
import subprocess
import re

def get_logs():
    result = subprocess.run(["docker", "logs", "iptu_worker", "--tail", "5000"], capture_output=True, text=True, encoding='utf-8', errors='ignore')
    lines = result.stdout.splitlines()
    
    for i, line in enumerate(lines):
        # Se encontrarmos uma linha que parece ser o início de um erro do SQLAlchemy
        if "sqlalchemy.exc" in line or "psycopg2" in line or "ProgrammingError" in line:
            print(f"--- Erro encontrado na linha {i} ---")
            # Mostrar 20 linhas antes e 20 depois, mas pular se for parâmetro
            for j in range(max(0, i-20), min(len(lines), i+20)):
                if "[parameters:" in lines[j]:
                    print("... (parâmetros suprimidos) ...")
                    break
                print(lines[j])
            print("-" * 40)

if __name__ == "__main__":
    get_logs()
