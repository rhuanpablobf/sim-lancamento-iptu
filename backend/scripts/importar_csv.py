"""
Script de importação dos CSVs exportados do SQL Server (SEFIN).
Uso: python scripts/importar_csv.py --principal PATH1 --auxiliar PATH2
"""
import argparse
import pandas as pd
from sqlalchemy import create_engine
import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://iptu_user:iptu_password@localhost:5432/lancamento-iptu"
)
engine = create_engine(DATABASE_URL)


def importar_lancamentos(caminho: str) -> None:
    print(f"Lendo {caminho}...")
    df = pd.read_csv(caminho, sep=";", encoding="utf-8", dtype=str, keep_default_na=False)

    colunas_float = ["VALR_VENAL_LAN", "VALR_ALIQUOTA_LAN", "VALR_IMPOSTO_LAN", "VALR_TOTAL_LAN"]
    for col in colunas_float:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col].str.replace(",", "."), errors="coerce")

    colunas_int = [
        "CODG_EXERCICIO_LAN", "TIPO_IMPOSTO_LAN", "TIPO_LANCAMENTO_LAN",
        "INFO_USO_LAN", "INFO_OCUPACAO_LAN", "INFO_POSICAO_FISCAL_LAN",
    ]
    for col in colunas_int:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").astype("Int16")

    if "INFO_STATUS_LAN" in df.columns:
        df = df[df["INFO_STATUS_LAN"].isna() | (df["INFO_STATUS_LAN"] == "1")]

    print(f"Inserindo {len(df)} registros...")
    df.to_sql(
        "SIA_LANCIPTU_ASG",
        engine,
        if_exists="append",
        index=False,
        method="multi",
        chunksize=5000,
    )
    print("Lançamentos importados.")


def importar_edificacoes(caminho: str) -> None:
    print(f"Lendo {caminho}...")
    df = pd.read_csv(caminho, sep=";", encoding="utf-8")
    print(f"Inserindo {len(df)} registros...")
    df.to_sql(
        "SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN",
        engine,
        if_exists="append",
        index=False,
        chunksize=5000,
    )
    print("Edificações importadas.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Importa CSVs do IPTU para PostgreSQL")
    parser.add_argument("--principal", required=True, help="Caminho para SIA_LANCIPTU_ASG.csv")
    parser.add_argument("--auxiliar",  required=True, help="Caminho para SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN.csv")
    args = parser.parse_args()

    importar_lancamentos(args.principal)
    importar_edificacoes(args.auxiliar)
    print("Importação concluída!")
