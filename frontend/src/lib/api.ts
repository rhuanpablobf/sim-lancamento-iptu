/**
 * Utilitário de fetch para a API FastAPI — SimLan IPTU.
 */

const getBase = () => {
  if (typeof window !== "undefined") {
    const envUrl = process.env.NEXT_PUBLIC_API_URL;
    // Se estiver no navegador e o host for localhost ou vazio, adapta dinamicamente para o host atual
    if (!envUrl || envUrl.includes("localhost")) {
      return `http://${window.location.hostname}:8000`;
    }
    return envUrl;
  }
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
};

export async function apiFetch<T = unknown>(path: string, opcoes?: RequestInit): Promise<T> {
  const BASE = getBase();
  const resposta = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...opcoes?.headers },
    ...opcoes,
  });
  if (!resposta.ok) {
    const texto = await resposta.text();
    throw new Error(texto || `Erro ${resposta.status}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return resposta.json() as any;
}

/**
 * Fetcher padrão para o SWR.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fetcher = (url: string): Promise<any> => apiFetch(url);
