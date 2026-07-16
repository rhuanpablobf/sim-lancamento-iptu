"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { fetcher, apiFetch } from "../../lib/api";

interface Simulacao {
  id: string;
  nome: string;
  cenario: string;
  exercicio_base: number;
  exercicio_destino: number;
  descricao?: string;
  total_imoveis?: number;
  total_processados?: number;
  status: string;
  criado_em?: string;
  erro_mensagem?: string;
  mensagem_status?: string;
}

const BADGE_STATUS: Record<string, { classe: string; dot: string; label: string }> = {
  CONCLUIDO:     { classe: "badge-green",  dot: "green", label: "Concluído" },
  PROCESSANDO:   { classe: "badge-amber",  dot: "blue",  label: "Processando" },
  SINCRONIZANDO: { classe: "badge-amber",  dot: "blue",  label: "Sincronizando..." },
  PENDENTE:      { classe: "badge-gray",   dot: "gray",  label: "Pendente" },
  ERRO:          { classe: "badge-red",    dot: "amber", label: "Erro" },
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
    processando: simulacoes.filter(s => s.status === 'PROCESSANDO' || s.status === 'SINCRONIZANDO').length,
    concluidas: simulacoes.filter(s => s.status === 'CONCLUIDO').length
  };

  const calcularProgresso = (s: Simulacao) => {
    if (s.status === 'CONCLUIDO') return 100;
    if (s.status === 'SINCRONIZANDO') return 99;
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
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: "middle", marginRight: "4px" }}><path d="M12 5v14M5 12h14"/></svg>
            Nova Simulação
          </Link>
        </div>
      </div>

      <div className="page-content">
        <div className="grid-3 mb-24">
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px", display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", fontWeight: 600 }}>Total de Estudos</div>
            <div style={{ fontSize: "24px", fontWeight: 700 }}>{resumo.total}</div>
          </div>
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px", display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", fontWeight: 600 }}>Em Processamento</div>
            <div style={{ fontSize: "24px", fontWeight: 700, color: "var(--amber-txt)" }}>{resumo.processando}</div>
          </div>
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px", display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", fontWeight: 600 }}>Concluídas</div>
            <div style={{ fontSize: "24px", fontWeight: 700, color: "var(--green)" }}>{resumo.concluidas}</div>
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
                  <th style={{ width: '25%' }}>Simulação / Cenário</th>
                  <th style={{ width: '20%' }}>Descrição</th>
                  <th className="right">Origem</th>
                  <th className="right">Destino</th>
                  <th>Progresso / Tempo</th>
                  <th>Status</th>
                  <th className="right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {simulacoes.length === 0 ? (
                  <tr><td colSpan={7} className="table-empty">{isLoading ? "Carregando..." : "Nenhuma simulação encontrada."}</td></tr>
                ) : (
                  simulacoes.map((s) => {
                    const badge = BADGE_STATUS[s.status] ?? BADGE_STATUS.PENDENTE;
                    const pct = calcularProgresso(s);
                    const tempo = calcularTempo(s);
                    
                    return (
                      <tr key={s.id}>
                        <td>
                          <div className="fw-600 mb-4">{s.nome}</div>
                          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            <span className={`badge ${s.cenario === 'SELIC' ? 'badge-blue' : 'badge-gray'}`} style={{ fontSize: '10px' }}>{s.cenario}</span>
                            <span className="text-xs text-muted">{s.total_imoveis?.toLocaleString("pt-BR") ?? "—"} registros</span>
                          </div>
                        </td>
                        <td>
                          <div className="text-muted" style={{ maxWidth: '280px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {s.descricao || "—"}
                          </div>
                        </td>
                        <td className="right fw-500">{s.exercicio_base}</td>
                        <td className="right fw-500" style={{ color: "var(--blue-txt)" }}>{s.exercicio_destino}</td>
                        <td>
                          {s.status === 'PROCESSANDO' || s.status === 'PENDENTE' || s.status === 'SINCRONIZANDO' ? (
                            <div style={{ width: '100%', minWidth: '180px' }}>
                              <div style={{ width: "100%", height: "18px", background: "var(--surface-3)", borderRadius: "9px", position: "relative", overflow: "hidden", border: "1px solid var(--border)" }}>
                                <div style={{ height: "100%", background: "linear-gradient(90deg, var(--blue) 0%, var(--blue-mid) 100%)", transition: "width 0.5s ease", width: `${pct}%` }}></div>
                                <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", fontSize: "10px", fontWeight: 700, textShadow: "0 0 2px white" }}>{pct}%</span>
                              </div>
                              {tempo && typeof tempo === 'object' && (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", fontSize: "10px", color: "var(--text-muted)", marginTop: "4px" }}>
                                  <span className="fw-600" style={{ color: "var(--blue-txt)" }}>
                                    {s.mensagem_status || "Calculando lançamentos..."}
                                  </span>
                                  <span>•</span>
                                  <span>⏱ {tempo.decorrido} decorridos</span>
                                  <span>•</span>
                                  <span className="fw-600">restam {tempo.restante}</span>
                                </div>
                              )}
                            </div>
                          ) : s.status === 'CONCLUIDO' ? (
                            <div className="text-xs text-muted">Processamento concluído</div>
                          ) : (
                            <div className="text-xs fw-500" style={{ color: "var(--red)" }}>{s.erro_mensagem || "Falha crítica"}</div>
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
                              <Link href={`/simulacoes/${s.id}`} className="action-link fw-600">analisar</Link>
                            )}
                            <button onClick={() => excluir(s.id, s.nome)} className="action-link" style={{ color: "var(--red)" }} disabled={excluindoId === s.id}>
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
    </div>
  );
}
