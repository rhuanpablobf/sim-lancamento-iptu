import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import SessionLocal
from sqlalchemy import text

def main():
    db = SessionLocal()
    query = """
    UPDATE sim_faixas_aliquota a
    SET faixa_codigo = r.faixa_codigo,
        faixa_label = r.faixa_label
    FROM sim_faixas_referencia r
    WHERE a.categoria = r.categoria
      AND a.aliquota = r.aliquota
      AND a.faixa_codigo IS NULL;
    """
    try:
        res = db.execute(text(query))
        db.commit()
        print(f'Linhas de sim_faixas_aliquota atualizadas: {res.rowcount}')
    except Exception as e:
        print(f"Erro: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    main()
