"""
Rotas de pagamento — MercadoPago.

Fluxo avulso:
  1. POST /api/payments/checkout  → preference → init_point
  2. MP chama webhook (topic=payment) → credita análise

Fluxo assinatura mensal:
  1. POST /api/payments/subscribe/{plan}  → preapproval → init_point
  2. MP chama webhook (topic=preapproval) → credita análises mensais
"""
import hashlib
import hmac
import os
from datetime import datetime, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database import get_db
from app.models.payment import Payment, UserCredits
from app.models.subscription import Subscription
from app.models.user import User

router = APIRouter()

MP_ACCESS_TOKEN = os.getenv("MP_ACCESS_TOKEN", "")
MP_WEBHOOK_SECRET = os.getenv("MP_WEBHOOK_SECRET", "")
BASE_URL = os.getenv("BASE_URL", "https://mineracaoanalytics.cloud")

SINGLE_PRODUCT = {
    "title": "Análise GeoProspecting — Relatório Avulso",
    "unit_price": 199.00,
    "credits": 1,
}

PLANS = {
    "basic": {
        "name": "Básico",
        "price": 299.00,
        "analyses_per_month": 5,
        "title": "GeoAnalytics Básico — 5 análises/mês",
    },
    "pro": {
        "name": "Pro",
        "price": 699.00,
        "analyses_per_month": 15,
        "title": "GeoAnalytics Pro — 15 análises/mês",
    },
    "enterprise": {
        "name": "Enterprise",
        "price": 1499.00,
        "analyses_per_month": -1,   # -1 = ilimitado
        "title": "GeoAnalytics Enterprise — Ilimitado",
    },
}


# ── helpers ──────────────────────────────────────────────────────────────────

def _get_or_create_credits(db: Session, user_id: int) -> UserCredits:
    uc = db.query(UserCredits).filter(UserCredits.user_id == user_id).first()
    if not uc:
        uc = UserCredits(user_id=user_id, balance=0)
        db.add(uc)
        db.commit()
        db.refresh(uc)
    return uc


def _cancel_existing_subscriptions(db: Session, user_id: int):
    """Cancela assinaturas ativas ao trocar de plano."""
    db.query(Subscription).filter(
        Subscription.user_id == user_id,
        Subscription.status == "authorized",
    ).update({"status": "cancelled", "updated_at": datetime.utcnow()})
    db.commit()


# ── análise avulsa ────────────────────────────────────────────────────────────

@router.post("/checkout")
async def create_checkout(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not MP_ACCESS_TOKEN:
        raise HTTPException(status_code=503, detail="Gateway de pagamento não configurado")

    payload = {
        "items": [{"id": "single_analysis", "title": SINGLE_PRODUCT["title"],
                   "quantity": 1, "unit_price": SINGLE_PRODUCT["unit_price"], "currency_id": "BRL"}],
        "payer": {"email": current_user.email},
        "back_urls": {"success": f"{BASE_URL}/payment/success",
                      "failure": f"{BASE_URL}/payment/failure",
                      "pending": f"{BASE_URL}/payment/pending"},
        "auto_return": "approved",
        "notification_url": f"{BASE_URL}/api/payments/webhook",
        "metadata": {"user_id": current_user.id, "product_type": "single_analysis"},
        "statement_descriptor": "GEOANALYTICS",
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.mercadopago.com/checkout/preferences",
            json=payload,
            headers={"Authorization": f"Bearer {MP_ACCESS_TOKEN}"},
            timeout=15,
        )
    if resp.status_code != 201:
        raise HTTPException(status_code=502, detail="Erro ao criar preferência de pagamento")

    data = resp.json()
    db.add(Payment(
        user_id=current_user.id,
        mp_preference_id=data["id"],
        status="pending",
        product_type="single_analysis",
        amount=SINGLE_PRODUCT["unit_price"],
        credits_granted=SINGLE_PRODUCT["credits"],
    ))
    db.commit()

    return {"preference_id": data["id"], "init_point": data["init_point"],
            "sandbox_init_point": data.get("sandbox_init_point"), "amount": SINGLE_PRODUCT["unit_price"]}


# ── assinatura mensal ─────────────────────────────────────────────────────────

@router.post("/subscribe/{plan_slug}")
async def create_subscription(
    plan_slug: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if plan_slug not in PLANS:
        raise HTTPException(status_code=400, detail="Plano inválido")
    if not MP_ACCESS_TOKEN:
        raise HTTPException(status_code=503, detail="Gateway de pagamento não configurado")

    plan = PLANS[plan_slug]
    start = datetime.utcnow()

    payload = {
        "reason": plan["title"],
        "auto_recurring": {
            "frequency": 1,
            "frequency_type": "months",
            "transaction_amount": plan["price"],
            "currency_id": "BRL",
        },
        "back_url": f"{BASE_URL}/payment/success?plan={plan_slug}",
        "notification_url": f"{BASE_URL}/api/payments/webhook",
        "payer_email": current_user.email,
        "external_reference": f"user_{current_user.id}_plan_{plan_slug}",
        "status": "pending",
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.mercadopago.com/preapproval",
            json=payload,
            headers={"Authorization": f"Bearer {MP_ACCESS_TOKEN}"},
            timeout=15,
        )
    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail="Erro ao criar assinatura")

    data = resp.json()
    preapproval_id = data["id"]

    _cancel_existing_subscriptions(db, current_user.id)
    db.add(Subscription(
        user_id=current_user.id,
        plan_slug=plan_slug,
        mp_preapproval_id=preapproval_id,
        status="pending",
        analyses_per_month=plan["analyses_per_month"],
        current_period_start=start,
        current_period_end=start + timedelta(days=30),
    ))
    db.commit()

    return {"preapproval_id": preapproval_id, "init_point": data.get("init_point"),
            "plan": plan_slug, "price": plan["price"]}


@router.get("/plans")
def list_plans():
    """Retorna os planos disponíveis (público)."""
    return [
        {"slug": slug, "name": p["name"], "price": p["price"],
         "analyses_per_month": p["analyses_per_month"], "title": p["title"]}
        for slug, p in PLANS.items()
    ]


@router.get("/my-subscription")
def my_subscription(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retorna assinatura ativa do usuário logado."""
    if current_user.role == "admin":
        return {"plan": "admin", "status": "authorized", "unlimited": True}

    sub = db.query(Subscription).filter(
        Subscription.user_id == current_user.id,
        Subscription.status == "authorized",
    ).order_by(Subscription.created_at.desc()).first()

    uc = _get_or_create_credits(db, current_user.id)

    if not sub:
        return {"plan": None, "status": None, "balance": uc.balance, "unlimited": False}

    return {
        "plan": sub.plan_slug,
        "plan_name": PLANS[sub.plan_slug]["name"],
        "status": sub.status,
        "analyses_per_month": sub.analyses_per_month,
        "balance": uc.balance,
        "unlimited": sub.analyses_per_month == -1,
        "period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
    }


# ── webhook (avulso + assinatura) ────────────────────────────────────────────

@router.post("/webhook")
async def mp_webhook(request: Request, db: Session = Depends(get_db)):
    body = await request.body()

    if MP_WEBHOOK_SECRET:
        sig = request.headers.get("x-signature", "")
        ts_part = next((p for p in sig.split(",") if p.startswith("ts=")), "")
        v1_part = next((p for p in sig.split(",") if p.startswith("v1=")), "")
        ts = ts_part.replace("ts=", "")
        received_hash = v1_part.replace("v1=", "")
        manifest = f"id:{request.query_params.get('data.id', '')};request-id:{request.headers.get('x-request-id', '')};ts:{ts};"
        expected = hmac.new(MP_WEBHOOK_SECRET.encode(), manifest.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, received_hash):
            raise HTTPException(status_code=401, detail="Assinatura inválida")

    data = await request.json()
    topic = data.get("type") or data.get("topic")

    # ── assinatura ────────────────────────────────────────────
    # MP pode enviar "preapproval" ou "subscription_preapproval"
    if topic in ("preapproval", "subscription_preapproval"):
        preapproval_id = str(data.get("data", {}).get("id") or data.get("id") or "")
        if not preapproval_id:
            return {"status": "no_id"}

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://api.mercadopago.com/preapproval/{preapproval_id}",
                headers={"Authorization": f"Bearer {MP_ACCESS_TOKEN}"},
                timeout=10,
            )
        if resp.status_code != 200:
            return {"status": "mp_error"}

        mp_sub = resp.json()
        mp_status = mp_sub.get("status")  # authorized | paused | cancelled

        sub = db.query(Subscription).filter(
            Subscription.mp_preapproval_id == preapproval_id
        ).first()
        if not sub:
            return {"status": "subscription_not_found"}

        prev_status = sub.status
        sub.status = mp_status
        sub.updated_at = datetime.utcnow()

        # Quando é a primeira autorização → credita análises do mês
        if mp_status == "authorized" and prev_status != "authorized":
            plan = PLANS.get(sub.plan_slug, {})
            analyses = plan.get("analyses_per_month", 0)
            if analyses > 0:
                uc = _get_or_create_credits(db, sub.user_id)
                uc.balance += analyses
                uc.updated_at = datetime.utcnow()
            sub.current_period_start = datetime.utcnow()
            sub.current_period_end = datetime.utcnow() + timedelta(days=30)

        db.commit()
        return {"status": "ok", "subscription": mp_status}

    # ── pagamento avulso ──────────────────────────────────────
    if topic in ("payment", "merchant_order"):
        payment_id = str(data.get("data", {}).get("id") or data.get("id") or "")
        if not payment_id:
            return {"status": "no_id"}

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://api.mercadopago.com/v1/payments/{payment_id}",
                headers={"Authorization": f"Bearer {MP_ACCESS_TOKEN}"},
                timeout=10,
            )
        if resp.status_code != 200:
            return {"status": "mp_error"}

        mp_data = resp.json()
        mp_status = mp_data.get("status")
        metadata = mp_data.get("metadata", {})
        user_id = metadata.get("user_id")
        preference_id = mp_data.get("preference_id")

        payment = db.query(Payment).filter(
            Payment.mp_preference_id == preference_id,
            Payment.user_id == user_id,
        ).first()
        if not payment or payment.status == "approved":
            return {"status": "already_approved" if payment else "payment_not_found"}

        payment.mp_payment_id = payment_id
        payment.status = mp_status
        payment.updated_at = datetime.utcnow()

        if mp_status == "approved":
            uc = _get_or_create_credits(db, user_id)
            uc.balance += payment.credits_granted
            uc.updated_at = datetime.utcnow()

        db.commit()
        return {"status": "ok"}

    return {"status": "ignored"}


@router.get("/credits")
def get_credits(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    uc = _get_or_create_credits(db, current_user.id)
    if current_user.role == "admin":
        return {"balance": -1, "unlimited": True}
    return {"balance": uc.balance, "unlimited": False}


PRODUCT = {
    "single_analysis": {
        "title": "Análise GeoProspecting — Relatório Avulso",
        "unit_price": 199.00,
        "credits": 1,
    }
}


# ── helpers ──────────────────────────────────────────────────────────────────

def _get_or_create_credits(db: Session, user_id: int) -> UserCredits:
    uc = db.query(UserCredits).filter(UserCredits.user_id == user_id).first()
    if not uc:
        uc = UserCredits(user_id=user_id, balance=0)
        db.add(uc)
        db.commit()
        db.refresh(uc)
    return uc


# ── endpoints ────────────────────────────────────────────────────────────────

@router.post("/checkout")
async def create_checkout(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cria uma preferência de pagamento no MercadoPago e retorna a URL de checkout."""
    if not MP_ACCESS_TOKEN:
        raise HTTPException(status_code=503, detail="Gateway de pagamento não configurado")

    product = PRODUCT["single_analysis"]

    payload = {
        "items": [
            {
                "id": "single_analysis",
                "title": product["title"],
                "quantity": 1,
                "unit_price": product["unit_price"],
                "currency_id": "BRL",
            }
        ],
        "payer": {"email": current_user.email},
        "back_urls": {
            "success": f"{BASE_URL}/payment/success",
            "failure": f"{BASE_URL}/payment/failure",
            "pending": f"{BASE_URL}/payment/pending",
        },
        "auto_return": "approved",
        "notification_url": f"{BASE_URL}/api/payments/webhook",
        "metadata": {
            "user_id": current_user.id,
            "product_type": "single_analysis",
        },
        "statement_descriptor": "GEOANALYTICS",
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.mercadopago.com/checkout/preferences",
            json=payload,
            headers={
                "Authorization": f"Bearer {MP_ACCESS_TOKEN}",
                "Content-Type": "application/json",
            },
            timeout=15,
        )

    if resp.status_code != 201:
        raise HTTPException(status_code=502, detail="Erro ao criar preferência de pagamento")

    data = resp.json()
    preference_id = data["id"]

    # Salva o pagamento como pendente
    payment = Payment(
        user_id=current_user.id,
        mp_preference_id=preference_id,
        status="pending",
        product_type="single_analysis",
        amount=product["unit_price"],
        credits_granted=product["credits"],
    )
    db.add(payment)
    db.commit()

    return {
        "preference_id": preference_id,
        "init_point": data["init_point"],        # URL completa (sandbox: sandbox_init_point)
        "sandbox_init_point": data.get("sandbox_init_point"),
        "amount": product["unit_price"],
    }


@router.post("/webhook")
async def mp_webhook(request: Request, db: Session = Depends(get_db)):
    """Recebe notificações do MercadoPago e credita análises aprovadas."""
    body = await request.body()

    # Verificar assinatura do webhook (se configurada)
    if MP_WEBHOOK_SECRET:
        sig = request.headers.get("x-signature", "")
        ts_part = next((p for p in sig.split(",") if p.startswith("ts=")), "")
        v1_part = next((p for p in sig.split(",") if p.startswith("v1=")), "")
        ts = ts_part.replace("ts=", "")
        received_hash = v1_part.replace("v1=", "")
        manifest = f"id:{request.query_params.get('data.id', '')};request-id:{request.headers.get('x-request-id', '')};ts:{ts};"
        expected = hmac.new(MP_WEBHOOK_SECRET.encode(), manifest.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, received_hash):
            raise HTTPException(status_code=401, detail="Assinatura inválida")

    data = await request.json()
    topic = data.get("type") or data.get("topic")

    if topic not in ("payment", "merchant_order"):
        return {"status": "ignored"}

    payment_id = str(data.get("data", {}).get("id") or data.get("id") or "")
    if not payment_id:
        return {"status": "no_id"}

    # Consultar pagamento no MP
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://api.mercadopago.com/v1/payments/{payment_id}",
            headers={"Authorization": f"Bearer {MP_ACCESS_TOKEN}"},
            timeout=10,
        )
    if resp.status_code != 200:
        return {"status": "mp_error"}

    mp_data = resp.json()
    mp_status = mp_data.get("status")
    metadata = mp_data.get("metadata", {})
    user_id = metadata.get("user_id")
    preference_id = mp_data.get("preference_id")

    # Achar o payment local
    payment = db.query(Payment).filter(
        Payment.mp_preference_id == preference_id,
        Payment.user_id == user_id,
    ).first()

    if not payment:
        return {"status": "payment_not_found"}

    # Já processado?
    if payment.status == "approved":
        return {"status": "already_approved"}

    payment.mp_payment_id = payment_id
    payment.status = mp_status
    payment.updated_at = datetime.utcnow()

    if mp_status == "approved":
        uc = _get_or_create_credits(db, user_id)
        uc.balance += payment.credits_granted
        uc.updated_at = datetime.utcnow()

    db.commit()
    return {"status": "ok"}


@router.get("/credits")
def get_credits(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retorna saldo de créditos do usuário logado."""
    uc = _get_or_create_credits(db, current_user.id)
    # Admin tem créditos ilimitados
    if current_user.role == "admin":
        return {"balance": -1, "unlimited": True}
    return {"balance": uc.balance, "unlimited": False}
