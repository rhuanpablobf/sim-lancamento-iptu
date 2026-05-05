"""
Task Celery responsável por executar o motor de simulação em background.
"""
import os
from celery import Celery
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import Simulacao, FaixaAliquota, ParametroMacroeconomico, ConfiguracaoBase

from app.celery_app import celery_app


@celery_app.task(bind=True, name="simulacao.executar")
def executar_simulacao(self, simulacao_id: str) -> dict:
    """
    Task principal de simulação.
    Carrega os dados do banco, executa o motor e atualiza o status em tempo real.
    """
    from app.services.motor_simulacao import executar_motor_completo

    db: Session = SessionLocal()
    try:
        simulacao = db.get(Simulacao, simulacao_id)
        if not simulacao:
            return {"erro": "Simulação não encontrada."}

        def atualizar_progresso(**kwargs):
            """Atualiza o registro da simulação no banco durante o processamento."""
            for campo, valor in kwargs.items():
                if campo == "exercicios_concluidos":
                    simulacao.progresso_json = valor
                elif campo == "total_imoveis":
                    simulacao.total_imoveis = valor
                elif campo == "total_processados":
                    simulacao.total_processados = valor
                elif campo == "exercicio_atual":
                    simulacao.exercicio_atual = valor
                elif campo == "status":
                    simulacao.status = valor
            db.commit()

        # 1. Carregar faixas base (conforme ano escolhido na simulação)
        faixas_base_db = (
            db.query(FaixaAliquota)
            .filter(FaixaAliquota.exercicio == simulacao.ano_base_faixas)
            .all()
        )
        if not faixas_base_db:
            raise Exception(f"Nenhuma faixa encontrada no ano base {simulacao.ano_base_faixas}")

        faixas_base = [
            {
                "categoria": f.categoria,
                "faixa_codigo": f.faixa_codigo,
                "faixa_label": f.faixa_label,
                "limite_inferior": float(f.limite_inferior),
                "limite_superior": float(f.limite_superior) if f.limite_superior else None,
                "aliquota": float(f.aliquota),
            }
            for f in faixas_base_db
        ]

        # 2. Carregar parâmetros para projeção
        params_all = db.query(ParametroMacroeconomico).all()
        parametros = {
            p.exercicio: {
                "ipca": float(p.ipca),
                "selic": float(p.selic),
            }
            for p in params_all
        }

        # 3. Carregar configurações base (Valores iniciais de 2022 ou ref)
        configs_base = {
            c.tipo: {"valor": float(c.valor), "ano": c.ano_referencia}
            for c in db.query(ConfiguracaoBase).all()
        }

        # 4. Projetar faixas ano a ano para a simulação (on-the-fly)
        faixas_por_ano: dict = {simulacao.ano_base_faixas: faixas_base}
        
        # Projetar de ano_base_faixas até exercicio_destino
        faixas_correntes = faixas_base
        for ano in range(simulacao.ano_base_faixas + 1, simulacao.exercicio_destino + 1):
            p = parametros.get(ano)
            if not p:
                raise Exception(f"Parâmetros IPCA/SELIC não encontrados para o exercício {ano}")
            
            fator = (p["selic"] if simulacao.cenario == "SELIC" else p["ipca"]) / 100.0
            
            novas_faixas = []
            for f in faixas_correntes:
                nova_f = FaixaAliquota(
                    exercicio=ano,
                    categoria=f["categoria"],
                    faixa_codigo=f["faixa_codigo"],
                    faixa_label=f["faixa_label"],
                    simulacao_id=simulacao.id,
                    limite_inferior=round(f["limite_inferior"] * (1 + fator), 2),
                    limite_superior=round(f["limite_superior"] * (1 + fator), 2) if f["limite_superior"] else None,
                    aliquota=f["aliquota"],
                    origem=f"PROJETADO_{simulacao.cenario}"
                )
                db.add(nova_f)
                novas_faixas.append({
                    "categoria": nova_f.categoria,
                    "faixa_codigo": nova_f.faixa_codigo,
                    "faixa_label": nova_f.faixa_label,
                    "limite_inferior": float(nova_f.limite_inferior),
                    "limite_superior": float(nova_f.limite_superior) if nova_f.limite_superior else None,
                    "aliquota": float(nova_f.aliquota),
                })
            db.commit()
            faixas_por_ano[ano] = novas_faixas
            faixas_correntes = novas_faixas

        executar_motor_completo(
            simulacao_id=simulacao_id,
            db=db,
            exercicio_base=simulacao.exercicio_base,
            exercicio_destino=simulacao.exercicio_destino,
            faixas_por_ano=faixas_por_ano,
            parametros=parametros,
            configs_base=configs_base,
            indexador_social=simulacao.indexador_social,
            indexador_minimo=simulacao.indexador_minimo,
            aplicar_cap=simulacao.aplicar_cap,
            atualizar_progresso=atualizar_progresso,
        )

        return {"status": "CONCLUIDO", "simulacao_id": simulacao_id}

    except Exception as exc:
        if db.get(Simulacao, simulacao_id):
            simulacao.status = "ERRO"
            simulacao.erro_mensagem = str(exc)
            db.commit()
        raise
    finally:
        db.close()
