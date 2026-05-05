"use client";
import { use, useState, useEffect } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetcher, apiFetch } from "@/lib/api";

interface SimulacaoDetalhe {
  id: string;
  nome: string;
  cenario: string;
  exercicio_base: number;
  exercicio_destino: number;
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
  CONCLUIDO:   { classe: "badge-green", dot: "green", label: "Concluído" },
  PROCESSANDO: { classe: "badge-amber", dot: "blue",  label: "Processando" },
  PENDENTE:    { classe: "badge-gray",  dot: "gray",  label: "Pendente" },
  ERRO:        { classe: "badge-red",   dot: "amber", label: "Erro" },
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
            <div className="flex-gap-8 mt-4">
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
              <button onClick={excluir} className="btn btn-ghost btn-sm color-red" disabled={excluindo}>
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
                  <div className="flex-between mb-8">
                    <span className="text-sm fw-600 color-blue">
                      {sim.exercicio_atual ? `Processando exercício ${sim.exercicio_atual}...` : "Iniciando motor de cálculo..."}
                    </span>
                    <div className="flex-gap-16 align-center">
                      {sim?.status === 'PROCESSANDO' && sim?.criado_em && (
                        <span className="text-xs color-blue opacity-70">
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
                  <div className="progress-bar mb-20"><div className="progress-fill" style={{ width: `${pct}%` }}></div></div>
                  
                  <div className="grid-steps">
                    {Array.from({ length: (sim.exercicio_destino - sim.exercicio_base) }, (_, i) => {
                      const ano = sim.exercicio_base + 1 + i;
                      const conc = sim.progresso_json?.find(c => c.exercicio === ano);
                      const atual = sim.exercicio_atual === ano;
                      return (
                        <div key={ano} className={`step-item ${conc ? 'done' : atual ? 'active' : ''}`}>
                          <div className="step-circle">{conc ? '✓' : ano.toString().slice(-2)}</div>
                          <div className="step-info">
                            <div className="ano">{ano}</div>
                            <div className="status">{conc ? `${conc.total.toLocaleString("pt-BR")} imov.` : atual ? 'processando' : 'aguardando'}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {sim?.progresso_json && sim.progresso_json.length > 0 && (
              <div className="card">
                <div className="card-header"><div className="card-title">Consolidado por Exercício</div></div>
                <div className="card-body-flush table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Exercício</th>
                        <th className="right">Total Imóveis</th>
                        <th className="right">IPTU Social</th>
                        <th className="right">Imp. Mínimo</th>
                        <th className="right">Tempo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sim.progresso_json.map(c => (
                        <tr key={c.exercicio}>
                          <td className="fw-600">{c.exercicio}</td>
                          <td className="right text-mono">{c.total.toLocaleString("pt-BR")}</td>
                          <td className="right"><span className="badge badge-blue">{c.iptu_social.toLocaleString("pt-BR")}</span></td>
                          <td className="right"><span className="badge badge-amber">{c.imposto_minimo.toLocaleString("pt-BR")}</span></td>
                          <td className="right text-muted">{c.tempo_segundos}s</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div style={{ flex: "0 0 320px" }}>
            <div className="card">
              <div className="card-header"><div className="card-title">Auditoria de Regras</div></div>
              <div className="card-body">
                {paramsUtilizados.map((p, i) => (
                  <div key={p.exercicio} className={`audit-item ${i > 0 ? 'mt-16 pt-16 border-top' : ''}`}>
                    <div className="flex-between mb-12">
                      <span className="fw-700 color-blue text-lg">{p.exercicio}</span>
                      <div className="flex-gap-4">
                        <span className="badge badge-gray text-xs">IPCA: {p.ipca_ano}%</span>
                        <span className="badge badge-gray text-xs">SELIC: {p.selic_ano}%</span>
                      </div>
                    </div>
                    
                    <div className="audit-section mb-8">
                      <div className="flex-between mb-4">
                        <span className="label-sm">Projeção de Faixas</span>
                        <span className="badge-outline">{p.tipo_indice_faixa ?? sim?.cenario}</span>
                      </div>
                    </div>

                    <div className="audit-section mb-8">
                      <div className="flex-between mb-4">
                        <span className="label-sm">IPTU Social</span>
                        <span className="badge-outline">{p.tipo_indice_social}</span>
                      </div>
                      <div className="audit-row">
                        <span className="label">Limite Venal</span>
                        <span className="value">{fmtMoeda(p.limite_venal_social)}</span>
                      </div>
                    </div>

                    <div className="audit-section">
                      <div className="flex-between mb-4">
                        <span className="label-sm">Imposto Mínimo</span>
                        <span className="badge-outline">{p.tipo_indice_minimo}</span>
                      </div>
                      <div className="audit-row">
                        <span className="label">Valor Mínimo</span>
                        <span className="value">{fmtMoeda(p.valr_minimo_iptu)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .color-blue { color: var(--blue-txt); }
        .color-red { color: var(--red); }
        .border-top { border-top: 1px solid var(--border); }
        
        .progress-bar { height: 8px; background: rgba(0,0,0,0.05); border-radius: 4px; overflow: hidden; }
        .progress-fill { height: 100%; background: var(--blue-txt); transition: width 0.5s ease; }
        
        .grid-steps { display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 12px; }
        .step-item { display: flex; flex-direction: column; align-items: center; gap: 8px; opacity: 0.4; }
        .step-item.active { opacity: 1; }
        .step-item.done { opacity: 1; }
        
        .step-circle { 
          width: 32px; height: 32px; border-radius: 50%; border: 2px solid var(--border);
          display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700;
        }
        .step-item.active .step-circle { border-color: var(--blue-mid); color: var(--blue-txt); animation: pulse-border 1.5s infinite; }
        .step-item.done .step-circle { background: var(--green); border-color: var(--green); color: white; }
        
        .step-info { text-align: center; }
        .step-info .ano { font-size: 12px; font-weight: 700; }
        .step-info .status { font-size: 9px; color: var(--text-muted); text-transform: uppercase; }
        
        .audit-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }
        .audit-row .label { color: var(--text-muted); }
        .audit-row .value { font-weight: 600; font-family: var(--font-mono); }

        .audit-section { background: rgba(0,0,0,0.02); padding: 8px; border-radius: 6px; }
        .label-sm { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; }
        .badge-outline { 
          font-size: 10px; font-weight: 700; padding: 2px 6px; border: 1px solid var(--border); 
          border-radius: 4px; color: var(--text-muted); background: white;
        }
        .text-lg { font-size: 18px; }
        @keyframes pulse-dot { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.4); opacity: 0.5; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes pulse-border { 0% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.4); } 70% { box-shadow: 0 0 0 10px rgba(37, 99, 235, 0); } 100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); } }
      `}</style>
    </div>
  );
}
