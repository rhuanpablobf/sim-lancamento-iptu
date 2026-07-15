"""
Ponto de entrada da aplicação FastAPI — SimLan IPTU.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import importacao, parametros, faixas, simulacoes, exportacao, classificacao, configuracoes
from app.db import engine, Base
from app.migrar import migrar
from app.clickhouse import inicializar_clickhouse

# Executa migrações de schema customizadas (adiciona colunas faltantes)
print("[DEBUG BOOT] Executando migrar()...", flush=True)
migrar()
print("[DEBUG BOOT] migrar() concluido.", flush=True)

# Cria as tabelas caso não existam (útil quando init.sql não roda)
print("[DEBUG BOOT] Criando tabelas no Postgres...", flush=True)
Base.metadata.create_all(bind=engine)
print("[DEBUG BOOT] Tabelas do Postgres criadas.", flush=True)

# Inicializa ClickHouse (Schema Analítico)
try:
    print("[DEBUG BOOT] Conectando/Inicializando Clickhouse...", flush=True)
    inicializar_clickhouse()
    print("[DEBUG BOOT] Clickhouse pronto.", flush=True)
except Exception as e:
    print(f"Aviso: ClickHouse não disponível no momento: {e}")

app = FastAPI(
    title="SimLan IPTU API",
    description="API do Simulador de Lançamentos Futuros do IPTU Municipal de Goiânia",
    version="1.0.0",
)

# CORS — permite que o frontend Next.js se comunique com a API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://frontend:3000",
        "https://laniptu.geredados.com.br"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registro de routers
app.include_router(importacao.router, prefix="/api/importacao", tags=["Importação"])
app.include_router(parametros.router, prefix="/api/parametros", tags=["Parâmetros"])
app.include_router(faixas.router, prefix="/api/faixas", tags=["Faixas"])
app.include_router(simulacoes.router, prefix="/api/simulacoes", tags=["Simulações"])
app.include_router(exportacao.router, prefix="/api/exportacao", tags=["Exportação"])
app.include_router(classificacao.router, prefix="/api/classificacao", tags=["Classificação"])
app.include_router(configuracoes.router, prefix="/api/config", tags=["Configurações Base"])


@app.get("/", tags=["Health"])
def raiz():
    """Verificação de saúde da API."""
    return {"status": "ok", "servico": "SimLan IPTU API", "versao": "1.0.0"}


@app.get("/api/health", tags=["Health"])
def saude():
    """Health check da API."""
    return {"status": "ok"}
