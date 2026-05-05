"""
Router de exportação de dados — SimLan IPTU.
Gera arquivos CSV, XLSX ou PDF a partir dos lançamentos simulados.
"""
import io
import os
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.db import obter_sessao
from app.models import Simulacao, HistoricoExportacao
from app.schemas import ExportacaoInput, ExportacaoLer, RespostaPadrao

router = APIRouter()


@router.post("", summary="Gerar arquivo de exportação", status_code=201)
def gerar_exportacao(payload: ExportacaoInput, db: Session = Depends(obter_sessao)) -> RespostaPadrao:
    """
    Gera o arquivo solicitado (CSV ou XLSX) e registra no histórico.
    O download é feito via GET /api/exportacao/{id}/download.
    """
    simulacao = db.get(Simulacao, payload.simulacao_id)
    if not simulacao:
        raise HTTPException(status_code=404, detail="Simulação não encontrada.")
    if simulacao.status != "CONCLUIDO":
        raise HTTPException(status_code=400, detail="Simulação ainda não concluída.")

    # Consultar lançamentos simulados para os exercícios solicitados
    linhas = db.execute(
        text("""
            SELECT *
            FROM sim_lancamentos
            WHERE simulacao_id = :sid
              AND codg_exercicio_lan = ANY(:anos)
            ORDER BY codg_exercicio_lan, codg_inscricao_lan
        """),
        {"sid": str(payload.simulacao_id), "anos": payload.exercicios},
    ).mappings().all()

    if not linhas:
        raise HTTPException(status_code=404, detail="Nenhum dado encontrado para os filtros informados.")

    import pandas as pd
    df = pd.DataFrame([dict(r) for r in linhas])

    # Serializar para o formato solicitado
    buffer = io.BytesIO()
    formato = payload.formato.upper()
    if formato == "CSV":
        conteudo = df.to_csv(index=False, sep=";").encode("utf-8")
        buffer.write(conteudo)
        tamanho = len(conteudo)
    elif formato == "XLSX":
        with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="Lançamentos")
        tamanho = buffer.tell()
    else:
        raise HTTPException(status_code=400, detail="Formato não suportado. Use CSV ou XLSX.")

    # Registrar histórico
    exportacao = HistoricoExportacao(
        simulacao_id=payload.simulacao_id,
        formato=formato,
        tamanho_bytes=tamanho,
        exercicios=payload.exercicios,
    )
    db.add(exportacao)
    db.commit()
    db.refresh(exportacao)

    return RespostaPadrao(
        dados=ExportacaoLer.model_validate(exportacao),
        meta={"registros": len(df), "tamanho_bytes": tamanho},
    )


@router.get("/historico", summary="Histórico de exportações")
def historico_exportacoes(db: Session = Depends(obter_sessao)) -> RespostaPadrao:
    """Retorna as últimas 20 exportações geradas."""
    itens = (
        db.query(HistoricoExportacao)
        .order_by(HistoricoExportacao.criado_em.desc())
        .limit(20)
        .all()
    )
    return RespostaPadrao(
        dados=[ExportacaoLer.model_validate(i) for i in itens],
        meta={"total": len(itens)},
    )


@router.get("/{exportacao_id}/download", summary="Baixar arquivo gerado")
def baixar_exportacao(exportacao_id: UUID, db: Session = Depends(obter_sessao)):
    """
    Regera e entrega o arquivo de exportação como download direto.
    """
    exportacao = db.get(HistoricoExportacao, exportacao_id)
    if not exportacao:
        raise HTTPException(status_code=404, detail="Exportação não encontrada.")

    simulacao = db.get(Simulacao, exportacao.simulacao_id)
    linhas = db.execute(
        text("""
            SELECT *
            FROM sim_lancamentos
            WHERE simulacao_id = :sid
              AND codg_exercicio_lan = ANY(:anos)
            ORDER BY codg_exercicio_lan, codg_inscricao_lan
        """),
        {"sid": str(exportacao.simulacao_id), "anos": exportacao.exercicios},
    ).mappings().all()

    import pandas as pd
    df = pd.DataFrame([dict(r) for r in linhas])
    buffer = io.BytesIO()
    formato = exportacao.formato

    if formato == "CSV":
        buffer.write(df.to_csv(index=False, sep=";").encode("utf-8"))
        media_type = "text/csv"
        nome_arquivo = f"simulacao_{exportacao.simulacao_id}.csv"
    else:
        with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="Lançamentos")
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        nome_arquivo = f"simulacao_{exportacao.simulacao_id}.xlsx"

    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{nome_arquivo}"'},
    )
