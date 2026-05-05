"use client";
import React, { useState, useEffect } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface KpisBrutos {
  total_imoveis: number;
  isentos: number;
  imposto_minimo: number;
  iptu_social: number;
  predial: number;
  territorial: number;
  valr_venal_total: number;
  valr_imposto_total: number;
  aliquota_media: number;
  valr_imposto_base?: number; 
}

interface Categoria {
  categoria: string;
  total: number;
  venal_total: number;
  imposto_total: number;
}

interface MatrizEdificacao {
  [edificacao: string]: {
    "Normal": number;
    "Isento/Imune": number;
    "Imposto Mínimo": number;
    "IPTU Social": number;
  }
}

interface SimulacaoMin {
  id: string;
  nome: string;
  status: string;
  exercicio_base: number;
  exercicio_destino: number;
}

// ─── Formatadores ─────────────────────────────────────────────────────────────

const fmtNum = (n: number) => n?.toLocaleString("pt-BR") ?? "—";

const fmtMoeda = (n: number) => {
  if (!n || isNaN(n)) return "—";
  const absN = Math.abs(n);
  let prefix = n < 0 ? "- " : "";
  if (absN >= 1e9) return `${prefix}R$ ${(absN / 1e9).toLocaleString("pt-BR", { minimumFractionDigits: 1 })} bi`;
  if (absN >= 1e6) return `${prefix}R$ ${(absN / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 1 })} M`;
  return prefix + absN.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const fmtPct = (parte: number, total: number) =>
  total > 0 ? `${((parte / total) * 100).toFixed(1)}%` : "—";

const variacao = (atual: number, anterior?: number, exercicioRef?: number | string) => {
  if (!anterior || anterior === 0) return null;
  const pct = ((atual - anterior) / anterior) * 100;
  return { 
    pct, 
    sobe: pct >= 0, 
    texto: `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}% vs ${exercicioRef || "anterior"}` 
  };
};

// ─── Componente ───────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [contexto, setContexto] = useState<string>("base"); 
  const [anoSelecionado, setAnoSelecionado] = useState<number | null>(null);

  const { data: respSims } = useSWR<{ dados: SimulacaoMin[] }>("/api/simulacoes", fetcher);
  const simulacoes = respSims?.dados?.filter(s => s.status === "CONCLUIDO") || [];

  const { data: respAnosBase } = useSWR<{ dados: number[] }>("/api/importacao/dashboard/anos", fetcher);
  const { data: respAnosSim } = useSWR<{ dados: number[] }>(
    contexto !== "base" ? `/api/simulacoes/${contexto}/anos` : null,
    fetcher
  );
  const anosBase = respAnosBase?.dados || [];
  const anosSimulacao = respAnosSim?.dados || [];

  useEffect(() => {
    const lista = contexto === "base" ? anosBase : anosSimulacao;
    if (lista.length > 0) {
      if (!anoSelecionado || !lista.includes(anoSelecionado)) {
        setAnoSelecionado(lista[0]);
      }
    } else {
      setAnoSelecionado(null);
    }
  }, [anosBase, anosSimulacao, contexto]);

  const urlDashboard = contexto === "base" 
    ? `/api/importacao/dashboard?exercicio=${anoSelecionado || ""}` 
    : `/api/simulacoes/${contexto}/dashboard?exercicio=${anoSelecionado}`;

  const { data, isLoading, error } = useSWR(
    (contexto === "base" || (contexto !== "base" && anoSelecionado)) ? urlDashboard : null,
    fetcher
  );

  const d = data?.dados;
  const kpis = d?.kpis;
  const ant = d?.kpis_anterior;

  const urlConsolidado = contexto === "base"
    ? "/api/importacao/dashboard/consolidado-faixas"
    : `/api/simulacoes/${contexto}/consolidado-faixas`;

  const { data: respConsolidado } = useSWR(urlConsolidado, fetcher);
  const consolidado = respConsolidado?.dados || {};

  const urlEdificacao = contexto === "base"
    ? `/api/importacao/dashboard/distribuicao-edificacao?exercicio=${anoSelecionado || ""}`
    : `/api/simulacoes/${contexto}/distribuicao-edificacao?exercicio=${anoSelecionado}`;

  const { data: respEdificacao } = useSWR<{ dados: MatrizEdificacao }>(
    anoSelecionado ? urlEdificacao : null, 
    fetcher
  );
  const matrizEdf = respEdificacao?.dados || {};

  const [anosVisiveis, setAnosVisiveis] = useState<number[]>([]);

  useEffect(() => {
    if (consolidado) {
      const todosAnos = new Set<number>();
      Object.values(consolidado).forEach((cat: any) => {
        Object.values(cat).forEach((faixa: any) => {
          Object.keys(faixa.dados).forEach(ano => todosAnos.add(Number(ano)));
        });
      });
      const anosSorted = Array.from(todosAnos).sort((a, b) => a - b);
      // Por padrão, mostramos os últimos 2 reais e os 3 primeiros simulados
      if (anosVisiveis.length === 0 && anosSorted.length > 0) {
        setAnosVisiveis(anosSorted.filter(a => (a >= 2022 && a <= 2028)));
      }
    }
  }, [consolidado]);

  const alternarAno = (ano: number) => {
    setAnosVisiveis(prev => 
      prev.includes(ano) ? prev.filter(a => a !== ano) : [...prev, ano].sort((a, b) => a - b)
    );
  };

  const todosAnosDisponiveis = () => {
    const todos = new Set<number>();
    Object.values(consolidado).forEach((cat: any) => {
      Object.values(cat).forEach((faixa: any) => {
        Object.keys(faixa.dados).forEach(ano => todos.add(Number(ano)));
      });
    });
    return Array.from(todos).sort((a, b) => a - b);
  };

  if (isLoading) {
    return <div className="page active"><div className="page-content"><div className="table-empty">Carregando indicadores...</div></div></div>;
  }

  if (error || !d || !kpis) {
    return (
      <div className="page active">
        <div className="page-content">
          <div className="card">
            <div className="card-body" style={{ textAlign: "center", padding: "40px" }}>
              <div style={{ fontSize: "32px", marginBottom: "12px" }}>📊</div>
              <div style={{ fontSize: "15px", fontWeight: 600, marginBottom: "6px" }}>Dados indisponíveis</div>
              <div className="text-sm text-muted">Certifique-se de que a base foi importada ou a simulação concluída.</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const varImoveis  = variacao(kpis.total_imoveis, ant?.total_imoveis, d.exercicio_anterior || d.exercicio_base);
  const varVenal    = variacao(kpis.valr_venal_total, ant?.valr_venal_total, d.exercicio_anterior || d.exercicio_base);
  const varImposto  = variacao(kpis.valr_imposto_total, ant?.valr_imposto_total, d.exercicio_anterior || d.exercicio_base);


  const renderDelta = (vAtual: number, vAnterior: number) => {
    if (!vAtual || !vAnterior) return null;
    const pct = ((vAtual - vAnterior) / vAnterior) * 100;
    // Crescimento (entrada na faixa) = Verde (badge-desceu)
    // Queda (saída da faixa) = Vermelho (badge-subiu)
    const cls = pct > 0.5 ? "badge-desceu" : pct < -0.5 ? "badge-subiu" : "badge-igual";
    const sinal = pct > 0.5 ? "↑" : pct < -0.5 ? "↓" : "→";
    return (
      <span className={`badge ${cls}`} style={{ fontSize: "10px", padding: "1px 5px" }}>
        {sinal} {Math.abs(pct).toFixed(1)}%
      </span>
    );
  };

  return (
    <div className="page active">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <div className="page-title">
              {contexto === "base" ? `Dashboard · Base Real ${anoSelecionado || d.exercicio_atual}` : `Dashboard · Projeção ${anoSelecionado}`}
            </div>
            <div className="page-subtitle">
              {contexto === "base" 
                ? "Visão analítica da base importada de lançamentos" 
                : "Impacto projetado conforme regras do cenário selecionado"}
            </div>
          </div>
          <div className="flex-gap-8">
            <select 
              value={contexto} 
              onChange={(e) => setContexto(e.target.value)}
              style={{ width: "240px" }}
            >
              <option value="base">📍 Base Original (Dados Reais)</option>
              <optgroup label="Simulações Concluídas">
                {simulacoes.map(s => (
                  <option key={s.id} value={s.id}>🚀 {s.nome}</option>
                ))}
              </optgroup>
            </select>

            {((contexto !== "base" && anosSimulacao.length > 0) || (contexto === "base" && anosBase.length > 0)) && (
              <select 
                value={anoSelecionado || ""} 
                onChange={(e) => setAnoSelecionado(Number(e.target.value))}
                style={{ width: "100px" }}
              >
                {(contexto === "base" ? anosBase : anosSimulacao).map(ano => (
                  <option key={ano} value={ano}>{ano}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      <div className="page-content">
        {/* KPIs */}
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-label">Total de imóveis</div>
            <div className="kpi-value">{fmtNum(kpis.total_imoveis)}</div>
            {varImoveis ? (
              <div className={`kpi-delta ${varImoveis.pct > 0 ? "up" : varImoveis.pct < 0 ? "down" : "neu"}`}>{varImoveis.texto}</div>
            ) : <div className="kpi-delta neu">— sem variação</div>}
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Valor venal total</div>
            <div className="kpi-value">{fmtMoeda(kpis.valr_venal_total)}</div>
            {varVenal ? (
              <div className={`kpi-delta ${varVenal.pct > 0 ? "up" : "down"}`}>{varVenal.texto}</div>
            ) : <div className="kpi-delta neu">— base de referência</div>}
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Imposto total</div>
            <div className="kpi-value">{fmtMoeda(kpis.valr_imposto_total)}</div>
            {varImposto ? (
              <div className={`kpi-delta ${varImposto.pct > 0 ? "up" : "down"}`}>{varImposto.texto}</div>
            ) : <div className="kpi-delta neu">— cálculo inicial</div>}
          </div>
          <div className="kpi-card">
            <div className="kpi-label">IPTU Social</div>
            <div className="kpi-value">{fmtNum(kpis.iptu_social)}</div>
            <div className="kpi-delta neu">↑ {fmtPct(kpis.iptu_social, kpis.total_imoveis)} da base total</div>
          </div>
        </div>

        {/* grid-2: Evolução IPTU Social (esq) + Imposto Mínimo (dir) */}
        <div className="grid-2 mt-16">
          <div className="card">
            <div className="card-header">
              <div className="card-title">Evolução do IPTU Social</div>
            </div>
            <div className="card-body-flush table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Exercício</th>
                    <th className="right">Quantidade</th>
                    <th className="right">Limite vigente</th>
                    <th className="right">% do total</th>
                  </tr>
                </thead>
                <tbody>
                  {(d.iptu_social_historico || []).map((row: any) => (
                    <tr key={row.exercicio}>
                      <td>{row.exercicio}</td>
                      <td className="right">{fmtNum(row.quantidade)}</td>
                      <td className="right mono">{fmtMoeda(row.limite_vigente)}</td>
                      <td className="right">{fmtPct(row.quantidade, kpis.total_imoveis)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: "var(--blue-light)" }}>
                    <td><span className="badge badge-blue">{anoSelecionado || d.exercicio_atual} ✦</span></td>
                    <td className="right fw-500">{fmtNum(kpis.iptu_social)}</td>
                    <td className="right mono fw-500">{fmtMoeda(kpis.limite_social)}</td>
                    <td className="right fw-500">{fmtPct(kpis.iptu_social, kpis.total_imoveis)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Imposto mínimo</div>
              <div className="badge badge-amber">Art. 179 CTM</div>
            </div>
            <div className="card-body">
              <div className="kpi-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: 0 }}>
                <div className="kpi-card" style={{ padding: "12px 14px" }}>
                  <div className="kpi-label">Quantidade</div>
                  <div className="kpi-value" style={{ fontSize: "20px" }}>{fmtNum(kpis.imposto_minimo)}</div>
                </div>
                <div className="kpi-card" style={{ padding: "12px 14px" }}>
                  <div className="kpi-label">Valor mínimo {anoSelecionado || d.exercicio_atual}</div>
                  <div className="kpi-value" style={{ fontSize: "18px", fontFamily: "var(--font-mono)" }}>{fmtMoeda(kpis.valr_minimo)}</div>
                </div>
              </div>
              <div className="text-xs text-muted mt-12">
                Valor base R$ 100,00 atualizado pelo indexador (SELIC/IPCA) acumulado.
              </div>
            </div>
          </div>
        </div>

        {/* Distribuição por faixa — sempre visível quando há dados */}
        {Object.keys(consolidado).length > 0 && (
          <div className="mt-24" style={{ overflow: "hidden", width: "100%" }}>
            <div className="card" style={{ overflow: "hidden" }}>
              <div className="card-header" style={{ flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <div className="card-title">Distribuição de imóveis por faixa de alíquota</div>
                  <div className="card-subtitle">Reais 2022–2026 · Simulados 2027+ — selecione os anos a exibir</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span className="text-xs text-muted fw-500" style={{ whiteSpace: "nowrap" }}>Anos:</span>
                  <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                    {todosAnosDisponiveis().map(ano => (
                      <button key={ano} className="btn btn-sm"
                        style={{
                          fontSize: "11px", padding: "3px 8px", borderRadius: "4px", margin: 0,
                          background: anosVisiveis.includes(ano) ? (ano < 2027 ? "var(--surface-3)" : "var(--blue-light)") : "transparent",
                          color: anosVisiveis.includes(ano) ? (ano < 2027 ? "var(--txt-2)" : "var(--blue-txt)") : "var(--txt-4)",
                          border: `1px ${anosVisiveis.includes(ano) && ano >= 2027 ? "dashed" : "solid"} ${anosVisiveis.includes(ano) ? (ano < 2027 ? "var(--border-md)" : "var(--blue-mid)") : "var(--border)"}`,
                          fontWeight: anosVisiveis.includes(ano) ? "500" : "400"
                        }}
                        onClick={() => alternarAno(ano)}>{ano}</button>
                    ))}
                  </div>
                  <div style={{ width: "1px", height: "18px", background: "var(--border-md)", margin: "0 4px" }} />
                  <button className="btn btn-ghost btn-sm" onClick={() => setAnosVisiveis(todosAnosDisponiveis())}>Todos</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setAnosVisiveis([])}>Limpar</button>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "20px", padding: "10px 18px", borderBottom: "1px solid var(--border)", background: "var(--surface-2)", flexWrap: "wrap" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--txt-3)" }}>
                  <span style={{ display: "inline-block", width: "28px", height: "2px", background: "var(--border-dark)" }} />
                  Dados reais (2022–2026)
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--blue-txt)" }}>
                  <span style={{ display: "inline-block", width: "28px", height: "0", borderTop: "2px dashed var(--blue)" }} />
                  Dados simulados (2027+)
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--txt-3)" }}>
                  <span className="badge badge-desceu" style={{ fontSize: "10px", padding: "1px 5px" }}>↑</span> Crescimento na faixa
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--txt-3)" }}>
                  <span className="badge badge-subiu" style={{ fontSize: "10px", padding: "1px 5px" }}>↓</span> Queda na faixa
                </span>
              </div>
              <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "480px", width: "100%", display: "block", boxSizing: "border-box" }}>
                <table style={{ minWidth: "1400px", borderCollapse: "collapse", whiteSpace: "nowrap" }}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: "190px", position: "sticky", left: 0, background: "var(--surface-2)", zIndex: 2 }}>Categoria / Faixa</th>
                      {anosVisiveis.map((ano, i) => (
                        <React.Fragment key={ano}>
                          <th className="right" style={{ minWidth: "80px", background: ano < 2027 ? "var(--surface-2)" : "var(--blue-light)", color: ano < 2027 ? "var(--txt-3)" : "var(--blue-txt)" }}>
                            {ano}{ano >= 2027 && <span style={{ fontSize: "9px", opacity: 0.6, marginLeft: "3px" }}>sim</span>}
                          </th>
                          {i > 0 && <th className="right" style={{ minWidth: "58px", background: ano < 2027 ? "var(--surface-2)" : "var(--blue-light)", color: ano < 2027 ? "var(--txt-3)" : "var(--blue-txt)", opacity: 0.8 }}>Δ</th>}
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(consolidado).map(([catNome, faixas]: [string, any]) => (
                      <React.Fragment key={catNome}>
                        <tr style={{ background: "var(--surface-3)" }}>
                          <td colSpan={anosVisiveis.length * 2} style={{ fontSize: "11px", fontWeight: 600, color: "var(--txt-2)", padding: "8px 14px", textTransform: "uppercase", letterSpacing: ".05em", position: "sticky", left: 0 }}>
                            {catNome}
                          </td>
                        </tr>
                        {Object.entries(faixas).sort((a: any, b: any) => a[1].ordem - b[1].ordem).map(([fxNome, fx]: [string, any]) => (
                          <tr key={fxNome}>
                            <td style={{ fontSize: "12px", color: "var(--txt-3)", paddingLeft: "22px", position: "sticky", left: 0, background: "var(--surface)" }}>{fxNome}</td>
                            {anosVisiveis.map((ano, i) => {
                              const val = fx.dados[ano];
                              const bg = ano < 2027 ? "" : "rgba(219,234,254,0.15)";
                              return (
                                <React.Fragment key={ano}>
                                  <td className="right text-mono" style={{ fontSize: "12px", background: bg }}>{fmtNum(val)}</td>
                                  {i > 0 && <td className="right" style={{ background: bg }}>{renderDelta(val, fx.dados[anosVisiveis[i - 1]])}</td>}
                                </React.Fragment>
                              );
                            })}
                          </tr>
                        ))}
                        {/* Linha Total por Categoria */}
                        <tr style={{ background: "var(--surface-2)", borderTop: "1px solid var(--border-md)" }}>
                          <td style={{ fontSize: "12px", fontWeight: 600, color: "var(--txt-2)", paddingLeft: "22px", position: "sticky", left: 0, background: "var(--surface-2)" }}>
                            Total {catNome}
                          </td>
                          {anosVisiveis.map((ano, i) => {
                            const tot = Object.values(faixas).reduce((acc: number, f: any) => acc + (f.dados[ano] || 0), 0);
                            const bg = ano < 2027 ? "" : "rgba(219,234,254,0.15)";
                            return (
                              <React.Fragment key={ano}>
                                <td className="right text-mono fw-500" style={{ fontSize: "12px", background: bg }}>{fmtNum(tot)}</td>
                                {i > 0 && (
                                  <td className="right" style={{ background: bg }}>
                                    {renderDelta(tot, Object.values(faixas).reduce((acc: number, f: any) => acc + (f.dados[anosVisiveis[i - 1]] || 0), 0))}
                                  </td>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tr>
                        <tr><td colSpan={anosVisiveis.length * 2 + 1} style={{ height: "6px", background: "var(--bg)" }}></td></tr>
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Distribuição por Edificação x Lançamento */}
        {Object.keys(matrizEdf).length > 0 && (
          <div className="mt-24">
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Imóveis por Tipo de Edificação e Lançamento</div>
                  <div className="card-subtitle">Detalhamento para identificação de perfil no exercício {anoSelecionado}</div>
                </div>
              </div>
              <div className="card-body-flush table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Tipo de Edificação</th>
                      <th className="right">Normal</th>
                      <th className="right">Isento/Imune</th>
                      <th className="right">IPTU Social</th>
                      <th className="right" style={{ background: "rgba(245, 158, 11, 0.05)" }}>Imposto Mínimo</th>
                      <th className="right fw-600">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(matrizEdf).sort((a, b) => a[0].localeCompare(b[0])).map(([edf, lancamentos]) => {
                      const totalRow = Object.values(lancamentos).reduce((acc, v) => acc + v, 0);
                      return (
                        <tr key={edf}>
                          <td className="fw-500">{edf}</td>
                          <td className="right text-mono">{fmtNum(lancamentos["Normal"])}</td>
                          <td className="right text-mono">{fmtNum(lancamentos["Isento/Imune"])}</td>
                          <td className="right text-mono">{fmtNum(lancamentos["IPTU Social"])}</td>
                          <td className="right text-mono fw-600" style={{ color: "var(--amber-txt)", background: "rgba(245, 158, 11, 0.05)" }}>
                            {fmtNum(lancamentos["Imposto Mínimo"])}
                          </td>
                          <td className="right text-mono fw-600" style={{ background: "var(--surface-2)" }}>{fmtNum(totalRow)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "var(--surface-3)" }}>
                      <td className="fw-700">TOTAL GERAL</td>
                      <td className="right text-mono fw-700">{fmtNum(Object.values(matrizEdf).reduce((acc, l) => acc + l["Normal"], 0))}</td>
                      <td className="right text-mono fw-700">{fmtNum(Object.values(matrizEdf).reduce((acc, l) => acc + l["Isento/Imune"], 0))}</td>
                      <td className="right text-mono fw-700">{fmtNum(Object.values(matrizEdf).reduce((acc, l) => acc + l["IPTU Social"], 0))}</td>
                      <td className="right text-mono fw-700" style={{ color: "var(--amber-txt)" }}>
                        {fmtNum(Object.values(matrizEdf).reduce((acc, l) => acc + l["Imposto Mínimo"], 0))}
                      </td>
                      <td className="right text-mono fw-700">{fmtNum(Object.values(matrizEdf).reduce((acc, l) => acc + Object.values(l).reduce((a, v) => a + v, 0), 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
