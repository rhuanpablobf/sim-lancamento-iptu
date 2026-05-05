"""
Router de parâmetros macroeconômicos (IPCA / SELIC) — SimLan IPTU.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import obter_sessao
from app.models import ParametroMacroeconomico
from app.schemas import ParametroCriar, ParametroLer, RespostaPadrao, ParametroLote

router = APIRouter()


@router.post("/lote", summary="Gerar parâmetros em lote para um período", status_code=201)
def criar_parametros_lote(
    payload: ParametroLote,
    db: Session = Depends(obter_sessao),
) -> RespostaPadrao:
    """Cria ou atualiza parâmetros para um intervalo de anos."""
    if payload.ano_final < payload.ano_inicial:
        raise HTTPException(status_code=400, detail="Ano final deve ser maior ou igual ao inicial.")
    
    anos_criados = 0
    for exercicio in range(payload.ano_inicial, payload.ano_final + 1):
        existente = db.get(ParametroMacroeconomico, exercicio)
        if existente:
            existente.ipca = payload.ipca
            existente.selic = payload.selic
            existente.tipo = payload.tipo.upper()
            existente.observacao = payload.observacao
        else:
            novo = ParametroMacroeconomico(
                exercicio=exercicio,
                ipca=payload.ipca,
                selic=payload.selic,
                tipo=payload.tipo.upper(),
                observacao=payload.observacao,
            )
            db.add(novo)
        anos_criados += 1
    
    db.commit()
    return RespostaPadrao(dados={"anos_processados": anos_criados})


@router.get("", summary="Listar todos os parâmetros")
def listar_parametros(db: Session = Depends(obter_sessao)) -> RespostaPadrao:
    """Retorna todos os anos cadastrados ordenados pelo exercício."""
    itens = (
        db.query(ParametroMacroeconomico)
        .order_by(ParametroMacroeconomico.exercicio)
        .all()
    )
    return RespostaPadrao(
        dados=[ParametroLer.model_validate(i) for i in itens],
        meta={"total": len(itens)},
    )


@router.post("", summary="Criar ou atualizar parâmetro", status_code=201)
def criar_parametro(
    payload: ParametroCriar,
    db: Session = Depends(obter_sessao),
) -> RespostaPadrao:
    """Cria um novo parâmetro ou substitui o existente para o exercício informado."""
    existente = db.get(ParametroMacroeconomico, payload.exercicio)
    if existente:
        existente.ipca = payload.ipca
        existente.selic = payload.selic
        existente.tipo = payload.tipo.upper()
        existente.observacao = payload.observacao
    else:
        novo = ParametroMacroeconomico(
            exercicio=payload.exercicio,
            ipca=payload.ipca,
            selic=payload.selic,
            tipo=payload.tipo.upper(),
            observacao=payload.observacao,
        )
        db.add(novo)
    db.commit()
    item = db.get(ParametroMacroeconomico, payload.exercicio)
    return RespostaPadrao(dados=ParametroLer.model_validate(item))


@router.delete("/{exercicio}", summary="Remover parâmetro")
def remover_parametro(exercicio: int, db: Session = Depends(obter_sessao)) -> RespostaPadrao:
    """Remove o parâmetro de um exercício específico."""
    item = db.get(ParametroMacroeconomico, exercicio)
    if not item:
        raise HTTPException(status_code=404, detail="Parâmetro não encontrado.")
    db.delete(item)
    db.commit()
    return RespostaPadrao(dados={"removido": exercicio})
