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


# ── Pesos por commodity + ajuste PSI (plugável) ─────────────────────────────
# Metais base: ouro, cobre, ferro, prata
# Terras raras / minerais críticos: terras_raras, ree, niobio, titanio, litio, fosfato
# Chaves: MAG, GRAV, BOUGUER, K, U, Th, GRADIENT
#
# Mapeamento das chaves do plug-in externo:
#   gravimetria  → GRAV
#   magnetometria → MAG
#   bouguer      → BOUGUER
#   geoquimica   → Th (dominante) + U + K (radiometria como proxy geoquímico)
#   estrutura    → GRADIENT

COMMODITY_WEIGHTS: dict[str, dict[str, float]] = {
    # ── Metais base ──────────────────────────────────────────────────────────
    "ouro": {
        "MAG":      0.15,
        "GRAV":     0.10,
        "BOUGUER":  0.10,
        "K":        0.20,
        "U":        0.08,
        "Th":       0.07,
        "GRADIENT": 0.30,
    },
    "cobre": {
        "MAG":      0.20,
        "GRAV":     0.12,
        "BOUGUER":  0.13,
        "K":        0.15,
        "U":        0.08,
        "Th":       0.07,
        "GRADIENT": 0.25,
    },
    "ferro": {
        "MAG":      0.35,
        "GRAV":     0.25,
        "BOUGUER":  0.20,
        "K":        0.03,
        "U":        0.02,
        "Th":       0.02,
        "GRADIENT": 0.13,
    },
    "prata": {
        "MAG":      0.12,
        "GRAV":     0.10,
        "BOUGUER":  0.10,
        "K":        0.22,
        "U":        0.10,
        "Th":       0.08,
        "GRADIENT": 0.28,
    },
    # ── Terras raras (REE) ───────────────────────────────────────────────────
    # Assinatura típica: Th e U elevados (carbonatitos/complexos alcalinos),
    # anomalia gravimétrica positiva, controle estrutural circular.
    # Mapeamento: geoquimica(0.35) → Th:0.20 + U:0.15; magnetometria(0.25) → MAG;
    #             gravimetria(0.15) → GRAV; bouguer(0.10) → BOUGUER;
    #             estrutura(0.15) → GRADIENT; K residual: 0.08 (alteração potássica)
    "terras_raras": {
        "MAG":      0.18,
        "GRAV":     0.12,
        "BOUGUER":  0.10,
        "K":        0.08,
        "U":        0.15,
        "Th":       0.25,
        "GRADIENT": 0.12,
    },
    "ree": {
        "MAG":      0.18,
        "GRAV":     0.12,
        "BOUGUER":  0.10,
        "K":        0.08,
        "U":        0.15,
        "Th":       0.25,
        "GRADIENT": 0.12,
    },
    # ── Nióbio (Nb) ──────────────────────────────────────────────────────────
    # Carbonatitos/complexos alcalinos; forte assinatura magnética e gravimétrica.
    "niobio": {
        "MAG":      0.22,
        "GRAV":     0.15,
        "BOUGUER":  0.12,
        "K":        0.08,
        "U":        0.12,
        "Th":       0.20,
        "GRADIENT": 0.11,
    },
    # ── Titânio (Ti) ─────────────────────────────────────────────────────────
    # Ilmenita/rutilo em anortositos e placers; MAG dominante.
    "titanio": {
        "MAG":      0.35,
        "GRAV":     0.18,
        "BOUGUER":  0.15,
        "K":        0.08,
        "U":        0.06,
        "Th":       0.06,
        "GRADIENT": 0.12,
    },
    # ── Lítio (Li) ───────────────────────────────────────────────────────────
    # Pegmatitos (K elevado por feldspato/espodumênio), controle estrutural forte.
    "litio": {
        "MAG":      0.08,
        "GRAV":     0.10,
        "BOUGUER":  0.10,
        "K":        0.32,
        "U":        0.08,
        "Th":       0.07,
        "GRADIENT": 0.25,
    },
    # ── Fosfato (P) ──────────────────────────────────────────────────────────
    # Carbonatitos e depósitos sedimentares; U e Th elevados, anomalia gravitacional.
    "fosfato": {
        "MAG":      0.08,
        "GRAV":     0.18,
        "BOUGUER":  0.15,
        "K":        0.10,
        "U":        0.20,
        "Th":       0.20,
        "GRADIENT": 0.09,
    },
}

# Alias GRADIENT → GRAD (nome interno da camada no pipeline)
_LAYER_ALIAS: dict[str, str] = {"GRADIENT": "GRAD", "BOUGUER": "GRAV"}


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


# ── PSI-Q Filter v1.0 ────────────────────────────────────────────────────────
# Supressão local de ruído por Z-score em janela deslizante 2D.
# Aplicado após _normalize_layers e antes da suavização gaussiana.
#
#   Parâmetros:
#     intensity (INTENSIDADE_PSIQ) — peso da componente filtrada no blend [0..1]
#     window    (JANELA_PSIQ)      — tamanho da janela em pixels (ímpar recomendado)
#
# Adaptação do plug-in PSI-Q (originalmente em pandas) para arrays numpy 2D
# usando scipy.ndimage.uniform_filter como equivalente do rolling().mean().

_PSIQ_LAYERS = {"MAG", "GRAV", "K", "U", "Th"}
_PSIQ_INTENSITY: float = 0.35
_PSIQ_WINDOW:    int   = 7


def apply_psiq_filter(
    normalized: dict[str, np.ndarray],
    intensity: float = _PSIQ_INTENSITY,
    window: int = _PSIQ_WINDOW,
) -> dict[str, np.ndarray]:
    """PSI-Q Filter v1.0 — Z-score local por janela deslizante 2D.

    Blenda o array normalizado com sua versão filtrada (Z-score local rescalado
    para [0, 1]), reduzindo ruído de alta frequência sem apagar anomalias reais.
    """
    from scipy.ndimage import uniform_filter

    filtered = {}
    for key, arr in normalized.items():
        if key not in _PSIQ_LAYERS:
            filtered[key] = arr
            continue

        a = arr.astype(np.float32)

        # Média local e desvio padrão local via E[X²] − E[X]²
        media_local  = uniform_filter(a, size=window)
        media_sq     = uniform_filter(a ** 2, size=window)
        desvio_local = np.sqrt(np.clip(media_sq - media_local ** 2, 0, None))

        # Z-score local → reescalado para [0, 1]
        zscore = (a - media_local) / (desvio_local + 1e-9)
        z_min, z_max = zscore.min(), zscore.max()
        zscore_norm = (zscore - z_min) / (z_max - z_min + 1e-9)

        # Blend: original * (1 − intensity) + filtrado * intensity
        blended = a * (1.0 - intensity) + zscore_norm * intensity
        filtered[key] = np.clip(blended, 0.0, 1.0).astype(np.float32)

    return filtered


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


# ── Helpers plugáveis ────────────────────────────────────────────────────────

def robust_normalize(arr: np.ndarray) -> np.ndarray:
    """Normalização min-max robusta para [0, 1]."""
    lo, hi = arr.min(), arr.max()
    if hi - lo > 1e-9:
        return (arr - lo) / (hi - lo)
    return np.zeros_like(arr)


def normalize_commodity_name(commodity: str) -> str:
    """Retorna o nome canônico (lowercase) da commodity."""
    _map = {
        "ouro": "ouro", "gold": "ouro", "au": "ouro",
        "cobre": "cobre", "copper": "cobre", "cu": "cobre",
        "ferro": "ferro", "iron": "ferro", "fe": "ferro",
        "prata": "prata", "silver": "prata", "ag": "prata",
        # Terras raras / REE
        "terras_raras": "terras_raras", "terras raras": "terras_raras",
        "ree": "ree", "rare earth": "ree", "rare_earth": "ree",
        # Minerais críticos
        "niobio": "niobio", "niobium": "niobio", "nb": "niobio",
        "titanio": "titanio", "titanium": "titanio", "ti": "titanio",
        "litio": "litio", "lithium": "litio", "li": "litio",
        "fosfato": "fosfato", "phosphate": "fosfato", "p": "fosfato",
    }
    return _map.get(commodity.lower().strip(), "ouro")


def compute_weighted_baseline_score(
    normalized: dict[str, np.ndarray],
    commodity: str,
) -> tuple[np.ndarray, dict[str, np.ndarray], dict[str, float]]:
    """Calcula o score base ponderado por commodity.

    Retorna (base_score, normalized, weights_used).
    """
    weights = COMMODITY_WEIGHTS.get(commodity, COMMODITY_WEIGHTS["ouro"])
    base_score = np.zeros_like(next(iter(normalized.values())))
    weights_used: dict[str, float] = {}

    for layer, w in weights.items():
        key = _LAYER_ALIAS.get(layer, layer)
        if key in normalized:
            base_score += normalized[key] * w
            weights_used[layer] = w

    base_score = robust_normalize(base_score)
    return base_score, normalized, weights_used


_COMMODITY_ADJUST_PARAMS: dict[str, dict[str, float]] = {
    # Metais base
    "ouro":  {"shielding": 0.30, "field": 0.30, "gradient": 0.40},
    "cobre": {"shielding": 0.35, "field": 0.35, "gradient": 0.30},
    "ferro": {"shielding": 0.50, "field": 0.35, "gradient": 0.15},
    "prata": {"shielding": 0.30, "field": 0.35, "gradient": 0.35},
    # Terras raras / minerais críticos — campo latente dominante (corpos ígneos alcalinos)
    "terras_raras": {"shielding": 0.35, "field": 0.42, "gradient": 0.23},
    "ree":          {"shielding": 0.35, "field": 0.42, "gradient": 0.23},
    "niobio":       {"shielding": 0.38, "field": 0.40, "gradient": 0.22},
    "titanio":      {"shielding": 0.48, "field": 0.35, "gradient": 0.17},
    "litio":        {"shielding": 0.25, "field": 0.33, "gradient": 0.42},
    "fosfato":      {"shielding": 0.35, "field": 0.42, "gradient": 0.23},
}


def psi_adjust_score_by_commodity(
    base_score: np.ndarray,
    sigma: np.ndarray,
    field: np.ndarray,
    gradient: np.ndarray,
    commodity: str,
) -> np.ndarray:
    """Ajuste não-linear do PSI com fatores específicos por commodity."""
    params = _COMMODITY_ADJUST_PARAMS.get(commodity, _COMMODITY_ADJUST_PARAMS["ouro"])
    shielding_factor = 0.5 + 0.5 * sigma
    field_factor = 1.5 - 0.5 * field
    gradient_factor = 1.0 + gradient
    combined = (
        shielding_factor * params["shielding"]
        + field_factor   * params["field"]
        + gradient_factor * params["gradient"]
    )
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
    radius_km = config.get("radiusKm", 5)
    targets_input = config.get("targets", [])[:5]  # máximo 5 pontos por análise

    # Build coordinate grids
    lons_1d = np.arange(bbox["lonMin"], bbox["lonMax"], resolution)
    lats_1d = np.arange(bbox["latMin"], bbox["latMax"], resolution)
    LON, LAT = np.meshgrid(lons_1d, lats_1d)
    nx, ny = LON.shape

    # Fetch real data (fallback a demo sintético controlado quando indisponível)
    layers, data_type, layer_sources = fetch_layers(
        bbox, nx, ny,
        config={"bbox": bbox, "commodity": commodity, "targets": targets_input},
    )

    # Override with user-uploaded layers when available
    uploaded = config.get("uploaded_layers", {})
    if uploaded:
        for key, data in uploaded.items():
            arr = np.array(data, dtype=np.float32)
            if arr.shape != (nx, ny):
                from scipy.ndimage import zoom as _zoom
                arr = _zoom(arr, (nx / arr.shape[0], ny / arr.shape[1]), order=1)
            layers[key] = arr
            layer_sources[key] = "upload"
        # Mark which layers came from upload
        uploaded_names = list(uploaded.keys())
        data_type = f"Upload do cliente ({', '.join(uploaded_names)})"
        if len(uploaded) < 5:
            data_type += " + automático"

    # Normalize
    normalized = _normalize_layers(layers)

    # PSI-Q Filter v1.0 — supressão de ruído local por Z-score em janela 2D
    # Aplicado sobre as camadas normalizadas, antes da suavização gaussiana.
    normalized = apply_psiq_filter(normalized)

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

    # PSI Index base com pesos por commodity
    commodity_name = normalize_commodity_name(commodity)
    psi_base, smoothed, weights_used = compute_weighted_baseline_score(smoothed, commodity_name)

    # Bônus de desacoplamento: K alto + MAG/GRAV baixos → padrão epitermal/Au
    mag_sm = smoothed.get("MAG", np.zeros_like(psi_base))
    grav_sm = smoothed.get("GRAV", np.zeros_like(psi_base))
    mag_grav_medio = (mag_sm + grav_sm) / 2
    k_sm = smoothed.get("K", np.zeros_like(psi_base))
    bonus = np.where((k_sm > 0.6) & (mag_grav_medio < 0.5), 0.08 * k_sm, 0.0)
    psi_base = np.clip(psi_base + bonus, 0, 1)

    psi_base = robust_normalize(psi_base)

    # GeoPSI v4.0 — ajuste estatístico não-linear por commodity
    sigma = _compute_shielding_index(smoothed)
    field = _compute_latent_field(sigma, LON, LAT, bbox)
    gradient = _compute_shielding_gradient(sigma)
    psi = psi_adjust_score_by_commodity(
        base_score=psi_base,
        sigma=sigma,
        field=field,
        gradient=smoothed.get("GRAD", gradient),
        commodity=commodity_name,
    )
    psi = robust_normalize(psi)

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

    # Priority zones (usa threshold mais flexível no modo demo)
    is_demo = "Sintetico" in data_type
    top_pct_zones = 0.15 if is_demo else 0.05
    _, n_zones = _find_priority_zones(psi, top_pct=top_pct_zones)

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
    is_demo = "Sintetico" in data_type
    pipeline_config = {
        **config,
        "bbox": bbox,
        "commodity": commodity,
        "dataType": data_type,
        "targets": targets_input,   # inclui alvos auto-detectados (corrige bug 0 zonas)
        "_demo": is_demo,
    }
    output = run_full_output_pipeline(
        psi_grid=psi,
        normalized_layers={k: v for k, v in smoothed.items() if k != "GRAD"},
        config=pipeline_config,
    )

    return {
        "jobId": job_id,
        "commodity": commodity_name,
        "weightsUsed": weights_used,
        "dataType": data_type,
        "layerSources": layer_sources,
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
