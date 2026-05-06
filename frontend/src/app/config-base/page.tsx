"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetcher, apiFetch } from "../../lib/api";

interface ConfigBase {
  id: string;
  tipo: string;
  ano_referencia: number;
  valor: number;
  descricao?: string;
}

interface RespostaPadrao {
  dados: ConfigBase[];
}

const TIPOS = [
  { id: "VALOR_MINIMO_IPTU", label: "Imposto Mínimo" },
  { id: "LIMITE_VENAL_SOCIAL", label: "Limite Venal IPTU Social" },
];

export default function ConfigBasePage() {
  const { data, isLoading, mutate } = useSWR<RespostaPadrao>("/api/config", fetcher);
  
  const [formData, setFormData] = useState({
    tipo: "VALOR_MINIMO_IPTU",
    ano_referencia: 2026,
    valor: 0,
    descricao: "",
  });

  const configs = data?.dados ?? [];

  const formatarMoedaInput = (valor: string) => {
    let v = valor.replace(/\D/g, "");
    if (v === "") return "0,00";
    return (Number(v) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  };

  const parseMoeda = (valor: string) => Number(valor.replace(/\./g, "").replace(",", "."));

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch("/api/config", {
        method: "POST",
        body: JSON.stringify(formData),
      });
      mutate();
      setFormData({ tipo: "VALOR_MINIMO_IPTU", ano_referencia: 2026, valor: 0, descricao: "" });
    } catch (err) {
      alert("Erro ao salvar configuração base.");
    }
  }

  async function remover(id: string) {
    if (!confirm("Remover esta configuração de referência?")) return;
    try {
      await apiFetch(`/api/config/${id}`, { method: "DELETE" });
      mutate();
    } catch (err) {
      alert("Erro ao remover configuração.");
    }
  }

  function editar(c: ConfigBase) {
    setFormData({
      tipo: c.tipo,
      ano_referencia: c.ano_referencia,
      valor: c.valor,
      descricao: c.descricao || "",
    });
  }

  const fmtMoeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="page active">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <div className="page-title">Configuração Base</div>
            <div className="page-subtitle">Valores de referência para projeções automáticas</div>
          </div>
        </div>
      </div>

      <div className="page-content">
        <div className="row">
          <div style={{ flex: "0 0 380px" }}>
            <div className="card">
              <div className="card-header">
                <div className="card-title">Definir Valor de Referência</div>
              </div>
              <div className="card-body">
                <form onSubmit={salvar}>
                  <div className="form-group">
                    <label className="form-label">Parâmetro</label>
                    <select 
                      value={formData.tipo} 
                      onChange={e => setFormData({...formData, tipo: e.target.value})}
                      required
                    >
                      {TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </div>

                  <div className="grid-2 mb-16">
                    <div className="form-group">
                      <label className="form-label">Ano Base</label>
                      <input 
                        type="number" 
                        value={formData.ano_referencia} 
                        onChange={e => setFormData({...formData, ano_referencia: Number(e.target.value)})}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Valor (R$)</label>
                      <input 
                        type="text" 
                        value={formData.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} 
                        onChange={e => setFormData({...formData, valor: parseMoeda(formatarMoedaInput(e.target.value))})}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Descrição / Observação</label>
                    <textarea 
                      value={formData.descricao} 
                      onChange={e => setFormData({...formData, descricao: e.target.value})}
                      placeholder="Ex: Valor definido no decreto nº 123/2026"
                    ></textarea>
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}>
                    Salvar Referência
                  </button>
                </form>
              </div>
            </div>

            <div className="card mt-24" style={{ background: "var(--blue-light)", border: "1px dashed var(--blue-mid)" }}>
              <div className="card-body">
                <div className="text-xs fw-600 mb-4" style={{ color: "var(--blue-txt)" }}>💡 COMO FUNCIONA</div>
                <div className="text-xs text-muted" style={{ lineHeight: "1.4" }}>
                  Você define um valor base para um ano específico. Durante a simulação, o sistema usará este valor e aplicará o <strong>IPCA ou SELIC acumulado</strong> cadastrado na tela de Índices para projetar os valores dos anos seguintes automaticamente.
                </div>
              </div>
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <div className="card">
              <div className="card-header">
                <div className="card-title">Valores Atuais de Referência</div>
              </div>
              <div className="card-body-flush table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Tipo de Parâmetro</th>
                      <th>Ano Ref.</th>
                      <th className="right">Valor Base</th>
                      <th>Descrição</th>
                      <th className="right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {configs.length === 0 ? (
                      <tr><td colSpan={5} className="table-empty">{isLoading ? "Carregando..." : "Nenhuma configuração base definida."}</td></tr>
                    ) : (
                      configs.map((c) => (
                        <tr key={c.id}>
                          <td className="fw-600">
                            {TIPOS.find(t => t.id === c.tipo)?.label || c.tipo}
                          </td>
                          <td>{c.ano_referencia}</td>
                          <td className="right fw-600" style={{ color: "var(--blue-txt)" }}>
                            {fmtMoeda(c.valor)}
                          </td>
                          <td className="text-muted text-xs">{c.descricao || "-"}</td>
                          <td className="right">
                            <div className="flex-gap-12" style={{ justifyContent: "flex-end" }}>
                              <button onClick={() => editar(c)} className="action-link">editar</button>
                              <button onClick={() => remover(c.id)} className="action-link" style={{ color: "var(--red)" }}>excluir</button>
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
