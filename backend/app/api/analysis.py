import asyncio
from datetime import datetime
from typing import Any

import numpy as np
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database import get_db
from app.models.payment import UserCredits
from app.models.user import User
from app.schemas.geo_schemas import AnalysisConfig, AnalysisResult
from app.services.layer_parser import LAYER_KEYS, parse_uploaded_file
from app.services.psi_index import run_pipeline

router = APIRouter()

# In-memory job store (replace with Redis/DB in production)
_jobs: dict[str, dict[str, Any]] = {}

# PDF bytes per job (stored separately to avoid JSON serialization)
_job_pdfs: dict[str, bytes] = {}

# Uploaded layers keyed by session token hash → {internal_key: np.ndarray}
# Stored as lists (serializable for JSON) only after analysis starts
_uploaded_layers: dict[str, dict[str, Any]] = {}


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


@router.post("/upload-layer", response_model=dict)
async def upload_layer(
    layer_key: str = Form(...),
    bbox_lon_min: float = Form(...),
    bbox_lat_min: float = Form(...),
    bbox_lon_max: float = Form(...),
    bbox_lat_max: float = Form(...),
    resolution: float = Form(default=0.02),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Recebe um arquivo CSV ou GeoTIFF para uma camada geofísica.
    Armazena temporariamente associado ao usuário.
    layer_key: gravimetria | magnetometria | bouguer | ternario_k | ternario_u | ternario_th
    """
    if layer_key not in LAYER_KEYS:
        raise HTTPException(status_code=422, detail=f"layer_key inválido. Opções: {list(LAYER_KEYS)}")

    MAX_SIZE = 50 * 1024 * 1024  # 50 MB
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="Arquivo muito grande (máx 50 MB).")

    bbox = {"lonMin": bbox_lon_min, "latMin": bbox_lat_min,
            "lonMax": bbox_lon_max, "latMax": bbox_lat_max}

    import numpy as np
    lons_1d = np.arange(bbox["lonMin"], bbox["lonMax"], resolution)
    lats_1d = np.arange(bbox["latMin"], bbox["latMax"], resolution)
    nx, ny = len(lats_1d), len(lons_1d)

    try:
        internal_key, arr = parse_uploaded_file(
            layer_key, file.filename or "upload", content, bbox, nx, ny
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    uid = str(current_user.id)
    if uid not in _uploaded_layers:
        _uploaded_layers[uid] = {}
    _uploaded_layers[uid][internal_key] = arr

    return {
        "ok": True,
        "layer": internal_key,
        "layer_key": layer_key,
        "filename": file.filename,
        "shape": list(arr.shape),
        "min": round(float(arr.min()), 4),
        "max": round(float(arr.max()), 4),
    }


@router.delete("/upload-layer", response_model=dict)
async def clear_uploaded_layers(current_user: User = Depends(get_current_user)):
    """Remove todos os arquivos carregados pelo usuário atual."""
    _uploaded_layers.pop(str(current_user.id), None)
    return {"ok": True}


@router.get("/upload-layer/status", response_model=dict)
async def upload_status(current_user: User = Depends(get_current_user)):
    """Retorna quais camadas o usuário já enviou."""
    layers = list(_uploaded_layers.get(str(current_user.id), {}).keys())
    return {"uploaded_layers": layers}


@router.post("/run", response_model=dict)
async def run_analysis(
    config: AnalysisConfig,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Inicia o pipeline de análise GeoProspecting.
    Se o usuário enviou arquivos via /upload-layer, eles substituem as camadas automáticas.
    """
    _check_and_consume_credit(current_user, db)

    config_dict = config.model_dump()

    # Inject uploaded layers into config
    user_layers = _uploaded_layers.get(str(current_user.id), {})
    if user_layers:
        config_dict["uploaded_layers"] = {k: v.tolist() for k, v in user_layers.items()}

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, run_pipeline, config_dict)

    job_id = result["jobId"]

    # Store PDF bytes separately (not in JSON response)
    pdf_bytes = result.pop("_pdf", None)
    _jobs[job_id] = result
    if pdf_bytes:
        _job_pdfs[job_id] = pdf_bytes

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


@router.get("/{job_id}/report")
async def download_report(
    job_id: str,
    current_user: User = Depends(get_current_user),
):
    """Retorna o relatório PDF técnico gerado para o job."""
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    pdf_bytes = _job_pdfs.get(job_id)
    if not pdf_bytes:
        raise HTTPException(status_code=404, detail="PDF não disponível para este job")
    commodity = _jobs[job_id].get("commodity", "GEO")
    date_str = _jobs[job_id].get("createdAt", "")[:10]
    filename = f"GeoAnalytics_{commodity}_{date_str}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/jobs", response_model=list[dict])
async def list_jobs(current_user: User = Depends(get_current_user)):
    """Lista os jobs de análise disponíveis."""
    return [
        {"job_id": k, "commodity": v.get("commodity"), "createdAt": v.get("createdAt")}
        for k, v in _jobs.items()
    ]
