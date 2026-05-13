import sys
import os
import json
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import SessionLocal
from sqlalchemy import text

def main():
    db = SessionLocal()
    query = """
    SELECT categoria, faixa_codigo, faixa_label, faixa_ordem, aliquota, tipo_imposto 
    FROM sim_faixas_referencia
    ORDER BY categoria, faixa_ordem, aliquota
    """
    res = db.execute(text(query)).fetchall()
    
    faixas = []
    for r in res:
        faixas.append({
            "categoria": r.categoria,
            "faixa_codigo": r.faixa_codigo,
            "faixa_label": r.faixa_label,
            "faixa_ordem": r.faixa_ordem,
            "aliquota": float(r.aliquota),
            "tipo_imposto": r.tipo_imposto
        })
    
    with open("faixas_dump.json", "w", encoding="utf-8") as f:
        json.dump(faixas, f, ensure_ascii=False, indent=2)
        
    print("Dump gerado!")

if __name__ == "__main__":
    main()
