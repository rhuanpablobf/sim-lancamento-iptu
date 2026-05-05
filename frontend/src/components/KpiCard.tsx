/**
 * Componente KpiCard — card de indicador-chave de performance.
 * Usa SVGs inline para evitar dependência de lucide-react.
 */

interface KpiCardProps {
  label: string;
  valor: string;
  variacao?: string;
  direcao?: "up" | "down" | "neutral";
  corVariacao?: "success" | "danger" | "neutral";
}

export function KpiCard({ label, valor, variacao, direcao, corVariacao }: KpiCardProps) {
  const corTexto =
    corVariacao === "danger"
      ? "var(--red-txt)"
      : corVariacao === "success"
      ? "var(--green)"
      : "var(--txt-3)";

  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{valor}</div>
      {variacao && (
        <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: corTexto, marginTop: "4px" }}>
          {direcao === "up" && (
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
            </svg>
          )}
          {direcao === "down" && (
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
            </svg>
          )}
          <span>{variacao}</span>
        </div>
      )}
    </div>
  );
}
