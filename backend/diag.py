
import pandas as pd
from sqlalchemy import create_engine
import os

db_url = os.getenv("DATABASE_URL", "postgresql://iptu_user:iptu_password@db:5432/lancamento-iptu")
engine = create_engine(db_url)
try:
    # Check Position Fiscal for Isento/Imune
    df_pos = pd.read_sql('SELECT "INFO_POSICAO_FISCAL_LAN", COUNT(*) FROM "SIA_LANCIPTU_ASG" GROUP BY 1', engine)
    print("POSICAO_FISCAL_COUNTS:")
    print(df_pos)
    
    # Check Uso and Ocupacao for Building Types
    df_uso = pd.read_sql('SELECT "INFO_USO_LAN", COUNT(*) FROM "SIA_LANCIPTU_ASG" GROUP BY 1', engine)
    print("\nUSO_COUNTS:")
    print(df_uso)
    
    df_ocu = pd.read_sql('SELECT "INFO_OCUPACAO_LAN", COUNT(*) FROM "SIA_LANCIPTU_ASG" GROUP BY 1', engine)
    print("\nOCUPACAO_COUNTS:")
    print(df_ocu)
    
    # Check if there is any other table that maps codes to names
    # Or just show a sample of rows where tax is > 0
    df_sample = pd.read_sql('SELECT "INFO_POSICAO_FISCAL_LAN", "INFO_USO_LAN", "INFO_OCUPACAO_LAN", "VALR_IMPOSTO_LAN" FROM "SIA_LANCIPTU_ASG" WHERE "VALR_IMPOSTO_LAN" > 0 LIMIT 10', engine)
    print("\nSAMPLE_DATA:")
    print(df_sample)

except Exception as e:
    print(f"ERROR: {e}")
