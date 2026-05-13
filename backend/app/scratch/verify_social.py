
def _calcular_limite_iptu_social(parametros, configs_base, exercicio, indexador="IPCA"):
    cfg = configs_base.get("LIMITE_VENAL_SOCIAL", {"valor": 181600.88, "ano": 2026})
    limite = float(cfg["valor"])
    ano_base = int(cfg["ano"])
    idx_key = indexador.lower()
    
    print(f"Calculando limite para {exercicio} (Base {ano_base}, Valor {limite})")
    for ano in range(ano_base, exercicio):
        valor_idx = parametros.get(ano, {}).get(idx_key, 0.0)
        limite *= (1 + valor_idx / 100.0)
        print(f"  Ano {ano}: Index {valor_idx}% -> Novo Limite {limite}")
    
    return round(limite, 2)

parametros = {
    2027: {"ipca": 4.46},
    2028: {"ipca": 4.46},
    2029: {"ipca": 4.46}
}
configs_base = {"LIMITE_VENAL_SOCIAL": {"valor": 181600.88, "ano": 2026}}

property_val_base = 179455.47 # Value in 2026

# Simulating 2027
print("\n--- SIMULATION 2027 ---")
ipca_2027 = 4.46 / 100.0
val_2027 = property_val_base * (1 + ipca_2027)
limite_2027 = _calcular_limite_iptu_social(parametros, configs_base, 2027)
print(f"Property 2027: {val_2027}")
print(f"Limit 2027: {limite_2027}")
is_social_2027 = val_2027 <= limite_2027
print(f"Social? {is_social_2027}")

# Simulating 2028
print("\n--- SIMULATION 2028 ---")
ipca_2028 = 4.46 / 100.0
val_2028 = val_2027 * (1 + ipca_2028)
limite_2028 = _calcular_limite_iptu_social(parametros, configs_base, 2028)
print(f"Property 2028: {val_2028}")
print(f"Limit 2028: {limite_2028}")
is_social_2028 = val_2028 <= limite_2028
print(f"Social? {is_social_2028}")
