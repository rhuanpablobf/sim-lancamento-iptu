"use client";
import { use, useState, useEffect } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetcher, apiFetch } from "../../../lib/api";

interface SimulacaoDetalhe {
  id: string;
  nome: string;
  cenario: string;
  exercicio_base: number;
  exercicio_destino: number;
  descricao?: string;
  status: string;
  total_imoveis?: number;
  total_processados?: number;
  exercicio_atual?: number;
  progresso_json?: Array<{
    exercicio: number;
    total: number;
    iptu_social: number;
    imposto_minimo: number;
    tempo_segundos: number;
  }>;
  erro_mensagem?: string;
  criado_em?: string;
  concluido_em?: string;
}

const BADGE_STATUS: Record<string, { classe: string; dot: string; label: string }> = {
  CONCLUIDO:     { classe: "badge-green",  dot: "green", label: "Concluído" },
  PROCESSANDO:   { classe: "badge-amber",  dot: "blue",  label: "Processando" },
  SINCRONIZANDO: { classe: "badge-amber",  dot: "blue",  label: "Sincronizando..." },
  PENDENTE:      { classe: "badge-gray",   dot: "gray",  label: "Pendente" },
  ERRO:          { classe: "badge-red",    dot: "amber", label: "Erro" },
};

const fmtMoeda = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function DetalheSimulacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [excluindo, setExcluindo] = useState(false);
  const [agora, setAgora] = useState(new Date());

  // Timer para o cronômetro de execução
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const { data, isLoading, error } = useSWR<{ dados: SimulacaoDetalhe }>(
    `/api/simulacoes/${id}`,
    fetcher,
    {
      refreshInterval: (data) => {
        const status = data?.dados?.status;
        return status === "PROCESSANDO" || status === "PENDENTE" ? 2000 : 0;
      },
    }
  );

  const { data: dataParam } = useSWR<{ dados: any[] }>(`/api/simulacoes/${id}/parametros`, fetcher);
  const paramsUtilizados = dataParam?.dados ?? [];
  const sim = data?.dados;
  const badge = sim ? (BADGE_STATUS[sim.status] ?? BADGE_STATUS.PENDENTE) : null;
  
  const pct = sim?.total_imoveis && sim?.total_processados
    ? Math.round((sim.total_processados / (sim.total_imoveis * (sim.exercicio_destino - sim.exercicio_base))) * 100)
    : 0;

  async function excluir() {
    if (!sim || !confirm(`Excluir a simulação "${sim.nome}"?`)) return;
    setExcluindo(true);
    try {
      await apiFetch(`/api/simulacoes/${id}`, { method: "DELETE" });
      router.push("/simulacoes");
    } catch (err) {
      alert("Erro ao excluir.");
      setExcluindo(false);
    }
  }

  return (
    <div className="page active">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <div className="page-title">{sim?.nome ?? "Estudo de Impacto"}</div>
            {sim?.descricao && <div className="text-muted" style={{ fontSize: '13px', fontStyle: 'italic', marginTop: '4px' }}>{sim.descricao}</div>}
            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              {sim && (
                <>
                  <span className="badge badge-blue">{sim.cenario}</span>
                  <span className="badge badge-gray">{sim.exercicio_base} → {sim.exercicio_destino}</span>
                  {badge && (
                    <span className={`badge ${badge.classe}`}>
                      <span className={`status-dot ${badge.dot} ${sim.status === 'PROCESSANDO' ? 'pulse' : ''}`}></span>
                      {badge.label}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="flex-gap-8">
            <Link href="/simulacoes" className="btn btn-ghost btn-sm">← Histórico</Link>
            {sim?.status === 'CONCLUIDO' && (
              <button onClick={() => router.push(`/dashboard?contexto=${id}`)} className="btn btn-primary btn-sm">Abrir Dashboard</button>
            )}
            {sim && sim.status !== 'PROCESSANDO' && (
              <button onClick={excluir} className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }} disabled={excluindo}>
                {excluindo ? "Apagando..." : "Excluir"}
              </button>
            )}
          </div>
        </div>
      </div>
      
      <div className="page-content">
        <div className="row">
          <div style={{ flex: 1 }}>
            {(sim?.status === 'PROCESSANDO' || sim?.status === 'PENDENTE') && (
              <div className="card mb-24" style={{ background: "var(--blue-light)", border: "1px solid var(--blue-mid)" }}>
                <div className="card-header"><div className="card-title">Monitoramento de Execução</div></div>
                <div className="card-body">
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span className="text-sm fw-600" style={{ color: "var(--blue-txt)" }}>
                      {sim.exercicio_atual ? `Processando exercício ${sim.exercicio_atual}...` : "Iniciando motor de cálculo..."}
                    </span>
                    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                      {sim?.status === 'PROCESSANDO' && sim?.criado_em && (
                        <span className="text-xs" style={{ color: "var(--blue-txt)", opacity: 0.7 }}>
                          ⏱️ {(() => {
                            const inicio = new Date(sim.criado_em).getTime();
                            const diff = Math.floor((agora.getTime() - inicio) / 1000);
                            const m = Math.floor(diff / 60);
                            const s = diff % 60;
                            return `${m}m ${s}s`;
                          })()}
                        </span>
                      )}
                      <span className="text-mono fw-600">{pct}%</span>
                    </div>
                  </div>
                  <div style={{ height: "8px", background: "rgba(0,0,0,0.05)", borderRadius: "4px", overflow: "hidden", marginBottom: "20px" }}>
                    <div style={{ height: "100%", background: "var(--blue-txt)", transition: "width 0.5s ease", width: `${pct}%` }}></div>
                  </div>
                  
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: "12px" }}>
                    {Array.from({ length: (sim.exercicio_destino - sim.exercicio_base) }, (_, i) => {
                      const ano = sim.exercicio_base + 1 + i;
                      const conc = sim.progresso_json?.find(c => c.exercicio === ano);
                      const atual = sim.exercicio_atual === ano;
                      return (
                        <div key={ano} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", opacity: conc || atual ? 1 : 0.4 }}>
                          <div style={{ 
                            width: "32px", height: "32px", borderRadius: "50%", border: "2px solid var(--border)",
                            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700,
                            background: conc ? "var(--green)" : "none",
                            borderColor: conc ? "var(--green)" : atual ? "var(--blue-mid)" : "var(--border)",
                            color: conc ? "white" : atual ? "var(--blue-txt)" : "inherit",
                          }}>{conc ? '✓' : ano.toString().slice(-2)}</div>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: "12px", fontWeight: 700 }}>{ano}</div>
                            <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase" }}>{conc ? `${conc.total.toLocaleString("pt-BR")} imov.` : atual ? 'processando' : 'aguardando'}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <div className="card">
              <div className="card-header">
                <div className="card-title">Auditoria de Regras e Parâmetros Aplicados</div>
                <div className="card-subtitle">Confirmação de cenários macroeconômicos utilizados no motor de cálculo</div>
              </div>
              <div className="card-body-flush table-wrap">
                <table className="table-clean">
                  <thead>
                    <tr>
                      <th>Exercício</th>
                      <th>Cenário Faixas</th>
                      <th>Cenário Soc. / Mín.</th>
                      <th className="right">IPCA Ano</th>
                      <th className="right">SELIC Ano</th>
                      <th className="right">Vlr. Mínimo</th>
                      <th className="right">Lim. Social</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paramsUtilizados.map((p) => (
                      <tr key={p.exercicio}>
                        <td className="fw-700" style={{ color: "var(--blue-txt)", fontSize: "15px" }}>{p.exercicio}</td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span className="text-xs fw-600 text-muted">PROJ. FAIXAS:</span>
                            <span className={`badge ${p.tipo_indice_faixa === 'SELIC' ? 'badge-amber' : 'badge-blue'}`} style={{ fontSize: "10px" }}>{p.tipo_indice_faixa}</span>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span className="text-xs fw-600 text-muted" style={{ width: "40px" }}>SOCIAL:</span>
                              <span className={`badge ${p.tipo_indice_social === 'SELIC' ? 'badge-amber' : 'badge-blue'}`} style={{ fontSize: "10px" }}>{p.tipo_indice_social}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span className="text-xs fw-600 text-muted" style={{ width: "40px" }}>MÍNIMO:</span>
                              <span className={`badge ${p.tipo_indice_minimo === 'SELIC' ? 'badge-amber' : 'badge-blue'}`} style={{ fontSize: "10px" }}>{p.tipo_indice_minimo}</span>
                            </div>
                          </div>
                        </td>
                        <td className="right text-mono">{p.ipca_ano}%</td>
                        <td className="right text-mono">{p.selic_ano}%</td>
                        <td className="right fw-600">{fmtMoeda(p.valr_minimo_iptu)}</td>
                        <td className="right fw-600" style={{ color: "var(--blue-txt)" }}>{fmtMoeda(p.limite_venal_social)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
