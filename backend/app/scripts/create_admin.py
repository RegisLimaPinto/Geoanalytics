"""
Script para criar o usuário administrador inicial.
Uso: python -m app.scripts.create_admin
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from app.auth import hash_password
from app.database import SessionLocal, engine
from app.models.user import Base, User

ADMIN_NAME = os.getenv("ADMIN_NAME", "Regis Lima")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "regislimapinto@gmail.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin@geo2024")


def create_admin():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == ADMIN_EMAIL).first()
        if existing:
            print(f"Administrador já existe: {ADMIN_EMAIL}")
            return
        admin = User(
            name=ADMIN_NAME,
            email=ADMIN_EMAIL,
            hashed_password=hash_password(ADMIN_PASSWORD),
            role="admin",
            plan="free",
            is_active=True,
        )
        db.add(admin)
        db.commit()
        print(f"Administrador criado com sucesso!")
        print(f"  E-mail: {ADMIN_EMAIL}")
        print(f"  Senha:  {ADMIN_PASSWORD}")
        print(f"  Role:   admin | Plan: free (ilimitado)")
    finally:
        db.close()


if __name__ == "__main__":
    create_admin()
