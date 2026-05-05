"""
Schemas Pydantic para validação e serialização da API.
"""
from __future__ import annotations
from datetime import datetime
from typing import Any, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict


# ─── RESPOSTA PADRÃO ──────────────────────────────────────────────────────────

class RespostaPadrao(BaseModel):
    """Envelope de resposta padrão da API."""
    dados: Any = None
    meta: dict = {}
    erro: Optional[str] = None


# ─── PARÂMETROS MACROECONÔMICOS ───────────────────────────────────────────────

class ParametroCriar(BaseModel):
    exercicio: int
    ipca: float
    selic: float
    tipo: str = "HISTORICO"
    observacao: Optional[str] = None


class ParametroLote(BaseModel):
    ano_inicial: int
    ano_final: int
    ipca: float
    selic: float
    tipo: str = "PROJETADO"
    observacao: Optional[str] = None


class ParametroLer(ParametroCriar):
    model_config = ConfigDict(from_attributes=True)
    criado_em: Optional[datetime] = None
    atualizado_em: Optional[datetime] = None


# ─── CONFIGURAÇÕES BASE ───────────────────────────────────────────────────────

class ConfigBaseCriar(BaseModel):
    tipo: str  # VALOR_MINIMO_IPTU | LIMITE_VENAL_SOCIAL
    ano_referencia: int
    valor: float
    descricao: Optional[str] = None


class ConfigBaseLer(ConfigBaseCriar):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    criado_em: datetime


# ─── FAIXAS DE ALÍQUOTA ───────────────────────────────────────────────────────

class FaixaCriar(BaseModel):
    exercicio: int
    categoria: str  # RESIDENCIAL | NAO_RESIDENCIAL | TERRITORIAL
    faixa_codigo: Optional[str] = None
    faixa_label: Optional[str] = None
    simulacao_id: Optional[UUID] = None
    limite_inferior: float = 0
    limite_superior: Optional[float] = None
    aliquota: float
    origem: str = "MANUAL"


class FaixaAtualizar(BaseModel):
    limite_inferior: Optional[float] = None
    limite_superior: Optional[float] = None
    aliquota: Optional[float] = None


class FaixaLer(FaixaCriar):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    criado_em: Optional[datetime] = None


class ProjetarFaixasInput(BaseModel):
    ano_base: int
    ate_ano: int
    indexador: str = "SELIC"  # SELIC | IPCA


# ─── SIMULAÇÕES ───────────────────────────────────────────────────────────────

class SimulacaoCriar(BaseModel):
    nome: str
    descricao: Optional[str] = None
    exercicio_base: int
    exercicio_destino: int
    ano_base_faixas: int
    cenario: str = "SELIC"
    indexador_social: str = "SELIC"
    indexador_minimo: str = "SELIC"
    aplicar_cap: bool = True


class SimulacaoLer(SimulacaoCriar):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    status: str
    total_imoveis: Optional[int] = None
    total_processados: int = 0
    exercicio_atual: Optional[int] = None
    progresso_json: Optional[list] = None
    erro_mensagem: Optional[str] = None
    criado_em: Optional[datetime] = None
    concluido_em: Optional[datetime] = None


# ─── EXPORTAÇÃO ───────────────────────────────────────────────────────────────

class ExportacaoInput(BaseModel):
    simulacao_id: UUID
    exercicios: list[int]
    formato: str = "CSV"  # CSV | XLSX | PDF
    filtros: Optional[dict] = None


class ExportacaoLer(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    simulacao_id: Optional[UUID] = None
    formato: Optional[str] = None
    tamanho_bytes: Optional[int] = None
    exercicios: Optional[list] = None
    criado_em: Optional[datetime] = None


# ─── IMPORTAÇÃO ───────────────────────────────────────────────────────────────

class ResultadoImportacao(BaseModel):
    exercicio: int
    total: int
    normal: int
    isento: int
    imposto_minimo: int
    iptu_social: int
    valr_venal_total: float
    valr_imposto_total: float
