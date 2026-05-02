from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import analysis, geo

app = FastAPI(
    title="GeoAnalytics API",
    description="Pipeline de análise de favorabilidade mineral — PSI Analytics",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analysis.router, prefix="/api/analysis", tags=["Analysis"])
app.include_router(geo.router, prefix="/api/geo", tags=["Geo"])


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "geoanalytics"}
