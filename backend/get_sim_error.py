
import psycopg2

def get_error():
    try:
        conn = psycopg2.connect(
            user="iptu_user",
            password="iptu_password",
            host="localhost",
            port=5432,
            database="lancamento-iptu"
        )
        cur = conn.cursor()
        cur.execute("SELECT status, erro_mensagem FROM sim_simulacoes ORDER BY criado_em DESC LIMIT 1;")
        row = cur.fetchone()
        if row:
            print(f"Status: {row[0]}")
            print(f"Erro: {row[1]}")
        else:
            print("Nenhuma simulação encontrada.")
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Erro ao conectar: {e}")

if __name__ == "__main__":
    get_error()
