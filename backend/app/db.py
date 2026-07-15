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

engine = create_engine(
    DATABASE_URL, 
    echo=False,
    pool_pre_ping=True,      # Verifica se a conexão está viva antes de usar
    pool_recycle=300,        # Recicla conexões a cada 5 min para evitar timeouts
    pool_size=20,            # Aumenta o tamanho do pool para o Worker
    max_overflow=30,         # Permite conexões extras em picos de carga
    connect_args={"connect_timeout": 10}  # Impede o boot de travar infinitamente se o Postgres cair
)
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
