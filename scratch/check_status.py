
import pandas as pd
from sqlalchemy import create_engine

engine = create_engine('postgresql://iptu_user:iptu_password@localhost:5433/lancamento-iptu')
try:
    df = pd.read_sql('SELECT "INFO_STATUS_LAN", COUNT(*) FROM "SIA_LANCIPTU_ASG" GROUP BY 1', engine)
    print(df)
except Exception as e:
    print(e)
