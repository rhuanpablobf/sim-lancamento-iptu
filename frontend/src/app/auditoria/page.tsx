"use client";
import { useState } from "react";
import useSWR from "swr";
import { fetcher, apiFetch } from "@/lib/api";

interface Simulacao {
  id: string;
  nome: string;
  status: string;
}

interface ResultadoImovel {
  exercicio: number;
  valr_venal_simulado: number;
  aliquota: number;
  imposto_final: number;
  tipo_lancamento: number;
  faixa_atual: number;
  simulacao_nome?: string;
  simulacao_id?: string;
}

const TIPO_LABEL: Record<number, { label: string; classe: string }> = {
  0: { label: "Normal", classe: "badge-gray" },
  1: { label: "Isento", classe: "badge-green" },
  2: { label: "Imp. Mínimo", classe: "badge-amber" },
  3: { label: "IPTU Social", classe: "badge-blue" }
};

export default function AuditoriaPage() {
  const [inscricao, setInscricao] = useState("");
  const [simulacoesSelecionadas, setSimulacoesSelecionadas] = useState<string[]>([]);
  const [resultados, setResultados] = useState<ResultadoImovel[]>([]);
  const [buscando, setBuscando] = useState(false);

  const { data: dataSims } = useSWR<{ dados: Simulacao[] }>("/api/simulacoes", fetcher);
  const simulacoes = dataSims?.dados?.filter(s => s.status === "CONCLUIDO") ?? [];

  async function buscarAuditoria() {
    if (!inscricao || simulacoesSelecionadas.length === 0) return alert("Informe a inscrição e selecione as simulações.");
    setBuscando(true);
    try {
      const promessas = simulacoesSelecionadas.map(async (id) => {
        const json: any = await apiFetch(`/api/simulacoes/${id}/imovel?inscricao=${inscricao}`);
        const simNome = simulacoes.find(s => s.id === id)?.nome;
        return (json.dados ?? []).map((d: any) => ({ ...d, simulacao_nome: simNome, simulacao_id: id }));
      });
      const todos = await Promise.all(promessas);
      setResultados(todos.flat().sort((a, b) => a.exercicio - b.exercicio));
    } catch (err) {
      alert("Erro na busca.");
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div className="page active">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <div className="page-title">Auditoria Individual de Imóvel</div>
            <div className="page-subtitle">Rastreabilidade completa de enquadramento e cálculo fiscal</div>
          </div>
        </div>
      </div>

      <div className="page-content">
        <div className="row">
          <div style={{ flex: "0 0 320px" }}>
            <div className="card mb-24">
              <div className="card-header"><div className="card-title">Parâmetros de Busca</div></div>
              <div className="card-body">
                <div className="form-group mb-20">
                  <label className="form-label">Inscrição Imobiliária</label>
                  <input type="text" placeholder="000.000.000.000" value={inscricao} onChange={e => setInscricao(e.target.value)} style={{ width: "100%" }} />
                  <div className="text-xs text-muted mt-8">Utilize apenas números ou formato padrão SEFIN</div>
                </div>

                <div className="form-group">
                  <label className="form-label">Estudos para Comparar</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "240px", overflowY: "auto", padding: "4px", border: "1px solid var(--border)", borderRadius: "6px" }}>
                    {simulacoes.map(s => (
                      <label 
                        key={s.id} 
                        style={{ 
                          display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", borderRadius: "6px", cursor: "pointer", transition: "all 0.2s", fontSize: "13px",
                          background: simulacoesSelecionadas.includes(s.id) ? "var(--blue-light)" : "transparent",
                          color: simulacoesSelecionadas.includes(s.id) ? "var(--blue-txt)" : "inherit"
                        }}
                      >
                        <input type="checkbox" checked={simulacoesSelecionadas.includes(s.id)} onChange={() => setSimulacoesSelecionadas(prev => prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id])} />
                        <span className="name">{s.nome}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <button className="btn btn-primary" style={{ width: "100%", marginTop: "20px" }} onClick={buscarAuditoria} disabled={buscando}>{buscando ? "Consultando..." : "Auditar Imóvel"}</button>
              </div>
            </div>

            {resultados.length > 0 && (
              <div className="card" style={{ background: "var(--surface-2)" }}>
                <div className="card-header"><div className="card-title">Legenda de Cálculo</div></div>
                <div className="card-body">
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div className="text-xs" style={{ display: "flex", gap: "8px" }}><span className="badge badge-blue">IPTU Social</span> Enquadrado por valor venal/uso</div>
                    <div className="text-xs" style={{ display: "flex", gap: "8px" }}><span className="badge badge-green">Isento</span> Isenção total conforme CTM</div>
                    <div className="text-xs" style={{ display: "flex", gap: "8px" }}><span className="badge badge-amber">Mínimo</span> Limite de valor mínimo atingido</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ flex: 1 }}>
            {resultados.length === 0 ? (
              <div style={{ height: "400px", display: "flex", flexDirection: "column", alignItems: "center", justifyCenter: "center", border: "2px dashed var(--border)", borderRadius: "var(--radius)", textAlign: "center", padding: "40px", display: "flex", justifyContent: "center" }}>
                <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔍</div>
                <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>Aguardando Consulta</div>
                <div style={{ fontSize: "13px", color: "var(--text-muted)", maxWidth: "300px" }}>Insira uma inscrição e selecione os estudos ao lado para visualizar a evolução do imposto.</div>
              </div>
            ) : (
              <div className="card">
                <div className="card-header">
                  <div className="card-title">Matriz de Evolução Fiscal — Inscrição {inscricao}</div>
                </div>
                <div className="card-body-flush table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Cenário de Estudo</th>
                        <th>Exercício</th>
                        <th className="right">V. Venal Projetado</th>
                        <th className="right">Alíquota</th>
                        <th className="right">Imposto Final</th>
                        <th className="center">Enquadramento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultados.map((r, i) => {
                        const meta = TIPO_LABEL[r.tipo_lancamento] || TIPO_LABEL[0];
                        return (
                          <tr key={i}>
                            <td className="fw-500">{r.simulacao_nome}</td>
                            <td className="fw-700" style={{ color: "var(--blue-txt)" }}>{r.exercicio}</td>
                            <td className="right text-mono">{r.valr_venal_simulado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                            <td className="right text-mono">{(r.aliquota * 100).toFixed(2)}%</td>
                            <td className="right text-mono fw-700" style={{ color: "var(--green)" }}>{r.imposto_final.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                            <td className="center"><span className={`badge ${meta.classe}`}>{meta.label}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
