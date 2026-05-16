"""
Rotas administrativas — estatísticas de uso.
Todos os endpoints exigem role=admin.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.auth import require_admin, get_current_user
from app.database import get_db
from app.models.job import AnalysisJob
from app.models.payment import Payment, UserCredits
from app.models.subscription import Subscription
from app.models.user import User

router = APIRouter()


@router.get("/stats")
def admin_stats(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """
    Resumo geral: total de usuários, total de análises, receita e top usuários.
    """
    total_users = db.query(func.count(User.id)).scalar() or 0
    total_analyses = db.query(func.count(AnalysisJob.id)).scalar() or 0
    total_revenue = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
        Payment.status == "approved"
    ).scalar() or 0.0

    active_subs = db.query(func.count(Subscription.id)).filter(
        Subscription.status == "authorized"
    ).scalar() or 0

    return {
        "total_users": total_users,
        "total_analyses": total_analyses,
        "total_revenue_brl": float(total_revenue),
        "active_subscriptions": active_subs,
    }


@router.get("/users")
def admin_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """
    Lista todos os usuários com contagem de análises, créditos e plano ativo.
    """
    # Contagem de análises por usuário
    counts = (
        db.query(AnalysisJob.user_id, func.count(AnalysisJob.id).label("total"))
        .group_by(AnalysisJob.user_id)
        .all()
    )
    analysis_map = {row.user_id: row.total for row in counts}

    # Última análise por usuário
    last_analysis = (
        db.query(AnalysisJob.user_id, func.max(AnalysisJob.created_at).label("last"))
        .group_by(AnalysisJob.user_id)
        .all()
    )
    last_map = {row.user_id: row.last for row in last_analysis}

    # Créditos por usuário
    credits_rows = db.query(UserCredits).all()
    credits_map = {uc.user_id: uc.balance for uc in credits_rows}

    # Assinatura ativa por usuário
    subs = (
        db.query(Subscription)
        .filter(Subscription.status == "authorized")
        .all()
    )
    sub_map = {s.user_id: s.plan_slug for s in subs}

    users = db.query(User).order_by(User.created_at.desc()).all()
    result = []
    for u in users:
        last: Optional[datetime] = last_map.get(u.id)
        result.append({
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "role": u.role,
            "is_active": u.is_active,
            "registered_at": u.created_at.isoformat() if u.created_at else None,
            "analyses_total": analysis_map.get(u.id, 0),
            "last_analysis": last.isoformat() if last else None,
            "credits_balance": credits_map.get(u.id, 0),
            "active_plan": sub_map.get(u.id) or ("admin" if u.role == "admin" else None),
        })
    return result


@router.get("/analyses")
def admin_analyses(
    limit: int = 100,
    user_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """
    Lista as análises realizadas (mais recentes primeiro).
    Filtro opcional por user_id.
    """
    query = db.query(AnalysisJob)
    if user_id is not None:
        query = query.filter(AnalysisJob.user_id == user_id)
    jobs = query.order_by(AnalysisJob.created_at.desc()).limit(min(limit, 500)).all()

    # Mapeia user_id → nome/email para enriquecer resposta
    user_ids = list({j.user_id for j in jobs})
    users = db.query(User).filter(User.id.in_(user_ids)).all()
    user_map = {u.id: {"name": u.name, "email": u.email} for u in users}

    return [
        {
            "job_id": j.id,
            "user_id": j.user_id,
            "user_name": user_map.get(j.user_id, {}).get("name"),
            "user_email": user_map.get(j.user_id, {}).get("email"),
            "created_at": j.created_at.isoformat() if j.created_at else None,
        }
        for j in jobs
    ]
