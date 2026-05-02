import asyncio
import json
from datetime import datetime
from typing import Any

import numpy as np
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.auth import decode_token
from app.database import get_db
from app.models.user import User

_oauth2_optional = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def _get_user_token_or_query(
    header_token: str | None = Depends(_oauth2_optional),
    token: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> User:
    """Aceita JWT via Authorization header OU ?token= query param."""
    raw = header_token or token
    if not raw:
        raise HTTPException(status_code=401, detail="Token ausente")
    payload = decode_token(raw)
    if not payload:
        raise HTTPException(status_code=401, detail="Token invalido")
    try:
        user_id = int(payload.get("sub", 0))
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Token invalido")
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Usuario nao encontrado")
    return user
from app.database import get_db
from app.models.job import AnalysisJob
from app.models.payment import UserCredits
from app.models.user import User
from app.schemas.geo_schemas import AnalysisConfig, AnalysisResult
from app.services.layer_parser import LAYER_KEYS, parse_uploaded_file
from app.services.psi_index import run_pipeline

router = APIRouter()

# In-memory job store (replace with Redis/DB in production)
_jobs: dict[str, dict[str, Any]] = {}

# PDF bytes per job (cached after first generation)
_job_pdfs: dict[str, bytes] = {}

# Raw data for lazy PDF generation (numpy arrays + DataFrames)
_job_pdf_raw: dict[str, dict] = {}

# Map assets per job: {"png": bytes, "html": bytes}
_job_maps: dict[str, dict[str, bytes]] = {}

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

    # Guardar dados para PDF lazy (não serializa numpy/DataFrame no JSON)
    pdf_raw = result.pop("_pdf_raw", None)
    if pdf_raw:
        _job_pdf_raw[job_id] = pdf_raw

    # Guardar mapas PNG e HTML 3D
    map_png = result.pop("_map_png", b"")
    map_3d = result.pop("_map_3d", b"")
    if map_png or map_3d:
        _job_maps[job_id] = {"png": map_png, "html": map_3d}

    _jobs[job_id] = result

    # Persistir no banco para sobreviver a restarts
    try:
        db_job = AnalysisJob(
            id=job_id,
            user_id=current_user.id,
            result_json=json.dumps(result, default=str),
        )
        db.merge(db_job)
        db.commit()
    except Exception:
        pass  # fallback gracioso — ainda está em memória

    return {"job_id": job_id, "status": "completed"}


@router.get("/{job_id}/results", response_model=AnalysisResult)
async def get_results(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retorna os resultados de uma análise pelo job_id."""
    # Tenta cache em memória primeiro
    if job_id in _jobs:
        return _jobs[job_id]
    # Fallback: busca no banco (sobrevive a restarts)
    db_job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
    if not db_job:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    result = db_job.get_result()
    _jobs[job_id] = result  # repopula cache
    return result


@router.get("/{job_id}/report")
async def download_report(
    job_id: str,
    current_user: User = Depends(get_current_user),
):
    """Gera e retorna o PDF técnico do job (geração lazy — só quando solicitado)."""
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail="Job não encontrado")

    # Retorna PDF em cache se já gerado
    if job_id in _job_pdfs:
        pdf_bytes = _job_pdfs[job_id]
    else:
        raw = _job_pdf_raw.get(job_id)
        if not raw:
            raise HTTPException(status_code=404, detail="Dados para PDF não disponíveis")
        from app.services.output_pipeline import generate_pdf_report
        job_data = _jobs[job_id]
        pdf_bytes = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: generate_pdf_report(
                score_grid=raw["psi_grid"],
                layers=raw["layers"],
                config=raw["config"],
                zones_df=raw["zones_df"],
                subtargets_df=raw["subtargets_df"],
                target_stats_df=raw["target_stats_df"],
                title="Relatório Técnico GeoAnalytics — Favorabilidade Exploratória",
                synthetic="sint" in raw["config"].get("dataType", "").lower(),
            ),
        )
        _job_pdfs[job_id] = pdf_bytes  # cache

    commodity = _jobs[job_id].get("commodity", "GEO")
    date_str = _jobs[job_id].get("createdAt", "")[:10]
    filename = f"GeoAnalytics_{commodity}_{date_str}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{job_id}/csv/{dataset}")
async def download_csv(
    job_id: str,
    dataset: str,
    current_user: User = Depends(get_current_user),
):
    """
    Baixa tabelas CSV do job.
    dataset: 'zonas' | 'subalvos' | 'alvos'
    """
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail="Job não encontrado")

    dataset_map = {
        "zonas": ("zones", "zonas_prioritarias"),
        "subalvos": ("subtargets", "subalvos_recomendados"),
        "alvos": ("targetStats", "analise_radial"),
    }
    if dataset not in dataset_map:
        raise HTTPException(status_code=400, detail="dataset deve ser: zonas, subalvos ou alvos")

    key, filename_base = dataset_map[dataset]
    records = _jobs[job_id].get(key, [])
    if not records:
        raise HTTPException(status_code=404, detail="Dados não disponíveis para este job")

    import io
    import pandas as pd
    df = pd.DataFrame(records)
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    csv_bytes = buf.getvalue().encode("utf-8")
    date_str = _jobs[job_id].get("createdAt", "")[:10]
    commodity = _jobs[job_id].get("commodity", "GEO")
    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename_base}_{commodity}_{date_str}.csv"'},
    )


@router.get("/jobs", response_model=list[dict])
async def list_jobs(current_user: User = Depends(get_current_user)):
    """Lista os jobs de análise disponíveis."""
    return [
        {"job_id": k, "commodity": v.get("commodity"), "createdAt": v.get("createdAt")}
        for k, v in _jobs.items()
    ]


@router.get("/{job_id}/map/favorability")
async def map_favorability(
    job_id: str,
    current_user: User = Depends(_get_user_token_or_query),
):
    """Retorna o PNG do mapa 2D de favorabilidade com contornos."""
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    maps = _job_maps.get(job_id, {})
    png = maps.get("png", b"")
    if not png:
        raise HTTPException(status_code=404, detail="Mapa PNG não disponível")
    return Response(content=png, media_type="image/png")


@router.get("/{job_id}/map/3d")
async def map_3d(
    job_id: str,
    current_user: User = Depends(_get_user_token_or_query),
):
    """Retorna o HTML interativo da superfície 3D (Plotly CDN)."""
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    maps = _job_maps.get(job_id, {})
    html = maps.get("html", b"")
    if not html:
        raise HTTPException(status_code=404, detail="Mapa 3D não disponível")
    return Response(content=html, media_type="text/html")
