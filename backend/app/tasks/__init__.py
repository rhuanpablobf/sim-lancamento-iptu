# backend/app/tasks/__init__.py
from app.tasks.simulacao_task import executar_simulacao
from app.tasks.classificacao_task import classificar_faixas_task
from app.tasks.importacao_task import importar_csv_task
