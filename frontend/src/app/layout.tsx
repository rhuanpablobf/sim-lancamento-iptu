import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

import { Sidebar } from "./components/Sidebar";

/* Carrega IBM Plex Sans/Mono do Google Fonts */
const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SimLan IPTU",
  description: "Sistema de Lançamento IPTU · Gabinete SEFIN",
};

import StyledJsxRegistry from "@/lib/registry";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${ibmPlexSans.variable} ${ibmPlexMono.variable}`}
        style={{ fontFamily: "var(--font-ibm-plex-sans, 'IBM Plex Sans', sans-serif)" }}
        suppressHydrationWarning
      >
        <StyledJsxRegistry>
          <Sidebar />
          <main className="main">
            {children}
          </main>
        </StyledJsxRegistry>
      </body>
    </html>
  );
}
