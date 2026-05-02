import asyncio
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException

from app.schemas.geo_schemas import AnalysisConfig, AnalysisResult
from app.services.psi_index import run_pipeline

router = APIRouter()

# In-memory job store (replace with Redis/DB in production)
_jobs: dict[str, dict[str, Any]] = {}


@router.post("/run", response_model=dict)
async def run_analysis(config: AnalysisConfig, background_tasks: BackgroundTasks):
    """
    Inicia o pipeline de análise GeoProspecting.
    Retorna imediatamente com job_id; resultado disponível em GET /{job_id}/results.
    """
    config_dict = config.model_dump()

    # For small configs, run synchronously and return result inline
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, run_pipeline, config_dict)

    job_id = result["jobId"]
    _jobs[job_id] = result

    return {"job_id": job_id, "status": "completed"}


@router.get("/{job_id}/results", response_model=AnalysisResult)
async def get_results(job_id: str):
    """Retorna os resultados de uma análise pelo job_id."""
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    return _jobs[job_id]


@router.get("/jobs", response_model=list[dict])
async def list_jobs():
    """Lista os jobs de análise disponíveis."""
    return [
        {"job_id": k, "commodity": v.get("commodity"), "createdAt": v.get("createdAt")}
        for k, v in _jobs.items()
    ]
