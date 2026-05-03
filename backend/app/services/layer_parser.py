"""
Parser de arquivos geofísicos enviados pelo cliente.

Suporta:
  - CSV  com colunas: lat, lon, value  (separador vírgula ou ponto-e-vírgula)
  - GeoTIFF (.tif / .tiff)             (rasterio)

Retorna array numpy 2-D reamostrado para o grid da análise.
"""

from __future__ import annotations

import io
import logging
from typing import Optional

import numpy as np
import pandas as pd
from scipy.interpolate import griddata
from scipy.ndimage import zoom

logger = logging.getLogger(__name__)

# Colunas aceitas como lat / lon / valor (case-insensitive)
_LAT_COLS  = {"lat", "latitude", "y"}
_LON_COLS  = {"lon", "long", "longitude", "x"}
_VAL_COLS  = {"value", "valor", "z", "anomaly", "anomalia",
              "mag", "grav", "bouguer", "k", "u", "th",
              "potassio", "uranio", "torio"}


def _find_col(df: pd.DataFrame, candidates: set[str]) -> Optional[str]:
    for col in df.columns:
        if col.lower().strip() in candidates:
            return col
    return None


def _safe_nodata(arr: np.ndarray, nodata: Optional[float]) -> np.ndarray:
    result = arr.astype(np.float32)
    if nodata is not None:
        result[result == nodata] = np.nan
    result[~np.isfinite(result)] = np.nan
    if np.any(np.isnan(result)):
        median = float(np.nanmedian(result))
        result = np.where(np.isnan(result), median, result)
    return result


def _resample(arr: np.ndarray, nx: int, ny: int) -> np.ndarray:
    if arr.shape == (nx, ny):
        return arr.astype(np.float32)
    zy = nx / arr.shape[0]
    zx = ny / arr.shape[1]
    return zoom(arr.astype(np.float32), (zy, zx), order=1)


# ── Spatial validation ─────────────────────────────────────────────────────────

def detect_bbox_from_csv(content: bytes) -> tuple[float, float, float, float]:
    """Detecta (lonMin, latMin, lonMax, latMax) a partir dos bytes brutos de um CSV."""
    text = content.decode("utf-8", errors="replace")
    sep = ";" if text.count(";") > text.count(",") else ","
    df = pd.read_csv(io.StringIO(text), sep=sep)
    df.columns = df.columns.str.strip()

    lat_col = _find_col(df, _LAT_COLS)
    lon_col = _find_col(df, _LON_COLS)

    if not lat_col or not lon_col:
        raise ValueError("CSV deve conter colunas de latitude e longitude.")

    lons = pd.to_numeric(df[lon_col], errors="coerce")
    lats = pd.to_numeric(df[lat_col], errors="coerce")
    valid = lons.notna() & lats.notna()

    if valid.sum() < 3:
        raise ValueError("CSV precisa de pelo menos 3 pontos válidos para detectar extensão.")

    return (
        float(lons[valid].min()),
        float(lats[valid].min()),
        float(lons[valid].max()),
        float(lats[valid].max()),
    )


def detect_bbox_from_geotiff(content: bytes) -> tuple[float, float, float, float]:
    """Detecta (lonMin, latMin, lonMax, latMax) a partir dos metadados de um GeoTIFF."""
    try:
        import rasterio
        from rasterio.io import MemoryFile
        from rasterio.warp import transform_bounds
    except ImportError:
        raise RuntimeError("rasterio não instalado.")

    with MemoryFile(content) as mf:
        with mf.open() as ds:
            b = ds.bounds
            src_crs = ds.crs
            if src_crs and not src_crs.is_geographic:
                from rasterio.crs import CRS as _CRS
                wgs84 = _CRS.from_epsg(4326)
                left, bottom, right, top = transform_bounds(src_crs, wgs84, b.left, b.bottom, b.right, b.top)
            else:
                left, bottom, right, top = b.left, b.bottom, b.right, b.top
    return (float(left), float(bottom), float(right), float(top))


def bbox_overlap_ratio(
    bbox_a: tuple[float, float, float, float],
    bbox_b: tuple[float, float, float, float],
) -> float:
    """Retorna a fração da área de bbox_a coberta pela interseção com bbox_b (0–1)."""
    ax1, ay1, ax2, ay2 = bbox_a
    bx1, by1, bx2, by2 = bbox_b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter_area = (ix2 - ix1) * (iy2 - iy1)
    area_a = (ax2 - ax1) * (ay2 - ay1)
    return float(inter_area / area_a) if area_a > 0 else 0.0


def validate_spatial_consistency(
    data_bboxes: list[tuple[float, float, float, float]],
    user_bbox: tuple[float, float, float, float],
    min_overlap: float = 0.20,
    buffer_pct: float = 0.02,
) -> dict:
    """
    Valida consistência espacial entre os dados enviados e a área de análise.

    Retorna dict com:
      final_bbox  : bbox a usar na análise (ajustado ou original)
      data_bbox   : união das extensões de todos os dados
      adjusted    : True se o bbox foi alterado
      overlap_ratio: sobreposição calculada (0–1)
      warning     : mensagem de aviso ou None
    """
    lon_min = min(b[0] for b in data_bboxes)
    lat_min = min(b[1] for b in data_bboxes)
    lon_max = max(b[2] for b in data_bboxes)
    lat_max = max(b[3] for b in data_bboxes)

    lon_buf = (lon_max - lon_min) * buffer_pct
    lat_buf = (lat_max - lat_min) * buffer_pct
    data_bbox: tuple[float, float, float, float] = (
        lon_min - lon_buf,
        lat_min - lat_buf,
        lon_max + lon_buf,
        lat_max + lat_buf,
    )

    overlap = bbox_overlap_ratio(user_bbox, data_bbox)

    if overlap >= min_overlap:
        return {
            "final_bbox": user_bbox,
            "data_bbox": data_bbox,
            "adjusted": False,
            "overlap_ratio": round(overlap, 4),
            "warning": None,
        }

    # Sobreposição insuficiente — ajusta automaticamente para a extensão dos dados
    return {
        "final_bbox": data_bbox,
        "data_bbox": data_bbox,
        "adjusted": True,
        "overlap_ratio": round(overlap, 4),
        "warning": "Área de análise ajustada automaticamente com base nos dados fornecidos.",
    }


# ── CSV ────────────────────────────────────────────────────────────────────────

def parse_csv(
    content: bytes,
    bbox: dict,
    nx: int,
    ny: int,
) -> np.ndarray:
    """
    Interpola pontos CSV irregulares para um grid regular.

    Parameters
    ----------
    content : bytes do arquivo CSV
    bbox    : {"lonMin", "latMin", "lonMax", "latMax"}
    nx, ny  : shape do grid alvo (linhas = lat, colunas = lon)
    """
    text = content.decode("utf-8", errors="replace")
    sep = ";" if text.count(";") > text.count(",") else ","
    df = pd.read_csv(io.StringIO(text), sep=sep)
    df.columns = df.columns.str.strip()

    lat_col = _find_col(df, _LAT_COLS)
    lon_col = _find_col(df, _LON_COLS)
    val_col = _find_col(df, _VAL_COLS)

    if not lat_col or not lon_col or not val_col:
        raise ValueError(
            f"CSV deve conter colunas de lat ({_LAT_COLS}), "
            f"lon ({_LON_COLS}) e valor ({_VAL_COLS}). "
            f"Encontradas: {list(df.columns)}"
        )

    df = df[[lat_col, lon_col, val_col]].dropna()
    df[val_col] = pd.to_numeric(df[val_col], errors="coerce")
    df = df.dropna()

    if len(df) < 4:
        raise ValueError("CSV precisa de pelo menos 4 pontos válidos.")

    # Grade alvo
    lons_grid = np.linspace(bbox["lonMin"], bbox["lonMax"], ny)
    lats_grid = np.linspace(bbox["latMin"], bbox["latMax"], nx)
    LON_G, LAT_G = np.meshgrid(lons_grid, lats_grid)

    arr = griddata(
        (df[lon_col].values, df[lat_col].values),
        df[val_col].values,
        (LON_G, LAT_G),
        method="linear",
        fill_value=float(df[val_col].median()),
    )

    return _safe_nodata(arr, None)


# ── GeoTIFF ───────────────────────────────────────────────────────────────────

def parse_geotiff(
    content: bytes,
    nx: int,
    ny: int,
) -> np.ndarray:
    """
    Lê GeoTIFF (banda 1) e reamostra para o grid alvo.
    """
    try:
        import rasterio
        from rasterio.io import MemoryFile
    except ImportError:
        raise RuntimeError("rasterio não instalado.")

    with MemoryFile(content) as mf:
        with mf.open() as ds:
            arr = ds.read(1).astype(np.float32)
            arr = _safe_nodata(arr, ds.nodata)

    return _resample(arr, nx, ny)


# ── Entry point ───────────────────────────────────────────────────────────────

LAYER_KEYS = {
    "gravimetria": "GRAV",
    "magnetometria": "MAG",
    "bouguer": "GRAV",   # Bouguer é redução gravimétrica → mesma camada GRAV
    "ternario_k": "K",
    "ternario_u": "U",
    "ternario_th": "Th",
}


def parse_uploaded_file(
    layer_key: str,
    filename: str,
    content: bytes,
    bbox: dict,
    nx: int,
    ny: int,
) -> tuple[str, np.ndarray]:
    """
    Faz o parse do arquivo enviado e retorna (internal_key, array_2d).

    Parameters
    ----------
    layer_key : chave do formulário (gravimetria, magnetometria, bouguer,
                ternario_k, ternario_u, ternario_th)
    filename  : nome original do arquivo
    content   : bytes do arquivo
    bbox, nx, ny : grid alvo

    Returns
    -------
    (internal_key, array) onde internal_key é MAG / GRAV / K / U / Th
    """
    if layer_key not in LAYER_KEYS:
        raise ValueError(f"Camada inválida: {layer_key}. Opções: {list(LAYER_KEYS)}")

    ext = filename.lower().rsplit(".", 1)[-1]
    if ext in ("tif", "tiff"):
        arr = parse_geotiff(content, nx, ny)
    elif ext == "csv":
        arr = parse_csv(content, bbox, nx, ny)
    else:
        raise ValueError(f"Formato não suportado: .{ext}. Use CSV ou GeoTIFF (.tif).")

    internal = LAYER_KEYS[layer_key]
    logger.info("Upload OK: %s → %s (%s) shape=%s", layer_key, internal, filename, arr.shape)
    return internal, arr
