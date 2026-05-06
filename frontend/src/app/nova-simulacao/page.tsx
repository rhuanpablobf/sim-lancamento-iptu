"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { fetcher, apiFetch } from "@/lib/api";

export default function NovaSimulacaoPage() {
  const router = useRouter();
  const [anos, setAnos] = useState({ base: 2026, destino: 2027, faixas: 2026 });
  const [cenario, setCenario] = useState("SELIC");
  const [indexadorSocial, setIndexadorSocial] = useState("SELIC");
  const [indexadorMinimo, setIndexadorMinimo] = useState("SELIC");
  const [executando, setExecutando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const { data: dataAnosFaixas } = useSWR<{ dados: number[] }>("/api/faixas/anos", fetcher);
  const { data: dataAnosBase } = useSWR<{ dados: { ano: number, total: number }[] }>("/api/simulacoes/base/anos", fetcher);
  
  const anosFaixasDisponiveis = dataAnosFaixas?.dados ?? [];
  const anosBaseDisponiveis = dataAnosBase?.dados ?? [];

  // Encontrar a contagem real para o ano base selecionado
  const baseInfo = anosBaseDisponiveis.find(a => a.ano === anos.base);
  const contagemTotal = baseInfo?.total ?? 0;
  const contagemAtivos = (baseInfo as any)?.ativos ?? 0;

  async function executar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setExecutando(true);
    setErro(null);
    try {
      const formData = new FormData(e.currentTarget);
      const res: any = await apiFetch("/api/simulacoes", {
        method: "POST",
        body: JSON.stringify({
          nome: formData.get("nome"),
          descricao: formData.get("descricao") || undefined,
          exercicio_base: Number(anos.base),
          exercicio_destino: Number(anos.destino),
          ano_base_faixas: Number(anos.faixas),
          cenario: cenario,
          indexador_social: indexadorSocial,
          indexador_minimo: indexadorMinimo,
          aplicar_cap: formData.get("aplicar_cap") === "on",
        }),
      });
      router.push(`/simulacoes/${res.dados.id}`);
    } catch (err: any) {
      setErro(err.message);
      setExecutando(false);
    }
  }

  return (
    <div className="page active">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <div className="page-title">Nova Projeção Fiscal</div>
            <div className="page-subtitle">Configure os parâmetros do motor de cálculo assíncrono</div>
          </div>
          <Link href="/simulacoes" className="btn btn-ghost btn-sm">← Voltar</Link>
        </div>
      </div>

      <div className="page-content">
        <div style={{ maxWidth: "680px", margin: "0 auto" }}>
          <form onSubmit={executar}>
            {/* Identificação */}
            <div className="card mb-16">
              <div className="card-header">
                <div className="card-title">Identificação</div>
              </div>
              <div className="card-body">
                <div className="form-group">
                  <label className="form-label">Nome da simulação</label>
                  <input name="nome" type="text" placeholder="Ex: Cenário 2027–2035 · SELIC c/ Cap" required />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Descrição <span className="text-muted fw-400">(opcional)</span></label>
                  <textarea name="descricao" placeholder="Descreva o objetivo desta simulação..."></textarea>
                </div>
              </div>
            </div>

            {/* Parâmetros */}
            <div className="card mb-16">
              <div className="card-header">
                <div className="card-title">Variáveis de tempo e projeção</div>
              </div>
              <div className="card-body">
                <div className="grid-2 mb-16">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Exercício base (origem dos dados)</label>
                    <select 
                      value={anos.base} 
                      onChange={e => setAnos({...anos, base: Number(e.target.value)})}
                    >
                      {anosBaseDisponiveis.map(a => (
                        <option key={a.ano} value={a.ano}>{a.ano}</option>
                      ))}
                      {anosBaseDisponiveis.length === 0 && <option value={2026}>2026</option>}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Exercício destino (alvo da projeção)</label>
                    <input 
                      type="number" 
                      value={anos.destino} 
                      onChange={e => setAnos({...anos, destino: Number(e.target.value)})}
                      className="form-control"
                    />
                  </div>
                </div>
                <div className="grid-2 mb-0">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Ano-base das faixas</label>
                    <select value={anos.faixas} onChange={e => setAnos({...anos, faixas: Number(e.target.value)})}>
                      {anosFaixasDisponiveis.length > 0 ? (
                        anosFaixasDisponiveis.sort((a,b) => b-a).map(a => (
                          <option key={a} value={a}>Tabela de {a}</option>
                        ))
                      ) : (
                        <option value={2026}>Tabela de 2026</option>
                      )}
                    </select>
                    <div className="form-hint">Faixas a partir deste ano serão projetadas</div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Cenário de reajuste das faixas</label>
                    <div className="radio-group" style={{ display: "flex", gap: "8px" }}>
                      <div 
                        className={`radio-option ${cenario === 'SELIC' ? 'selected' : ''}`}
                        onClick={() => setCenario('SELIC')}
                        style={{ 
                          flex: 1, cursor: "pointer", padding: "10px", border: "1px solid var(--border)", borderRadius: "8px",
                          borderColor: cenario === 'SELIC' ? "var(--blue-txt)" : "var(--border)",
                          background: cenario === 'SELIC' ? "white" : "transparent"
                        }}
                      >
                        <div className="fw-600 text-sm">SELIC</div>
                        <div className="text-xs text-muted">Padrão legal (Art. 381)</div>
                      </div>
                      <div 
                        className={`radio-option ${cenario === 'IPCA' ? 'selected' : ''}`}
                        onClick={() => setCenario('IPCA')}
                        style={{ 
                          flex: 1, cursor: "pointer", padding: "10px", border: "1px solid var(--border)", borderRadius: "8px",
                          borderColor: cenario === 'IPCA' ? "var(--blue-txt)" : "var(--border)",
                          background: cenario === 'IPCA' ? "white" : "transparent"
                        }}
                      >
                        <div className="fw-600 text-sm">IPCA</div>
                        <div className="text-xs text-muted">Cenário conservador</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Regras de negócio */}
            <div className="card mb-16">
              <div className="card-header"><div className="card-title">Regras de negócio</div></div>
              <div className="card-body">
                <div className="mb-20" style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                  <input type="checkbox" name="aplicar_cap" id="cap" defaultChecked style={{ marginTop: "4px" }} />
                  <div>
                    <label htmlFor="cap" className="fw-600 text-sm" style={{ display: "block", marginBottom: "4px", cursor: "pointer" }}>
                      Aplicar cap de transição (+5% acima da inflação)
                    </label>
                    <div className="text-xs text-muted" style={{ lineHeight: "1.4" }}>
                      Limita o acréscimo do imposto em relação ao ano anterior, conforme Art. 168 §6º CTM. 
                      O cálculo considera: (Imposto {anos.base}) x 1.05 x (Inflação Acumulada).
                    </div>
                  </div>
                </div>

                <div className="grid-2">
                  <div className="form-group mb-0">
                    <label className="form-label">Indexador IPTU Social</label>
                    <div style={{ display: "flex", background: "var(--bg)", padding: "4px", borderRadius: "8px", border: "1px solid var(--border)" }}>
                      <button type="button" 
                        style={{ flex: 1, border: "none", padding: "6px", fontSize: "12px", fontWeight: 500, cursor: "pointer", borderRadius: "6px",
                          background: indexadorSocial === 'SELIC' ? "white" : "none",
                          color: indexadorSocial === 'SELIC' ? "var(--text)" : "var(--text-muted)",
                          boxShadow: indexadorSocial === 'SELIC' ? "0 2px 4px rgba(0,0,0,0.05)" : "none"
                        }}
                        onClick={() => setIndexadorSocial('SELIC')}
                      >SELIC</button>
                      <button type="button"
                        style={{ flex: 1, border: "none", padding: "6px", fontSize: "12px", fontWeight: 500, cursor: "pointer", borderRadius: "6px",
                          background: indexadorSocial === 'IPCA' ? "white" : "none",
                          color: indexadorSocial === 'IPCA' ? "var(--text)" : "var(--text-muted)",
                          boxShadow: indexadorSocial === 'IPCA' ? "0 2px 4px rgba(0,0,0,0.05)" : "none"
                        }}
                        onClick={() => setIndexadorSocial('IPCA')}
                      >IPCA</button>
                    </div>
                  </div>
                  <div className="form-group mb-0">
                    <label className="form-label">Indexador Imposto Mínimo</label>
                    <div style={{ display: "flex", background: "var(--bg)", padding: "4px", borderRadius: "8px", border: "1px solid var(--border)" }}>
                      <button type="button"
                        style={{ flex: 1, border: "none", padding: "6px", fontSize: "12px", fontWeight: 500, cursor: "pointer", borderRadius: "6px",
                          background: indexadorMinimo === 'SELIC' ? "white" : "none",
                          color: indexadorMinimo === 'SELIC' ? "var(--text)" : "var(--text-muted)",
                          boxShadow: indexadorMinimo === 'SELIC' ? "0 2px 4px rgba(0,0,0,0.05)" : "none"
                        }}
                        onClick={() => setIndexadorMinimo('SELIC')}
                      >SELIC</button>
                      <button type="button"
                        style={{ flex: 1, border: "none", padding: "6px", fontSize: "12px", fontWeight: 500, cursor: "pointer", borderRadius: "6px",
                          background: indexadorMinimo === 'IPCA' ? "white" : "none",
                          color: indexadorMinimo === 'IPCA' ? "var(--text)" : "var(--text-muted)",
                          boxShadow: indexadorMinimo === 'IPCA' ? "0 2px 4px rgba(0,0,0,0.05)" : "none"
                        }}
                        onClick={() => setIndexadorMinimo('IPCA')}
                      >IPCA</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Preview Info */}
            <div className="card mb-24" style={{ borderColor: "var(--blue-mid)", background: "var(--blue-light)" }}>
              <div className="card-header" style={{ borderColor: "var(--blue-mid)" }}>
                <div className="card-title" style={{ color: "var(--blue-txt)" }}>Resumo da simulação</div>
              </div>
              <div className="card-body">
                <div className="grid-2">
                  <div>
                    <span className="text-xs text-muted uppercase fw-600">Período de Projeção</span><br />
                    {anos.destino > anos.base ? (
                      <span className="fw-500">
                        {anos.base + 1} a {anos.destino} ({anos.destino - anos.base} {anos.destino - anos.base === 1 ? 'ano' : 'anos'})
                      </span>
                    ) : (
                      <span className="fw-500" style={{ color: "var(--red)" }}>Exercício destino deve ser posterior a {anos.base}</span>
                    )}
                  </div>
                  <div>
                    <span className="text-xs text-muted uppercase fw-600">Volume (Base {anos.base})</span><br />
                    <span className="fw-500">{contagemAtivos.toLocaleString('pt-BR')} ativos</span>
                    <span className="text-xs text-muted" style={{ marginLeft: "8px" }}>de {contagemTotal.toLocaleString('pt-BR')} total</span>
                  </div>
                </div>
              </div>
            </div>

            <button type="submit" className="btn btn-primary btn-lg" style={{ width: "100%" }} disabled={executando}>
              {executando ? (
                <>Processando...</>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" width="16" height="16" style={{ marginRight: "8px", verticalAlign: "middle" }}>
                    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
                    <polygon points="10 8 16 12 10 16 10 8" fill="currentColor"/>
                  </svg>
                  Iniciar processamento assíncrono (Celery)
                </>
              )}
            </button>

            {erro && <div className="alert alert-error mt-16">{erro}</div>}

            <div className="text-xs text-muted mt-12" style={{ textAlign: "center" }}>
              Ao iniciar, o painel pode ser fechado sem interromper a execução — o motor roda em background via <strong>Celery/Redis</strong>.
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
