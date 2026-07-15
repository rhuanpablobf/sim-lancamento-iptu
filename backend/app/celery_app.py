# backend/app/celery_app.py
import os
from celery import Celery

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

celery_app = Celery(
    "simlan",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=[
        "app.tasks.simulacao_task", 
        "app.tasks.classificacao_task",
        "app.tasks.importacao_task"
    ]
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="America/Sao_Paulo",
    enable_utc=True,
    broker_connection_retry_on_startup=True,
)
