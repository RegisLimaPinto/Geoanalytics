"""
PSI Analytics — Script Standalone de Análise de Favorabilidade Mineral
=======================================================================
Executa o pipeline completo sem necessidade do servidor web / Docker.

Dependências (instalar com pip):
    pip install numpy scipy scikit-learn httpx pandas matplotlib

Fontes de dados:
    - CPRM GeoServer WCS (magnética + radiométrica K/U/Th, Brasil)
    - ICGEM/EGM2008 (anomalia de gravidade, global)
    - Fallback sintético controlado quando as APIs estiverem indisponíveis

Uso:
    python analise_psi_standalone.py

Saída:
    resultados_psi.json  — resultado completo em JSON
    zonas_psi.csv        — zonas prioritárias
    alvos_psi.csv        — ranking de alvos
    mapa_psi.png         — mapa 2D de favorabilidade (requer matplotlib)
"""

from __future__ import annotations

import csv
import hashlib
import json
import logging
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Any, Optional

import numpy as np
from scipy.ndimage import gaussian_filter, label, maximum_filter, zoom
from scipy.interpolate import RegularGridInterpolator
from sklearn.preprocessing import RobustScaler

# ── Instalar httpx se necessário ──────────────────────────────────────────────
try:
    import httpx
    _HAS_HTTPX = True
except ImportError:
    _HAS_HTTPX = False
    print("[aviso] httpx não instalado — usando apenas dados sintéticos. Instale com: pip install httpx")

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("psi_analytics")


# =============================================================================
# ██████████  CONFIGURAÇÃO  ███████████████████████████████████████████████████
# =============================================================================

CONFIG = {
    # ── Área de interesse ─────────────────────────────────────────────────────
    # Longitude Oeste / Latitude Sul no Brasil → valores negativos
    "bbox": {
        "lonMin": -48.5,
        "latMin": -16.5,
        "lonMax": -47.5,
        "latMax": -15.5,
    },

    # Resolução do grid em graus (~0.02° ≈ 2.2 km/pixel)
    "resolution": 0.02,

    # Mineral alvo: "ouro", "cobre", "ferro" ou "prata"
    "commodity": "ouro",

    # Raio de análise por ponto alvo (km)
    "radiusKm": 20,

    # Pontos de interesse (deixe vazio [] para detecção automática)
    "targets": [
        {"id": "T1", "lon": -48.1, "lat": -16.0},
        {"id": "T2", "lon": -47.8, "lat": -15.8},
    ],

    # ── Arquivos de dados próprios (OPCIONAL) ─────────────────────────────────
    # Informe o caminho dos seus arquivos CSV ou GeoTIFF para cada camada.
    # Deixe o valor como None para usar dados automáticos (CPRM / ICGEM).
    #
    # Formatos aceitos:
    #   CSV  — deve ter colunas: lon, lat, valor
    #   TIF  — GeoTIFF com CRS WGS84 (EPSG:4326)
    #
    # Exemplo:
    #   "MAG": "dados/magnetometria.tif",
    #   "K":   "dados/potassio.csv",
    "arquivos": {
        "MAG":  None,   # Magnetometria
        "GRAV": None,   # Gravimetria
        "K":    None,   # Radiometria — Potássio
        "U":    None,   # Radiometria — Urânio
        "Th":   None,   # Radiometria — Tório
    },
}

# Arquivos de saída
OUTPUT_JSON = "resultados_psi.json"
OUTPUT_ZONAS_CSV = "zonas_psi.csv"
OUTPUT_ALVOS_CSV = "alvos_psi.csv"
OUTPUT_MAPA_PNG = "mapa_psi.png"


# =============================================================================
# ██████████  DADOS SINTÉTICOS (FALLBACK DEMO)  ███████████████████████████████
# =============================================================================

def _gaussian_blob(X, Y, lon, lat, amp=1.0, sigma=0.04):
    return amp * np.exp(-(((X - lon)**2 + (Y - lat)**2) / (2 * sigma**2)))


def _robust_norm(x, p_low=5, p_high=95):
    lo, hi = np.percentile(x, p_low), np.percentile(x, p_high)
    if abs(hi - lo) < 1e-12:
        return np.zeros_like(x)
    return np.clip((x - lo) / (hi - lo), 0, 1)


def generate_synthetic_layers(bbox, grid_w, grid_h, commodity="ouro", targets=None):
    """Gera camadas sintéticas controladas com anomalias gaussianas por commodity."""
    lons = np.linspace(bbox["lonMin"], bbox["lonMax"], grid_w)
    lats = np.linspace(bbox["latMin"], bbox["latMax"], grid_h)
    X, Y = np.meshgrid(lons, lats)
    s = max(bbox["lonMax"] - bbox["lonMin"], bbox["latMax"] - bbox["latMin"], 0.1)

    rng = np.random.default_rng(42)
    base_keys = ["MAG", "GRAV", "BOUGUER", "K", "U", "Th"]
    layers = {k: gaussian_filter(rng.normal(0, 1, X.shape), sigma=4).astype(np.float32)
              for k in base_keys}

    if not targets:
        targets = [
            {"id": "D1", "lon": bbox["lonMin"] + 0.30 * s, "lat": bbox["latMin"] + 0.35 * s},
            {"id": "D2", "lon": bbox["lonMin"] + 0.60 * s, "lat": bbox["latMin"] + 0.55 * s},
            {"id": "D3", "lon": bbox["lonMin"] + 0.75 * s, "lat": bbox["latMin"] + 0.30 * s},
        ]

    for t in targets:
        lon, lat = float(t["lon"]), float(t["lat"])
        c = commodity.lower()
        if c in ("ouro", "gold", "au"):
            layers["K"]       += _gaussian_blob(X, Y, lon + 0.02*s, lat - 0.02*s, 4.0, 0.055*s)
            layers["U"]       += _gaussian_blob(X, Y, lon + 0.03*s, lat,           1.7, 0.070*s)
            layers["Th"]      += _gaussian_blob(X, Y, lon - 0.02*s, lat + 0.02*s, 1.2, 0.080*s)
            layers["MAG"]     += _gaussian_blob(X, Y, lon - 0.05*s, lat + 0.03*s, 1.1, 0.100*s)
            layers["GRAV"]    += _gaussian_blob(X, Y, lon - 0.04*s, lat + 0.02*s, 1.0, 0.100*s)
            layers["BOUGUER"] += _gaussian_blob(X, Y, lon - 0.03*s, lat + 0.01*s, 1.0, 0.100*s)
        elif c in ("ferro", "iron", "fe"):
            layers["MAG"]     += _gaussian_blob(X, Y, lon,           lat,           5.0, 0.065*s)
            layers["GRAV"]    += _gaussian_blob(X, Y, lon + 0.02*s, lat,           3.0, 0.080*s)
            layers["BOUGUER"] += _gaussian_blob(X, Y, lon + 0.02*s, lat - 0.01*s, 3.3, 0.080*s)
            layers["K"]       += _gaussian_blob(X, Y, lon - 0.05*s, lat + 0.03*s, 0.8, 0.120*s)
        elif c in ("cobre", "copper", "cu"):
            layers["MAG"]     += _gaussian_blob(X, Y, lon,           lat,           2.8, 0.070*s)
            layers["GRAV"]    += _gaussian_blob(X, Y, lon + 0.03*s, lat,           1.8, 0.090*s)
            layers["K"]       += _gaussian_blob(X, Y, lon - 0.03*s, lat + 0.02*s, 2.7, 0.075*s)
        else:
            for k in base_keys:
                layers[k] += _gaussian_blob(X, Y, lon, lat, 2.0, 0.080*s)

    for k in base_keys:
        layers[k] = _robust_norm(layers[k]).astype(np.float32)

    return layers


# =============================================================================
# ██████████  FETCHER DE DADOS REAIS  █████████████████████████████████████████
# =============================================================================

CPRM_WCS = "https://geosgb.cprm.gov.br/geosgb/ows"
ICGEM_API = "https://icgem.gfz-potsdam.de/calcgrid"
HTTP_TIMEOUT = 5

CPRM_LAYER_CANDIDATES = {
    "MAG": ["levantamentos_aereo:anomalia_mag_reducao_polo", "levantamentos_aereo:anomalia_magnetica_total"],
    "K":   ["levantamentos_aereo:potassio", "levantamentos_aereo:k_perc"],
    "U":   ["levantamentos_aereo:uranio_equivalente", "levantamentos_aereo:u_ppm"],
    "Th":  ["levantamentos_aereo:torio_equivalente", "levantamentos_aereo:th_ppm"],
}


def _safe_fill(arr, nodata=None):
    arr = arr.astype(np.float32)
    if nodata is not None:
        arr[arr == nodata] = np.nan
    arr[~np.isfinite(arr)] = np.nan
    if np.any(np.isnan(arr)):
        arr = np.where(np.isnan(arr), float(np.nanmedian(arr)), arr)
    return arr


def _resample(arr, nx, ny):
    if arr.shape == (nx, ny):
        return arr.astype(np.float32)
    return zoom(arr.astype(np.float32), (nx / arr.shape[0], ny / arr.shape[1]), order=1)


def _fetch_cprm(layer, bbox, nx, ny):
    if not _HAS_HTTPX:
        return None
    try:
        from rasterio.io import MemoryFile
    except ImportError:
        return None
    params = {
        "service": "WCS", "version": "1.0.0", "request": "GetCoverage",
        "coverage": layer,
        "bbox": f"{bbox['lonMin']},{bbox['latMin']},{bbox['lonMax']},{bbox['latMax']}",
        "width": str(max(ny, 16)), "height": str(max(nx, 16)),
        "format": "GeoTIFF", "crs": "EPSG:4326",
    }
    try:
        r = httpx.get(CPRM_WCS, params=params, timeout=HTTP_TIMEOUT)
        r.raise_for_status()
        ct = r.headers.get("content-type", "")
        if "xml" in ct or "html" in ct or len(r.content) < 512:
            return None
        with MemoryFile(r.content) as mf:
            with mf.open() as ds:
                arr = _safe_fill(ds.read(1), ds.nodata)
        return _resample(arr, nx, ny)
    except Exception:  # noqa
        return None


def _fetch_icgem(bbox, nx, ny):
    if not _HAS_HTTPX:
        return None
    lon_r = bbox["lonMax"] - bbox["lonMin"]
    lat_r = bbox["latMax"] - bbox["latMin"]
    step = max(0.02, min(0.5, max(lon_r, lat_r) / 40))
    params = {
        "model": "EGM2008",
        "lat1": f"{bbox['latMin']:.4f}", "lat2": f"{bbox['latMax']:.4f}",
        "lon1": f"{bbox['lonMin']:.4f}", "lon2": f"{bbox['lonMax']:.4f}",
        "step": f"{step:.4f}", "functional": "gravity",
        "format": "icgem", "unit": "mgal", "tide": "zero_tide",
    }
    try:
        r = httpx.get(ICGEM_API, params=params, timeout=HTTP_TIMEOUT)
        r.raise_for_status()
        lats_o, lons_o, vals = [], [], []
        in_data = False
        for line in r.text.splitlines():
            if "end_of_head" in line:
                in_data = True; continue
            if not in_data or not line.strip(): continue
            parts = line.split()
            if len(parts) >= 3:
                try:
                    lats_o.append(float(parts[0])); lons_o.append(float(parts[1])); vals.append(float(parts[2]))
                except ValueError:
                    continue
        if len(vals) < 4:
            return None
        ul = np.sort(np.unique(lats_o)); ulo = np.sort(np.unique(lons_o))
        grid = np.full((len(ul), len(ulo)), np.nan, dtype=np.float32)
        li = {v: i for i, v in enumerate(ul)}; loi = {v: i for i, v in enumerate(ulo)}
        for la, lo, va in zip(lats_o, lons_o, vals):
            grid[li[la], loi[lo]] = va
        grid = _safe_fill(grid)
        interp = RegularGridInterpolator((ul, ulo), grid, method="linear", bounds_error=False,
                                         fill_value=float(np.nanmean(grid)))
        tl = np.linspace(bbox["latMin"], bbox["latMax"], nx)
        tlo = np.linspace(bbox["lonMin"], bbox["lonMax"], ny)
        TL, TLO = np.meshgrid(tl, tlo, indexing="ij")
        return interp((TL, TLO)).astype(np.float32)
    except Exception:  # noqa
        return None


def _load_csv_layer(path: str, bbox: dict, nx: int, ny: int) -> Optional[np.ndarray]:
    """
    Carrega uma camada a partir de CSV com colunas: lon, lat, valor
    Interpola para o grid (nx × ny) da bbox.
    """
    try:
        import pandas as pd
        df = pd.read_csv(path)
        # Aceita variações de nome das colunas
        col_map = {}
        for col in df.columns:
            cl = col.strip().lower()
            if cl in ("lon", "longitude", "x", "long"):
                col_map["lon"] = col
            elif cl in ("lat", "latitude", "y"):
                col_map["lat"] = col
            elif cl in ("valor", "value", "val", "z", "data", "dado"):
                col_map["val"] = col
        if len(col_map) < 3:
            # Se não encontrou coluna de valor, tenta a terceira coluna numérica
            num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
            if len(num_cols) >= 3:
                col_map.setdefault("lon", num_cols[0])
                col_map.setdefault("lat", num_cols[1])
                col_map.setdefault("val", num_cols[2])
            else:
                logger.error("CSV %s: não encontrou colunas lon/lat/valor. Colunas: %s", path, list(df.columns))
                return None

        lons_o = df[col_map["lon"]].values.astype(float)
        lats_o = df[col_map["lat"]].values.astype(float)
        vals_o = df[col_map["val"]].values.astype(float)

        # Filtrar pontos dentro da bbox (com margem de 10%)
        mx = (bbox["lonMax"] - bbox["lonMin"]) * 0.10
        my = (bbox["latMax"] - bbox["latMin"]) * 0.10
        mask = (
            (lons_o >= bbox["lonMin"] - mx) & (lons_o <= bbox["lonMax"] + mx) &
            (lats_o >= bbox["latMin"] - my) & (lats_o <= bbox["latMax"] + my)
        )
        if mask.sum() < 4:
            logger.warning("CSV %s: apenas %d pontos dentro da bbox — usando todos", path, mask.sum())
            mask = np.ones(len(lons_o), dtype=bool)

        lons_f, lats_f, vals_f = lons_o[mask], lats_o[mask], vals_o[mask]

        # Interpolação linear para o grid alvo
        from scipy.interpolate import LinearNDInterpolator, NearestNDInterpolator
        points = np.column_stack([lons_f, lats_f])
        target_lons = np.linspace(bbox["lonMin"], bbox["lonMax"], ny)
        target_lats = np.linspace(bbox["latMin"], bbox["latMax"], nx)
        TL, TLO = np.meshgrid(target_lats, target_lons, indexing="ij")
        target_pts = np.column_stack([TLO.ravel(), TL.ravel()])

        interp_lin = LinearNDInterpolator(points, vals_f, fill_value=np.nan)
        result = interp_lin(target_pts).reshape(nx, ny).astype(np.float32)

        # Preenche NaN com interpolação nearest
        nan_mask = np.isnan(result)
        if nan_mask.any():
            interp_nn = NearestNDInterpolator(points, vals_f)
            result[nan_mask] = interp_nn(target_pts[nan_mask.ravel()]).astype(np.float32)

        logger.info("CSV %s: %d pontos carregados → grid %d×%d", path, len(vals_f), nx, ny)
        return result

    except Exception as exc:  # noqa
        logger.error("Erro ao carregar CSV %s: %s", path, exc)
        return None


def _load_geotiff_layer(path: str, bbox: dict, nx: int, ny: int) -> Optional[np.ndarray]:
    """Carrega uma camada a partir de GeoTIFF (requer rasterio)."""
    try:
        from rasterio import open as rio_open
        from rasterio.warp import reproject, Resampling
        import rasterio.crs

        with rio_open(path) as ds:
            arr = ds.read(1).astype(np.float32)
            arr = _safe_fill(arr, ds.nodata)
        return _resample(arr, nx, ny)

    except ImportError:
        logger.error("rasterio não instalado — não é possível ler GeoTIFF. Instale com: pip install rasterio")
        return None
    except Exception as exc:  # noqa
        logger.error("Erro ao carregar GeoTIFF %s: %s", path, exc)
        return None


def load_user_files(arquivos: dict, bbox: dict, nx: int, ny: int) -> dict[str, np.ndarray]:
    """
    Carrega arquivos de dados fornecidos pelo usuário.
    Retorna dict com as camadas carregadas com sucesso.
    """
    loaded = {}
    for key, path in arquivos.items():
        if not path:
            continue
        if not __import__("os").path.isfile(path):
            logger.warning("Arquivo não encontrado: %s (camada %s ignorada)", path, key)
            continue
        ext = path.lower().rsplit(".", 1)[-1]
        if ext == "csv":
            arr = _load_csv_layer(path, bbox, nx, ny)
        elif ext in ("tif", "tiff"):
            arr = _load_geotiff_layer(path, bbox, nx, ny)
        else:
            logger.warning("Formato não suportado: %s (use CSV ou GeoTIFF)", path)
            continue
        if arr is not None:
            loaded[key] = arr
            logger.info("Camada %s carregada de: %s", key, path)
    return loaded


def fetch_layers(bbox, nx, ny, commodity="ouro", targets=None):
    """Busca camadas reais (CPRM + ICGEM) com fallback sintético por camada."""
    synthetic = generate_synthetic_layers(bbox, ny, nx, commodity, targets)
    layers = {}
    sources = []

    def _try_key(key):
        for cand in CPRM_LAYER_CANDIDATES.get(key, []):
            arr = _fetch_cprm(cand, bbox, nx, ny)
            if arr is not None:
                logger.info("CPRM %s OK (%s)", key, cand)
                return key, arr
        return key, None

    with ThreadPoolExecutor(max_workers=5) as pool:
        futs = {pool.submit(_try_key, k): k for k in ("MAG", "K", "U", "Th")}
        futs[pool.submit(_fetch_icgem, bbox, nx, ny)] = "GRAV"
        for fut in as_completed(futs, timeout=HTTP_TIMEOUT + 2):
            key = futs[fut]
            try:
                if key == "GRAV":
                    arr = fut.result()
                    k = "GRAV"
                else:
                    k, arr = fut.result()
                if arr is not None:
                    layers[k] = arr
                    src = "CPRM" if k != "GRAV" else "ICGEM/EGM2008"
                    if src not in sources: sources.append(src)
                else:
                    layers[k] = synthetic[k]
            except Exception:  # noqa
                layers[key] = synthetic[key]

    for k in ("MAG", "K", "U", "Th", "GRAV", "BOUGUER"):
        if k not in layers:
            layers[k] = synthetic.get(k, synthetic["GRAV"].copy())

    data_type = ("Real (" + " + ".join(sources) + ")") if sources else "Sintético (demo controlado)"
    return layers, data_type


# =============================================================================
# ██████████  PIPELINE PSI  ███████████████████████████████████████████████████
# =============================================================================

COMMODITY_WEIGHTS = {
    "ouro":  {"MAG": 0.15, "GRAV": 0.10, "BOUGUER": 0.10, "K": 0.20, "U": 0.08, "Th": 0.07, "GRADIENT": 0.30},
    "cobre": {"MAG": 0.20, "GRAV": 0.12, "BOUGUER": 0.13, "K": 0.15, "U": 0.08, "Th": 0.07, "GRADIENT": 0.25},
    "ferro": {"MAG": 0.35, "GRAV": 0.25, "BOUGUER": 0.20, "K": 0.03, "U": 0.02, "Th": 0.02, "GRADIENT": 0.13},
    "prata": {"MAG": 0.12, "GRAV": 0.10, "BOUGUER": 0.10, "K": 0.22, "U": 0.10, "Th": 0.08, "GRADIENT": 0.28},
}

_LAYER_ALIAS = {"GRADIENT": "GRAD", "BOUGUER": "GRAV"}

_ADJUST_PARAMS = {
    "ouro":  {"shielding": 0.30, "field": 0.30, "gradient": 0.40},
    "cobre": {"shielding": 0.35, "field": 0.35, "gradient": 0.30},
    "ferro": {"shielding": 0.50, "field": 0.35, "gradient": 0.15},
    "prata": {"shielding": 0.30, "field": 0.35, "gradient": 0.35},
}

_PSI_CFG = {"L0": 1.0, "lambda_decay": 0.35}


def _normalize_layers(layers):
    scaler = RobustScaler()
    out = {}
    for name, arr in layers.items():
        flat = arr.flatten().reshape(-1, 1)
        norm = scaler.fit_transform(flat).reshape(arr.shape)
        norm = (norm - norm.min()) / (norm.max() - norm.min() + 1e-9)
        out[name] = norm
    return out


def _robust_normalize(arr):
    lo, hi = arr.min(), arr.max()
    return (arr - lo) / (hi - lo) if hi - lo > 1e-9 else np.zeros_like(arr)


def _normalize_commodity(c):
    m = {"ouro": "ouro", "gold": "ouro", "au": "ouro",
         "cobre": "cobre", "copper": "cobre", "cu": "cobre",
         "ferro": "ferro", "iron": "ferro", "fe": "ferro",
         "prata": "prata", "silver": "prata", "ag": "prata"}
    return m.get(c.lower().strip(), "ouro")


def _psi_score(smoothed, commodity):
    weights = COMMODITY_WEIGHTS.get(commodity, COMMODITY_WEIGHTS["ouro"])
    base = np.zeros_like(next(iter(smoothed.values())))
    used = {}
    for layer, w in weights.items():
        key = _LAYER_ALIAS.get(layer, layer)
        if key in smoothed:
            base += smoothed[key] * w
            used[layer] = w
    return _robust_normalize(base), used


def _shielding_index(sm):
    mag = sm.get("MAG", np.zeros(1))
    grav = sm.get("GRAV", np.zeros(1))
    d = 0.6 * mag + 0.4 * grav
    lo, hi = np.percentile(d, 5), np.percentile(d, 95)
    if abs(hi - lo) < 1e-12:
        return np.zeros_like(d)
    return np.clip((d - lo) / (hi - lo), 0, 1)


def _latent_field(sigma, LON, LAT, bbox):
    cx = (bbox["lonMin"] + bbox["lonMax"]) / 2
    cy = (bbox["latMin"] + bbox["latMax"]) / 2
    depth = np.sqrt((LON - cx)**2 + (LAT - cy)**2)
    depth_norm = depth / (depth.max() + 1e-9)
    field = _PSI_CFG["L0"] * (1 - sigma * np.exp(-_PSI_CFG["lambda_decay"] * depth_norm))
    return np.clip(field, 0.01, 1.0)


def _shielding_gradient(sigma):
    gy, gx = np.gradient(np.nan_to_num(sigma))
    g = np.sqrt(gx**2 + gy**2)
    m = g.max()
    return g / m if m > 0 else g


def _psi_adjust(base, sigma, field, gradient, commodity):
    p = _ADJUST_PARAMS.get(commodity, _ADJUST_PARAMS["ouro"])
    combined = ((0.5 + 0.5 * sigma) * p["shielding"]
                + (1.5 - 0.5 * field) * p["field"]
                + (1.0 + gradient) * p["gradient"])
    return np.clip(base * np.tanh(combined), 0, 1)


def _rank_targets(targets, psi, LON, LAT, radius_km):
    results = []
    for t in targets:
        r_deg = radius_km / 111.0
        dist = np.sqrt((LON - t["lon"])**2 + (LAT - t["lat"])**2)
        mask = dist <= r_deg
        if mask.sum() == 0:
            score = float(psi.mean())
        else:
            z = psi[mask]
            score = float(z.max() * 0.6 + z.mean() * 0.4)
        results.append({"id": t["id"], "lon": t["lon"], "lat": t["lat"],
                        "psiScore": round(score, 4),
                        "area_km2": round(mask.sum() * 0.04 * 111**2, 1)})
    results.sort(key=lambda x: x["psiScore"], reverse=True)
    for i, r in enumerate(results):
        r["priority"] = i + 1
        r["cluster"] = "ABCDEFGHIJ"[i % 10]
    return results


def _detect_zones(psi, bbox, lons_1d, lats_1d, top_pct=0.05, min_pixels=3):
    threshold = np.percentile(psi, (1 - top_pct) * 100)
    binary = psi >= threshold
    labeled, n = label(binary)
    grid_h, grid_w = psi.shape
    zones = []
    for zone_id in range(1, n + 1):
        mask = labeled == zone_id
        if mask.sum() < min_pixels:
            continue
        score = float(psi[mask].mean())
        ys, xs = np.where(mask)
        cx = float(lons_1d[int(xs.mean())])
        cy = float(lats_1d[int(ys.mean())])
        area = mask.sum() * ((bbox["lonMax"] - bbox["lonMin"]) / grid_w * 111) \
                           * ((bbox["latMax"] - bbox["latMin"]) / grid_h * 111)
        zones.append({"zona": zone_id, "lon": round(cx, 5), "lat": round(cy, 5),
                      "score": round(score, 4), "pixels": int(mask.sum()),
                      "area_km2": round(area, 2)})
    zones.sort(key=lambda x: x["score"], reverse=True)
    return zones


def _ternary_profile(smoothed, targets, LON, LAT, radius_km):
    profiles = []
    for t in targets:
        r_deg = radius_km / 111.0
        dist = np.sqrt((LON - t["lon"])**2 + (LAT - t["lat"])**2)
        mask = dist <= r_deg
        K  = float(smoothed["K"][mask].mean())  if mask.sum() > 0 else 0
        U  = float(smoothed["U"][mask].mean())  if mask.sum() > 0 else 0
        Th = float(smoothed["Th"][mask].mean()) if mask.sum() > 0 else 0
        tot = K + U + Th + 1e-9
        profiles.append({"name": t["id"],
                         "K": round(K/tot*100, 1), "U": round(U/tot*100, 1), "Th": round(Th/tot*100, 1)})
    return profiles


def run_analysis(config: dict) -> dict[str, Any]:
    """Executa o pipeline PSI Analytics completo."""
    bbox       = config["bbox"]
    resolution = config.get("resolution", 0.02)
    commodity  = _normalize_commodity(config.get("commodity", "ouro"))
    radius_km  = config.get("radiusKm", 20)
    targets_in = config.get("targets", [])[:5]

    lons_1d = np.arange(bbox["lonMin"], bbox["lonMax"], resolution)
    lats_1d = np.arange(bbox["latMin"], bbox["latMax"], resolution)
    LON, LAT = np.meshgrid(lons_1d, lats_1d)
    nx, ny = LON.shape

    logger.info("Grid: %d × %d pixels | commodity: %s | bbox: %s", nx, ny, commodity, bbox)

    # 1. Busca dados reais / fallback sintético
    layers, data_type = fetch_layers(bbox, nx, ny, commodity, targets_in)
    logger.info("Fonte de dados automática: %s", data_type)

    # 1b. Substitui camadas pelos arquivos do usuário (se fornecidos)
    arquivos = config.get("arquivos", {})
    user_layers = load_user_files(arquivos, bbox, nx, ny)
    if user_layers:
        layers.update(user_layers)
        camadas_usuario = list(user_layers.keys())
        data_type = f"Dados do cliente ({', '.join(camadas_usuario)})"
        if len(user_layers) < 5:
            data_type += " + automático"
        logger.info("Camadas substituídas pelos dados do cliente: %s", camadas_usuario)

    # 2. Normalização RobustScaler
    normalized = _normalize_layers(layers)

    # 3. Suavização Gaussiana (σ = 1.5 pixels)
    smoothed = {k: gaussian_filter(v.astype(np.float32), sigma=1.5)
                for k, v in normalized.items()}

    # 4. Camada GRAD: gradiente espacial do K
    k_layer = smoothed.get("K", np.zeros((nx, ny), np.float32))
    gx, gy = np.gradient(k_layer)
    grad_k = np.sqrt(gx**2 + gy**2)
    smoothed["GRAD"] = grad_k / grad_k.max() if grad_k.max() > 1e-9 else grad_k

    # 5. PSI Score base ponderado
    psi_base, weights_used = _psi_score(smoothed, commodity)

    # 6. Bônus epitermal (K alto + MAG/GRAV baixos → Au/Ag)
    k_sm = smoothed.get("K", np.zeros_like(psi_base))
    mg   = (smoothed.get("MAG", np.zeros_like(psi_base)) + smoothed.get("GRAV", np.zeros_like(psi_base))) / 2
    psi_base = np.clip(psi_base + np.where((k_sm > 0.6) & (mg < 0.5), 0.08 * k_sm, 0.0), 0, 1)
    psi_base = _robust_normalize(psi_base)

    # 7. GeoPSI v4.0 — ajuste não-linear por commodity
    sigma    = _shielding_index(smoothed)
    field    = _latent_field(sigma, LON, LAT, bbox)
    gradient = _shielding_gradient(sigma)
    psi = _psi_adjust(psi_base, sigma, field, smoothed.get("GRAD", gradient), commodity)
    psi = _robust_normalize(psi)

    # 8. Auto-detecção de alvos se nenhum foi informado
    if not targets_in:
        lm = psi == maximum_filter(psi, size=max(3, min(nx, ny) // 15))
        cand = lm & (psi >= np.percentile(psi, 90))
        ys_c, xs_c = np.where(cand)
        if len(ys_c) > 0:
            top_idx = np.argsort(psi[ys_c, xs_c])[::-1][:3]
            targets_in = [{"id": f"Z{i+1}",
                           "lon": float(lons_1d[xs_c[idx]]),
                           "lat": float(lats_1d[ys_c[idx]])}
                          for i, idx in enumerate(top_idx)]
            logger.info("Alvos auto-detectados: %s", [t["id"] for t in targets_in])

    # 9. Resultados
    is_demo   = "Sintético" in data_type or "Sintetico" in data_type
    top_pct   = 0.15 if is_demo else 0.05
    zones     = _detect_zones(psi, bbox, lons_1d, lats_1d, top_pct=top_pct)
    ranked    = _rank_targets(targets_in, psi, LON, LAT, radius_km)
    ternary   = _ternary_profile(smoothed, targets_in, LON, LAT, radius_km)

    layer_summary = []
    for name, arr in smoothed.items():
        if name == "GRAD": continue
        thr = np.percentile(arr, 95)
        layer_summary.append({
            "name": {"K": "K (Potássio)", "U": "U (Urânio)", "Th": "Th (Tório)"}.get(name, name),
            "anomaly": round(float(arr[arr >= thr].mean()), 3),
        })

    return {
        "jobId": str(uuid.uuid4()),
        "commodity": commodity,
        "dataType": data_type,
        "bbox": bbox,
        "resolution": resolution,
        "radiusKm": radius_km,
        "weightsUsed": weights_used,
        "topZones": len(zones),
        "targets": ranked,
        "zones": zones[:20],       # top 20 zonas
        "layers": layer_summary,
        "ternary": ternary,
        "createdAt": datetime.utcnow().isoformat() + "Z",
        "_psi_grid": psi,          # array numpy — removido ao salvar JSON
    }


# =============================================================================
# ██████████  SAÍDA  ██████████████████████████████████████████████████████████
# =============================================================================

def save_json(result: dict, path: str):
    """Salva resultado em JSON (remove arrays numpy não-serializáveis)."""
    clean = {k: v for k, v in result.items() if not k.startswith("_")}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(clean, f, ensure_ascii=False, indent=2, default=str)
    logger.info("JSON salvo em: %s", path)


def save_csv(records: list[dict], path: str):
    if not records:
        logger.warning("Nenhum registro para salvar em %s", path)
        return
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(records[0].keys()))
        writer.writeheader()
        writer.writerows(records)
    logger.info("CSV salvo em: %s", path)


def save_map(psi_grid, bbox, targets, path: str):
    """Gera mapa 2D de favorabilidade em PNG."""
    try:
        import matplotlib.pyplot as plt
        import matplotlib.patches as mpatches
        from matplotlib.colors import LinearSegmentedColormap

        cmap = LinearSegmentedColormap.from_list("psi", [
            "#0d0d2b", "#1a237e", "#1565c0", "#00897b",
            "#f9a825", "#e65100", "#b71c1c"
        ])

        fig, ax = plt.subplots(figsize=(10, 8))
        im = ax.imshow(
            psi_grid, origin="lower", cmap=cmap, vmin=0, vmax=1,
            extent=[bbox["lonMin"], bbox["lonMax"], bbox["latMin"], bbox["latMax"]],
            aspect="auto",
        )
        plt.colorbar(im, ax=ax, label="PSI Score (0–1)")

        for t in targets:
            ax.plot(t["lon"], t["lat"], "w*", markersize=12, markeredgecolor="k", markeredgewidth=0.5)
            ax.annotate(f"  {t['id']} ({t.get('psiScore', 0):.3f})",
                        (t["lon"], t["lat"]), color="white", fontsize=8,
                        bbox=dict(boxstyle="round,pad=0.2", fc="black", alpha=0.5))

        ax.set_xlabel("Longitude (°)")
        ax.set_ylabel("Latitude (°)")
        ax.set_title("PSI Analytics — Mapa de Favorabilidade Mineral", fontsize=13, weight="bold")
        ax.grid(color="white", alpha=0.15, linewidth=0.5)

        plt.tight_layout()
        plt.savefig(path, dpi=150, bbox_inches="tight")
        plt.close()
        logger.info("Mapa PNG salvo em: %s", path)
    except ImportError:
        logger.warning("matplotlib não instalado — mapa PNG não gerado. Instale com: pip install matplotlib")


# =============================================================================
# ██████████  MAIN  ███████████████████████████████████████████████████████████
# =============================================================================

if __name__ == "__main__":
    print("=" * 60)
    print("  PSI Analytics — Análise de Favorabilidade Mineral")
    print("=" * 60)
    print(f"  Commodity : {CONFIG['commodity'].upper()}")
    print(f"  Bbox      : {CONFIG['bbox']}")
    print(f"  Alvos     : {[t['id'] for t in CONFIG['targets']] or 'auto-detectar'}")

    arquivos_cfg = CONFIG.get("arquivos", {})
    arquivos_ativos = {k: v for k, v in arquivos_cfg.items() if v}
    if arquivos_ativos:
        print(f"  Arquivos  : {arquivos_ativos}")
    else:
        print("  Arquivos  : usando dados automáticos (CPRM + ICGEM)")
    print("=" * 60)

    result = run_analysis(CONFIG)

    # Salva saídas
    save_json(result, OUTPUT_JSON)
    save_csv(result["zones"],   OUTPUT_ZONAS_CSV)
    save_csv(result["targets"], OUTPUT_ALVOS_CSV)
    save_map(result["_psi_grid"], result["bbox"], result["targets"], OUTPUT_MAPA_PNG)

    # Resumo no terminal
    print("\n── RANKING DE ALVOS ─────────────────────────────────────")
    for t in result["targets"]:
        print(f"  #{t['priority']} {t['id']:4s} | PSI: {t['psiScore']:.4f} | "
              f"Lon: {t['lon']:.4f}  Lat: {t['lat']:.4f} | Cluster: {t['cluster']}")

    print(f"\n── ZONAS PRIORITÁRIAS: {result['topZones']} detectadas (top {len(result['zones'])} exibidas) ──")
    for z in result["zones"][:5]:
        print(f"  Zona {z['zona']:3d} | Score: {z['score']:.4f} | "
              f"Lon: {z['lon']:.4f}  Lat: {z['lat']:.4f} | Área: {z['area_km2']:.1f} km²")

    print(f"\n── FONTE DOS DADOS: {result['dataType']} ──")
    print(f"── Job ID: {result['jobId']} ──")
    print(f"\nArquivos gerados:")
    print(f"  {OUTPUT_JSON}")
    print(f"  {OUTPUT_ZONAS_CSV}")
    print(f"  {OUTPUT_ALVOS_CSV}")
    print(f"  {OUTPUT_MAPA_PNG}")
    print("=" * 60)
