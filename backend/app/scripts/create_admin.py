"""
Script para criar usuários administradores.
Uso: python -m app.scripts.create_admin
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from app.auth import hash_password
from app.database import SessionLocal, engine
from app.models.user import Base, User

# Lista de administradores a garantir no sistema
ADMINS = [
    {
        "name": "Regis Lima",
        "email": "regislimapinto@gmail.com",
        "password": "admin@geo2024",
    },
    {
        "name": "Gleudiano",
        "email": "gleudianoprof@gmail.com",
        "password": "admin@geo2024",
    },
    {
        "name": "Gilvan",
        "email": "gilvan18om@hotmail.com",
        "password": "admin@geo2024",
    },
]


def create_admins():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        for adm in ADMINS:
            existing = db.query(User).filter(User.email == adm["email"]).first()
            if existing:
                # Garante role=admin caso o usuário já exista como user comum
                if existing.role != "admin":
                    existing.role = "admin"
                    db.commit()
                    print(f"Role atualizado para admin: {adm['email']}")
                else:
                    print(f"Administrador já existe: {adm['email']}")
                continue

            admin = User(
                name=adm["name"],
                email=adm["email"],
                hashed_password=hash_password(adm["password"]),
                role="admin",
                plan="free",
                is_active=True,
            )
            db.add(admin)
            db.commit()
            print(f"Administrador criado: {adm['email']}  |  senha: {adm['password']}")
    finally:
        db.close()


if __name__ == "__main__":
    create_admins()
