from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

ALLOWED_COMMODITIES = {"OURO", "COBRE", "FERRO", "NIQUEL", "MANGANES", "ZINCO", "CHUMBO"}


class BBox(BaseModel):
    lonMin: float = Field(ge=-180, le=180)
    latMin: float = Field(ge=-90, le=90)
    lonMax: float = Field(ge=-180, le=180)
    latMax: float = Field(ge=-90, le=90)

    @field_validator("lonMax")
    @classmethod
    def lon_order(cls, v, info):
        if "lonMin" in info.data and v <= info.data["lonMin"]:
            raise ValueError("lonMax deve ser maior que lonMin")
        return v

    @field_validator("latMax")
    @classmethod
    def lat_order(cls, v, info):
        if "latMin" in info.data and v <= info.data["latMin"]:
            raise ValueError("latMax deve ser maior que latMin")
        return v


class TargetIn(BaseModel):
    id: str = Field(min_length=1, max_length=20, pattern=r"^[A-Za-z0-9_-]+$")
    lon: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)


class AnalysisConfig(BaseModel):
    bbox: BBox
    resolution: float = Field(default=0.02, ge=0.005, le=0.1)
    commodity: str = "OURO"
    radiusKm: float = Field(default=20.0, ge=1, le=100)
    targets: list[TargetIn] = Field(default=[], max_length=20)

    @field_validator("commodity")
    @classmethod
    def commodity_allowed(cls, v):
        v = v.upper().strip()
        if v not in ALLOWED_COMMODITIES:
            raise ValueError(f"Commodity inválido. Permitidos: {', '.join(sorted(ALLOWED_COMMODITIES))}")
        return v


class TargetResult(BaseModel):
    id: str
    lon: float
    lat: float
    psiScore: float
    priority: int
    cluster: str
    area_km2: float


class LayerSummary(BaseModel):
    name: str
    anomaly: float


class TernaryPoint(BaseModel):
    name: str
    K: float
    U: float
    Th: float


class AnalysisResult(BaseModel):
    jobId: str
    commodity: str
    dataType: str
    bbox: BBox
    targets: list[TargetResult]
    layers: list[LayerSummary]
    ternary: list[TernaryPoint]
    topZones: int
    radiusKm: float = 20.0
    zones: list[dict] = []
    subtargets: list[dict] = []
    targetStats: list[dict] = []
    createdAt: str
