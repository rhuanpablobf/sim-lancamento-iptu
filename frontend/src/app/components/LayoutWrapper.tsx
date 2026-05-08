"use client";
import { useState } from "react";
import { Sidebar } from "./Sidebar";

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <>
      {/* Botão Hambúrguer Mobile */}
      <button 
        className="mobile-menu-btn" 
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        aria-label="Menu"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
          {isSidebarOpen ? (
            <path d="M18 6L6 18M6 6l12 12" />
          ) : (
            <path d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Overlay para fechar ao clicar fora no mobile */}
      {isSidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* Sidebar com classe dinâmica */}
      <div className={isSidebarOpen ? "sidebar-container open" : "sidebar-container"}>
        <Sidebar onClose={() => setIsSidebarOpen(false)} />
      </div>

      <main className="main">
        {children}
      </main>

      <style jsx>{`
        .mobile-menu-btn {
          display: none;
          position: fixed;
          top: 12px;
          right: 12px;
          z-index: 1000;
          background: var(--surface);
          border: 1px solid var(--border);
          padding: 8px;
          border-radius: var(--radius);
          cursor: pointer;
          color: var(--txt-1);
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }

        .sidebar-container {
          transition: transform 0.3s ease;
        }

        .sidebar-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.2);
          backdrop-filter: blur(2px);
          z-index: 90;
        }

        @media (max-width: 768px) {
          .mobile-menu-btn { display: block; }
          .sidebar-container {
            position: fixed;
            top: 0; left: 0;
            height: 100vh;
            z-index: 100;
            transform: translateX(-100%);
          }
          .sidebar-container.open {
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  );
}
