from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import analysis, auth, geo, payments
from app.database import engine
from app.models.job import AnalysisJob  # noqa: F401 — ensure table created
from app.models.payment import Payment, UserCredits  # noqa: F401 — ensure tables created
from app.models.subscription import Subscription  # noqa: F401
from app.models.user import Base

# Cria as tabelas automaticamente na inicialização
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="GeoAnalytics API",
    description="Pipeline de análise de favorabilidade mineral — PSI Analytics",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "https://mineracaoanalytics.cloud",
        "https://www.mineracaoanalytics.cloud",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["Analysis"])
app.include_router(geo.router, prefix="/api/geo", tags=["Geo"])
app.include_router(payments.router, prefix="/api/payments", tags=["Payments"])


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "geoanalytics"}
