"use client";
import React, { useState, useEffect } from "react";
import useSWR from "swr";
import { fetcher } from "../../lib/api";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface KpisBrutos {
  total_imoveis: number;
  normal: number;
  isentos: number;
  imposto_minimo: number;
  iptu_social: number;
  imunes: number;
  predial: number;
  territorial: number;
  residencial: number;
  nao_residencial: number;
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
  cenario?: string;
  indexador_social?: string;
  indexador_minimo?: string;
  aplicar_cap?: boolean;
  tipo_cap?: string;
  descricao?: string;
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

const LineChart = ({ dados, valorKey = "valor", labelKey = "exercicio", height = 200, width = 600, moeda = false, anoAtivo = null, fontScale = 1, lineWidth = 1 }: any) => {
  if (!dados || dados.length === 0) return <div className="table-empty">Sem dados para o gráfico</div>;

  const padding = { top: 30, right: 40, bottom: 30, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const fsFactor = 1.0;

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
          strokeWidth={lineWidth * 0.75} 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          style={{ transition: "all 0.3s" }}
        />

        {/* Pontos e Rótulos */}
        {points.map((p: any, i: number) => {
          const isAtivo = anoAtivo === p[labelKey];
          const val = p[valorKey] || 0;
          let variacao = null;
          if (i > 0) {
            const ant = points[i-1][valorKey] || 0;
            if (ant > 0) variacao = ((val - ant) / ant) * 100;
          }

          return (
            <g key={i}>
              <circle 
                cx={p.x} 
                cy={p.y} 
                r={(isAtivo ? 1.5 : 0.9) * lineWidth * 0.75} 
                fill={isAtivo ? "#0e4f66" : "#fff"} 
                stroke="#0e4f66" 
                strokeWidth={1.5 * lineWidth * 0.75} 
                style={{ cursor: "pointer", transition: "all 0.2s" }}
              />
              {/* Variação % acima do ponto */}
              {variacao !== null && (
                <text 
                  x={p.x} 
                  y={p.y - (28 * fontScale * fsFactor)} 
                  textAnchor="middle" 
                  fontSize={10 * fontScale * fsFactor} 
                  fontWeight="700" 
                  fill={variacao > 0 ? "var(--green)" : variacao < 0 ? "var(--red)" : "var(--txt-4)"}
                >
                  {variacao > 0 ? `↑${variacao.toFixed(1)}%` : variacao < 0 ? `↓${Math.abs(variacao).toFixed(1)}%` : "0%"}
                </text>
              )}
              <text 
                x={p.x} 
                y={p.y - (12 * fontScale * fsFactor)} 
                textAnchor="middle" 
                fontSize={11 * fontScale * fsFactor} 
                fontWeight="600" 
                fill="var(--txt-1)"
                style={{ opacity: 0.9 }}
              >
                {moeda ? `R$ ${(val / 1000000).toLocaleString('pt-BR', { minimumFractionDigits: 1 })}M` : fmtNum(val)}
              </text>
              <text 
                x={p.x} 
                y={height - (10 * fontScale * fsFactor)} 
                textAnchor="middle" 
                fontSize={11 * fontScale * fsFactor} 
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

const PieChart = ({ dados, total, title }: { dados: { label: string, value: number, color: string }[], total: number, title: string }) => {
  let currentPercent = 0;
  
  const getCoordinatesForPercent = (percent: number) => {
    const x = Math.cos(2 * Math.PI * percent);
    const y = Math.sin(2 * Math.PI * percent);
    return [x, y];
  };

  return (
    <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '10px', padding: '15px' }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flex: 1 }}>
        <div style={{ width: '100px', height: '100px', flexShrink: 0 }}>
          <svg viewBox="-1.1 -1.1 2.2 2.2" style={{ transform: 'rotate(-90deg)', width: '100%', height: '100%' }}>
            {dados.map((slice, i) => {
              if (slice.value <= 0) return null;
              const percent = slice.value / total;
              const [startX, startY] = getCoordinatesForPercent(currentPercent);
              currentPercent += percent;
              const [endX, endY] = getCoordinatesForPercent(currentPercent);
              const largeArcFlag = percent > 0.5 ? 1 : 0;
              const pathData = [
                `M ${startX} ${startY}`,
                `A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY}`,
                `L 0 0`,
              ].join(' ');
              return <path key={i} d={pathData} fill={slice.color} stroke="#fff" strokeWidth="0.02" />;
            })}
            <circle cx="0" cy="0" r="0.6" fill="#fff" />
          </svg>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
          {dados.map((slice, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: slice.color }}></div>
                <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>{slice.label}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', color: 'var(--text-muted)' }}>
                <span>{fmtNum(slice.value)}</span>
                <span style={{ fontWeight: 600, color: slice.color, minWidth: '40px', textAlign: 'right' }}>{fmtPct(slice.value, total)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Componente ───────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [contexto, setContexto] = useState<string>("base"); 
  const [anoSelecionado, setAnoSelecionado] = useState<number | null>(null);
  const [anosGraficoVisiveis, setAnosGraficoVisiveis] = useState<number[]>([]);

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
    }
  }, [anosBase, anosSimulacao, contexto]);

  const urlDashboard = contexto === "base" 
    ? `/api/importacao/dashboard?exercicio=${anoSelecionado || ""}` 
    : `/api/simulacoes/${contexto}/dashboard?exercicio=${anoSelecionado}`;

  const { data, error, isLoading } = useSWR(
    (contexto === "base" || (contexto !== "base" && anoSelecionado)) ? urlDashboard : null,
    fetcher,
    { keepPreviousData: true }
  );

  const d = data?.dados;
  const kpis = d?.kpis || null;
  const ant = d?.kpis_anterior || null;

  const urlConsolidado = contexto === "base"
    ? "/api/importacao/dashboard/consolidado-faixas"
    : `/api/simulacoes/${contexto}/consolidado-faixas`;

  const { data: respConsolidado } = useSWR(urlConsolidado, fetcher, { keepPreviousData: true });
  const consolidado = respConsolidado?.dados || {};

  const urlEdificacao = contexto === "base"
    ? `/api/importacao/dashboard/distribuicao-edificacao?exercicio=${anoSelecionado || ""}`
    : `/api/simulacoes/${contexto}/distribuicao-edificacao?exercicio=${anoSelecionado}`;

  const { data: respEdificacao } = useSWR<{ dados: MatrizEdificacao }>(
    anoSelecionado ? urlEdificacao : null, 
    fetcher,
    { keepPreviousData: true }
  );
  const matrizEdf = respEdificacao?.dados || {};
  const { data: respResumo } = useSWR(
    contexto !== "base" ? `/api/simulacoes/${contexto}/resumo-consolidado` : null, 
    fetcher
  );
  const resumoConsolidado = respResumo?.dados || [];

  const { data: respParams } = useSWR<{ dados: any[] }>(
    contexto !== "base" ? `/api/simulacoes/${contexto}/parametros` : null,
    fetcher
  );
  const parametros = respParams?.dados || [];
  const simulacaoAtiva = simulacoes.find(s => s.id === contexto);
  const paramsAtivos = parametros.find((p: any) => p.exercicio === anoSelecionado) || parametros[0];

  // Calcula escala de fonte baseada no número de anos visíveis para evitar truncamento
  const calcFS = (base: number = 1) => {
    const n = anosGraficoVisiveis.length;
    if (n <= 6) return base;
    if (n <= 10) return base * 0.90;
    if (n <= 15) return base * 0.80;
    if (n <= 20) return base * 0.60;
    return base * 0.50;
  };

  // Inicializa anos do gráfico quando os dados chegam
  useEffect(() => {
    if (d?.arrecadacao_historica) {
      const todos = d.arrecadacao_historica.map((h: any) => h.exercicio).sort();
      const intersecao = anosGraficoVisiveis.filter(a => todos.includes(a));
      if (intersecao.length === 0 && todos.length > 0) {
        // Se os anos selecionados anteriormente não existem na nova base, reseta para os últimos 6
        setAnosGraficoVisiveis(todos.slice(-6));
      } else if (intersecao.length > 0 && intersecao.length !== anosGraficoVisiveis.length) {
        // Ajusta mantendo apenas os anos que de fato existem
        setAnosGraficoVisiveis(intersecao);
      }
    }
  }, [d]);

  const todosAnosGrafico = d?.arrecadacao_historica?.map((h: any) => h.exercicio).sort() || [];
  
  const alternarAnoGrafico = (ano: number) => {
    setAnosGraficoVisiveis(prev => 
      prev.includes(ano) ? prev.filter(a => a !== ano) : [...prev, ano].sort((a, b) => a - b)
    );
  };

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
              style={{ width: "420px" }}
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

        {/* Índices e Info */}
        {contexto !== "base" && (
          <div className="card" style={{ padding: '10px 15px', marginTop: '20px', marginBottom: '20px', backgroundColor: 'rgba(14, 79, 102, 0.02)', border: '1px solid rgba(14, 79, 102, 0.1)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', fontSize: '0.75rem', color: '#666' }}>
              <div>
                <strong>Índices:</strong>{' '}
                IPCA: {paramsAtivos?.ipca_ano !== undefined && paramsAtivos?.ipca_ano !== null ? `${paramsAtivos.ipca_ano}%` : '—'}{' '}
                &bull; SELIC: {paramsAtivos?.selic_ano !== undefined && paramsAtivos?.selic_ano !== null ? `${paramsAtivos.selic_ano}%` : '—'}{' '}
                &bull; Faixa de Alíquota: {paramsAtivos?.tipo_indice_faixa || simulacaoAtiva?.cenario || '—'}{' '}
                &bull; IPTU Social: {paramsAtivos?.tipo_indice_social || simulacaoAtiva?.indexador_social || '—'}{' '}
                &bull; Imposto Mínimo: {paramsAtivos?.tipo_indice_minimo || simulacaoAtiva?.indexador_minimo || '—'}{' '}
                &bull; Aplicar limite de transição (CAP): {simulacaoAtiva?.aplicar_cap ? (simulacaoAtiva.tipo_cap === 'APENAS_INFLACAO' ? 'Apenas Inflação (IPCA)' : 'Inflação + 5% (Art. 168 §6º)') : 'Não'}
              </div>
            </div>
          </div>
        )}

        {/* Graficos de Pizza */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '20px' }}>
          <PieChart 
            title="Tipo de Imposto"
            total={kpis?.total_imoveis || 0}
            dados={[
              { label: 'Predial', value: kpis?.predial || 0, color: '#0e4f66' },
              { label: 'Territorial', value: kpis?.territorial || 0, color: '#e67e22' }
            ]}
          />
          <PieChart 
            title="Tipo de Lançamento"
            total={kpis?.total_imoveis || 0}
            dados={[
              { label: 'Normal', value: (kpis?.normal || 0), color: '#27ae60' },
              { label: 'Social', value: kpis?.iptu_social || 0, color: '#3498db' },
              { label: 'Isento', value: kpis?.isentos || 0, color: '#9b59b6' },
              { label: 'Mínimo', value: kpis?.imposto_minimo || 0, color: '#f1c40f' },
              { label: 'Imune', value: kpis?.imunes || 0, color: '#95a5a6' }
            ]}
          />
          <PieChart 
            title="Tipo de Uso"
            total={(kpis?.residencial || 0) + (kpis?.nao_residencial || 0)}
            dados={[
              { label: 'Residencial', value: kpis?.residencial || 0, color: '#2ecc71' },
              { label: 'Não Residencial', value: kpis?.nao_residencial || 0, color: '#34495e' }
            ]}
          />
        </div>

        {/* Filtro de Período para Gráficos */}
        <div className="card mt-16" style={{ padding: "12px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span className="text-sm fw-700" style={{ color: "var(--txt-1)" }}>Período dos Gráficos:</span>
              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                {todosAnosGrafico.map(ano => (
                  <button 
                    key={ano} 
                    className="btn btn-sm"
                    style={{
                      fontSize: "11px", padding: "4px 10px", borderRadius: "6px", margin: 0,
                      background: anosGraficoVisiveis.includes(ano) ? "var(--blue-light)" : "transparent",
                      color: anosGraficoVisiveis.includes(ano) ? "var(--blue-txt)" : "var(--txt-4)",
                      border: `1px solid ${anosGraficoVisiveis.includes(ano) ? "var(--blue-mid)" : "var(--border)"}`,
                      fontWeight: anosGraficoVisiveis.includes(ano) ? "600" : "400",
                      transition: "all 0.2s"
                    }}
                    onClick={() => alternarAnoGrafico(ano)}
                  >
                    {ano}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setAnosGraficoVisiveis(todosAnosGrafico)}>Todos</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setAnosGraficoVisiveis([])}>Limpar</button>
            </div>
          </div>
        </div>

        {/* Gráficos em Série */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' }}>
          
          {/* Linha 1: Lançamento */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Lançamento (Milhões R$)</h3>
              <span className="badge badge-primary">Cofre</span>
            </div>
            <div className="card-body">
              <LineChart 
                dados={(d?.arrecadacao_historica || []).filter((v: any) => anosGraficoVisiveis.includes(v.exercicio))} 
                moeda={true} 
                width={1200}
                height={110} 
                anoAtivo={anoSelecionado}
                fontScale={calcFS(1.0)}
                lineWidth={1.2}
              />
            </div>
          </div>

          {/* Linha 1b: Predial e Territorial */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Predial (Qtd. Imóveis)</h3>
                <span className="badge badge-primary">Predial</span>
              </div>
              <div className="card-body">
                <LineChart 
                  dados={(d?.predial_territorial || []).filter((v: any) => anosGraficoVisiveis.includes(v.exercicio)).map((v: any) => ({ ...v, valor: v.predial }))} 
                  valorKey="valor"
                  height={100}
                  anoAtivo={anoSelecionado}
                  fontScale={calcFS(1.0)}
                  lineWidth={1.1}
                />
              </div>
            </div>
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Territorial (Qtd. Imóveis)</h3>
                <span className="badge" style={{ background: 'rgba(230, 126, 34, 0.15)', color: '#e67e22', border: '1px solid rgba(230, 126, 34, 0.3)' }}>Territorial</span>
              </div>
              <div className="card-body">
                <LineChart 
                  dados={(d?.predial_territorial || []).filter((v: any) => anosGraficoVisiveis.includes(v.exercicio)).map((v: any) => ({ ...v, valor: v.territorial }))} 
                  valorKey="valor"
                  height={100}
                  anoAtivo={anoSelecionado}
                  fontScale={calcFS(1.0)}
                  lineWidth={1.1}
                />
              </div>
            </div>
          </div>

          {/* Linha 2: Normal e Social */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Normal (Qtd. Imóveis)</h3>
                <span className="badge badge-primary">Tributados</span>
              </div>
              <div className="card-body">
                <LineChart 
                  dados={(d?.volume_historico || []).filter((v: any) => anosGraficoVisiveis.includes(v.exercicio)).map((v: any) => ({ ...v, valor: v.normal }))} 
                  valorKey="valor"
                  height={100}
                  anoAtivo={anoSelecionado}
                  fontScale={calcFS(1.0)}
                  lineWidth={1.1}
                />
              </div>
            </div>
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">IPTU Social (Qtd. Imóveis)</h3>
                <span className="badge badge-success">Social</span>
              </div>
              <div className="card-body">
                <LineChart 
                  dados={(d?.volume_historico || []).filter((v: any) => anosGraficoVisiveis.includes(v.exercicio)).map((v: any) => ({ ...v, valor: v.social }))} 
                  valorKey="valor"
                  height={100}
                  anoAtivo={anoSelecionado}
                  fontScale={calcFS(1.0)}
                  lineWidth={1.1}
                />
              </div>
            </div>
          </div>

          {/* Linha 3: Isentos e Imunes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Isentos (Qtd. Imóveis)</h3>
                <span className="badge badge-warning">Fiscal</span>
              </div>
              <div className="card-body">
                <LineChart 
                  dados={(d?.volume_historico || []).filter((v: any) => anosGraficoVisiveis.includes(v.exercicio)).map((v: any) => ({ ...v, valor: v.isentos }))} 
                  valorKey="valor"
                  height={100}
                  anoAtivo={anoSelecionado}
                  fontScale={calcFS(1.0)}
                  lineWidth={1.1}
                />
              </div>
            </div>
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Imunes (Qtd. Imóveis)</h3>
                <span className="badge badge-warning">Fiscal</span>
              </div>
              <div className="card-body">
                <LineChart 
                  dados={(d?.volume_historico || []).filter((v: any) => anosGraficoVisiveis.includes(v.exercicio)).map((v: any) => ({ ...v, valor: v.imunes }))} 
                  valorKey="valor"
                  height={100}
                  anoAtivo={anoSelecionado}
                  fontScale={calcFS(1.0)}
                  lineWidth={1.1}
                />
              </div>
            </div>
          </div>

          {/* Linha 4: Caiu e Subiu de Faixa */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Caiu de Faixa (Qtd. Imóveis)</h3>
                <span className="badge badge-success">Migração</span>
              </div>
              <div className="card-body">
                <LineChart 
                  dados={(d?.migracao_trava || []).filter((v: any) => anosGraficoVisiveis.includes(v.exercicio)).map((v: any) => ({ ...v, valor: v.desceu_faixa }))} 
                  valorKey="valor"
                  height={100}
                  anoAtivo={anoSelecionado}
                  fontScale={calcFS(1.0)}
                  lineWidth={1.1}
                />
              </div>
            </div>
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Subiu de Faixa (Qtd. Imóveis)</h3>
                <span className="badge badge-warning">Migração</span>
              </div>
              <div className="card-body">
                <LineChart 
                  dados={(d?.migracao_trava || []).filter((v: any) => anosGraficoVisiveis.includes(v.exercicio)).map((v: any) => ({ ...v, valor: v.subiu_faixa }))} 
                  valorKey="valor"
                  height={100}
                  anoAtivo={anoSelecionado}
                  fontScale={calcFS(1.0)}
                  lineWidth={1.1}
                />
              </div>
            </div>
          </div>

          {/* Linha 5: CAP e Abaixo da Trava */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Travados no Limite (CAP) - Qtd. Imóveis</h3>
                <span className="badge badge-danger">Transição</span>
              </div>
              <div className="card-body">
                <LineChart 
                  dados={(d?.migracao_trava || []).filter((v: any) => anosGraficoVisiveis.includes(v.exercicio)).map((v: any) => ({ ...v, valor: v.travado_cap }))} 
                  valorKey="valor"
                  height={100}
                  anoAtivo={anoSelecionado}
                  fontScale={calcFS(1.0)}
                  lineWidth={1.1}
                />
              </div>
            </div>
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Abaixo da Trava (Qtd. Imóveis)</h3>
                <span className="badge badge-info">Normal</span>
              </div>
              <div className="card-body">
                <LineChart 
                  dados={(d?.migracao_trava || []).filter((v: any) => anosGraficoVisiveis.includes(v.exercicio)).map((v: any) => ({ ...v, valor: v.abaixo_trava }))} 
                  valorKey="valor"
                  height={100}
                  anoAtivo={anoSelecionado}
                  fontScale={calcFS(1.0)}
                  lineWidth={1.1}
                />
              </div>
            </div>
          </div>

          {/* Linha 6: Imposto Mínimo */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Imposto Mínimo (Qtd. Imóveis)</h3>
              <span className="badge badge-primary">Tributados</span>
            </div>
            <div className="card-body">
              <LineChart 
                dados={(d?.volume_historico || []).filter((v: any) => anosGraficoVisiveis.includes(v.exercicio)).map((v: any) => ({ ...v, valor: v.minimo }))} 
                valorKey="valor"
                width={1200}
                height={110}
                anoAtivo={anoSelecionado}
                fontScale={calcFS(1.0)}
                lineWidth={1.2}
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
