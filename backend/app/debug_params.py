from app.db import SessionLocal
from app.models import ParametroMacroeconomico

db = SessionLocal()
params = db.query(ParametroMacroeconomico).order_by(ParametroMacroeconomico.exercicio).all()

print(f"{'Exercício':<10} | {'IPCA (%)':<10} | {'SELIC (%)':<10}")
print("-" * 40)
for p in params:
    print(f"{p.exercicio:<10} | {float(p.ipca):<10} | {float(p.selic):<10}")
db.close()
