from pydantic import BaseModel, Field
from typing import Optional


class BBox(BaseModel):
    lonMin: float
    latMin: float
    lonMax: float
    latMax: float


class TargetIn(BaseModel):
    id: str
    lon: float
    lat: float


class AnalysisConfig(BaseModel):
    bbox: BBox
    resolution: float = Field(default=0.02, ge=0.005, le=0.1)
    commodity: str = "OURO"
    radiusKm: float = Field(default=20.0, ge=1, le=100)
    targets: list[TargetIn] = []


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
    createdAt: str
