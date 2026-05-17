"use client";
import React, { useState } from "react";

interface Etapa {
  numero: string;
  titulo: string;
  artigo: string;
  descricao: string;
  detalhes: string[];
  formula?: string;
  exemplo: string;
  categoria: string;
}

export default function RegrasPage() {
  const [etapaAtiva, setEtapaAtiva] = useState<string>("1");
  const [categoriaAtiva, setCategoriaAtiva] = useState<string>("RESIDENCIAL");

  const etapas: Etapa[] = [
    {
      numero: "1",
      categoria: "Cadastro",
      titulo: "Classificação da Categoria Tributária",
      artigo: "Artigo 165 a 175 - CTM Goiânia",
      descricao: "Determina o enquadramento do imóvel em uma das três grandes categorias fiscais do município com base no cadastro imobiliário.",
      detalhes: [
        "Territorial: Identificado pelo código de imposto territorial (TIPO_IMPOSTO_LAN = 2).",
        "Residencial: Identificado por imposto predial (TIPO_IMPOSTO_LAN = 1) e uso residencial (INFO_USO_LAN = 1).",
        "Não Residencial: Identificado por imposto predial (TIPO_IMPOSTO_LAN = 1) e uso comercial/industrial/outros (INFO_USO_LAN != 1).",
        "Em Construção (Especial): Imóvel territorial (TIPO_IMPOSTO_LAN = 2) com ocupação do lote ativa (INFO_OCUPACAO_LAN = 4). Recebe teto legal de alíquota de 1,00% (Art. 178, IV)."
      ],
      formula: "Categoria = f(TIPO_IMPOSTO_LAN, INFO_USO_LAN, INFO_OCUPACAO_LAN)",
      exemplo: "Um apartamento residencial comum recebe a categoria 'RESIDENCIAL', enquanto um lote vago comercial recebe 'TERRITORIAL'."
    },
    {
      numero: "2",
      categoria: "Valor Venal",
      titulo: "Correção Monetária do Valor Venal",
      artigo: "Artigo 168, § 6º - CTM Goiânia",
      descricao: "Aplica a atualização inflacionária sobre o valor venal do imóvel cadastrado no município para o exercício simulado.",
      detalhes: [
        "O Valor Venal Base do ano anterior (VALR_VENAL_LAN) é multiplicado pelo fator de IPCA acumulado do exercício.",
        "A taxa de IPCA (%) é configurada no menu de Índices Macroeconômicos para cada ano da projeção.",
        "Esta correção é cumulativa e serve como a base tributária real para o cálculo de alíquotas."
      ],
      formula: "VV_simulado = VV_base * (1 + IPCA_ano)",
      exemplo: "Um imóvel com Valor Venal de R$ 200.000,00 sob um IPCA de 4,46% passa a ter o Valor Venal Simulado de R$ 208.920,00 no exercício seguinte."
    },
    {
      numero: "3",
      categoria: "Alíquotas",
      titulo: "Enquadramento em Faixas de Alíquota",
      artigo: "Anexo I / Artigo 178 - CTM Goiânia",
      descricao: "Com o Valor Venal Simulado atualizado, o imóvel é enquadrado nas tabelas progressivas da sua respectiva categoria.",
      detalhes: [
        "Faixas Progressivas: Os limites superiores e inferiores de cada faixa são atualizados on-the-fly de acordo com o indexador da simulação (IPCA ou SELIC).",
        "Busca Vetorizada: O motor percorre as faixas progressivas e enquadra o imóvel de forma dinâmica.",
        "Teto de Construção: Se o imóvel for Territorial 'Em Construção', sua alíquota resultante é limitada ao teto de 1,00% (Art. 178, IV)."
      ],
      formula: "Alíquota = TabelaFaixas(VV_simulado, Categoria)",
      exemplo: "Um imóvel residencial de R$ 400.000,00 simulado em 2026 é enquadrado na faixa RES-F3 (R$ 313.720,35 a R$ 470.580,51), recebendo a alíquota de 0,29%."
    },
    {
      numero: "4",
      categoria: "Cálculo Bruto",
      titulo: "Cálculo do Imposto Bruto",
      artigo: "Artigo 177 - CTM Goiânia",
      descricao: "Consiste na aplicação direta da alíquota enquadrada sobre o valor venal corrigido para encontrar o imposto de partida.",
      detalhes: [
        "Multiplicação simples da base tributária (Valor Venal Simulado) pela taxa correspondente (Alíquota Calculada).",
        "Esse valor representa o imposto bruto inicial, antes de qualquer limitação legal de reajuste ou isenção social."
      ],
      formula: "IPTU_bruto = VV_simulado * Alíquota_calculada",
      exemplo: "Com Valor Venal de R$ 208.920,00 e alíquota de 0,20% (RES-F2), o IPTU Bruto gerado é de R$ 417,84."
    },
    {
      numero: "5",
      categoria: "Trava Legal",
      titulo: "Aplicação da Trava de Reajuste (CAP)",
      artigo: "Artigo 168, § 6º - CTM Goiânia",
      descricao: "Garante a limitação legal do aumento real do imposto de um ano para o outro, protegendo o contribuinte contra saltos bruscos.",
      detalhes: [
        "Cenário APENAS_INFLACAO: O imposto simulado fica limitado a, no máximo, o imposto pago no ano anterior corrigido pelo IPCA do exercício.",
        "Cenário INFLACAO_MAIS_5: O imposto fica limitado ao imposto do ano anterior corrigido pelo IPCA + 5% de aumento real.",
        "Se o imposto bruto for maior que o limite calculado, o imóvel é classificado como 'Travado no Limite (CAP)' e paga o limite. Caso contrário, ele fica 'Abaixo da Trava' e paga o imposto bruto."
      ],
      formula: "Limite_CAP = IPTU_anterior * (1 + IPCA) * [1.05 se INFLACAO_MAIS_5] | IPTU_cap = min(IPTU_bruto, Limite_CAP)",
      exemplo: "Um imóvel que pagou R$ 1.000,00 de IPTU no ano anterior, sob IPCA de 4,46% e regra de CAP de 5%, tem seu imposto limitado a R$ 1.096,83, mesmo que seu cálculo bruto resulte em R$ 1.300,00."
    },
    {
      numero: "6",
      categoria: "Benefício Social",
      titulo: "Verificação e Enquadramento do IPTU Social",
      artigo: "Anexo X, Item 14 - CTM Goiânia",
      descricao: "Aplica o benefício fiscal de isenção total (100% de desconto) para famílias de baixa renda e imóveis populares.",
      detalhes: [
        "Categoria Exclusiva: Válido apenas para imóveis RESIDENCIAIS de Pessoas Físicas (CPF).",
        "Imóvel Único: O proprietário deve possuir apenas 1 imóvel cadastrado no município (ou no máximo 2, se formarem o par único de Apartamento + Box/Garagem no mesmo condomínio).",
        "Limite Venal Social: O valor venal do imóvel (ou a soma do par Apto+Box) deve ser menor ou igual ao limite do IPTU Social daquele exercício.",
        "Projeção do Limite: O limite social base (R$ 140.000,00 em 2022) é corrigido cumulativamente pelo indexador escolhido na simulação (IPCA ou SELIC)."
      ],
      formula: "Se (Residencial E PF E Unico E VV <= Limite_Social) -> IPTU_final = 0.00 (Social)",
      exemplo: "Um contribuinte com apenas um apartamento residencial avaliado em R$ 138.000,00 no ano de 2023 (limite social projetado de R$ 146.244,00) fica totalmente isento de IPTU."
    },
    {
      numero: "7",
      categoria: "Ajuste Final",
      titulo: "Imposto Mínimo e Enquadramento Final",
      artigo: "Artigo 179 - CTM Goiânia",
      descricao: "Garante o recolhimento mínimo necessário para a manutenção dos serviços de arrecadação pública, exceto para os isentos sociais.",
      detalhes: [
        "Base de Cálculo: O valor mínimo (R$ 100,00 em 2022) é atualizado anualmente pelo indexador selecionado (IPCA ou SELIC).",
        "Regra de Aplicação: Se o imposto cap final for maior que zero (ou seja, não é isento de origem ou social) e for inferior ao valor mínimo, ele é elevado para o Imposto Mínimo.",
        "Imunidades/Isenções Fiscais: Imóveis públicos, templos religiosos, partidos políticos (Posição Fiscal = 1) ou isentos de origem (Posição Fiscal >= 2) são identificados e recebem imposto final R$ 0,00."
      ],
      formula: "Se (Imposto > 0 E Imposto < Minimo) -> IPTU_final = Minimo",
      exemplo: "Um pequeno lote cujo IPTU calculado após a trava resultou em R$ 68,00 é ajustado para o valor mínimo simulado do exercício (ex: R$ 114,75)."
    }
  ];

  const tabelasReferencia = {
    RESIDENCIAL: [
      { faixa: "RES-F1", de: "R$ 0,00", ate: "R$ 156.860,16", aliq: "0,15%" },
      { faixa: "RES-F2", de: "R$ 156.860,17", ate: "R$ 313.720,34", aliq: "0,20%" },
      { faixa: "RES-F3", de: "R$ 313.720,35", ate: "R$ 470.580,51", aliq: "0,29%" },
      { faixa: "RES-F4", de: "R$ 470.580,52", ate: "R$ 784.300,86", aliq: "0,40%" },
      { faixa: "RES-F5", de: "R$ 784.300,87", ate: "R$ 1.568.601,71", aliq: "0,50%" },
      { faixa: "RES-F6", de: "R$ 1.568.601,72", ate: "Sem Limite", aliq: "0,55%" },
    ],
    NAO_RESIDENCIAL: [
      { faixa: "NR-F1", de: "R$ 0,00", ate: "R$ 313.720,34", aliq: "0,75%" },
      { faixa: "NR-F2", de: "R$ 313.720,35", ate: "R$ 470.580,51", aliq: "0,80%" },
      { faixa: "NR-F3", de: "R$ 470.580,52", ate: "R$ 784.300,86", aliq: "0,85%" },
      { faixa: "NR-F4", de: "R$ 784.300,87", ate: "R$ 1.098.021,21", aliq: "0,90%" },
      { faixa: "NR-F5", de: "R$ 1.098.021,22", ate: "R$ 1.568.601,71", aliq: "0,95%" },
      { faixa: "NR-F6", de: "R$ 1.568.601,72", ate: "Sem Limite", aliq: "1,00%" },
    ],
    TERRITORIAL: [
      { faixa: "TER-F1", de: "R$ 0,00", ate: "R$ 56.217,24", aliq: "1,00%" },
      { faixa: "TER-F2", de: "R$ 56.217,25", ate: "R$ 84.325,86", aliq: "1,30%" },
      { faixa: "TER-F3", de: "R$ 84.325,87", ate: "R$ 112.434,49", aliq: "1,60%" },
      { faixa: "TER-F4", de: "R$ 112.434,50", ate: "R$ 140.543,12", aliq: "1,90%" },
      { faixa: "TER-F5", de: "R$ 140.543,13", ate: "R$ 210.814,67", aliq: "2,20%" },
      { faixa: "TER-F6", de: "R$ 210.814,68", ate: "R$ 421.629,35", aliq: "2,50%" },
      { faixa: "TER-F7", de: "R$ 421.629,36", ate: "Sem Limite", aliq: "2,80%" },
    ]
  };

  const etapaSelecionada = etapas.find(e => e.numero === etapaAtiva) || etapas[0];

  return (
    <div className="page active">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <div className="page-title">Manual &amp; Regras de Cálculo</div>
            <div className="page-subtitle">Metodologia oficial de simulação passo a passo com base no CTM Goiânia</div>
          </div>
        </div>
      </div>

      <div className="page-content">
        {/* Banner Premium de Introdução */}
        <div className="card mb-24" style={{ 
          background: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)", 
          border: "none", 
          color: "#fff",
          borderRadius: "var(--radius-xl)",
          padding: "24px 28px"
        }}>
          <div className="row" style={{ alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: "18px", fontWeight: "600", marginBottom: "8px", letterSpacing: "-0.3px" }}>
                Entendendo o Motor de Simulação SimLan IPTU
              </h2>
              <p style={{ fontSize: "12.5px", color: "#93c5fd", lineHeight: "1.6", maxWidth: "800px", margin: 0 }}>
                O sistema processa o lançamento fiscal de centenas de milhares de imóveis de forma totalmente 
                vetorizada (usando Python, Pandas e Numpy). A simulação reproduz fielmente as regras tributárias 
                do município, aplicando correções inflacionárias, limites legais de aumento (CAP), faixas 
                progressivas atualizadas e isenções de caráter social.
              </p>
            </div>
            <div className="flex-center" style={{ width: "80px", height: "80px", background: "rgba(255,255,255,0.08)", borderRadius: "50%" }}>
              <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#60a5fa" strokeWidth="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
            </div>
          </div>
        </div>

        <div className="row">
          {/* Timeline da Esquerda */}
          <div style={{ flex: "0 0 280px" }}>
            <div className="card">
              <div className="card-header">
                <div className="card-title">Etapas do Lançamento</div>
              </div>
              <div className="card-body" style={{ padding: "12px" }}>
                <div className="inner-nav">
                  {etapas.map((etapa) => (
                    <div
                      key={etapa.numero}
                      className={`inner-nav-item ${etapaAtiva === etapa.numero ? "active" : ""}`}
                      onClick={() => setEtapaAtiva(etapa.numero)}
                      style={{ 
                        display: "flex", 
                        alignItems: "center", 
                        gap: "10px", 
                        padding: "10px 12px",
                        cursor: "pointer"
                      }}
                    >
                      <div className="flex-center" style={{ 
                        width: "20px", 
                        height: "20px", 
                        borderRadius: "50%", 
                        background: etapaAtiva === etapa.numero ? "var(--blue)" : "var(--surface-3)", 
                        color: etapaAtiva === etapa.numero ? "#fff" : "var(--txt-3)",
                        fontSize: "11px",
                        fontWeight: "600"
                      }}>
                        {etapa.numero}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="fw-600" style={{ fontSize: "11.5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {etapa.titulo}
                        </div>
                        <div className="text-xs text-muted" style={{ fontSize: "10px" }}>{etapa.categoria}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Configuração de Indexadores Info */}
            <div className="card mt-24" style={{ background: "var(--blue-light)", border: "1px dashed var(--blue-mid)" }}>
              <div className="card-body">
                <div className="text-xs fw-600 mb-4" style={{ color: "var(--blue-txt)" }}>📈 COMPORTAMENTO DE CENÁRIO</div>
                <div className="text-xs text-muted" style={{ lineHeight: "1.5", fontSize: "11px" }}>
                  A correção anual pelo <strong>IPCA</strong> valoriza os imóveis de forma equilibrada. 
                  Se você configurar o reajuste das faixas progressivas pela <strong>SELIC</strong>, 
                  as faixas se expandem a taxas superiores à valorização dos imóveis, fazendo com que 
                  a maior parte do município caia para alíquotas mais baratas e isenção do IPTU Social.
                </div>
              </div>
            </div>
          </div>

          {/* Conteúdo Detalhado da Direita */}
          <div style={{ flex: 1 }}>
            <div className="card">
              <div className="card-header" style={{ background: "var(--surface-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span className="badge badge-blue" style={{ borderRadius: "4px", fontSize: "10.5px" }}>ETAPA {etapaSelecionada.numero}</span>
                  <div className="card-title" style={{ fontSize: "14px" }}>{etapaSelecionada.titulo}</div>
                </div>
                <span className="text-xs text-muted fw-600" style={{ color: "var(--amber-txt)" }}>{etapaSelecionada.artigo}</span>
              </div>
              <div className="card-body">
                {/* Descrição Geral */}
                <div style={{ fontSize: "13px", lineHeight: "1.6", color: "var(--txt-2)", marginBottom: "20px" }}>
                  {etapaSelecionada.descricao}
                </div>

                {/* Bloco de Fórmula (se houver) */}
                {etapaSelecionada.formula && (
                  <div className="mb-20" style={{
                    background: "var(--surface-3)",
                    borderLeft: "4px solid var(--blue)",
                    padding: "12px 16px",
                    borderRadius: "0 var(--radius) var(--radius) 0"
                  }}>
                    <div className="text-xs text-muted fw-600 mb-4" style={{ letterSpacing: "0.05em", textTransform: "uppercase" }}>Equação Matemática / Regra Lógica</div>
                    <code className="text-mono fw-600" style={{ fontSize: "12.5px", color: "var(--blue-txt)" }}>{etapaSelecionada.formula}</code>
                  </div>
                )}

                {/* Lista de Passos Técnicos */}
                <div className="section-title">Diretrizes de Processamento</div>
                <ul style={{ paddingLeft: "18px", margin: "0 0 24px 0", fontSize: "12px", color: "var(--txt-2)", lineHeight: "1.7" }}>
                  {etapaSelecionada.detalhes.map((item, idx) => (
                    <li key={idx} style={{ marginBottom: "8px" }}>{item}</li>
                  ))}
                </ul>

                {/* Exemplo de Aplicação */}
                <div className="section-title" style={{ color: "var(--green)" }}>Exemplo Prático na Base</div>
                <div style={{ 
                  background: "var(--green-light)", 
                  border: "1px solid var(--green-mid)", 
                  borderRadius: "var(--radius-lg)", 
                  padding: "14px 16px",
                  fontSize: "12px",
                  color: "var(--green-txt)",
                  lineHeight: "1.6"
                }}>
                  {etapaSelecionada.exemplo}
                </div>
              </div>
            </div>

            {/* Tabelas de Alíquota de Referência Base 2026 */}
            <div className="card mt-24">
              <div className="card-header">
                <div>
                  <div className="card-title">Tabelas Fiscais de Referência (Base 2026)</div>
                  <div className="card-subtitle">As faixas originais do Código Tributário Municipal (CTM) cadastradas no sistema</div>
                </div>
                <div className="flex-gap-8">
                  {Object.keys(tabelasReferencia).map((cat) => (
                    <button
                      key={cat}
                      className={`btn btn-sm ${categoriaAtiva === cat ? "btn-primary" : "btn-secondary"}`}
                      onClick={() => setCategoriaAtiva(cat)}
                    >
                      {cat.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>
              <div className="card-body-flush table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: "120px" }}>Código Faixa</th>
                      <th>Valor Inicial</th>
                      <th>Valor Limite</th>
                      <th className="right" style={{ width: "120px" }}>Alíquota IPTU</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabelasReferencia[categoriaAtiva as keyof typeof tabelasReferencia].map((f, idx) => (
                      <tr key={idx}>
                        <td className="fw-600">{f.faixa}</td>
                        <td className="text-mono">{f.de}</td>
                        <td className="text-mono">{f.ate}</td>
                        <td className="right text-mono fw-600" style={{ color: "var(--blue-txt)" }}>{f.aliq}</td>
                      </tr>
                    ))}
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
