
import subprocess

def get_logs():
    result = subprocess.run(["docker", "logs", "iptu_worker", "--tail", "2000"], capture_output=True, text=True, encoding='utf-8', errors='ignore')
    lines = result.stdout.splitlines()
    
    # Mostrar apenas as linhas que contém "Error" ou "Exception" e algumas linhas em volta, 
    # mas pular o bloco gigante de parâmetros (que começa com "[parameters: ")
    in_parameters = False
    for i, line in enumerate(lines):
        if "[parameters: " in line:
            in_parameters = True
            print("... (parâmetros truncados) ...")
            continue
        if in_parameters:
            if line.strip().endswith("}]"):
                in_parameters = False
            continue
        
        if "Error" in line or "Exception" in line or "Traceback" in line:
            # Mostrar contexto
            for j in range(max(0, i-5), min(len(lines), i+10)):
                print(lines[j])
            print("-" * 40)

if __name__ == "__main__":
    get_logs()
