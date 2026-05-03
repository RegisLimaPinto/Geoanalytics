"""
Gerador de dados sintéticos CONTROLADOS para o modo DEMO da plataforma.

Diferente do fallback aleatório simples (_synthetic_layers no real_data_fetcher),
este módulo gera anomalias gaussianas claras com padrão por commodity, garantindo
que a análise retorne zonas e subalvos visíveis no modo demo.
"""

import numpy as np
from scipy.ndimage import gaussian_filter


def robust_normalize(x: np.ndarray, p_low: float = 5, p_high: float = 95) -> np.ndarray:
    valid = x[~np.isnan(x)]
    lo = np.percentile(valid, p_low)
    hi = np.percentile(valid, p_high)
    if abs(hi - lo) < 1e-12:
        return np.zeros_like(x)
    return np.clip((x - lo) / (hi - lo), 0, 1)


def gaussian_blob(
    X: np.ndarray,
    Y: np.ndarray,
    lon: float,
    lat: float,
    amp: float = 1.0,
    sigma: float = 0.04,
) -> np.ndarray:
    """Gaussiana 2D centrada em (lon, lat). sigma em graus."""
    return amp * np.exp(-(((X - lon) ** 2 + (Y - lat) ** 2) / (2 * sigma ** 2)))


def generate_controlled_synthetic_layers(
    config: dict,
) -> tuple[dict[str, np.ndarray], list[dict]]:
    """
    Gera camadas sintéticas controladas (MAG, GRAV, BOUGUER, K, U, Th).

    Parâmetros
    ----------
    config: dict com chaves:
        - bbox: dict {lonMin, latMin, lonMax, latMax} ou list [lonMin, latMin, lonMax, latMax]
        - grid_w: número de colunas do grid
        - grid_h: número de linhas do grid
        - commodity: "gold"/"ouro", "iron"/"ferro", "copper"/"cobre" (default: "gold")
        - targets: lista de {"id", "lon", "lat"} — se vazia, cria 3 alvos demo

    Retorna
    -------
    (layers_dict, targets_list)
    """
    bbox = config["bbox"]
    if isinstance(bbox, dict):
        min_lon = bbox["lonMin"]
        min_lat = bbox["latMin"]
        max_lon = bbox["lonMax"]
        max_lat = bbox["latMax"]
    else:
        min_lon, min_lat, max_lon, max_lat = bbox

    grid_w: int = config["grid_w"]
    grid_h: int = config["grid_h"]
    commodity: str = config.get("commodity", "gold").lower()
    targets: list = list(config.get("targets", []))

    lons = np.linspace(min_lon, max_lon, grid_w)
    lats = np.linspace(min_lat, max_lat, grid_h)
    X, Y = np.meshgrid(lons, lats)

    # Escala o sigma em proporção ao tamanho da bbox (referência: 1°)
    bbox_size = max(max_lon - min_lon, max_lat - min_lat)
    s = max(bbox_size, 0.1)  # evita sigma zero para bboxes minúsculas

    rng = np.random.default_rng(42)
    base_layers = ["MAG", "GRAV", "BOUGUER", "K", "U", "Th"]

    layers: dict[str, np.ndarray] = {}
    for layer in base_layers:
        noise = gaussian_filter(rng.normal(0, 1, X.shape), sigma=4)
        layers[layer] = noise.astype(np.float32)

    # Alvos demo padrão quando o usuário não informou nenhum ponto
    if not targets:
        targets = [
            {
                "id": "D1",
                "lon": min_lon + 0.30 * (max_lon - min_lon),
                "lat": min_lat + 0.35 * (max_lat - min_lat),
            },
            {
                "id": "D2",
                "lon": min_lon + 0.60 * (max_lon - min_lon),
                "lat": min_lat + 0.55 * (max_lat - min_lat),
            },
            {
                "id": "D3",
                "lon": min_lon + 0.75 * (max_lon - min_lon),
                "lat": min_lat + 0.30 * (max_lat - min_lat),
            },
        ]

    for t in targets:
        lon, lat = float(t["lon"]), float(t["lat"])

        if commodity in ("gold", "ouro"):
            layers["K"]       += gaussian_blob(X, Y, lon + 0.02 * s, lat - 0.02 * s, amp=4.0, sigma=0.055 * s)
            layers["U"]       += gaussian_blob(X, Y, lon + 0.03 * s, lat,             amp=1.7, sigma=0.070 * s)
            layers["Th"]      += gaussian_blob(X, Y, lon - 0.02 * s, lat + 0.02 * s, amp=1.2, sigma=0.080 * s)
            layers["MAG"]     += gaussian_blob(X, Y, lon - 0.05 * s, lat + 0.03 * s, amp=1.1, sigma=0.100 * s)
            layers["GRAV"]    += gaussian_blob(X, Y, lon - 0.04 * s, lat + 0.02 * s, amp=1.0, sigma=0.100 * s)
            layers["BOUGUER"] += gaussian_blob(X, Y, lon - 0.03 * s, lat + 0.01 * s, amp=1.0, sigma=0.100 * s)

        elif commodity in ("iron", "ferro"):
            layers["MAG"]     += gaussian_blob(X, Y, lon,             lat,             amp=5.0, sigma=0.065 * s)
            layers["GRAV"]    += gaussian_blob(X, Y, lon + 0.02 * s, lat,             amp=3.0, sigma=0.080 * s)
            layers["BOUGUER"] += gaussian_blob(X, Y, lon + 0.02 * s, lat - 0.01 * s, amp=3.3, sigma=0.080 * s)
            layers["K"]       += gaussian_blob(X, Y, lon - 0.05 * s, lat + 0.03 * s, amp=0.8, sigma=0.120 * s)
            layers["U"]       += gaussian_blob(X, Y, lon - 0.03 * s, lat + 0.02 * s, amp=0.6, sigma=0.120 * s)
            layers["Th"]      += gaussian_blob(X, Y, lon - 0.02 * s, lat + 0.02 * s, amp=0.5, sigma=0.120 * s)

        elif commodity in ("copper", "cobre"):
            layers["MAG"]     += gaussian_blob(X, Y, lon,             lat,             amp=2.8, sigma=0.070 * s)
            layers["GRAV"]    += gaussian_blob(X, Y, lon + 0.03 * s, lat,             amp=1.8, sigma=0.090 * s)
            layers["K"]       += gaussian_blob(X, Y, lon - 0.03 * s, lat + 0.02 * s, amp=2.7, sigma=0.075 * s)
            layers["U"]       += gaussian_blob(X, Y, lon - 0.02 * s, lat,             amp=1.4, sigma=0.090 * s)
            layers["Th"]      += gaussian_blob(X, Y, lon + 0.04 * s, lat - 0.01 * s, amp=1.3, sigma=0.095 * s)
            layers["BOUGUER"] += gaussian_blob(X, Y, lon + 0.02 * s, lat,             amp=1.6, sigma=0.090 * s)

        else:
            for layer in base_layers:
                layers[layer] += gaussian_blob(X, Y, lon, lat, amp=2.0, sigma=0.080 * s)

    for layer in base_layers:
        layers[layer] = robust_normalize(layers[layer]).astype(np.float32)

    return layers, targets


def demo_threshold(score_grid: np.ndarray) -> float:
    """
    Threshold flexível para modo demo: top 15% ou media + 0.35*std (o maior).
    Garante que zonas apareçam mesmo com dados sintéticos.
    """
    return float(max(
        np.percentile(score_grid, 85),
        float(np.mean(score_grid)) + 0.35 * float(np.std(score_grid)),
    ))


def fallback_subtargets(
    score_grid: np.ndarray,
    config: dict,
    n: int = 6,
) -> list[dict]:
    """
    Extrai N pontos de maior score quando detect_subtargets retorna vazio.
    Usado como fallback de segurança no modo demo.
    """
    bbox = config["bbox"]
    if isinstance(bbox, dict):
        lon_min, lat_min = bbox["lonMin"], bbox["latMin"]
        lon_max, lat_max = bbox["lonMax"], bbox["latMax"]
    else:
        lon_min, lat_min, lon_max, lat_max = bbox

    grid_h, grid_w = score_grid.shape
    flat_idx = np.argsort(score_grid.ravel())[-n:][::-1]

    rows = []
    for rank, idx in enumerate(flat_idx, start=1):
        iy, ix = np.unravel_index(idx, score_grid.shape)
        lon = lon_min + ix / max(grid_w - 1, 1) * (lon_max - lon_min)
        lat = lat_min + iy / max(grid_h - 1, 1) * (lat_max - lat_min)
        rows.append({
            "Target": "DEMO",
            "Rank": rank,
            "Score": round(float(score_grid[iy, ix]), 5),
            "Lon": round(float(lon), 6),
            "Lat": round(float(lat), 6),
            "DistanceToTarget_km": 0.0,
        })

    return rows
