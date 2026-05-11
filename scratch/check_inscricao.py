import os
from sqlalchemy import create_engine, text

def buscar():
    url = os.getenv("DATABASE_URL")
    if not url: return
    
    engine = create_engine(url)
    with engine.connect() as conn:
        # Busca na tabela de simulações
        query = text('SELECT "codg_inscricao_lan" FROM sim_lancamentos WHERE "codg_inscricao_lan" LIKE :p LIMIT 1')
        res = conn.execute(query, {"p": "%45405803570001%"}).scalar()
        if res:
            print(f"RESULTADO SIMULACAO: [{res}] (Tamanho: {len(res)})")
        else:
            print("Não encontrado na sim_lancamentos")

if __name__ == "__main__":
    buscar()
