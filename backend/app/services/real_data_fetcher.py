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
from scipy.ndimage import zoom
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

HTTP_TIMEOUT = 3  # segundos — fallback sintético se não responder em 3s

# Cache em memória: bbox_hash → (layers, data_type)  (TTL: processo vivo)
_FETCH_CACHE: dict[str, tuple[dict, str]] = {}


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
    except httpx.TimeoutException:
        raise  # propaga para _try_cprm_key fazer early-exit
    except Exception as exc:  # pylint: disable=broad-except
        logger.debug("CPRM WCS %s → %s", layer, exc)
        return None


def _try_cprm_key(key: str, bbox: dict, nx: int, ny: int) -> Optional[np.ndarray]:
    """Tenta todas as camadas candidatas para uma chave (MAG, K, U, Th).
    Se uma requisição demorar (timeout), pula o restante dos candidatos — o servidor está lento.
    """
    for candidate in CPRM_LAYER_CANDIDATES.get(key, []):
        try:
            result = _fetch_cprm_layer(candidate, bbox, nx, ny)
            if result is not None:
                logger.info("CPRM %s: camada '%s' OK", key, candidate)
                return result
        except httpx.TimeoutException:
            logger.debug("CPRM %s timeout — pulando candidatos restantes", key)
            return None  # servidor lento: não tenta os outros candidatos
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

    except Exception as exc:  # pylint: disable=broad-except
        logger.warning("ICGEM gravity → %s", exc)
        return None


# ─── Sintético controlado (modo DEMO) ───────────────────────────────────────

def _synthetic_layers(
    nx: int,
    ny: int,
    _seed: int,
    config: Optional[dict] = None,
) -> dict[str, np.ndarray]:
    """
    Gera camadas sintéticas via demo_synthetic (anomalias gaussianas controladas).
    Mesma config → mesmo resultado (rng seed=42 fixo no demo_synthetic).
    """
    from app.services.demo_synthetic import generate_controlled_synthetic_layers

    demo_cfg = {
        "bbox": config["bbox"] if config else {"lonMin": 0, "latMin": 0, "lonMax": 1, "latMax": 1},
        "grid_w": ny,
        "grid_h": nx,
        "commodity": (config or {}).get("commodity", "gold"),
        "targets": (config or {}).get("targets", []),
    }
    layers, _ = generate_controlled_synthetic_layers(demo_cfg)
    return layers


# ─── Entry point ─────────────────────────────────────────────────────────────

def fetch_layers(
    bbox: dict,
    nx: int,
    ny: int,
    config: Optional[dict] = None,
) -> tuple[dict[str, np.ndarray], str]:
    """
    Retorna (layers_dict, data_type_label).

    Busca CPRM (MAG/K/U/Th) e ICGEM (GRAV) em paralelo via ThreadPoolExecutor.
    Camadas que falharem são preenchidas com sintético controlado (demo).
    Resultados são cacheados em memória por bbox (hash).
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    seed = _bbox_seed(bbox)
    cache_key = f"{seed}|{nx}|{ny}"
    if cache_key in _FETCH_CACHE:
        logger.info("fetch_layers: cache hit para bbox %s", cache_key)
        return _FETCH_CACHE[cache_key]
    synthetic = _synthetic_layers(nx, ny, seed, config)
    layers: dict[str, np.ndarray] = {}
    sources_used: list[str] = []

    def _fetch_key(key: str) -> tuple[str, Optional[np.ndarray]]:
        return key, _try_cprm_key(key, bbox, nx, ny)

    def _fetch_grav() -> tuple[str, Optional[np.ndarray]]:
        return "GRAV", _fetch_icgem_gravity(bbox, nx, ny)

    # Fetch all 5 fontes em paralelo
    tasks = {"MAG": _fetch_key, "K": _fetch_key, "U": _fetch_key, "Th": _fetch_key}
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = {pool.submit(fn, key): key for key, fn in tasks.items()}
        futures[pool.submit(_fetch_grav)] = "GRAV"

        for future in as_completed(futures, timeout=HTTP_TIMEOUT + 1):
            try:
                key, result = future.result()
                if result is not None:
                    layers[key] = result
                    source = "CPRM" if key != "GRAV" else "ICGEM/EGM2008"
                    if source not in sources_used:
                        sources_used.append(source)
                else:
                    layers[key] = synthetic[key]
            except Exception as exc:  # pylint: disable=broad-except
                key = futures[future]
                logger.debug("fetch_layers %s → %s", key, exc)
                layers[key] = synthetic[key]

    # Garante que todas as camadas estão presentes (incluindo BOUGUER do sintético)
    for key in ("MAG", "K", "U", "Th", "GRAV", "BOUGUER"):
        if key not in layers:
            layers[key] = synthetic.get(key, synthetic["GRAV"].copy())

    if sources_used:
        data_type = "Real (" + " + ".join(sources_used) + ")"
    else:
        data_type = "Sintetico (demo controlado)"

    result = (layers, data_type)
    _FETCH_CACHE[cache_key] = result
    return result
