"use client";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { fetcher } from "@/lib/api";

interface SimulacaoItem {
  id: string;
  nome: string;
  status: string;
  exercicio_base: number;
  exercicio_destino: number;
}

interface ExportacaoItem {
  id: string;
  simulacao_id?: string;
  formato?: string;
  tamanho_bytes?: number;
  exercicios?: number[];
  criado_em?: string;
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function ExportarConteudo() {
  const params = useSearchParams();
  const simIdInicial = params.get("sim") ?? "";

  const { data: dataSims } = useSWR<{ dados: SimulacaoItem[] }>("/api/simulacoes", fetcher);
  const { data: dataHist, mutate: mutateHist } =
    useSWR<{ dados: ExportacaoItem[] }>("/api/exportacao/historico", fetcher);

  const simulacoes = (dataSims?.dados ?? []).filter((s) => s.status === "CONCLUIDO");
  const historico = dataHist?.dados ?? [];

  const [simId, setSimId] = useState(simIdInicial);
  const [formato, setFormato] = useState("CSV");
  const [gerando, setGerando] = useState(false);

  const simSelecionada = simulacoes.find((s) => s.id === simId);
  const anos = simSelecionada
    ? Array.from(
        { length: simSelecionada.exercicio_destino - simSelecionada.exercicio_base },
        (_, i) => simSelecionada.exercicio_base + 1 + i
      )
    : [];

  const [anosChecked, setAnosChecked] = useState<Set<number>>(new Set());
  const toggleAno = (a: number) =>
    setAnosChecked((prev) => {
      const n = new Set(prev);
      n.has(a) ? n.delete(a) : n.add(a);
      return n;
    });

  async function gerar() {
    if (!simId || anosChecked.size === 0) return;
    setGerando(true);
    try {
      const r = await fetch(`${BASE}/api/exportacao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          simulacao_id: simId,
          exercicios: Array.from(anosChecked),
          formato,
        }),
      });
      const json = await r.json();
      mutateHist();
      // Iniciar download
      const expId = json.dados?.id;
      if (expId) window.open(`${BASE}/api/exportacao/${expId}/download`, "_blank");
    } finally {
      setGerando(false);
    }
  }

  const fmtBytes = (b?: number) =>
    b != null ? `${(b / 1024 / 1024).toFixed(1)} MB` : "—";
  const fmtData = (d?: string) => (d ? new Date(d).toLocaleString("pt-BR") : "—");

  return (
    <div className="page active">
      <div className="page-header">
        <div className="page-title">Exportar dados</div>
        <div className="page-subtitle">Gere arquivos CSV ou XLSX com os lançamentos simulados</div>
      </div>
      <div className="page-content">
        <div className="row">
          {/* Configurador */}
          <div style={{ flex: "0 0 300px" }}>
            <div className="card">
              <div className="card-header"><div className="card-title">Configurar exportação</div></div>
              <div className="card-body">
                <div className="form-group">
                  <label className="form-label" htmlFor="simulacao">Simulação</label>
                  <select id="simulacao" value={simId} onChange={(e) => { setSimId(e.target.value); setAnosChecked(new Set()); }}>
                    <option value="">Selecione...</option>
                    {simulacoes.map((s) => (
                      <option key={s.id} value={s.id}>{s.nome}</option>
                    ))}
                  </select>
                </div>

                {anos.length > 0 && (
                  <div className="form-group">
                    <label className="form-label">Exercícios</label>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      {anos.map((a) => (
                        <label key={a} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={anosChecked.has(a)}
                            onChange={() => toggleAno(a)}
                            style={{ width: "auto" }}
                          />
                          {a}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Formato</label>
                  <div className="radio-group" style={{ flexDirection: "column", gap: "4px" }}>
                    {["CSV", "XLSX"].map((f) => (
                      <div
                        key={f}
                        className={`radio-option${formato === f ? " selected" : ""}`}
                        style={{ padding: "8px 12px", cursor: "pointer" }}
                        onClick={() => setFormato(f)}
                      >
                        <div className="radio-option-label">{f}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {anosChecked.size > 0 && (
                  <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 12px", marginBottom: "16px", fontSize: "12px", color: "var(--txt-3)" }}>
                    Exercícios selecionados: <strong style={{ color: "var(--txt-1)" }}>{anosChecked.size}</strong> ano(s)
                  </div>
                )}

                <button
                  className="btn btn-primary"
                  style={{ width: "100%", justifyContent: "center" }}
                  disabled={!simId || anosChecked.size === 0 || gerando}
                  onClick={gerar}
                >
                  <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  {gerando ? "Gerando..." : "Gerar e baixar"}
                </button>
              </div>
            </div>
          </div>

          {/* Histórico */}
          <div className="col-6">
            <div className="card">
              <div className="card-header"><div className="card-title">Histórico de exportações</div></div>
              <div className="card-body-flush table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Formato</th>
                      <th className="right">Tamanho</th>
                      <th>Exercícios</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {historico.length === 0 ? (
                      <tr><td colSpan={5} className="table-empty">Nenhuma exportação gerada.</td></tr>
                    ) : (
                      historico.map((h) => (
                        <tr key={h.id}>
                          <td className="muted">{fmtData(h.criado_em)}</td>
                          <td><span className="badge badge-gray">{h.formato}</span></td>
                          <td className="right text-mono">{fmtBytes(h.tamanho_bytes)}</td>
                          <td className="text-muted">{h.exercicios?.join(", ") ?? "—"}</td>
                          <td>
                            <a
                              href={`${BASE}/api/exportacao/${h.id}/download`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="action-link"
                            >
                              baixar
                            </a>
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

export default function ExportarPage() {
  return (
    <Suspense fallback={<div className="page-content">Carregando...</div>}>
      <ExportarConteudo />
    </Suspense>
  );
}
