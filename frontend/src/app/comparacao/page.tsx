"use client";
import React, { useState, useEffect } from "react";
import useSWR from "swr";
import { fetcher } from "../../lib/api";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface SimulacaoMin {
  id: string;
  nome: string;
  status: string;
  exercicio_base: number;
  exercicio_destino: number;
  cenario?: string;
  indexador_social?: string;
  indexador_minimo?: string;
  indexador_valor_venal?: string;
  aplicar_cap?: boolean;
  tipo_cap?: string;
  descricao?: string;
}

interface ColunaDados {
  simId: string;
  ano: number | null;
}

// ─── Formatadores ─────────────────────────────────────────────────────────────

const fmtNum = (n: any) => {
  if (n === null || n === undefined) return "—";
  const val = typeof n === "string" ? parseFloat(n) : n;
  return (!isNaN(val)) ? val.toLocaleString("pt-BR") : "—";
};

const fmtMillions = (n: any) => {
  if (n === null || n === undefined) return "—";
  const val = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(val)) return "—";
  return (val / 1000000).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

export default function ComparacaoPage() {
  // Lista de simulações cadastradas
  const { data: respSimulacoes } = useSWR<{ dados: SimulacaoMin[] }>("/api/simulacoes", fetcher);
  const simulacoes = respSimulacoes?.dados || [];

  // Anos da base original (Dados Reais)
  const { data: respAnosBase } = useSWR<{ dados: number[] }>("/api/importacao/dashboard/anos", fetcher);
  const anosBase = respAnosBase?.dados || [];

  // Estado das 4 colunas de comparação
  const [colunas, setColunas] = useState<ColunaDados[]>([
    { simId: "base", ano: 2026 },
    { simId: "", ano: null },
    { simId: "", ano: null },
    { simId: "", ano: null }
  ]);

  // Pré-popula as colunas assim que as simulações e anos forem carregados
  useEffect(() => {
    if (anosBase.length > 0) {
      setColunas(prev => {
        const updated = [...prev];
        updated[0] = { simId: "base", ano: anosBase[0] || 2026 };
        
        // Encontrar as duas primeiras simulações concluídas
        const concluidas = simulacoes.filter(s => s.status === "CONCLUIDO");
        
        if (concluidas.length > 0) {
          updated[1] = { simId: concluidas[0].id, ano: concluidas[0].exercicio_base + 1 };
          
          if (concluidas.length > 1) {
            updated[2] = { simId: concluidas[1].id, ano: concluidas[1].exercicio_base + 1 };
          } else {
            updated[2] = { simId: concluidas[0].id, ano: concluidas[0].exercicio_destino };
          }
        }
        return updated;
      });
    }
  }, [simulacoes, anosBase]);

  // ─── Hooks do useSWR declarados de forma estática para as 4 colunas ────────────

  // Coluna 0
  const sim0 = colunas[0];
  const { data: dataCol0 } = useSWR(
    sim0.simId && sim0.ano
      ? sim0.simId === "base"
        ? `/api/importacao/dashboard?exercicio=${sim0.ano}`
        : `/api/simulacoes/${sim0.simId}/dashboard?exercicio=${sim0.ano}`
      : null,
    fetcher,
    { keepPreviousData: true }
  );
  const { data: paramsCol0 } = useSWR(
    sim0.simId && sim0.simId !== "base"
      ? `/api/simulacoes/${sim0.simId}/parametros`
      : null,
    fetcher,
    { keepPreviousData: true }
  );
  const { data: yearsCol0 } = useSWR(
    sim0.simId && sim0.simId !== "base" ? `/api/simulacoes/${sim0.simId}/anos` : null,
    fetcher
  );

  // Coluna 1
  const sim1 = colunas[1];
  const { data: dataCol1 } = useSWR(
    sim1.simId && sim1.ano
      ? sim1.simId === "base"
        ? `/api/importacao/dashboard?exercicio=${sim1.ano}`
        : `/api/simulacoes/${sim1.simId}/dashboard?exercicio=${sim1.ano}`
      : null,
    fetcher,
    { keepPreviousData: true }
  );
  const { data: paramsCol1 } = useSWR(
    sim1.simId && sim1.simId !== "base"
      ? `/api/simulacoes/${sim1.simId}/parametros`
      : null,
    fetcher,
    { keepPreviousData: true }
  );
  const { data: yearsCol1 } = useSWR(
    sim1.simId && sim1.simId !== "base" ? `/api/simulacoes/${sim1.simId}/anos` : null,
    fetcher
  );

  // Coluna 2
  const sim2 = colunas[2];
  const { data: dataCol2 } = useSWR(
    sim2.simId && sim2.ano
      ? sim2.simId === "base"
        ? `/api/importacao/dashboard?exercicio=${sim2.ano}`
        : `/api/simulacoes/${sim2.simId}/dashboard?exercicio=${sim2.ano}`
      : null,
    fetcher,
    { keepPreviousData: true }
  );
  const { data: paramsCol2 } = useSWR(
    sim2.simId && sim2.simId !== "base"
      ? `/api/simulacoes/${sim2.simId}/parametros`
      : null,
    fetcher,
    { keepPreviousData: true }
  );
  const { data: yearsCol2 } = useSWR(
    sim2.simId && sim2.simId !== "base" ? `/api/simulacoes/${sim2.simId}/anos` : null,
    fetcher
  );

  // Coluna 3
  const sim3 = colunas[3];
  const { data: dataCol3 } = useSWR(
    sim3.simId && sim3.ano
      ? sim3.simId === "base"
        ? `/api/importacao/dashboard?exercicio=${sim3.ano}`
        : `/api/simulacoes/${sim3.simId}/dashboard?exercicio=${sim3.ano}`
      : null,
    fetcher,
    { keepPreviousData: true }
  );
  const { data: paramsCol3 } = useSWR(
    sim3.simId && sim3.simId !== "base"
      ? `/api/simulacoes/${sim3.simId}/parametros`
      : null,
    fetcher,
    { keepPreviousData: true }
  );
  const { data: yearsCol3 } = useSWR(
    sim3.simId && sim3.simId !== "base" ? `/api/simulacoes/${sim3.simId}/anos` : null,
    fetcher
  );

  // ─── Funções de Manipulação ───────────────────────────────────────────────────

  const handleSimChange = (idx: number, simId: string) => {
    setColunas(prev => {
      const updated = [...prev];
      if (simId === "base") {
        updated[idx] = { simId, ano: anosBase[0] || 2026 };
      } else if (simId === "") {
        updated[idx] = { simId: "", ano: null };
      } else {
        const sim = simulacoes.find(s => s.id === simId);
        updated[idx] = { simId, ano: sim ? sim.exercicio_base + 1 : null };
      }
      return updated;
    });
  };

  const handleAnoChange = (idx: number, ano: number) => {
    setColunas(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], ano };
      return updated;
    });
  };

  const handleClearColumn = (idx: number) => {
    setColunas(prev => {
      const updated = [...prev];
      updated[idx] = { simId: "", ano: null };
      return updated;
    });
  };

  // Resolve os anos disponíveis para o seletor de cada coluna
  const getAnosDisponiveis = (idx: number) => {
    const col = colunas[idx];
    if (col.simId === "base") return anosBase;
    
    if (idx === 0) return yearsCol0?.dados || [];
    if (idx === 1) return yearsCol1?.dados || [];
    if (idx === 2) return yearsCol2?.dados || [];
    if (idx === 3) return yearsCol3?.dados || [];
    return [];
  };

  // Mapeia e junta a resposta dos KPIs e Migrações
  const resolveColunaDados = (idx: number, data: any, params: any) => {
    const col = colunas[idx];
    if (!col.simId || !col.ano) return null;

    const d = data?.dados;
    const kpis = d?.kpis || null;
    const migracaoArr = d?.migracao_trava || [];
    const migracao = migracaoArr.find((x: any) => x.exercicio === col.ano) || null;
    const parametros = params?.dados || [];
    const paramsAno = parametros.find((p: any) => p.exercicio === col.ano) || parametros[0] || null;

    return {
      kpis,
      migracao,
      paramsAno,
    };
  };

  const colunasResolvidas = [
    resolveColunaDados(0, dataCol0, paramsCol0),
    resolveColunaDados(1, dataCol1, paramsCol1),
    resolveColunaDados(2, dataCol2, paramsCol2),
    resolveColunaDados(3, dataCol3, paramsCol3),
  ];

  // Renderizador amigável do resumo dos índices aplicados na simulação
  const renderIndicesCell = (colRes: any, col: ColunaDados) => {
    if (col.simId === "base") {
      return (
        <div style={{
          padding: "10px 12px",
          fontSize: "11px",
          lineHeight: "1.5",
          color: "var(--txt-2)",
          backgroundColor: "rgba(14, 79, 102, 0.03)",
          borderRadius: "var(--radius)",
          border: "1px solid rgba(14, 79, 102, 0.08)",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          gap: "4px"
        }}>
          <div><strong>Faixa de Alíquota:</strong> CTM Original</div>
          <div><strong>IPTU Social:</strong> Original</div>
          <div><strong>Imposto Mínimo:</strong> Original</div>
          <div><strong>CAP (Trava):</strong> Sem Trava</div>
          <div className="text-muted" style={{ fontSize: "10px", marginTop: "2px" }}>IPCA: — &bull; SELIC: —</div>
        </div>
      );
    }

    if (!colRes) {
      return <div className="text-muted" style={{ padding: "8px", fontSize: "11px", textAlign: "center" }}>—</div>;
    }

    const { paramsAno } = colRes;
    const simAtiva = simulacoes.find(s => s.id === col.simId);

    const capText = simAtiva?.aplicar_cap 
      ? (simAtiva.tipo_cap === "APENAS_INFLACAO" ? "Apenas Inflação (IPCA)" : "Inflação + 5% (Art. 168 §6º)") 
      : "Não";

    return (
      <div style={{
        padding: "10px 12px",
        fontSize: "11px",
        lineHeight: "1.5",
        color: "var(--txt-2)",
        backgroundColor: "rgba(14, 79, 102, 0.03)",
        borderRadius: "var(--radius)",
        border: "1px solid rgba(14, 79, 102, 0.08)",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: "4px"
      }}>
        <div><strong>Venal:</strong> {simAtiva?.indexador_valor_venal || "IPCA"}</div>
        <div><strong>Faixa:</strong> {paramsAno?.tipo_indice_faixa || simAtiva?.cenario || "—"}</div>
        <div><strong>Social:</strong> {paramsAno?.tipo_indice_social || simAtiva?.indexador_social || "—"}</div>
        <div><strong>Mínimo:</strong> {paramsAno?.tipo_indice_minimo || simAtiva?.indexador_minimo || "—"}</div>
        <div><strong>CAP:</strong> {capText}</div>
        <div style={{ fontSize: "10px", color: "var(--txt-3)", marginTop: "2px", borderTop: "1px solid rgba(0,0,0,0.04)", paddingTop: "4px" }}>
          IPCA: {paramsAno?.ipca_ano !== undefined && paramsAno?.ipca_ano !== null ? `${paramsAno.ipca_ano}%` : "—"} &bull;{' '}
          SELIC: {paramsAno?.selic_ano !== undefined && paramsAno?.selic_ano !== null ? `${paramsAno.selic_ano}%` : "—"}
        </div>
      </div>
    );
  };

  return (
    <div className="page active">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <div className="page-title">Comparação de Simulações</div>
            <div className="page-subtitle">Análise comparativa das projeções fiscais e migração de faixas lado a lado</div>
          </div>
        </div>
      </div>

      <div className="page-content">
        {/* Banner de instrução */}
        <div className="card mb-20" style={{ 
          background: "linear-gradient(135deg, #0e4f66 0%, #062f3e 100%)", 
          border: "none", 
          color: "#fff",
          borderRadius: "var(--radius-lg)",
          padding: "16px 20px"
        }}>
          <h3 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "4px" }}>Painel Multi-Cenários</h3>
          <p style={{ fontSize: "11.5px", color: "#add8e6", margin: 0, lineHeight: "1.5" }}>
            Selecione até 4 simulações ou anos fiscais diferentes para comparar o impacto na arrecadação total 
            (Lançamento em milhões), distribuição imobiliária e a quantidade de imóveis que subiram ou caíram de faixa de alíquota.
          </p>
        </div>

        {/* Tabela de Comparação */}
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="card-body-flush table-wrap" style={{ overflowX: "auto" }}>
            <table style={{ minWidth: "900px", borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr style={{ backgroundColor: "var(--surface-2)", borderBottom: "2px solid var(--border)" }}>
                  <th style={{ width: "240px", padding: "16px 20px", textTransform: "uppercase", fontSize: "10px", letterSpacing: "0.05em", color: "var(--txt-3)", borderRight: "1px solid var(--border)", textAlign: "left" }}>
                    Métricas Comparativas
                  </th>
                  
                  {/* Cabeçalho das 4 colunas de Simulação */}
                  {[0, 1, 2, 3].map((idx) => {
                    const col = colunas[idx];
                    const anosDisp = getAnosDisponiveis(idx);

                    return (
                      <th key={idx} style={{ padding: "16px 15px", borderRight: idx < 3 ? "1px solid var(--border)" : "none", verticalAlign: "top", textAlign: "left" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: "11px", fontWeight: "600", color: "var(--blue-txt)", textTransform: "uppercase", letterSpacing: "0.02em" }}>
                              Coluna {idx + 1}
                            </span>
                            {col.simId && (
                              <button 
                                onClick={() => handleClearColumn(idx)}
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "var(--red)",
                                  fontSize: "10px",
                                  cursor: "pointer",
                                  fontWeight: "500",
                                  padding: 0
                                }}
                              >
                                Limpar
                              </button>
                            )}
                          </div>
                          
                          {/* Seletor de Simulação */}
                          <select 
                            value={col.simId}
                            onChange={(e) => handleSimChange(idx, e.target.value)}
                            style={{ 
                              width: "100%", 
                              fontSize: "11.5px", 
                              padding: "6px 8px", 
                              borderRadius: "var(--radius)",
                              border: "1px solid var(--border-md)",
                              backgroundColor: "#fff"
                            }}
                          >
                            <option value="">-- Selecionar Simulação --</option>
                            <option value="base">📍 Base Original (Dados Reais)</option>
                            {simulacoes.map(s => (
                              <option key={s.id} value={s.id}>
                                🚀 {s.nome}
                              </option>
                            ))}
                          </select>

                          {/* Seletor de Ano */}
                          {col.simId ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ fontSize: "11px", color: "var(--txt-3)" }}>Ano:</span>
                              <select 
                                value={col.ano || ""}
                                onChange={(e) => handleAnoChange(idx, Number(e.target.value))}
                                style={{ 
                                  flex: 1,
                                  fontSize: "11.5px", 
                                  padding: "4px 8px", 
                                  borderRadius: "var(--radius)",
                                  border: "1px solid var(--border-md)",
                                  backgroundColor: "#fff"
                                }}
                              >
                                {anosDisp.map((ano: number) => (
                                  <option key={ano} value={ano}>{ano}</option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div style={{ fontSize: "11px", color: "var(--txt-4)", fontStyle: "italic", padding: "4px 0" }}>
                              Aguardando seleção...
                            </div>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {/* Linha dos Índices */}
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 20px", fontWeight: "600", fontSize: "12px", borderRight: "1px solid var(--border)", backgroundColor: "var(--surface-2)" }}>
                    Índices e Regras
                  </td>
                  {[0, 1, 2, 3].map((idx) => (
                    <td key={idx} style={{ padding: "12px 15px", borderRight: idx < 3 ? "1px solid var(--border)" : "none", verticalAlign: "top" }}>
                      {renderIndicesCell(colunasResolvidas[idx], colunas[idx])}
                    </td>
                  ))}
                </tr>

                {/* Métricas Principais */}
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 20px", fontWeight: "600", fontSize: "12px", borderRight: "1px solid var(--border)", backgroundColor: "var(--surface-2)" }}>
                    Lançamento (Milhões R$)
                  </td>
                  {[0, 1, 2, 3].map((idx) => {
                    const res = colunasResolvidas[idx];
                    return (
                      <td key={idx} className="text-mono fw-600" style={{ padding: "10px 15px", fontSize: "13px", color: "var(--blue-txt)", borderRight: idx < 3 ? "1px solid var(--border)" : "none" }}>
                        {res?.kpis?.valr_imposto_total !== undefined ? `R$ ${fmtMillions(res.kpis.valr_imposto_total)} M` : "—"}
                      </td>
                    );
                  })}
                </tr>

                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 20px", fontSize: "11.5px", color: "var(--txt-2)", borderRight: "1px solid var(--border)", backgroundColor: "var(--surface-2)", paddingLeft: "30px" }}>
                    &bull; Predial (Qtd. Imóveis)
                  </td>
                  {[0, 1, 2, 3].map((idx) => {
                    const res = colunasResolvidas[idx];
                    return (
                      <td key={idx} className="text-mono" style={{ padding: "10px 15px", borderRight: idx < 3 ? "1px solid var(--border)" : "none" }}>
                        {fmtNum(res?.kpis?.predial)}
                      </td>
                    );
                  })}
                </tr>

                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 20px", fontSize: "11.5px", color: "var(--txt-2)", borderRight: "1px solid var(--border)", backgroundColor: "var(--surface-2)", paddingLeft: "30px" }}>
                    &bull; Territorial (Qtd. Imóveis)
                  </td>
                  {[0, 1, 2, 3].map((idx) => {
                    const res = colunasResolvidas[idx];
                    return (
                      <td key={idx} className="text-mono" style={{ padding: "10px 15px", borderRight: idx < 3 ? "1px solid var(--border)" : "none" }}>
                        {fmtNum(res?.kpis?.territorial)}
                      </td>
                    );
                  })}
                </tr>

                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 20px", fontWeight: "600", fontSize: "12px", borderRight: "1px solid var(--border)", backgroundColor: "var(--surface-2)" }}>
                    Normal (Qtd. Imóveis)
                  </td>
                  {[0, 1, 2, 3].map((idx) => {
                    const res = colunasResolvidas[idx];
                    return (
                      <td key={idx} className="text-mono fw-600" style={{ padding: "10px 15px", borderRight: idx < 3 ? "1px solid var(--border)" : "none" }}>
                        {fmtNum(res?.kpis?.normal)}
                      </td>
                    );
                  })}
                </tr>

                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 20px", fontWeight: "600", fontSize: "12px", borderRight: "1px solid var(--border)", backgroundColor: "var(--surface-2)" }}>
                    IPTU Social (Qtd. Imóveis)
                  </td>
                  {[0, 1, 2, 3].map((idx) => {
                    const res = colunasResolvidas[idx];
                    return (
                      <td key={idx} className="text-mono fw-600" style={{ padding: "10px 15px", color: "var(--green)", borderRight: idx < 3 ? "1px solid var(--border)" : "none" }}>
                        {fmtNum(res?.kpis?.iptu_social)}
                      </td>
                    );
                  })}
                </tr>

                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 20px", fontWeight: "600", fontSize: "12px", borderRight: "1px solid var(--border)", backgroundColor: "var(--surface-2)" }}>
                    Isentos (Qtd. Imóveis)
                  </td>
                  {[0, 1, 2, 3].map((idx) => {
                    const res = colunasResolvidas[idx];
                    return (
                      <td key={idx} className="text-mono" style={{ padding: "10px 15px", borderRight: idx < 3 ? "1px solid var(--border)" : "none" }}>
                        {fmtNum(res?.kpis?.isentos)}
                      </td>
                    );
                  })}
                </tr>

                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 20px", fontWeight: "600", fontSize: "12px", borderRight: "1px solid var(--border)", backgroundColor: "var(--surface-2)" }}>
                    Imunes (Qtd. Imóveis)
                  </td>
                  {[0, 1, 2, 3].map((idx) => {
                    const res = colunasResolvidas[idx];
                    return (
                      <td key={idx} className="text-mono" style={{ padding: "10px 15px", borderRight: idx < 3 ? "1px solid var(--border)" : "none" }}>
                        {fmtNum(res?.kpis?.imunes)}
                      </td>
                    );
                  })}
                </tr>

                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 20px", fontWeight: "600", fontSize: "12px", borderRight: "1px solid var(--border)", backgroundColor: "var(--surface-2)" }}>
                    Caiu de Faixa (Qtd. Imóveis)
                  </td>
                  {[0, 1, 2, 3].map((idx) => {
                    const res = colunasResolvidas[idx];
                    return (
                      <td key={idx} className="text-mono" style={{ padding: "10px 15px", borderRight: idx < 3 ? "1px solid var(--border)" : "none" }}>
                        {fmtNum(res?.migracao?.desceu_faixa)}
                      </td>
                    );
                  })}
                </tr>

                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 20px", fontWeight: "600", fontSize: "12px", borderRight: "1px solid var(--border)", backgroundColor: "var(--surface-2)" }}>
                    Subiu de Faixa (Qtd. Imóveis)
                  </td>
                  {[0, 1, 2, 3].map((idx) => {
                    const res = colunasResolvidas[idx];
                    return (
                      <td key={idx} className="text-mono" style={{ padding: "10px 15px", borderRight: idx < 3 ? "1px solid var(--border)" : "none" }}>
                        {fmtNum(res?.migracao?.subiu_faixa)}
                      </td>
                    );
                  })}
                </tr>

                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 20px", fontWeight: "600", fontSize: "12px", borderRight: "1px solid var(--border)", backgroundColor: "var(--surface-2)" }}>
                    Travados no Limite (CAP) - Qtd. Imóveis
                  </td>
                  {[0, 1, 2, 3].map((idx) => {
                    const res = colunasResolvidas[idx];
                    return (
                      <td key={idx} className="text-mono" style={{ padding: "10px 15px", color: "var(--red-txt)", borderRight: idx < 3 ? "1px solid var(--border)" : "none" }}>
                        {fmtNum(res?.migracao?.travado_cap)}
                      </td>
                    );
                  })}
                </tr>

                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 20px", fontWeight: "600", fontSize: "12px", borderRight: "1px solid var(--border)", backgroundColor: "var(--surface-2)" }}>
                    Abaixo da Trava (Qtd. Imóveis)
                  </td>
                  {[0, 1, 2, 3].map((idx) => {
                    const res = colunasResolvidas[idx];
                    return (
                      <td key={idx} className="text-mono" style={{ padding: "10px 15px", color: "var(--green-txt)", borderRight: idx < 3 ? "1px solid var(--border)" : "none" }}>
                        {fmtNum(res?.migracao?.abaixo_trava)}
                      </td>
                    );
                  })}
                </tr>

                <tr style={{ borderBottom: "none" }}>
                  <td style={{ padding: "10px 20px", fontWeight: "600", fontSize: "12px", borderRight: "1px solid var(--border)", backgroundColor: "var(--surface-2)" }}>
                    Imposto Mínimo (Qtd. Imóveis)
                  </td>
                  {[0, 1, 2, 3].map((idx) => {
                    const res = colunasResolvidas[idx];
                    return (
                      <td key={idx} className="text-mono" style={{ padding: "10px 15px", borderRight: idx < 3 ? "1px solid var(--border)" : "none" }}>
                        {fmtNum(res?.kpis?.imposto_minimo)}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
