import psycopg2
import pandas as pd

conn = psycopg2.connect("postgresql://iptu_user:iptu_password@localhost:5433/lancamento-iptu")

query = """
WITH h AS (
    SELECT "CODG_INSCRICAO_LAN" as id, "CODG_EXERCICIO_LAN" as ex, "VALR_IMPOSTO_LAN" as val 
    FROM "SIA_LANCIPTU_ASG"
) 
SELECT h1.ex, round((h1.val / NULLIF(h2.val, 0) - 1)::numeric, 4) as ratio, count(*) 
FROM h h1 
JOIN h h2 ON h1.id = h2.id AND h1.ex = h2.ex + 1 
WHERE h1.ex BETWEEN 2022 AND 2026 
GROUP BY 1, 2 
HAVING count(*) > 500 
ORDER BY 1, 3 DESC
"""

df = pd.read_sql(query, conn)
print(df)
conn.close()
