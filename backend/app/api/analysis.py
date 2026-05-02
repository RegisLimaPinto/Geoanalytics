import asyncio
from datetime import datetime
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database import get_db
from app.models.payment import UserCredits
from app.models.user import User
from app.schemas.geo_schemas import AnalysisConfig, AnalysisResult
from app.services.psi_index import run_pipeline

router = APIRouter()

# In-memory job store (replace with Redis/DB in production)
_jobs: dict[str, dict[str, Any]] = {}


def _check_and_consume_credit(user: User, db: Session):
    """Admin tem acesso ilimitado. Outros usuários precisam de crédito."""
    if user.role == "admin":
        return
    uc = db.query(UserCredits).filter(UserCredits.user_id == user.id).first()
    if not uc or uc.balance < 1:
        raise HTTPException(
            status_code=402,
            detail="Créditos insuficientes. Adquira uma análise para continuar.",
        )
    uc.balance -= 1
    uc.updated_at = datetime.utcnow()
    db.commit()


@router.post("/run", response_model=dict)
async def run_analysis(
    config: AnalysisConfig,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Inicia o pipeline de análise GeoProspecting.
    Retorna imediatamente com job_id; resultado disponível em GET /{job_id}/results.
    """
    _check_and_consume_credit(current_user, db)

    config_dict = config.model_dump()

    # For small configs, run synchronously and return result inline
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, run_pipeline, config_dict)

    job_id = result["jobId"]
    _jobs[job_id] = result

    return {"job_id": job_id, "status": "completed"}


@router.get("/{job_id}/results", response_model=AnalysisResult)
async def get_results(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retorna os resultados de uma análise pelo job_id."""
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    return _jobs[job_id]


@router.get("/jobs", response_model=list[dict])
async def list_jobs(current_user: User = Depends(get_current_user)):
    """Lista os jobs de análise disponíveis."""
    return [
        {"job_id": k, "commodity": v.get("commodity"), "createdAt": v.get("createdAt")}
        for k, v in _jobs.items()
    ]
