"use client";
import { useState, useRef, useEffect } from "react";
import useSWR from "swr";
import { fetcher, apiFetch } from "../../lib/api";

const getBase = () => {
  if (typeof window !== "undefined") {
    const envUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!envUrl || envUrl.includes("localhost")) {
      return `http://${window.location.hostname}:8000`;
    }
    return envUrl;
  }
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
};

interface ItemResultado {
  exercicio: number;
  total: number;
  normal: number;
  isento: number;
  imposto_minimo: number;
  iptu_social: number;
  valr_venal_total: number;
  valr_imposto_total: number;
}

interface RespostaStatus {
  dados: ItemResultado[];
  meta: { total_exercicios: number; total_registros: number };
}

const fmtNum = (n: number) => Number(n).toLocaleString("pt-BR");
const fmtMoeda = (n: number) => {
  const v = Number(n);
  if (isNaN(v) || v === 0) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
};

export default function ImportacaoPage() {
  const [arquivo1, setArquivo1] = useState<File | null>(null);
  const [arquivo2, setArquivo2] = useState<File | null>(null);
  const [modo, setModo] = useState<"substituir" | "acumular">("substituir");
  const [importando, setImportando] = useState(false);
  const [fase, setFase] = useState<"upload" | "processamento" | null>(null);
  const [progresso, setProgresso] = useState(0);
  const [mensagemStatus, setMensagemStatus] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  
  const ref1 = useRef<HTMLInputElement>(null);
  const ref2 = useRef<HTMLInputElement>(null);

  const { data, mutate } = useSWR<RespostaStatus>("/api/importacao/status", fetcher);
  const resultado = data?.dados ?? [];

  const { data: statusVps, mutate: mutateVps } = useSWR("/api/importacao/detectar-vps", fetcher, { refreshInterval: 5000 });
  const arquivosVps = statusVps?.dados ?? {};
  const vpsPronta = arquivosVps.principal?.existe;

  async function importarVps() {
    if (!vpsPronta) return;
    setImportando(true);
    setFase("processamento");
    setProgresso(0);
    setMensagemStatus("Iniciando processamento direto do servidor...");
    setErro(null);
    setSucesso(null);

    try {
      const fd = new FormData();
      fd.append("modo", modo);
      
      const resp: any = await apiFetch("/api/importacao/processar-vps", {
        method: "POST",
        body: fd
      });

      if (resp.dados?.task_id) {
        monitorarTask(resp.dados.task_id);
      }
    } catch (err) {
      setErro("Falha ao iniciar processamento local.");
      setImportando(false);
    }
  }

  async function importar() {

    if (!arquivo1) return alert("Selecione o arquivo principal.");
    setImportando(true);
    setFase("upload");
    setProgresso(0);
    setMensagemStatus("Preparando arquivos...");
    setErro(null);
    setSucesso(null);

    const fd = new FormData();
    fd.append("arquivo_principal", arquivo1);
    if (arquivo2) fd.append("arquivo_auxiliar", arquivo2);
    fd.append("modo", modo);

    const xhr = new XMLHttpRequest();
    const BASE = getBase();
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const p = Math.round((e.loaded / e.total) * 100);
        setProgresso(p);
        setMensagemStatus(`Sincronizando dados... ${p}%`);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const resp = JSON.parse(xhr.responseText);
        const taskId = resp.dados?.task_id;
        if (taskId) {
          setFase("processamento");
          setProgresso(0);
          setMensagemStatus("Consolidando registros no banco...");
          monitorarTask(taskId);
        }
      } else {
        setErro("Falha no envio dos arquivos.");
        setImportando(false);
      }
    });

    xhr.open("POST", `${BASE}/api/importacao/upload`);
    xhr.send(fd);
  }

  const BASE = getBase();

  // Recuperar task pendente ao carregar
  useEffect(() => {
    const savedTaskId = localStorage.getItem('iptu_import_task_id');
    if (savedTaskId) {
      setTaskId(savedTaskId);
      setImportando(true);
    }
  }, []);

  // Monitoramento da Task via SWR
  useSWR(
    taskId ? `${BASE}/api/importacao/task/${taskId}` : null,
    fetcher,
    { 
      refreshInterval: 3000,
      revalidateOnFocus: true,
      onSuccess: (data: any) => {
        const info = data?.dados || {};
        if (info.status === 'SUCCESS') {
          setImportando(false);
          setTaskId(null);
          localStorage.removeItem('iptu_import_task_id');
          setSucesso("Sincronização concluída com sucesso.");
          mutate();
        } else if (info.status === 'FAILURE') {
          setImportando(false);
          setTaskId(null);
          localStorage.removeItem('iptu_import_task_id');
          setErro("Erro no processamento: " + (info.mensagem || "Erro desconhecido"));
        } else if (info.status === 'PROGRESS' || info.status === 'PENDING') {
          setProgresso(info.progresso || 0);
          setMensagemStatus(info.mensagem || "Processando registros...");
        }
      }
    }
  );

  async function excluirExercicio(ano: number) {
    if (!confirm(`Deseja limpar todos os dados do exercício ${ano}?`)) return;
    try {
      await apiFetch(`/api/importacao/exercicio/${ano}`, { method: "DELETE" });
      mutate();
      setSucesso(`Exercício ${ano} excluído com sucesso.`);
    } catch (err) {
      setErro(`Erro ao excluir exercício ${ano}.`);
    }
  }

  return (
    <div className="page active">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <div className="page-title">Sincronização de Dados</div>
            <div className="page-subtitle">Gestão da base bruta de lançamentos imobiliários (SQL Server)</div>
          </div>
          {resultado.length > 0 && (
            <div className="flex-gap-8">
              <span className="badge badge-green">● Base Integrada</span>
            </div>
          )}
        </div>
      </div>

      <div className="page-content">
        <div className="row">
          <div style={{ flex: "0 0 380px" }}>
            <div className="card mb-24">
              <div className="card-header"><div className="card-title">Upload de Arquivos (CSV)</div></div>
              <div className="card-body">
                <div className="form-group mb-16">
                  <label className="form-label">Tabela Principal (Lançamentos)</label>
                  <div 
                    style={{ 
                      border: "2px dashed var(--border)", 
                      borderRadius: "var(--radius)", 
                      padding: "24px", 
                      textAlign: "center", 
                      cursor: "pointer",
                      background: arquivo1 ? "var(--green-light)" : "transparent",
                      borderColor: arquivo1 ? "var(--green-mid)" : "var(--border)"
                    }} 
                    onClick={() => ref1.current?.click()}
                  >
                    <input ref={ref1} type="file" accept=".csv" style={{ display: "none" }} onChange={e => setArquivo1(e.target.files?.[0] ?? null)}/>
                    <div className="zone-content">
                      <span style={{ fontSize: "24px", display: "block", marginBottom: "8px" }}>{arquivo1 ? '📄' : '📁'}</span>
                      <span style={{ fontSize: "13px", fontWeight: 500 }}>{arquivo1 ? arquivo1.name : "Clique para selecionar"}</span>
                    </div>
                  </div>
                </div>

                <div className="form-group mb-20">
                  <label className="form-label">Tabela Auxiliar (Tipos de Edif.)</label>
                  <div 
                    style={{ 
                      border: "2px dashed var(--border)", 
                      borderRadius: "var(--radius)", 
                      padding: "24px", 
                      textAlign: "center", 
                      cursor: "pointer",
                      background: arquivo2 ? "var(--green-light)" : "transparent",
                      borderColor: arquivo2 ? "var(--green-mid)" : "var(--border)"
                    }} 
                    onClick={() => ref2.current?.click()}
                  >
                    <input ref={ref2} type="file" accept=".csv" style={{ display: "none" }} onChange={e => setArquivo2(e.target.files?.[0] ?? null)}/>
                    <div className="zone-content">
                      <span style={{ fontSize: "24px", display: "block", marginBottom: "8px" }}>{arquivo2 ? '📄' : '📁'}</span>
                      <span style={{ fontSize: "13px", fontWeight: 500 }}>{arquivo2 ? arquivo2.name : "Opcional"}</span>
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Modo de Inserção</label>
                  <div style={{ display: "flex", background: "var(--bg)", padding: "4px", borderRadius: "8px", border: "1px solid var(--border)" }}>
                    <button 
                      style={{ 
                        flex: 1, border: "none", padding: "8px", fontSize: "12px", fontWeight: 500, cursor: "pointer", borderRadius: "6px",
                        background: modo === 'substituir' ? "white" : "none",
                        color: modo === 'substituir' ? "var(--text)" : "var(--text-muted)",
                        boxShadow: modo === 'substituir' ? "0 2px 4px rgba(0,0,0,0.05)" : "none"
                      }} 
                      onClick={() => setModo('substituir')}
                    >Substituir</button>
                    <button 
                      style={{ 
                        flex: 1, border: "none", padding: "8px", fontSize: "12px", fontWeight: 500, cursor: "pointer", borderRadius: "6px",
                        background: modo === 'acumular' ? "white" : "none",
                        color: modo === 'acumular' ? "var(--text)" : "var(--text-muted)",
                        boxShadow: modo === 'acumular' ? "0 2px 4px rgba(0,0,0,0.05)" : "none"
                      }} 
                      onClick={() => setModo('acumular')}
                    >Acumular</button>
                  </div>
                </div>

                <button className="btn btn-primary" style={{ width: "100%", marginTop: "20px" }} disabled={!arquivo1 || importando} onClick={importar}>
                  {importando ? "Sincronizando..." : "Iniciar Importação"}
                </button>
              </div>
            </div>

            {/* Card de Importação via VPS */}
            <div className="card mb-24" style={{ background: "var(--blue-light)", border: "1px solid var(--blue-mid)" }}>
              <div className="card-header">
                <div className="card-title" style={{ color: "var(--blue-txt)", display: "flex", alignItems: "center", gap: "8px" }}>
                  📦 Status dos Arquivos na VPS
                </div>
              </div>
              <div className="card-body">
                <div className="mb-20">
                  <div className="flex-between mb-4">
                    <span className="text-xs fw-500">Principal (Lançamentos)</span>
                    <span className={`badge ${arquivosVps.principal?.existe ? 'badge-green' : 'badge-red'}`} style={{fontSize: '9px'}}>
                      {arquivosVps.principal?.existe ? 'DETECTADO' : 'AUSENTE'}
                    </span>
                  </div>
                  {arquivosVps.principal?.existe && <div className="text-2xs text-muted">{arquivosVps.principal.tamanho_mb} MB</div>}
                </div>

                <div className="mb-20">
                  <div className="flex-between mb-4">
                    <span className="text-xs fw-500">Auxiliar (Tipos Edif.)</span>
                    <span className={`badge ${arquivosVps.auxiliar?.existe ? 'badge-green' : 'badge-gray'}`} style={{fontSize: '9px'}}>
                      {arquivosVps.auxiliar?.existe ? 'DETECTADO' : 'OPCIONAL'}
                    </span>
                  </div>
                  {arquivosVps.auxiliar?.existe && <div className="text-2xs text-muted">{arquivosVps.auxiliar.tamanho_mb} MB</div>}
                </div>

                {!importando ? (
                  <button 
                    className="btn btn-primary w-100" 
                    style={{ background: vpsPronta ? "var(--blue-txt)" : "#ccc" }} 
                    onClick={importarVps}
                    disabled={!vpsPronta}
                  >
                    {vpsPronta ? "Processar Arquivos Detectados" : "Aguardando Arquivo Principal..."}
                  </button>
                ) : (
                  <div className="text-center text-xs fw-600 color-blue">
                    Processamento em curso...
                  </div>
                )}
              </div>
            </div>

            {importando && (

              <div className="card mb-24" style={{ background: "var(--blue-light)", border: "1px solid var(--blue-mid)" }}>
                <div className="card-body">
                  <div className="flex-between mb-8">
                    <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--blue-txt)" }}>{fase === 'upload' ? 'UPLOADING' : 'PROCESSING'}</span>
                    <span style={{ fontSize: "10px", fontWeight: 600 }}>{progresso}%</span>
                  </div>
                  <div className="progress-bar"><div className="progress-fill" style={{ width: `${progresso}%` }}></div></div>
                  <div className="text-xs mt-8 text-muted">{mensagemStatus}</div>
                </div>
              </div>
            )}

            {sucesso && <div className="badge badge-green p-12 w-100 mb-24" style={{ display: "block", textAlign: "center" }}>{sucesso}</div>}
            {erro && <div className="badge badge-red p-12 w-100 mb-24" style={{ display: "block", textAlign: "center" }}>{erro}</div>}
          </div>

          <div style={{ flex: 1 }}>
            <div className="card">
              <div className="card-header">
                <div className="card-title">Inventário da Base Bruta</div>
                <span className="badge badge-gray">{data?.meta?.total_registros ? fmtNum(data.meta.total_registros) : 0} registros</span>
              </div>
              <div className="card-body-flush table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Exercício</th>
                      <th className="right">Volume</th>
                      <th className="right">Isenções</th>
                      <th className="right">IPTU Social</th>
                      <th className="right">Receita Bruta</th>
                      <th className="right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.length === 0 ? (
                      <tr><td colSpan={6} className="table-empty">Nenhum dado importado no sistema.</td></tr>
                    ) : (
                      resultado.map((r) => (
                        <tr key={r.exercicio}>
                          <td className="fw-600">{r.exercicio}</td>
                          <td className="right text-mono">{fmtNum(r.total)}</td>
                          <td className="right text-mono">{fmtNum(r.isento)}</td>
                          <td className="right">
                             <span className="badge badge-blue">{fmtNum(r.iptu_social)}</span>
                          </td>
                          <td className="right text-mono fw-600">{fmtMoeda(r.valr_imposto_total)}</td>
                          <td className="right">
                            <button className="action-link" style={{ color: "var(--red)" }} onClick={() => excluirExercicio(r.exercicio)}>limpar</button>
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
