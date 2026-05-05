"""
Router de faixas de alíquota — SimLan IPTU.
Inclui CRUD e endpoint de projeção para exercícios futuros.
"""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import obter_sessao
from app.models import FaixaAliquota, ParametroMacroeconomico
from app.schemas import FaixaCriar, FaixaAtualizar, FaixaLer, ProjetarFaixasInput, RespostaPadrao

router = APIRouter()


@router.get("/anos", summary="Listar anos que possuem faixas cadastradas")
def listar_anos_faixas(db: Session = Depends(obter_sessao)) -> RespostaPadrao:
    """Retorna uma lista de exercícios (anos) únicos que têm ao menos uma faixa cadastrada."""
    anos = db.query(FaixaAliquota.exercicio).distinct().order_by(FaixaAliquota.exercicio.desc()).all()
    lista = [a[0] for a in anos]
    return RespostaPadrao(dados=lista)


@router.get("", summary="Listar faixas por exercício e categoria")
def listar_faixas(
    exercicio: int = Query(..., description="Ano das faixas"),
    categoria: str = Query(None, description="RESIDENCIAL | NAO_RESIDENCIAL | TERRITORIAL"),
    db: Session = Depends(obter_sessao),
) -> RespostaPadrao:
    """Retorna as faixas cadastradas para o exercício, opcionalmente filtradas por categoria."""
    q = db.query(FaixaAliquota).filter(FaixaAliquota.exercicio == exercicio)
    if categoria:
        q = q.filter(FaixaAliquota.categoria == categoria.upper())
    itens = q.order_by(FaixaAliquota.categoria, FaixaAliquota.limite_inferior).all()
    return RespostaPadrao(
        dados=[FaixaLer.model_validate(i) for i in itens],
        meta={"total": len(itens), "exercicio": exercicio},
    )


@router.post("", summary="Criar nova faixa", status_code=201)
def criar_faixa(payload: FaixaCriar, db: Session = Depends(obter_sessao)) -> RespostaPadrao:
    """Cria uma nova faixa de alíquota com validações de unicidade e sobreposição."""
    # 1. Verificar se já existe essa alíquota exata para o exercício/categoria
    aliquota_duplicada = db.query(FaixaAliquota).filter(
        FaixaAliquota.exercicio == payload.exercicio,
        FaixaAliquota.categoria == payload.categoria.upper(),
        FaixaAliquota.aliquota == payload.aliquota
    ).first()
    
    if aliquota_duplicada:
        raise HTTPException(
            status_code=400, 
            detail=f"Já existe uma faixa cadastrada com a alíquota {payload.aliquota*100}% para este exercício e categoria."
        )

    # 2. Verificar sobreposição de limites
    # Uma nova faixa (inf1, sup1) sobrepõe (inf2, sup2) se inf1 < sup2 AND sup1 > inf2
    conflito = db.query(FaixaAliquota).filter(
        FaixaAliquota.exercicio == payload.exercicio,
        FaixaAliquota.categoria == payload.categoria.upper()
    ).all()
    
    for f in conflito:
        inf1, sup1 = payload.limite_inferior, payload.limite_superior or 999999999999.99
        inf2, sup2 = f.limite_inferior, f.limite_superior or 999999999999.99
        
        if inf1 < sup2 and sup1 > inf2:
            raise HTTPException(
                status_code=400,
                detail=f"Sobreposição detectada: o intervalo R${inf1} - R${payload.limite_superior or '∞'} conflita com a faixa existente R${inf2} - R${f.limite_superior or '∞'}."
            )

    nova = FaixaAliquota(**payload.model_dump())
    db.add(nova)
    db.commit()
    db.refresh(nova)
    return RespostaPadrao(dados=FaixaLer.model_validate(nova))


@router.put("/{faixa_id}", summary="Atualizar faixa")
def atualizar_faixa(
    faixa_id: UUID,
    payload: FaixaAtualizar,
    db: Session = Depends(obter_sessao),
) -> RespostaPadrao:
    """Atualiza os campos de uma faixa existente com validações."""
    item = db.get(FaixaAliquota, faixa_id)
    if not item:
        raise HTTPException(status_code=404, detail="Faixa não encontrada.")
    
    # Valores finais (mesclando payload com o que já existe)
    novo_inf = payload.limite_inferior if payload.limite_inferior is not None else item.limite_inferior
    novo_sup = payload.limite_superior if payload.limite_superior is not None else item.limite_superior
    nova_aliq = payload.aliquota if payload.aliquota is not None else item.aliquota

    # 1. Verificar duplicidade de alíquota (ignorando a própria faixa)
    if payload.aliquota is not None:
        duplicada = db.query(FaixaAliquota).filter(
            FaixaAliquota.exercicio == item.exercicio,
            FaixaAliquota.categoria == item.categoria,
            FaixaAliquota.aliquota == payload.aliquota,
            FaixaAliquota.id != faixa_id
        ).first()
        if duplicada:
            raise HTTPException(status_code=400, detail=f"Já existe outra faixa com a alíquota {payload.aliquota*100}%.")

    # 2. Verificar sobreposição (ignorando a própria faixa)
    conflito = db.query(FaixaAliquota).filter(
        FaixaAliquota.exercicio == item.exercicio,
        FaixaAliquota.categoria == item.categoria,
        FaixaAliquota.id != faixa_id
    ).all()
    
    inf1, sup1 = novo_inf, novo_sup or 999999999999.99
    for f in conflito:
        inf2, sup2 = f.limite_inferior, f.limite_superior or 999999999999.99
        if inf1 < sup2 and sup1 > inf2:
            raise HTTPException(status_code=400, detail="A alteração resultaria em sobreposição de faixas.")

    for campo, valor in payload.model_dump(exclude_none=True).items():
        setattr(item, campo, valor)
    
    db.commit()
    db.refresh(item)
    return RespostaPadrao(dados=FaixaLer.model_validate(item))


@router.delete("/{faixa_id}", summary="Remover faixa")
def remover_faixa(faixa_id: UUID, db: Session = Depends(obter_sessao)) -> RespostaPadrao:
    """Remove uma faixa de alíquota."""
    item = db.get(FaixaAliquota, faixa_id)
    if not item:
        raise HTTPException(status_code=404, detail="Faixa não encontrada.")
    db.delete(item)
    db.commit()
    return RespostaPadrao(dados={"removido": str(faixa_id)})


@router.post("/projetar", summary="Projetar faixas para anos futuros")
def projetar_faixas(payload: ProjetarFaixasInput, db: Session = Depends(obter_sessao)) -> RespostaPadrao:
    """Gera projeções de faixas baseadas em índices IPCA/SELIC."""
    print(f"Iniciando projeção: base={payload.ano_base}, até={payload.ate_ano}, indexador={payload.indexador}")
    
    # 1. Buscar faixas do ano-base
    faixas_base = (
        db.query(FaixaAliquota)
        .filter(FaixaAliquota.exercicio == payload.ano_base)
        .all()
    )
    
    if not faixas_base:
        raise HTTPException(status_code=400, detail=f"Nenhuma faixa encontrada no ano base {payload.ano_base}")

    # 2. Buscar parâmetros para o período
    anos_projetar = list(range(payload.ano_base + 1, payload.ate_ano + 1))
    params_db = db.query(ParametroMacroeconomico).filter(ParametroMacroeconomico.exercicio.in_(anos_projetar)).all()
    parametros = {p.exercicio: p for p in params_db}

    # 3. Executar projeção ano a ano
    total_criadas = 0
    for ano in anos_projetar:
        param = parametros.get(ano)
        if not param:
            raise HTTPException(status_code=400, detail=f"Índices (IPCA/SELIC) não cadastrados para o ano {ano}. Cadastre-os primeiro.")

        fator = float(param.selic if payload.indexador.upper() == "SELIC" else param.ipca) / 100.0
        
        # Remover projeções anteriores para este ano e categoria das faixas base (evitar duplicatas)
        categorias_base = list(set(f.categoria for f in faixas_base))
        db.query(FaixaAliquota).filter(
            FaixaAliquota.exercicio == ano,
            FaixaAliquota.categoria.in_(categorias_base),
            FaixaAliquota.origem == "PROJETADO",
        ).delete(synchronize_session=False)

        novas_do_ano = []
        for faixa in faixas_base:
            # Cálculo dos novos limites
            novo_inf = float(faixa.limite_inferior or 0) * (1 + fator)
            novo_sup = float(faixa.limite_superior or 0) * (1 + fator) if faixa.limite_superior else None

            nova = FaixaAliquota(
                exercicio=ano,
                categoria=faixa.categoria,
                faixa_codigo=faixa.faixa_codigo,
                faixa_label=faixa.faixa_label,
                limite_inferior=round(novo_inf, 2),
                limite_superior=round(novo_sup, 2) if novo_sup else None,
                aliquota=faixa.aliquota,
                origem="PROJETADO"
            )
            db.add(nova)
            novas_do_ano.append(nova)
            total_criadas += 1
        
        # Para o próximo ano da projeção, usamos as faixas que acabamos de criar
        faixas_base = novas_do_ano

    db.commit()
    print(f"Projeção finalizada. Total de faixas criadas: {total_criadas}")
    return RespostaPadrao(
        dados={"mensagem": f"Projeção concluída. {total_criadas} faixas geradas.", "total": total_criadas},
        meta={"indexador": payload.indexador, "anos": anos_projetar},
    )
