"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();

  const handleLinkClick = () => {
    if (onClose && window.innerWidth <= 768) {
      onClose();
    }
  };

  const isActive = (path: string) => {
    if (path === '/simulacoes') {
      return pathname?.startsWith("/simulacoes") || pathname?.startsWith("/nova-simulacao") ? "nav-item active" : "nav-item";
    }
    return pathname === path ? "nav-item active" : "nav-item";
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-name">SimLan IPTU</div>
        <div className="sidebar-logo-sub">Gabinete SEFIN · v1.2</div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">Visão Geral</div>
        <Link href="/dashboard" className={isActive("/dashboard")} onClick={handleLinkClick}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          Dashboard Analítico
        </Link>
        <Link href="/comparacao" className={isActive("/comparacao")} onClick={handleLinkClick}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 3h5v18h-5zM9 9h5v12H9zM2 14h5v7H2z"/></svg>
          Comparação de Simulações
        </Link>
        <Link href="/regras" className={isActive("/regras")} onClick={handleLinkClick}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
          Manual de Cálculos
        </Link>

        <div className="nav-section-label">Dados & Integração</div>
        <Link href="/importacao" className={isActive("/importacao")} onClick={handleLinkClick}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Sincronização (Base)
        </Link>

        <div className="nav-section-label">Planejamento Fiscal</div>
        <Link href="/parametros" className={isActive("/parametros")} onClick={handleLinkClick}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          Índices (IPCA/SELIC)
        </Link>

        <Link href="/config-base" className={isActive("/config-base")} onClick={handleLinkClick}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
          Config. IPTU Social / Mínimo
        </Link>

        <Link href="/faixas" className={isActive("/faixas")} onClick={handleLinkClick}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          Faixas de Alíquota
        </Link>

        <div className="nav-section-label">Estudos & Auditoria</div>
        <Link href="/simulacoes" className={isActive("/simulacoes")} onClick={handleLinkClick}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
          Estudos de Impacto
        </Link>

        <Link href="/auditoria" className={isActive("/auditoria")} onClick={handleLinkClick}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 00 2 2h12a2 2 0 00 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          Auditoria de Imóvel
        </Link>

        <div className="nav-section-label">Extração</div>
        <Link href="/exportar" className={isActive("/exportar")} onClick={handleLinkClick}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Exportar Relatórios
        </Link>
      </nav>

      <div className="sidebar-footer">
        Goiânia · SEFIN<br/>
        Estabilidade & Precisão
      </div>
    </aside>
  );
}
