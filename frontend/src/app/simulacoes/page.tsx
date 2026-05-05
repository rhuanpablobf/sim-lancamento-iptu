"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { fetcher, apiFetch } from "@/lib/api";

interface Simulacao {
  id: string;
  nome: string;
  cenario: string;
  exercicio_base: number;
  exercicio_destino: number;
  total_imoveis?: number;
  total_processados?: number;
  status: string;
  criado_em?: string;
  erro_mensagem?: string;
}

const BADGE_STATUS: Record<string, { classe: string; dot: string; label: string }> = {
  CONCLUIDO:   { classe: "badge-green", dot: "green", label: "Concluído" },
  PROCESSANDO: { classe: "badge-amber", dot: "blue",  label: "Processando" },
  PENDENTE:    { classe: "badge-gray",  dot: "gray",  label: "Pendente" },
  ERRO:        { classe: "badge-red",   dot: "amber", label: "Erro" },
};

export default function SimulacoesPage() {
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const { data, isLoading, mutate } = useSWR<{ dados: Simulacao[]; meta: any }>(
    "/api/simulacoes",
    fetcher,
    { refreshInterval: 3000 } // Reduzi para 3s para progresso mais fluido
  );

  const simulacoes = data?.dados ?? [];
  const resumo = {
    total: simulacoes.length,
    processando: simulacoes.filter(s => s.status === 'PROCESSANDO').length,
    concluidas: simulacoes.filter(s => s.status === 'CONCLUIDO').length
  };

  const calcularProgresso = (s: Simulacao) => {
    if (s.status === 'CONCLUIDO') return 100;
    if (s.status === 'PENDENTE' || !s.total_imoveis) return 0;
    
    const numAnos = (s.exercicio_destino - s.exercicio_base);
    const totalEsperado = s.total_imoveis * numAnos;
    if (totalEsperado <= 0) return 0;
    
    const pct = ((s.total_processados ?? 0) / totalEsperado) * 100;
    return Math.min(Math.round(pct), 99);
  };

  const calcularTempo = (s: Simulacao) => {
    if (s.status !== 'PROCESSANDO' || !s.criado_em) return null;
    
    const inicio = new Date(s.criado_em).getTime();
    const agora = new Date().getTime();
    const decorridoMs = agora - inicio;
    
    const progresso = calcularProgresso(s);
    if (progresso <= 5) return "calculando tempo...";

    const totalEstimadoMs = (decorridoMs / progresso) * 100;
    const restanteMs = totalEstimadoMs - decorridoMs;
    
    const formatarMs = (ms: number) => {
      const seg = Math.floor(ms / 1000) % 60;
      const min = Math.floor(ms / (1000 * 60)) % 60;
      const hrs = Math.floor(ms / (1000 * 60 * 60));
      return `${hrs > 0 ? hrs + 'h ' : ''}${min}m ${seg}s`;
    };

    return {
      decorrido: formatarMs(decorridoMs),
      restante: formatarMs(restanteMs)
    };
  };

  async function excluir(id: string, nome: string) {
    if (!confirm(`Tem certeza que deseja excluir a simulação "${nome}"?\nTodos os lançamentos simulados serão apagados.`)) return;
    setExcluindoId(id);
    try {
      await apiFetch(`/api/simulacoes/${id}`, { method: "DELETE" });
      await mutate();
    } catch (err) {
      alert("Erro ao excluir.");
    } finally {
      setExcluindoId(null);
    }
  }

  return (
    <div className="page active">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <div className="page-title">Estudos e Projeções</div>
            <div className="page-subtitle">Acompanhe o processamento e analise os impactos fiscais</div>
          </div>
          <Link href="/nova-simulacao" className="btn btn-primary">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            Nova Simulação
          </Link>
        </div>
      </div>

      <div className="page-content">
        <div className="grid-3 mb-24">
          <div className="card-mini">
            <div className="label">Total de Estudos</div>
            <div className="value">{resumo.total}</div>
          </div>
          <div className="card-mini">
            <div className="label">Em Processamento</div>
            <div className="value color-amber">{resumo.processando}</div>
          </div>
          <div className="card-mini">
            <div className="label">Concluídas</div>
            <div className="value color-green">{resumo.concluidas}</div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Listagem Cronológica</div>
            <span className="badge badge-gray">Atualização automática ativada</span>
          </div>
          <div className="card-body-flush table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '30%' }}>Simulação / Cenário</th>
                  <th className="right">Origem</th>
                  <th className="right">Destino</th>
                  <th>Progresso / Tempo</th>
                  <th>Status</th>
                  <th className="right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {simulacoes.length === 0 ? (
                  <tr><td colSpan={6} className="table-empty">{isLoading ? "Carregando..." : "Nenhuma simulação encontrada."}</td></tr>
                ) : (
                  simulacoes.map((s) => {
                    const badge = BADGE_STATUS[s.status] ?? BADGE_STATUS.PENDENTE;
                    const pct = calcularProgresso(s);
                    const tempo = calcularTempo(s);
                    
                    return (
                      <tr key={s.id}>
                        <td>
                          <div className="fw-600 mb-4">{s.nome}</div>
                          <div className="flex-gap-8 align-center">
                            <span className={s.cenario === 'SELIC' ? 'badge badge-blue' : 'badge badge-gray'} style={{ fontSize: '10px' }}>{s.cenario}</span>
                            <span className="text-xs text-muted">{s.total_imoveis?.toLocaleString("pt-BR") ?? "—"} registros</span>
                          </div>
                        </td>
                        <td className="right fw-500">{s.exercicio_base}</td>
                        <td className="right fw-500 color-blue">{s.exercicio_destino}</td>
                        <td>
                          {s.status === 'PROCESSANDO' || s.status === 'PENDENTE' ? (
                            <div style={{ width: '100%', minWidth: '180px' }}>
                              <div className="progress-container">
                                <div className="progress-bar" style={{ width: `${pct}%` }}></div>
                                <span className="progress-text">{pct}%</span>
                              </div>
                              {tempo && typeof tempo === 'object' && (
                                <div className="time-info">
                                  <span>⏱ {tempo.decorrido} decorridos</span>
                                  <span>•</span>
                                  <span className="fw-600 color-blue">restam {tempo.restante}</span>
                                </div>
                              )}
                            </div>
                          ) : s.status === 'CONCLUIDO' ? (
                            <div className="text-xs text-muted">Processamento concluído</div>
                          ) : (
                            <div className="text-xs color-red fw-500">{s.erro_mensagem || "Falha crítica"}</div>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${badge.classe}`}>
                            <span className={`status-dot ${badge.dot} ${s.status === 'PROCESSANDO' ? 'pulse' : ''}`}></span>
                            {badge.label}
                          </span>
                        </td>
                        <td className="right">
                          <div className="flex-gap-12" style={{ justifyContent: "flex-end" }}>
                            {s.status === 'CONCLUIDO' && (
                              <Link href={`/dashboard?id=${s.id}`} className="action-link fw-600">analisar</Link>
                            )}
                            <button onClick={() => excluir(s.id, s.nome)} className="action-link color-red" disabled={excluindoId === s.id}>
                              {excluindoId === s.id ? "apagando..." : "excluir"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <style jsx>{`
        .card-mini {
          background: var(--card-bg);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .card-mini .label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          font-weight: 600;
        }
        .card-mini .value {
          font-size: 24px;
          font-weight: 700;
          color: var(--text);
        }
        .color-amber { color: var(--amber-txt); }
        .color-green { color: var(--green); }
        .color-blue { color: var(--blue-txt); }
        .color-red { color: var(--red); }
        
        .progress-container {
          width: 100%;
          height: 18px;
          background: var(--surface-3);
          border-radius: 9px;
          position: relative;
          overflow: hidden;
          border: 1px solid var(--border);
        }
        .progress-bar {
          height: 100%;
          background: linear-gradient(90deg, var(--blue) 0%, var(--blue-mid) 100%);
          transition: width 0.5s ease;
          box-shadow: 0 0 10px rgba(59, 130, 246, 0.3);
        }
        .progress-text {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 10px;
          font-weight: 700;
          color: var(--text);
          text-shadow: 0 0 2px white;
        }
        .time-info {
          display: flex;
          gap: 6px;
          font-size: 10px;
          color: var(--text-muted);
          margin-top: 4px;
        }
        
        .pulse {
          animation: pulse-dot 1.5s infinite;
        }
        @keyframes pulse-dot {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.5; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
