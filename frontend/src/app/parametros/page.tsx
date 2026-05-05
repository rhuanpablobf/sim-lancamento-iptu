"use client";
import React, { useState } from "react";
import useSWR from "swr";
import { fetcher, apiFetch } from "@/lib/api";

interface ParametroItem {
  exercicio: number;
  ipca: number;
  selic: number;
  tipo: string;
  observacao?: string;
}

interface RespostaPadrao {
  dados: ParametroItem[] | any;
  meta: { total: number };
}

export default function ParametrosPage() {
  const [modoLote, setModoLote] = useState(false);
  const [formData, setFormData] = useState({
    exercicio: "" as string | number,
    ano_inicial: "" as string | number,
    ano_final: "" as string | number,
    ipca: 0,
    selic: 0,
    tipo: "HISTORICO",
    observacao: "",
  });

  const { data, isLoading, mutate } = useSWR<RespostaPadrao>(
    "/api/parametros",
    fetcher
  );

  const parametros = (Array.isArray(data?.dados) ? data?.dados : []) as ParametroItem[];

  const formatarMoedaInput = (valor: string) => {
    let v = valor.replace(/\D/g, "");
    if (v === "") return "0,00";
    return (Number(v) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  };

  const parseMoeda = (valor: string) => Number(valor.replace(/\./g, "").replace(",", "."));

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    
    const url = modoLote ? "/api/parametros/lote" : "/api/parametros";
    const payload = modoLote ? {
      ano_inicial: Number(formData.ano_inicial),
      ano_final: Number(formData.ano_final),
      ipca: formData.ipca,
      selic: formData.selic,
      tipo: formData.tipo,
      observacao: formData.observacao,
    } : {
      exercicio: Number(formData.exercicio),
      ipca: formData.ipca,
      selic: formData.selic,
      tipo: formData.tipo,
      observacao: formData.observacao,
    };

    try {
      await apiFetch(url, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      mutate();
      setFormData({ exercicio: "", ano_inicial: "", ano_final: "", ipca: 0, selic: 0, tipo: "HISTORICO", observacao: "" });
      setModoLote(false);
    } catch (err: any) {
      alert(`Erro: ${err.message || "Erro ao processar"}`);
    }
  }

  async function remover(exercicio: number) {
    if (!confirm(`Remover parâmetro de ${exercicio}?`)) return;
    try {
      await apiFetch(`/api/parametros/${exercicio}`, { method: "DELETE" });
      mutate();
    } catch (err) {
      alert("Erro ao remover parâmetro.");
    }
  }

  function editar(p: ParametroItem) {
    setModoLote(false);
    setFormData({
      exercicio: p.exercicio,
      ano_inicial: "",
      ano_final: "",
      ipca: p.ipca,
      selic: p.selic,
      tipo: p.tipo,
      observacao: p.observacao || "",
    });
  }

  return (
    <div className="page active">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <div className="page-title">IPCA &amp; SELIC</div>
            <div className="page-subtitle">Configuração dos índices macroeconômicos por exercício</div>
          </div>
          <div className="flex-gap-8">
            <button className="btn btn-secondary btn-sm" disabled>Importar série BACEN (em breve)</button>
          </div>
        </div>
      </div>

      <div className="page-content">
        <div className="row">
          <div style={{ flex: "0 0 340px" }}>
            <div className="card">
              <div className="card-header">
                <div className="card-title">{modoLote ? "Geração em Lote" : "Adicionar Parâmetro"}</div>
                <button 
                  className={`badge ${modoLote ? 'badge-blue' : 'badge-gray'}`}
                  style={{ border: "none", cursor: "pointer" }}
                  onClick={() => setModoLote(!modoLote)}
                >
                  {modoLote ? "Modo Lote ATIVO" : "Mudar p/ Lote"}
                </button>
              </div>
              <div className="card-body">
                <form onSubmit={salvar}>
                  {modoLote ? (
                    <div className="grid-2 mb-16">
                      <div className="form-group">
                        <label className="form-label">De:</label>
                        <input type="number" placeholder="2026" required value={formData.ano_inicial} onChange={e => setFormData({...formData, ano_inicial: e.target.value})}/>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Até:</label>
                        <input type="number" placeholder="2035" required value={formData.ano_final} onChange={e => setFormData({...formData, ano_final: e.target.value})}/>
                      </div>
                    </div>
                  ) : (
                    <div className="form-group">
                      <label className="form-label">Exercício</label>
                      <input type="number" placeholder="2026" required value={formData.exercicio} onChange={e => setFormData({...formData, exercicio: e.target.value})}/>
                    </div>
                  )}

                  <div className="grid-2 mb-16">
                    <div className="form-group">
                      <label className="form-label">IPCA (%)</label>
                      <input type="text" required value={formData.ipca.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} onChange={e => setFormData({...formData, ipca: parseMoeda(formatarMoedaInput(e.target.value))})}/>
                    </div>
                    <div className="form-group">
                      <label className="form-label">SELIC (%)</label>
                      <input type="text" required value={formData.selic.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} onChange={e => setFormData({...formData, selic: parseMoeda(formatarMoedaInput(e.target.value))})}/>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Tipo de Dado</label>
                    <select value={formData.tipo} onChange={e => setFormData({...formData, tipo: e.target.value})}>
                      <option value="HISTORICO">Histórico (Real)</option>
                      <option value="PROJETADO">Projetado (Projeção)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Observação</label>
                    <textarea value={formData.observacao} onChange={e => setFormData({...formData, observacao: e.target.value})} placeholder="Opcional: Fonte dos dados..."></textarea>
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}>
                    {modoLote ? "Gerar Séries Temporais" : "Salvar Parâmetro"}
                  </button>
                </form>
              </div>
            </div>
            
            <div className="card mt-24" style={{ background: "var(--amber-light)", border: "1px dashed var(--amber-mid)" }}>
              <div className="card-body">
                <div className="text-xs fw-600 mb-4" style={{ color: "var(--amber-txt)" }}>⚠ ATENÇÃO</div>
                <div className="text-xs text-muted" style={{ lineHeight: "1.4" }}>
                  Estes índices são usados para atualizar o valor venal e o limite do IPTU Social. Certifique-se de que a série abrange todo o período das simulações.
                </div>
              </div>
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <div className="card">
              <div className="card-header">
                <div className="card-title">Índices Econômicos</div>
                <span className="badge badge-gray">{parametros.length} anos</span>
              </div>
              <div className="card-body-flush table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: "100px" }}>Ano</th>
                      <th className="right">IPCA Acumulado</th>
                      <th className="right">SELIC Acumulada</th>
                      <th style={{ width: "140px" }}>Status</th>
                      <th className="right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parametros.length === 0 ? (
                      <tr><td colSpan={5} className="table-empty">{isLoading ? "Carregando..." : "Nenhum índice cadastrado."}</td></tr>
                    ) : (
                      parametros.sort((a,b) => b.exercicio - a.exercicio).map((p) => (
                        <tr key={p.exercicio} style={p.tipo === 'PROJETADO' ? { background: "var(--blue-light)" } : {}}>
                          <td className="fw-600">{p.exercicio}</td>
                          <td className="right text-mono">{Number(p.ipca).toFixed(2)}%</td>
                          <td className="right text-mono">{Number(p.selic).toFixed(2)}%</td>
                          <td>
                            <span className={`badge ${p.tipo === 'PROJETADO' ? 'badge-blue' : 'badge-gray'}`}>
                              {p.tipo === 'PROJETADO' ? "🔮 projetado" : "📍 histórico"}
                            </span>
                          </td>
                          <td className="right">
                            <div className="flex-gap-12" style={{ justifyContent: "flex-end" }}>
                              <button onClick={() => editar(p)} className="action-link">editar</button>
                              <button onClick={() => remover(p.exercicio)} className="action-link" style={{ color: "var(--red)" }}>excluir</button>
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
    </div>
  );
}
