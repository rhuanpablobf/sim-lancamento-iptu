from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID

from app.db import obter_sessao
from app.models import ConfiguracaoBase
from app.schemas import ConfigBaseCriar, ConfigBaseLer, RespostaPadrao

router = APIRouter()

@router.get("", summary="Listar configurações base")
def listar_configs(db: Session = Depends(obter_sessao)) -> RespostaPadrao:
    itens = db.query(ConfiguracaoBase).all()
    return RespostaPadrao(dados=[ConfigBaseLer.model_validate(i) for i in itens])

@router.post("", summary="Criar ou atualizar configuração base")
def salvar_config(payload: ConfigBaseCriar, db: Session = Depends(obter_sessao)) -> RespostaPadrao:
    # Busca por tipo (só pode ter uma de cada tipo)
    existente = db.query(ConfiguracaoBase).filter(ConfiguracaoBase.tipo == payload.tipo).first()
    if existente:
        existente.ano_referencia = payload.ano_referencia
        existente.valor = payload.valor
        existente.descricao = payload.descricao
    else:
        novo = ConfiguracaoBase(
            tipo=payload.tipo,
            ano_referencia=payload.ano_referencia,
            valor=payload.valor,
            descricao=payload.descricao
        )
        db.add(novo)
    db.commit()
    
    item = db.query(ConfiguracaoBase).filter(ConfiguracaoBase.tipo == payload.tipo).first()
    return RespostaPadrao(dados=ConfigBaseLer.model_validate(item))

@router.delete("/{id}", summary="Remover configuração")
def remover_config(id: UUID, db: Session = Depends(obter_sessao)) -> RespostaPadrao:
    item = db.get(ConfiguracaoBase, id)
    if not item:
        raise HTTPException(status_code=404, detail="Não encontrado.")
    db.delete(item)
    db.commit()
    return RespostaPadrao(dados={"removido": str(id)})
