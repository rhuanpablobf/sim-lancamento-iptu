"""
Conexão com o banco de dados PostgreSQL via SQLAlchemy.
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://iptu_user:iptu_password@localhost:5432/lancamento-iptu"
)

engine = create_engine(DATABASE_URL, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Classe base para todos os modelos SQLAlchemy."""
    pass


def obter_sessao():
    """Dependency injection do SQLAlchemy — garante fechamento da sessão."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
