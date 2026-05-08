
import pandas as pd
from sqlalchemy import create_engine
import os

db_url = os.getenv("DATABASE_URL", "postgresql://iptu_user:iptu_password@db:5432/lancamento-iptu")
engine = create_engine(db_url)
try:
    count_edf = pd.read_sql('SELECT COUNT(*) FROM "SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN"', engine)
    print(f"EDF_TABLE_COUNT: {count_edf.iloc[0,0]}")
    
    if count_edf.iloc[0,0] > 0:
        sample_edf = pd.read_sql('SELECT * FROM "SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN" LIMIT 5', engine)
        print("\nSAMPLE_EDF:")
        print(sample_edf)
        
except Exception as e:
    print(f"ERROR: {e}")
