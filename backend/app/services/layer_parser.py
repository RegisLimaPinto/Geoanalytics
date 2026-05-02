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
