"use client";
import React, { useState } from "react";
import useSWR from "swr";
import { fetcher } from "../../lib/api";

interface FaixaItem {
  id: string;
  exercicio: number;
  categoria: string;
  limite_inferior: number;
  limite_superior?: number;
  aliquota: number;
  origem: string;
}

interface RespostaFaixas {
  dados: FaixaItem[];
  meta: { total: number; exercicio: number };
}

const CATEGORIAS = ["RESIDENCIAL", "NAO_RESIDENCIAL", "TERRITORIAL"];
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function FaixasPage() {
  const [categoriaSelecionada, setCategoriaSelecionada] = useState("RESIDENCIAL");
  const [exercicio, setExercicio] = useState(2027);
  const [projetando, setProjetando] = useState(false);
  const [exibirModal, setExibirModal] = useState(false);
  const [faixaEditandoId, setFaixaEditandoId] = useState<string | null>(null);
  
  const [novaFaixa, setNovaFaixa] = useState({
    limite_inferior: 0,
    limite_superior: "" as string | number,
    aliquota: 0,
  });

  const { data, isLoading, mutate } = useSWR<RespostaFaixas>(
    `/api/faixas?exercicio=${exercicio}&categoria=${categoriaSelecionada}`,
    fetcher
  );

  const faixas = data?.dados ?? [];

  async function removerFaixa(id: string) {
    if (!confirm("Remover esta faixa?")) return;
    await fetch(`${BASE}/api/faixas/${id}`, { method: "DELETE" });
    mutate();
  }

  function abrirEditar(f: FaixaItem) {
    setFaixaEditandoId(f.id);
    setNovaFaixa({
      limite_inferior: f.limite_inferior,
      limite_superior: f.limite_superior ?? "",
      aliquota: f.aliquota,
    });
    setExibirModal(true);
  }

  function abrirNovo() {
    setFaixaEditandoId(null);
    setNovaFaixa({ limite_inferior: 0, limite_superior: "", aliquota: 0 });
    setExibirModal(true);
  }

  async function salvarFaixa(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      exercicio,
      categoria: categoriaSelecionada,
      limite_inferior: Number(novaFaixa.limite_inferior),
      limite_superior: novaFaixa.limite_superior === "" ? null : Number(novaFaixa.limite_superior),
      aliquota: Number(novaFaixa.aliquota),
      origem: "MANUAL",
    };

    const url = faixaEditandoId ? `${BASE}/api/faixas/${faixaEditandoId}` : `${BASE}/api/faixas`;
    const method = faixaEditandoId ? "PUT" : "POST";

    const r = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (r.ok) {
      setExibirModal(false);
      mutate();
    } else {
      const err = await r.json();
      alert(`Erro: ${err.detail || "Erro ao salvar"}`);
    }
  }

  async function projetar() {
    const ate = prompt("Projetar até qual exercício?", "2035");
    if (!ate) return;
    setProjetando(true);
    try {
      const r = await fetch(`${BASE}/api/faixas/projetar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ano_base: exercicio, ate_ano: Number(ate), indexador: "SELIC" }),
      });
      const json = await r.json();
      alert(`${json.dados?.faixas_criadas ?? 0} faixas projetadas.`);
      mutate();
    } finally {
      setProjetando(false);
    }
  }

  const formatarMoedaInput = (valor: string) => {
    let v = valor.replace(/\D/g, "");
    if (v === "") return "0,00";
    return (Number(v) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  };

  const parseMoeda = (valor: string) => Number(valor.replace(/\./g, "").replace(",", "."));

  return (
    <div className="page active">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <div className="page-title">Faixas de Alíquota</div>
            <div className="page-subtitle">Configure os limites e alíquotas base por categoria (Art. 178 CTM)</div>
          </div>
          <div className="flex-gap-8">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--surface)", border: "1px solid var(--border)", padding: "2px 8px", borderRadius: "var(--radius)" }}>
              <span className="text-xs text-muted fw-500">EXERCÍCIO BASE:</span>
              <input
                type="number"
                value={exercicio}
                onChange={(e) => setExercicio(Number(e.target.value))}
                style={{ width: "60px", border: "none", padding: "4px", fontSize: "12px", fontWeight: 600 }}
              />
            </div>
            <button className="btn btn-secondary btn-sm" onClick={projetar} disabled={projetando}>
              {projetando ? "Projetando..." : "Projetar anos seguintes →"}
            </button>
          </div>
        </div>
      </div>

      <div className="page-content">
        <div className="row">
          <div style={{ flex: "0 0 180px" }}>
            <div className="section-title">Categoria</div>
            <div className="inner-nav">
              {CATEGORIAS.map((cat) => (
                <div
                  key={cat}
                  className={`inner-nav-item${categoriaSelecionada === cat ? " active" : ""}`}
                  onClick={() => setCategoriaSelecionada(cat)}
                >
                  {cat === "RESIDENCIAL" ? "Residencial" : cat === "NAO_RESIDENCIAL" ? "Não residencial" : "Territorial"}
                </div>
              ))}
            </div>
            
            <div className="card mt-24" style={{ background: "var(--surface-2)", borderStyle: "dashed" }}>
              <div className="card-body" style={{ padding: "12px" }}>
                <div className="text-xs fw-600 mb-4" style={{ color: "var(--txt-2)" }}>
                  {categoriaSelecionada === "RESIDENCIAL" ? "Art. 178, I" : categoriaSelecionada === "NAO_RESIDENCIAL" ? "Art. 178, II" : "Art. 178, III/IV"}
                </div>
                <div className="text-xs text-muted" style={{ lineHeight: "1.4" }}>
                  {categoriaSelecionada === "RESIDENCIAL" ? "Alíquotas progressivas para imóveis edificados residenciais." : categoriaSelecionada === "NAO_RESIDENCIAL" ? "Alíquotas para comércio, indústria e prestadores de serviço." : "Imóveis não edificados ou em construção."}
                </div>
              </div>
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <div className="card">
              <div className="card-header">
                <div className="card-title">Tabela de Enquadramento ({exercicio})</div>
                <div className="flex-gap-12">
                  <span className="badge badge-gray">{faixas.length} faixas</span>
                  <button className="btn btn-primary btn-sm" onClick={abrirNovo}>+ Adicionar Faixa</button>
                </div>
              </div>
              <div className="card-body-flush table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: "40px" }}>#</th>
                      <th>Limite Inferior</th>
                      <th>Limite Superior</th>
                      <th className="right">Alíquota (%)</th>
                      <th style={{ width: "100px" }}>Origem</th>
                      <th style={{ width: "120px" }} className="right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faixas.length === 0 ? (
                      <tr><td colSpan={6} className="table-empty">{isLoading ? "Carregando..." : "Nenhuma faixa cadastrada."}</td></tr>
                    ) : (
                      faixas.map((f, idx) => (
                        <tr key={f.id}>
                          <td className="muted">{idx + 1}</td>
                          <td className="text-mono">R$ {f.limite_inferior.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                          <td className="text-mono">{f.limite_superior ? `R$ ${f.limite_superior.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "∞ (Sem teto)"}</td>
                          <td className="right fw-600 text-mono">{(f.aliquota * 100).toFixed(2)}%</td>
                          <td>
                            <span className={`badge ${f.origem === 'MANUAL' ? 'badge-gray' : 'badge-blue'}`}>{f.origem.toLowerCase()}</span>
                          </td>
                          <td className="right">
                            <div className="flex-gap-12" style={{ justifyContent: "flex-end" }}>
                              <button onClick={() => abrirEditar(f)} className="action-link">editar</button>
                              <button onClick={() => removerFaixa(f.id)} className="action-link" style={{ color: "var(--red)" }}>excluir</button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {exibirModal && (
        <div 
          style={{ 
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(17, 24, 39, 0.4)", display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 1000,
            backdropFilter: "blur(4px)"
          }} 
          onClick={() => setExibirModal(false)}
        >
          <div className="card" style={{ width: "400px", boxShadow: "0 20px 50px rgba(0,0,0,0.2)" }} onClick={e => e.stopPropagation()}>
            <div className="card-header">
              <div className="card-title">{faixaEditandoId ? "Editar Faixa" : "Nova Faixa"}</div>
              <button className="btn-ghost btn-sm" onClick={() => setExibirModal(false)}>✕</button>
            </div>
            <form onSubmit={salvarFaixa}>
              <div className="card-body">
                <div className="form-group">
                  <label className="form-label">Limite Inferior (R$)</label>
                  <input
                    type="text"
                    required
                    value={novaFaixa.limite_inferior.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    onChange={e => setNovaFaixa({ ...novaFaixa, limite_inferior: parseMoeda(formatarMoedaInput(e.target.value)) })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Limite Superior (R$) — <span className="text-muted">vazio para sem teto</span></label>
                  <input
                    type="text"
                    value={novaFaixa.limite_superior === "" ? "" : Number(novaFaixa.limite_superior).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    onChange={e => {
                      const v = e.target.value === "" ? "" : parseMoeda(formatarMoedaInput(e.target.value));
                      setNovaFaixa({ ...novaFaixa, limite_superior: v });
                    }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Alíquota (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={(novaFaixa.aliquota * 100).toFixed(2)}
                    onChange={e => setNovaFaixa({ ...novaFaixa, aliquota: Number(e.target.value) / 100 })}
                  />
                  <div className="form-hint">Exemplo: 1,50 para um e meio porcento.</div>
                </div>
              </div>
              <div className="card-header" style={{ borderTop: "1px solid var(--border)", borderBottom: "none", background: "var(--surface-2)" }}>
                <div className="flex-gap-8" style={{ width: "100%", justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setExibirModal(false)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary">Salvar Alterações</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
