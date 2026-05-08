"use client";
import React, { useState, useEffect } from "react";
import useSWR from "swr";
import { fetcher } from "../../lib/api";

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

const fmtNum = (n: any) => {
  const val = typeof n === "string" ? parseFloat(n) : n;
  return (val !== null && val !== undefined && !isNaN(val)) ? val.toLocaleString("pt-BR") : "—";
};

const fmtMoeda = (n: any) => {
  const val = typeof n === "string" ? parseFloat(n) : n;
  if (val === null || val === undefined || isNaN(val)) return "—";
  const absN = Math.abs(val);
  let prefix = val < 0 ? "- " : "";
  if (absN >= 1e9) return `${prefix}R$ ${(absN / 1e9).toLocaleString("pt-BR", { minimumFractionDigits: 1 })} bi`;
  if (absN >= 1e6) return `${prefix}R$ ${(absN / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 1 })} M`;
  return prefix + val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

const LineChart = ({ dados, valorKey = "valor", labelKey = "exercicio", height = 200, moeda = false, anoAtivo = null }: any) => {
  if (!dados || dados.length === 0) return <div className="table-empty">Sem dados para o gráfico</div>;

  const padding = { top: 30, right: 40, bottom: 30, left: 40 };
  const width = 600; // ViewBox width
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const maxVal = Math.max(...dados.map((d: any) => d[valorKey] || 0), 1) * 1.1;
  const minVal = 0;

  const points = dados.map((d: any, i: number) => {
    const x = padding.left + (i / (dados.length - 1 || 1)) * chartWidth;
    const y = height - padding.bottom - ((d[valorKey] - minVal) / (maxVal - minVal)) * chartHeight;
    return { x, y, ...d };
  });

  const pathD = points.reduce((acc: string, p: any, i: number) => 
    i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`, "");

  return (
    <div style={{ width: "100%", position: "relative" }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", overflow: "visible" }}>
        {/* Linhas de Grade */}
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
          <line 
            key={i} 
            x1={padding.left} 
            y1={height - padding.bottom - p * chartHeight} 
            x2={width - padding.right} 
            y2={height - padding.bottom - p * chartHeight} 
            stroke="var(--border)" 
            strokeWidth="1" 
            strokeDasharray="4 4"
          />
        ))}

        {/* Linha do Gráfico */}
        <path 
          d={pathD} 
          fill="none" 
          stroke="#0e4f66" 
          strokeWidth="3" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          style={{ transition: "all 0.3s" }}
        />

        {/* Pontos e Rótulos */}
        {points.map((p: any, i: number) => {
          const isAtivo = anoAtivo === p[labelKey];
          return (
            <g key={i}>
              <circle 
                cx={p.x} 
                cy={p.y} 
                r={isAtivo ? 6 : 4} 
                fill={isAtivo ? "#0e4f66" : "#fff"} 
                stroke="#0e4f66" 
                strokeWidth="2" 
                style={{ cursor: "pointer", transition: "all 0.2s" }}
              />
              <text 
                x={p.x} 
                y={p.y - 12} 
                textAnchor="middle" 
                fontSize="11" 
                fontWeight="600" 
                fill="var(--txt-1)"
                style={{ opacity: 0.9 }}
              >
                {moeda ? `R$ ${(p[valorKey] / 1000000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : fmtNum(p[valorKey])}
              </text>
              <text 
                x={p.x} 
                y={height - 10} 
                textAnchor="middle" 
                fontSize="11" 
                fontWeight={isAtivo ? "700" : "400"} 
                fill={isAtivo ? "var(--txt-1)" : "var(--txt-4)"}
              >
                {p[labelKey]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
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
      // Sempre tenta pegar o maior ano disponível para abrir o dashboard atualizado
      const maiorAno = Math.max(...lista);
      if (!anoSelecionado || !lista.includes(anoSelecionado)) {
        setAnoSelecionado(maiorAno);
      }
    } else {
      setAnoSelecionado(null);
    }
  }, [anosBase, anosSimulacao, contexto]);

  const urlDashboard = contexto === "base" 
    ? `/api/importacao/dashboard?exercicio=${anoSelecionado || ""}` 
    : `/api/simulacoes/${contexto}/dashboard?exercicio=${anoSelecionado}`;

  const { data, error, isLoading } = useSWR(
    (contexto === "base" || (contexto !== "base" && anoSelecionado)) ? urlDashboard : null,
    fetcher
  );

  const d = data?.dados;
  const kpis = d?.kpis || null;
  const ant = d?.kpis_anterior || null;

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
  const { data: respResumo } = useSWR(
    contexto !== "base" ? `/api/simulacoes/${contexto}/resumo-consolidado` : null, 
    fetcher
  );
  const resumoConsolidado = respResumo?.dados || [];

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
    return (
      <div className="page active">
        <div className="page-header">
           <div className="page-title">Carregando Dashboard...</div>
        </div>
        <div className="page-content">
          <div className="card">
            <div className="card-body" style={{ textAlign: "center", padding: "100px" }}>
              <div className="table-empty">Processando indicadores financeiros e estatísticos...</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Se não tem dados ou KPIs essenciais e não está carregando, mostra a base vazia
  if ((!d || !kpis) && !isLoading) {
    return (
      <div className="page active">
        <div className="page-content">
          <div className="card">
            <div className="card-body" style={{ textAlign: "center", padding: "40px" }}>
              <div style={{ fontSize: "32px", marginBottom: "12px" }}>📊</div>
              <div style={{ fontSize: "15px", fontWeight: 600, marginBottom: "6px" }}>Nenhum dado encontrado</div>
              <div className="text-sm text-muted">A base do exercício selecionado está vazia ou não foi importada.</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const varImoveis  = variacao(kpis?.total_imoveis || 0, ant?.total_imoveis, d?.exercicio_anterior || d?.exercicio_base);
  const varVenal    = variacao(kpis?.valr_venal_total || 0, ant?.valr_venal_total, d?.exercicio_anterior || d?.exercicio_base);
  const varImposto  = variacao(kpis?.valr_imposto_total || 0, ant?.valr_imposto_total, d?.exercicio_anterior || d?.exercicio_base);


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
            <div className="kpi-value">{fmtNum(kpis?.total_imoveis || 0)}</div>
            {varImoveis ? (
              <div className={`kpi-delta ${varImoveis.pct > 0 ? "up" : varImoveis.pct < 0 ? "down" : "neu"}`}>{varImoveis.texto}</div>
            ) : <div className="kpi-delta neu">— sem variação</div>}
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Valor venal total</div>
            <div className="kpi-value">{fmtMoeda(kpis?.valr_venal_total || 0)}</div>
            {varVenal ? (
              <div className={`kpi-delta ${varVenal.pct > 0 ? "up" : "down"}`}>{varVenal.texto}</div>
            ) : <div className="kpi-delta neu">— base de referência</div>}
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Imposto total</div>
            <div className="kpi-value">{fmtMoeda(kpis?.valr_imposto_total || 0)}</div>
            {varImposto ? (
              <div className={`kpi-delta ${varImposto.pct > 0 ? "up" : "down"}`}>{varImposto.texto}</div>
            ) : <div className="kpi-delta neu">— cálculo inicial</div>}
          </div>
          <div className="kpi-card">
            <div className="kpi-label">IPTU Social</div>
            <div className="kpi-value">{fmtNum(kpis?.iptu_social || 0)}</div>
            <div className="kpi-delta neu">↑ {fmtPct(kpis?.iptu_social || 0, kpis?.total_imoveis || 0)} da base total</div>
          </div>
        </div>

        {/* Gráficos de Evolução */}
        <div className="grid-3 mt-16">
          <div className="card">
            <div className="card-header">
              <div className="card-title">Lançamento (Milhões R$)</div>
              <div className="badge badge-blue">Cofre</div>
            </div>
            <div className="card-body">
              <LineChart 
                dados={d?.arrecadacao_historica || []} 
                valorKey="valor"
                moeda={true} 
                height={160}
                anoAtivo={anoSelecionado}
              />
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Normal (Qtd. Imóveis)</div>
              <div className="badge badge-blue">Tributados</div>
            </div>
            <div className="card-body">
              <LineChart 
                dados={(d?.volume_historico || []).map((v: any) => ({ ...v, valor: v.normal }))} 
                valorKey="valor"
                height={160}
                anoAtivo={anoSelecionado}
              />
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">IPTU Social (Qtd. Imóveis)</div>
              <div className="badge badge-green">Social</div>
            </div>
            <div className="card-body">
              <LineChart 
                dados={(d?.volume_historico || []).map((v: any) => ({ ...v, valor: v.social }))} 
                valorKey="valor"
                height={160}
                anoAtivo={anoSelecionado}
              />
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Isentos (Qtd. Imóveis)</div>
              <div className="badge badge-amber">Fiscal</div>
            </div>
            <div className="card-body">
              <LineChart 
                dados={(d?.volume_historico || []).map((v: any) => ({ ...v, valor: v.isentos }))} 
                valorKey="valor"
                height={160}
                anoAtivo={anoSelecionado}
              />
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Imunes (Qtd. Imóveis)</div>
              <div className="badge badge-purple">Fiscal</div>
            </div>
            <div className="card-body">
              <LineChart 
                dados={(d?.volume_historico || []).map((v: any) => ({ ...v, valor: v.imunes }))} 
                valorKey="valor"
                height={160}
                anoAtivo={anoSelecionado}
              />
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Imposto Mínimo (Qtd. Imóveis)</div>
              <div className="badge badge-red">Tributados</div>
            </div>
            <div className="card-body">
              <LineChart 
                dados={(d?.volume_historico || []).map((v: any) => ({ ...v, valor: v.minimo }))} 
                valorKey="valor"
                height={160}
                anoAtivo={anoSelecionado}
              />
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
                      const totalRow = Object.values(lancamentos).reduce((acc: number, v: number) => acc + v, 0);
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
                      <td className="right text-mono fw-700">{fmtNum(Object.values(matrizEdf).reduce((acc: number, l: any) => acc + (l["Normal"] || 0), 0))}</td>
                      <td className="right text-mono fw-700">{fmtNum(Object.values(matrizEdf).reduce((acc: number, l: any) => acc + (l["Isento/Imune"] || 0), 0))}</td>
                      <td className="right text-mono fw-700">{fmtNum(Object.values(matrizEdf).reduce((acc: number, l: any) => acc + (l["IPTU Social"] || 0), 0))}</td>
                      <td className="right text-mono fw-700" style={{ color: "var(--amber-txt)" }}>
                        {fmtNum(Object.values(matrizEdf).reduce((acc: number, l: any) => acc + (l["Imposto Mínimo"] || 0), 0))}
                      </td>
                      <td className="right text-mono fw-700">{fmtNum(Object.values(matrizEdf).reduce((acc: number, l: any) => acc + Object.values(l).reduce((a: number, v: any) => a + (Number(v) || 0), 0), 0))}</td>
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
