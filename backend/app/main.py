import re

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse


def _traduzir_msg(msg: str, tipo: str) -> str:
    m = re.match(r"String should have at least (\d+) character", msg)
    if m:
        return f"Deve ter pelo menos {m.group(1)} caracteres"
    m = re.match(r"String should have at most (\d+) character", msg)
    if m:
        return f"Deve ter no máximo {m.group(1)} caracteres"
    if "valid email" in msg.lower() or "value_error.email" in tipo:
        return "E-mail inválido"
    if tipo == "missing" or "field required" in msg.lower():
        return "Campo obrigatório"
    if "value is not a valid" in msg.lower():
        return "Valor inválido"
    return msg

from app.api import admin, analysis, auth, geo, payments
from app.database import engine
from app.models.job import AnalysisJob  # noqa: F401 — ensure table created  # pylint: disable=unused-import
from app.models.payment import Payment, UserCredits  # noqa: F401 — ensure tables created  # pylint: disable=unused-import
from app.models.subscription import Subscription  # noqa: F401  # pylint: disable=unused-import
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
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["Analysis"])
app.include_router(geo.router, prefix="/api/geo", tags=["Geo"])
app.include_router(payments.router, prefix="/api/payments", tags=["Payments"])


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    print(f"[VALIDATION 422] {request.method} {request.url.path} -> {errors}", flush=True)
    # Sanitiza para JSON (remove objetos nao-serializaveis como ValueError em 'ctx')
    safe = []
    for e in errors:
        tipo = str(e.get("type", ""))
        msg = _traduzir_msg(str(e.get("msg", "")), tipo)
        safe.append({
            "loc": list(e.get("loc", [])),
            "msg": msg,
            "type": tipo,
        })
    return JSONResponse(status_code=422, content={"detail": safe})


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "geoanalytics"}
