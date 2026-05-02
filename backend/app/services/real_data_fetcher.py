"""
Fetcher de dados geofísicos reais para o pipeline GeoProspecting.

Fontes:
  1. CPRM GeoServer WCS  — magnética + radiométrica K/U/Th (cobertura Brasil)
  2. ICGEM HTTP API      — anomalia de gravidade, global (modelo EGM2008)
  3. Fallback            — sintético determinístico por bbox (mesmo input = mesmo output)

Todos os métodos são síncronos (chamados dentro de run_in_executor no FastAPI).
"""

from __future__ import annotations

import hashlib
import logging
from typing import Optional

import httpx
import numpy as np
from scipy.ndimage import gaussian_filter, zoom
from scipy.interpolate import RegularGridInterpolator

logger = logging.getLogger(__name__)

# ─── CPRM GeoServer WCS ──────────────────────────────────────────────────────
# Endpoint público do GeoServer do Serviço Geológico do Brasil (CPRM).
# Camadas dos levantamentos aerogeofísicos nacionais (formato GeoTIFF).
CPRM_WCS = "https://geosgb.cprm.gov.br/geosgb/ows"

# Cada chave mapeia para uma lista de possíveis nomes de camada (tentados em ordem)
CPRM_LAYER_CANDIDATES: dict[str, list[str]] = {
    "MAG": [
        "levantamentos_aereo:anomalia_mag_reducao_polo",
        "levantamentos_aereo:anomalia_magnetica_total",
        "aerogeofisica:anomalia_magnetica_total",
        "geofisica:anomalia_magnetica",
    ],
    "K": [
        "levantamentos_aereo:potassio",
        "levantamentos_aereo:k_perc",
        "aerogeofisica:k_perc",
        "geofisica:k",
    ],
    "U": [
        "levantamentos_aereo:uranio_equivalente",
        "levantamentos_aereo:u_ppm",
        "aerogeofisica:u_ppm",
        "geofisica:u",
    ],
    "Th": [
        "levantamentos_aereo:torio_equivalente",
        "levantamentos_aereo:th_ppm",
        "aerogeofisica:th_ppm",
        "geofisica:th",
    ],
}

# ─── ICGEM Gravity API (GFZ Potsdam) ─────────────────────────────────────────
ICGEM_API = "https://icgem.gfz-potsdam.de/calcgrid"

HTTP_TIMEOUT = 25  # segundos


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _bbox_seed(bbox: dict) -> int:
    """Semente determinística a partir da bbox (mesma área → mesmo resultado)."""
    key = f"{bbox['lonMin']:.4f}|{bbox['latMin']:.4f}|{bbox['lonMax']:.4f}|{bbox['latMax']:.4f}"
    return int(hashlib.md5(key.encode()).hexdigest()[:8], 16) % (2**31)


def _resample(arr: np.ndarray, nx: int, ny: int) -> np.ndarray:
    """Reamostra 2-D array para shape (nx, ny) via interpolação bilinear."""
    if arr.shape == (nx, ny):
        return arr.astype(np.float32)
    zy = nx / arr.shape[0]
    zx = ny / arr.shape[1]
    return zoom(arr.astype(np.float32), (zy, zx), order=1)


def _safe_nodata_fill(arr: np.ndarray, nodata: Optional[float]) -> np.ndarray:
    """Substitui nodata / ±inf / NaN pela mediana."""
    result = arr.astype(np.float32)
    if nodata is not None:
        result[result == nodata] = np.nan
    result[~np.isfinite(result)] = np.nan
    if np.any(np.isnan(result)):
        median = float(np.nanmedian(result))
        result = np.where(np.isnan(result), median, result)
    return result


# ─── CPRM WCS ─────────────────────────────────────────────────────────────────

def _fetch_cprm_layer(layer: str, bbox: dict, nx: int, ny: int) -> Optional[np.ndarray]:
    """Tenta baixar uma camada do CPRM WCS como GeoTIFF."""
    try:
        import rasterio
        from rasterio.io import MemoryFile
    except ImportError:
        return None

    params = {
        "service": "WCS",
        "version": "1.0.0",
        "request": "GetCoverage",
        "coverage": layer,
        "bbox": f"{bbox['lonMin']},{bbox['latMin']},{bbox['lonMax']},{bbox['latMax']}",
        "width": str(max(ny, 16)),
        "height": str(max(nx, 16)),
        "format": "GeoTIFF",
        "crs": "EPSG:4326",
    }
    try:
        r = httpx.get(CPRM_WCS, params=params, timeout=HTTP_TIMEOUT)
        r.raise_for_status()
        ct = r.headers.get("content-type", "")
        # Se a resposta não é imagem, CPRM retornou XML de erro
        if "xml" in ct.lower() or "html" in ct.lower() or len(r.content) < 512:
            return None
        with MemoryFile(r.content) as mf:
            with mf.open() as ds:
                arr = ds.read(1)
                arr = _safe_nodata_fill(arr, ds.nodata)
        return _resample(arr, nx, ny)
    except Exception as exc:
        logger.debug("CPRM WCS %s → %s", layer, exc)
        return None


def _try_cprm_key(key: str, bbox: dict, nx: int, ny: int) -> Optional[np.ndarray]:
    """Tenta todas as camadas candidatas para uma chave (MAG, K, U, Th)."""
    for candidate in CPRM_LAYER_CANDIDATES.get(key, []):
        result = _fetch_cprm_layer(candidate, bbox, nx, ny)
        if result is not None:
            logger.info("CPRM %s: camada '%s' OK", key, candidate)
            return result
    return None


# ─── ICGEM Gravity ───────────────────────────────────────────────────────────

def _fetch_icgem_gravity(bbox: dict, nx: int, ny: int) -> Optional[np.ndarray]:
    """
    Baixa anomalia de gravidade (mgal) do ICGEM usando o modelo EGM2008.
    A API retorna um grid em texto no formato ICGEM.
    """
    lon_range = bbox["lonMax"] - bbox["lonMin"]
    lat_range = bbox["latMax"] - bbox["latMin"]
    # Passo de grade: limita entre 0.02° e 0.5° para evitar grades enormes
    step = max(0.02, min(0.5, max(lon_range, lat_range) / 40))

    params = {
        "model": "EGM2008",
        "lat1": f"{bbox['latMin']:.4f}",
        "lat2": f"{bbox['latMax']:.4f}",
        "lon1": f"{bbox['lonMin']:.4f}",
        "lon2": f"{bbox['lonMax']:.4f}",
        "step": f"{step:.4f}",
        "functional": "gravity",
        "format": "icgem",
        "unit": "mgal",
        "tide": "zero_tide",
    }
    try:
        r = httpx.get(ICGEM_API, params=params, timeout=HTTP_TIMEOUT)
        r.raise_for_status()

        lats_out, lons_out, vals = [], [], []
        in_data = False
        for line in r.text.splitlines():
            if "end_of_head" in line:
                in_data = True
                continue
            if not in_data or not line.strip():
                continue
            parts = line.split()
            if len(parts) >= 3:
                try:
                    lats_out.append(float(parts[0]))
                    lons_out.append(float(parts[1]))
                    vals.append(float(parts[2]))
                except ValueError:
                    continue

        if len(vals) < 4:
            return None

        lats_arr = np.array(lats_out)
        lons_arr = np.array(lons_out)
        vals_arr = np.array(vals, dtype=np.float32)

        # Reconstruir grid regular
        unique_lats = np.sort(np.unique(lats_arr))
        unique_lons = np.sort(np.unique(lons_arr))
        grid = np.full((len(unique_lats), len(unique_lons)), np.nan, dtype=np.float32)
        lat_idx = {v: i for i, v in enumerate(unique_lats)}
        lon_idx = {v: i for i, v in enumerate(unique_lons)}
        for la, lo, va in zip(lats_out, lons_out, vals):
            grid[lat_idx[la], lon_idx[lo]] = va

        grid = _safe_nodata_fill(grid, None)

        # Interpolar para o grid alvo usando RegularGridInterpolator
        interp = RegularGridInterpolator(
            (unique_lats, unique_lons), grid,
            method="linear", bounds_error=False, fill_value=float(np.nanmean(grid))
        )
        target_lats = np.linspace(bbox["latMin"], bbox["latMax"], nx)
        target_lons = np.linspace(bbox["lonMin"], bbox["lonMax"], ny)
        TLAT, TLON = np.meshgrid(target_lats, target_lons, indexing="ij")
        result = interp((TLAT, TLON)).astype(np.float32)

        logger.info("ICGEM GRAV: %d pontos interpolados para (%d×%d)", len(vals), nx, ny)
        return result

    except Exception as exc:
        logger.warning("ICGEM gravity → %s", exc)
        return None


# ─── Sintético determinístico (fallback) ─────────────────────────────────────

def _synthetic_layers(nx: int, ny: int, seed: int) -> dict[str, np.ndarray]:
    """
    Gera camadas sintéticas determinísticas baseadas na seed (derivada da bbox).
    Mesma área → mesma topografia geofísica, independente de quando é calculado.
    """
    rng = np.random.default_rng(seed)
    LN, LT = np.meshgrid(np.linspace(0, 1, ny), np.linspace(0, 1, nx))

    def blob(cx, cy, sx, sy, amp):
        return amp * np.exp(
            -((LN - cx) ** 2 / (2 * sx ** 2) + (LT - cy) ** 2 / (2 * sy ** 2))
        )

    # Dois centros de anomalia, posição derivada da seed
    cx1 = float(rng.uniform(0.15, 0.45))
    cy1 = float(rng.uniform(0.45, 0.75))
    cx2 = float(rng.uniform(0.55, 0.85))
    cy2 = float(rng.uniform(0.25, 0.55))

    def layer(mean, std, a1, a2, sigma=2.0):
        raw = (rng.normal(mean, std, (nx, ny)).astype(np.float32)
               + blob(cx1, cy1, 0.10, 0.10, a1)
               + blob(cx2, cy2, 0.08, 0.08, a2))
        return gaussian_filter(raw, sigma=sigma)

    return {
        "K":    layer(0.30, 0.10, 1.4, 1.1),
        "U":    layer(0.25, 0.08, 0.9, 0.7),
        "Th":   layer(0.35, 0.12, 0.5, 0.4),
        "MAG":  layer(0.50, 0.15, 1.5, 1.2),
        "GRAV": layer(0.40, 0.12, 0.8, 0.6),
    }


# ─── Entry point ─────────────────────────────────────────────────────────────

def fetch_layers(
    bbox: dict,
    nx: int,
    ny: int,
) -> tuple[dict[str, np.ndarray], str]:
    """
    Retorna (layers_dict, data_type_label).

    Tenta fontes reais nesta ordem:
      1. CPRM WCS para MAG, K, U, Th
      2. ICGEM API para GRAV
    Camadas que falharem são preenchidas com sintético determinístico.

    Parameters
    ----------
    bbox : dict  com lonMin, latMin, lonMax, latMax
    nx   : linhas do grid (latitude)
    ny   : colunas do grid (longitude)
    """
    seed = _bbox_seed(bbox)
    synthetic = _synthetic_layers(nx, ny, seed)
    layers: dict[str, np.ndarray] = {}
    sources_used: list[str] = []

    # 1 — CPRM (MAG, K, U, Th)
    for key in ("MAG", "K", "U", "Th"):
        result = _try_cprm_key(key, bbox, nx, ny)
        if result is not None:
            layers[key] = result
            if "CPRM" not in sources_used:
                sources_used.append("CPRM")
        else:
            layers[key] = synthetic[key]

    # 2 — ICGEM (GRAV)
    grav = _fetch_icgem_gravity(bbox, nx, ny)
    if grav is not None:
        layers["GRAV"] = grav
        sources_used.append("ICGEM/EGM2008")
    else:
        layers["GRAV"] = synthetic["GRAV"]

    if sources_used:
        data_type = "Real (" + " + ".join(sources_used) + ")"
    else:
        data_type = "Sintético (determinístico)"

    return layers, data_type
