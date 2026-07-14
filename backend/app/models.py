"""
Modelos SQLAlchemy — tabelas do sistema SimLan IPTU.
"""
import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, BigInteger, SmallInteger, Numeric, Boolean,
    DateTime, Text, ForeignKey, CheckConstraint
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.db import Base


class ParametroMacroeconomico(Base):
    """Índices IPCA e SELIC por exercício."""
    __tablename__ = "sim_parametros"

    exercicio = Column(SmallInteger, primary_key=True)
    ipca      = Column(Numeric(6, 4), nullable=False)
    selic     = Column(Numeric(6, 4), nullable=False)
    tipo      = Column(String(10), nullable=False,
                       default="HISTORICO")  # HISTORICO | PROJETADO
    observacao = Column(Text)
    criado_em  = Column(DateTime, default=datetime.utcnow)
    atualizado_em = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ConfiguracaoBase(Base):
    """Configurações base (valores de referência) para o sistema."""
    __tablename__ = "sim_config_base"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tipo         = Column(String(30), nullable=False) # VALOR_MINIMO_IPTU | LIMITE_VENAL_SOCIAL
    ano_referencia = Column(SmallInteger, nullable=False) # Ex: 2022
    valor        = Column(Numeric(15, 2), nullable=False)
    descricao    = Column(String(200))
    criado_em    = Column(DateTime, default=datetime.utcnow)


class FaixaAliquota(Base):
    """Faixas de alíquota por exercício e categoria tributária."""
    __tablename__ = "sim_faixas_aliquota"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    exercicio       = Column(SmallInteger, nullable=False)
    categoria       = Column(String(20), nullable=False)  # RESIDENCIAL | NAO_RESIDENCIAL | TERRITORIAL
    faixa_codigo    = Column(String(20))
    faixa_label     = Column(String(100))
    simulacao_id    = Column(UUID(as_uuid=True), ForeignKey("sim_simulacoes.id", ondelete="CASCADE"))
    limite_inferior = Column(Numeric(15, 2), nullable=False, default=0)
    limite_superior = Column(Numeric(15, 2))  # NULL = sem teto
    aliquota        = Column(Numeric(7, 5), nullable=False)
    origem          = Column(String(20), default="MANUAL")  # MANUAL | PROJETADO_SELIC | PROJETADO_IPCA
    criado_em       = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        CheckConstraint(
            "categoria IN ('RESIDENCIAL','NAO_RESIDENCIAL','TERRITORIAL')",
            name="ck_faixa_categoria"
        ),
    )


class Simulacao(Base):
    """Registro de simulação executada ou em execução."""
    __tablename__ = "sim_simulacoes"

    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nome             = Column(String(200), nullable=False)
    descricao        = Column(Text)
    exercicio_base   = Column(SmallInteger, nullable=False)
    exercicio_destino = Column(SmallInteger, nullable=False)
    ano_base_faixas  = Column(SmallInteger, nullable=False)
    cenario          = Column(String(10), nullable=False)  # SELIC | IPCA (para faixas)
    indexador_social = Column(String(10), default="SELIC") # SELIC | IPCA
    indexador_minimo = Column(String(10), default="SELIC") # SELIC | IPCA
    indexador_valor_venal = Column(String(10), default="IPCA") # IPCA | SELIC
    aplicar_cap      = Column(Boolean, default=True)
    tipo_cap         = Column(String(20), default="INFLACAO_MAIS_5") # INFLACAO_MAIS_5 | APENAS_INFLACAO
    status           = Column(String(15), default="PENDENTE")
    # PENDENTE | PROCESSANDO | CONCLUIDO | ERRO
    total_imoveis    = Column(Integer)
    total_processados = Column(Integer, default=0)
    exercicio_atual  = Column(SmallInteger)
    mensagem_status  = Column(String(100))
    progresso_json   = Column(JSONB, default=list)  # lista de exercícios concluídos
    erro_mensagem    = Column(Text)
    criado_em        = Column(DateTime, default=datetime.utcnow)
    concluido_em     = Column(DateTime)

    lancamentos = relationship("SimLancamento", back_populates="simulacao", cascade="all, delete-orphan")
    parametros_utilizados = relationship("SimulacaoParametroUtilizado", back_populates="simulacao", cascade="all, delete-orphan")


class SimLancamento(Base):
    """Resultado simulado por imóvel × exercício."""
    __tablename__ = "sim_lancamentos"

    id                   = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    simulacao_id         = Column(UUID(as_uuid=True), ForeignKey("sim_simulacoes.id"), nullable=False)
    isn_sia_lanciptu_asg = Column(BigInteger)
    codg_exercicio_lan   = Column(SmallInteger, nullable=False)
    codg_inscricao_lan   = Column(String(20), nullable=False)
    valr_venal_simulado  = Column(Numeric(15, 2))
    valr_aliquota_simulada = Column(Numeric(7, 5))
    valr_iptu_bruto      = Column(Numeric(12, 2))
    valr_iptu_cap        = Column(Numeric(12, 2))
    valr_imposto_final   = Column(Numeric(12, 2))
    valr_imposto_anterior = Column(Numeric(12, 2))
    valr_venal_base      = Column(Numeric(15, 2))
    tipo_lancamento      = Column(SmallInteger)
    # 0=Normal 1=Isento 2=ImpMínimo 3=IPTUSocial
    faixa_anterior       = Column(String(20))
    faixa_atual          = Column(String(20))
    migrou_faixa         = Column(Boolean, default=False)

    simulacao = relationship("Simulacao", back_populates="lancamentos")


class SimulacaoParametroUtilizado(Base):
    """Auditoria de thresholds aplicados em cada ano da simulação."""
    __tablename__ = "sim_simulacao_parametros_utilizados"

    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    simulacao_id     = Column(UUID(as_uuid=True), ForeignKey("sim_simulacoes.id"), nullable=False)
    exercicio        = Column(SmallInteger, nullable=False)
    valr_minimo_iptu = Column(Numeric(15, 2))
    limite_venal_social = Column(Numeric(15, 2))
    
    # Valores dos índices no ano
    ipca_ano         = Column(Numeric(10, 6))
    selic_ano        = Column(Numeric(10, 6))
    
    # Quais indexadores foram escolhidos para cada regra
    tipo_indice_social = Column(String(10)) # IPCA | SELIC
    tipo_indice_minimo = Column(String(10)) # IPCA | SELIC
    tipo_indice_faixa  = Column(String(10)) # IPCA | SELIC (Cenário)
    
    # Campo legado (para compatibilidade temporária se necessário)
    indice_aplicado  = Column(Numeric(10, 6)) 
    tipo_indice      = Column(String(10))     

    simulacao = relationship("Simulacao", back_populates="parametros_utilizados")


class HistoricoExportacao(Base):
    """Registro de exportações geradas."""
    __tablename__ = "sim_exportacoes"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    simulacao_id = Column(UUID(as_uuid=True), ForeignKey("sim_simulacoes.id"))
    formato      = Column(String(5))  # CSV | XLSX | PDF
    tamanho_bytes = Column(Integer)
    exercicios   = Column(JSONB)  # lista de anos exportados
    caminho      = Column(Text)
    criado_em    = Column(DateTime, default=datetime.utcnow)
