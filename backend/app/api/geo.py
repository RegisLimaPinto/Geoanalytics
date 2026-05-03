from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter()


@router.get("/bbox-info")
def bbox_info(
    lon_min: float = -41.95,
    lat_min: float = -4.75,
    lon_max: float = -40.30,
    lat_max: float = -3.90,
    resolution: float = 0.02,
):
    """Retorna informações sobre a grade para o bounding box fornecido."""
    import math

    lon_range = lon_max - lon_min
    lat_range = lat_max - lat_min
    nx = math.ceil(lat_range / resolution)
    ny = math.ceil(lon_range / resolution)
    area_km2 = lon_range * lat_range * (111.0**2)

    return {
        "bbox": {
            "lonMin": lon_min,
            "latMin": lat_min,
            "lonMax": lon_max,
            "latMax": lat_max,
        },
        "grid": {
            "nx": nx,
            "ny": ny,
            "total_pixels": nx * ny,
            "resolution_deg": resolution,
            "resolution_km": round(resolution * 111, 2),
        },
        "area_km2": round(area_km2, 1),
    }


@router.get("/default-config")
def default_config():
    """Retorna a configuração padrão do pipeline (Estudo de Caso: Ouro — CE)."""
    return {
        "bbox": {"lonMin": -41.95, "latMin": -4.75, "lonMax": -40.30, "latMax": -3.90},
        "resolution": 0.02,
        "commodity": "OURO",
        "radiusKm": 5,
        "targets": [
            {"id": "T1", "lon": -40.57, "lat": -4.65},
            {"id": "T2", "lon": -41.58, "lat": -4.30},
            {"id": "T3", "lon": -41.20, "lat": -4.52},
        ],
    }
