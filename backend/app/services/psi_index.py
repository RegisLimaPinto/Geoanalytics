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
from app.services.output_pipeline import run_full_output_pipeline


# ── PSI Config (GeoPSI v4.0) ──────────────────────────────────────────────────

_PSI_CFG = {
    "L0": 1.0,
    "lambda_decay": 0.35,
    "regularization": 0.10,
}


# ── Pesos do PSI Index por commodity ─────────────────────────────────────────

WEIGHTS: dict[str, dict[str, float]] = {
    # Pesos idênticos ao GeoProspecting_Ouro_Pipeline.ipynb
    "OURO": {
        "K":         0.40,   # alteração potássica — indicador primário de Au
        "GRAD":      0.25,   # gradiente espacial do K — controle estrutural
        "MAG":       0.15,   # magnetometria — controle litológico
        "GRAV":      0.10,   # gravimetria — controle crustal
        "U":         0.05,   # urânio — complementar
        "Th":        0.05,   # tório — complementar
    },
    "COBRE": {
        "K":         0.20,
        "GRAD":      0.20,
        "MAG":       0.35,
        "GRAV":      0.15,
        "U":         0.05,
        "Th":        0.05,
    },
    "FERRO": {
        "K":         0.05,
        "GRAD":      0.10,
        "MAG":       0.55,
        "GRAV":      0.25,
        "U":         0.03,
        "Th":        0.02,
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


# ── GeoPSI v4.0 — ajuste estatístico não-linear ──────────────────────────────

def _compute_shielding_index(
    normalized: dict[str, np.ndarray],
) -> np.ndarray:
    """Proxy de suscetibilidade local (Σ): combinação MAG + GRAV."""
    mag = normalized.get("MAG", np.zeros(1))
    grav = normalized.get("GRAV", np.zeros(1))
    density = 0.6 * mag + 0.4 * grav
    # segunda normalização robusta
    lo, hi = np.percentile(density, 5), np.percentile(density, 95)
    if abs(hi - lo) < 1e-12:
        return np.zeros_like(density)
    return np.clip((density - lo) / (hi - lo), 0, 1)


def _compute_latent_field(
    sigma: np.ndarray,
    LON: np.ndarray,
    LAT: np.ndarray,
    bbox: dict,
) -> np.ndarray:
    """Campo latente de correção espacial baseado em distância ao centro."""
    center_lon = (bbox["lonMin"] + bbox["lonMax"]) / 2
    center_lat = (bbox["latMin"] + bbox["latMax"]) / 2
    depth = np.sqrt((LON - center_lon) ** 2 + (LAT - center_lat) ** 2)
    depth_max = depth.max() + 1e-9
    depth_norm = depth / depth_max
    L0 = _PSI_CFG["L0"]
    lam = _PSI_CFG["lambda_decay"]
    field = L0 * (1 - sigma * np.exp(-lam * depth_norm))
    return np.clip(field, 0.01, 1.0)


def _compute_shielding_gradient(sigma: np.ndarray) -> np.ndarray:
    grad_y, grad_x = np.gradient(np.nan_to_num(sigma))
    grad = np.sqrt(grad_x ** 2 + grad_y ** 2)
    max_g = grad.max()
    return grad / max_g if max_g > 0 else grad


def _psi_adjust_score(
    base_score: np.ndarray,
    sigma: np.ndarray,
    field: np.ndarray,
    gradient: np.ndarray,
) -> np.ndarray:
    """Ajuste não-linear vetorizado (substitui o loop pixel-a-pixel original)."""
    shielding_factor = 0.5 + 0.5 * sigma
    field_factor = 1.5 - 0.5 * field
    gradient_factor = 1.0 + gradient
    combined = shielding_factor * 0.4 + field_factor * 0.3 + gradient_factor * 0.3
    adjusted = base_score * np.tanh(combined)
    return np.clip(adjusted, 0, 1)


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

    # Suavização Gaussiana (sigma=1.5 pixels) — reduz ruído de alta frequência
    # Idêntico ao notebook: gaussian_filter(dados_norm[k], sigma=1.5)
    SMOOTH_SIGMA = 1.5
    smoothed = {
        k: gaussian_filter(v.astype(np.float32), sigma=SMOOTH_SIGMA)
        for k, v in normalized.items()
    }

    # Camada GRAD: gradiente espacial do K — controle estrutural (peso 0.25 no OURO)
    k_layer = smoothed.get("K", np.zeros((nx, ny), dtype=np.float32))
    gx, gy = np.gradient(k_layer)
    grad_k = np.sqrt(gx ** 2 + gy ** 2)
    grad_max = grad_k.max()
    smoothed["GRAD"] = grad_k / grad_max if grad_max > 1e-9 else grad_k

    # PSI Index base (soma ponderada com camadas suavizadas + GRAD)
    weights = WEIGHTS.get(commodity, WEIGHTS["OURO"])
    psi_base = _compute_psi_index(smoothed, weights)

    # Bônus de desacoplamento: K alto + MAG/GRAV baixos → padrão epitermal/Au
    mag_sm = smoothed.get("MAG", np.zeros_like(psi_base))
    grav_sm = smoothed.get("GRAV", np.zeros_like(psi_base))
    mag_grav_medio = (mag_sm + grav_sm) / 2
    k_sm = smoothed.get("K", np.zeros_like(psi_base))
    bonus = np.where((k_sm > 0.6) & (mag_grav_medio < 0.5), 0.08 * k_sm, 0.0)
    psi_base = np.clip(psi_base + bonus, 0, 1)

    # Re-normalizar o score base
    psi_min, psi_max = psi_base.min(), psi_base.max()
    if psi_max - psi_min > 1e-9:
        psi_base = (psi_base - psi_min) / (psi_max - psi_min)

    # GeoPSI v4.0 — ajuste estatístico não-linear
    sigma = _compute_shielding_index(smoothed)
    field = _compute_latent_field(sigma, LON, LAT, bbox)
    gradient = _compute_shielding_gradient(sigma)
    psi = _psi_adjust_score(psi_base, sigma, field, gradient)

    # Auto-detectar alvos a partir dos top máximos locais do PSI
    # quando o usuário não informou nenhum ponto de interesse
    if not targets_input:
        local_max_mask = psi == maximum_filter(psi, size=max(3, min(nx, ny) // 15))
        threshold_auto = np.percentile(psi, 90)
        cand_mask = local_max_mask & (psi >= threshold_auto)
        ys_c, xs_c = np.where(cand_mask)
        if len(ys_c) > 0:
            top_idx = np.argsort(psi[ys_c, xs_c])[::-1][:3]
            targets_input = [
                {
                    "id": f"Z{i + 1}",
                    "lon": float(lons_1d[xs_c[idx]]),
                    "lat": float(lats_1d[ys_c[idx]]),
                }
                for i, idx in enumerate(top_idx)
            ]

    # Priority zones (usa o score ajustado)
    _, n_zones = _find_priority_zones(psi, top_pct=0.05)

    # Rank targets
    ranked_targets = _rank_targets(targets_input, psi, LON, LAT, radius_km)

    # Radiometric profile (usa camadas suavizadas, exclui GRAD que é derivada)
    ternary = _compute_radiometric_profile(
        layers, smoothed, targets_input, LON, LAT, radius_km
    )

    # Layer anomaly summary (mean of top 5% per layer) — exclui GRAD
    layer_summary = []
    for name, arr in smoothed.items():
        if name == "GRAD":
            continue
        threshold = np.percentile(arr, 95)
        anomaly = float(arr[arr >= threshold].mean())
        layer_summary.append({"name": name, "anomaly": round(anomaly, 3)})

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

    job_id = str(uuid.uuid4())

    # Gera zonas, subalvos via output_pipeline (PDF gerado lazy em /report)
    pipeline_config = {**config, "bbox": bbox, "commodity": commodity, "dataType": data_type}
    output = run_full_output_pipeline(
        psi_grid=psi,
        normalized_layers={k: v for k, v in smoothed.items() if k != "GRAD"},
        config=pipeline_config,
    )

    return {
        "jobId": job_id,
        "commodity": commodity,
        "dataType": data_type,
        "bbox": bbox,
        "targets": ranked_targets,
        "layers": layer_summary,
        "ternary": ternary,
        "topZones": int(n_zones),
        "radiusKm": radius_km,
        "zones": output["zones"],
        "subtargets": output["subtargets"],
        "targetStats": output["targetStats"],
        # dados para geração lazy do PDF (não serializado no JSON)
        "_pdf_raw": {**output["_pdf_raw"], "config": pipeline_config},
        "_map_png": output.get("mapPng", b""),
        "_map_3d": output.get("map3dHtml", b""),
        "createdAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    }
