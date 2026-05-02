"""
PSI Index — Índice de Favorabilidade Exploratória Mineral
Pipeline baseado em: GeoProspecting_Ouro_Pipeline.ipynb

Dados geofísicos obtidos de fontes reais quando disponíveis:
  - CPRM GeoServer WCS  (magnética + radiométrica K/U/Th, Brasil)
  - ICGEM/EGM2008 API   (anomalia de gravidade, global)
  - Fallback determinístico por bbox quando APIs indisponíveis
"""

import uuid
from typing import Any

import numpy as np
from scipy.ndimage import gaussian_filter, label, maximum_filter
from sklearn.cluster import DBSCAN
from sklearn.preprocessing import RobustScaler

from app.services.real_data_fetcher import fetch_layers


# ── Pesos do PSI Index por commodity ─────────────────────────────────────────

WEIGHTS: dict[str, dict[str, float]] = {
    "OURO": {
        "K": 0.30,
        "U": 0.15,
        "Th": 0.05,
        "MAG": 0.30,
        "GRAV": 0.20,
    },
    "COBRE": {
        "K": 0.20,
        "U": 0.10,
        "Th": 0.05,
        "MAG": 0.40,
        "GRAV": 0.25,
    },
    "FERRO": {
        "K": 0.10,
        "U": 0.05,
        "Th": 0.05,
        "MAG": 0.55,
        "GRAV": 0.25,
    },
}


def _normalize_layers(layers: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    scaler = RobustScaler()
    normalized = {}
    for name, arr in layers.items():
        flat = arr.flatten().reshape(-1, 1)
        norm = scaler.fit_transform(flat).reshape(arr.shape)
        # Clamp to [0, 1]
        norm = (norm - norm.min()) / (norm.max() - norm.min() + 1e-9)
        normalized[name] = norm
    return normalized


def _compute_psi_index(
    normalized: dict[str, np.ndarray],
    weights: dict[str, float],
) -> np.ndarray:
    psi = np.zeros_like(next(iter(normalized.values())))
    for name, w in weights.items():
        if name in normalized:
            psi += w * normalized[name]
    return psi


def _find_priority_zones(
    psi: np.ndarray,
    top_pct: float = 0.05,
) -> tuple[np.ndarray, int]:
    threshold = np.percentile(psi, (1 - top_pct) * 100)
    binary = psi >= threshold
    labeled, n_zones = label(binary)
    return labeled, n_zones


def _rank_targets(
    targets: list[dict],
    psi: np.ndarray,
    lons: np.ndarray,
    lats: np.ndarray,
    radius_km: float = 20.0,
) -> list[dict]:
    results = []
    for t in targets:
        lon, lat = t["lon"], t["lat"]
        # Compute radius in degrees (~1 deg = 111 km)
        r_deg = radius_km / 111.0

        # Mask within radius
        dist = np.sqrt((lons - lon) ** 2 + (lats - lat) ** 2)
        mask = dist <= r_deg

        if mask.sum() == 0:
            score = float(psi.mean())
        else:
            zone_psi = psi[mask]
            score = float(zone_psi.max() * 0.6 + zone_psi.mean() * 0.4)

        results.append(
            {
                "id": t["id"],
                "lon": lon,
                "lat": lat,
                "psiScore": round(score, 4),
                "area_km2": round(mask.sum() * 0.04 * 111**2, 1),
            }
        )

    # Sort by score descending, assign priority
    results.sort(key=lambda x: x["psiScore"], reverse=True)
    clusters = list("ABCDEFGHIJ")
    for i, r in enumerate(results):
        r["priority"] = i + 1
        r["cluster"] = clusters[i % len(clusters)]

    return results


def _compute_radiometric_profile(
    layers: dict[str, np.ndarray],
    normalized: dict[str, np.ndarray],
    targets: list[dict],
    lons: np.ndarray,
    lats: np.ndarray,
    radius_km: float = 20.0,
) -> list[dict]:
    profiles = []
    for t in targets:
        lon, lat = t["lon"], t["lat"]
        r_deg = radius_km / 111.0
        dist = np.sqrt((lons - lon) ** 2 + (lats - lat) ** 2)
        mask = dist <= r_deg

        K_mean = float(normalized["K"][mask].mean()) if mask.sum() > 0 else 0
        U_mean = float(normalized["U"][mask].mean()) if mask.sum() > 0 else 0
        Th_mean = float(normalized["Th"][mask].mean()) if mask.sum() > 0 else 0

        total = K_mean + U_mean + Th_mean + 1e-9
        profiles.append(
            {
                "name": t["id"],
                "K": round(K_mean / total * 100, 1),
                "U": round(U_mean / total * 100, 1),
                "Th": round(Th_mean / total * 100, 1),
            }
        )

    # Add background
    K_bg = float(normalized["K"].mean())
    U_bg = float(normalized["U"].mean())
    Th_bg = float(normalized["Th"].mean())
    total_bg = K_bg + U_bg + Th_bg + 1e-9
    profiles.append(
        {
            "name": "BG",
            "K": round(K_bg / total_bg * 100, 1),
            "U": round(U_bg / total_bg * 100, 1),
            "Th": round(Th_bg / total_bg * 100, 1),
        }
    )

    return profiles


def run_pipeline(config: dict[str, Any]) -> dict[str, Any]:
    """
    Executa o pipeline GeoProspecting completo.

    Parameters
    ----------
    config: dict com bbox, resolution, commodity, targets, radiusKm

    Returns
    -------
    dict com targets ranked, layers, ternary, topZones, jobId
    """
    bbox = config["bbox"]
    resolution = config.get("resolution", 0.02)
    commodity = config.get("commodity", "OURO").upper()
    radius_km = config.get("radiusKm", 20)
    targets_input = config.get("targets", [])

    # Build coordinate grids
    lons_1d = np.arange(bbox["lonMin"], bbox["lonMax"], resolution)
    lats_1d = np.arange(bbox["latMin"], bbox["latMax"], resolution)
    LON, LAT = np.meshgrid(lons_1d, lats_1d)
    nx, ny = LON.shape

    # Fetch real data (with fallback to deterministic synthetic)
    layers, data_type = fetch_layers(bbox, nx, ny)

    # Override with user-uploaded layers when available
    uploaded = config.get("uploaded_layers", {})
    if uploaded:
        for key, data in uploaded.items():
            arr = np.array(data, dtype=np.float32)
            if arr.shape != (nx, ny):
                from scipy.ndimage import zoom as _zoom
                arr = _zoom(arr, (nx / arr.shape[0], ny / arr.shape[1]), order=1)
            layers[key] = arr
        # Mark which layers came from upload
        uploaded_names = list(uploaded.keys())
        data_type = f"Upload do cliente ({', '.join(uploaded_names)})"
        if len(uploaded) < 5:
            data_type += " + automático"

    # Normalize
    normalized = _normalize_layers(layers)

    # PSI Index
    weights = WEIGHTS.get(commodity, WEIGHTS["OURO"])
    psi = _compute_psi_index(normalized, weights)

    # Priority zones
    _, n_zones = _find_priority_zones(psi, top_pct=0.05)

    # Rank targets
    ranked_targets = _rank_targets(targets_input, psi, LON, LAT, radius_km)

    # Radiometric profile
    ternary = _compute_radiometric_profile(
        layers, normalized, targets_input, LON, LAT, radius_km
    )

    # Layer anomaly summary (mean of top 5% per layer)
    layer_summary = []
    for name, arr in normalized.items():
        threshold = np.percentile(arr, 95)
        anomaly = float(arr[arr >= threshold].mean())
        layer_summary.append({"name": f"{name}", "anomaly": round(anomaly, 3)})

    # Friendly layer names
    label_map = {
        "K": "K (Potássio)",
        "U": "U (Urânio)",
        "Th": "Th (Tório)",
        "MAG": "MAG",
        "GRAV": "GRAV",
    }
    for ls in layer_summary:
        ls["name"] = label_map.get(ls["name"], ls["name"])

    return {
        "jobId": str(uuid.uuid4()),
        "commodity": commodity,
        "dataType": data_type,
        "bbox": bbox,
        "targets": ranked_targets,
        "layers": layer_summary,
        "ternary": ternary,
        "topZones": int(n_zones),
        "radiusKm": radius_km,
        "createdAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    }
