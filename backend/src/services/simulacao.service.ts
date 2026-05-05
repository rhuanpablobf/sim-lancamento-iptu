import db from '../config/db';

export const executarMotorSimulacao = async (simulacaoId: string, parametros: any) => {
  const { exercicio_base, exercicio_destino, cenario_faixa, ano_base_faixas, aplicar_cap_5pct } = parametros;

  // 1. Carregar índices macroeconômicos (IPCA e SELIC) entre base e destino
  const indRes = await db.query('SELECT exercicio, ipca_acumulado, selic_acumulado FROM sim_parametros_anuais WHERE exercicio > $1 AND exercicio <= $2 ORDER BY exercicio ASC', [exercicio_base, exercicio_destino]);
  const indices = indRes.rows;
  
  const fatorIpcaTotal = indices.reduce((acc, curr) => acc * (1 + parseFloat(curr.ipca_acumulado)), 1);
  const fatorSelicTotal = indices.reduce((acc, curr) => acc * (1 + parseFloat(curr.selic_acumulado)), 1);
  const ipcaAnoDestino = indices.find(i => i.exercicio === exercicio_destino)?.ipca_acumulado || 0;

  // Fator para IPTU Social e Mínimo (SELIC a partir de 2022 até ano-1)
  const selicAteAnoMenos1Res = await db.query('SELECT selic_acumulado FROM sim_parametros_anuais WHERE exercicio >= 2022 AND exercicio < $1', [exercicio_destino]);
  const fatorSelicSocial = selicAteAnoMenos1Res.rows.reduce((acc, curr) => acc * (1 + parseFloat(curr.selic_acumulado)), 1);

  const limiteIptuSocial = 140000 * fatorSelicSocial;
  const limiteImpostoMinimo = 100 * fatorSelicSocial;

  // Fator de atualização das faixas (depende do cenário)
  const fatorAtualizacaoFaixas = cenario_faixa === 'SELIC' ? fatorSelicTotal : fatorIpcaTotal;

  // 2. Carregar faixas base e projetá-las
  const faixasRes = await db.query('SELECT * FROM sim_faixas_aliquota WHERE exercicio = $1 ORDER BY categoria, limite_inferior ASC', [ano_base_faixas]);
  const faixasBase = faixasRes.rows;

  const getAliquota = (categoria: string, valorVenal: number) => {
    const faixasCategoria = faixasBase.filter(f => f.categoria === categoria);
    for (const f of faixasCategoria) {
      const limSup = f.limite_superior ? parseFloat(f.limite_superior) * fatorAtualizacaoFaixas : Infinity;
      if (valorVenal <= limSup) return { aliquota: parseFloat(f.aliquota), faixaId: f.id };
    }
    return { aliquota: 0, faixaId: null };
  };

  // 3. Processamento em lotes para sim_lancamentos
  let offset = 0;
  const limit = 10000;
  let hasMore = true;
  let processados = 0;

  while (hasMore) {
    const imoveisRes = await db.query(`
      SELECT l.*,
        t1.INFO_TIPO_EDF_LAN as tipo_edf_1,
        t2.INFO_TIPO_EDF_LAN as tipo_edf_2
      FROM "SIA_LANCIPTU_ASG" l
      LEFT JOIN "SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN" t1 ON l."ISN_SIA_LANCIPTU_ASG" = t1."ISN_SIA_LANCIPTU_ASG" AND t1.cnxarraycolumn = 0
      LEFT JOIN "SIA_LANCIPTU_ASG_INFO_TIPO_EDF_LAN" t2 ON l."ISN_SIA_LANCIPTU_ASG" = t2."ISN_SIA_LANCIPTU_ASG" AND t2.cnxarraycolumn = 1
      WHERE l."CODG_EXERCICIO_LAN" = $1
      ORDER BY l."ISN_SIA_LANCIPTU_ASG" ASC
      LIMIT $2 OFFSET $3
    `, [exercicio_base, limit, offset]);

    if (imoveisRes.rows.length === 0) {
      hasMore = false;
      break;
    }

    const valoresInsert = [];

    for (const imovel of imoveisRes.rows) {
      const valr_venal_base = parseFloat(imovel.VALR_VENAL_LAN || '0');
      const valr_venal_simulado = valr_venal_base * fatorIpcaTotal;
      let valr_imposto_anterior = parseFloat(imovel.VALR_IMPOSTO_LAN || '0');
      
      let categoriaTributacao = 'RESIDENCIAL';
      let aliquotaAplicada = 0;
      let valr_iptu_bruto = 0;
      let valr_iptu_cap = 0;
      let valr_imposto_lan = 0;
      let tipo_lancamento = 0; // 0 = Normal
      let motivo_isencao = '';

      if (imovel.INFO_POSICAO_FISCAL_LAN && imovel.INFO_POSICAO_FISCAL_LAN !== 0) {
        tipo_lancamento = 1; // Isento / Imune
        motivo_isencao = 'MANTIDA_EXERCICIO_ANTERIOR';
      } else {
        // Enquadramento
        if (imovel.TIPO_IMPOSTO_LAN === 2) {
          categoriaTributacao = 'TERRITORIAL';
        } else if (imovel.INFO_OCUPACAO_LAN === 4) {
          categoriaTributacao = 'EM_CONSTRUCAO';
        } else if (imovel.INFO_USO_LAN !== 1) {
          categoriaTributacao = 'NAO_RESIDENCIAL';
        }

        const faixaS = getAliquota(categoriaTributacao, valr_venal_simulado);
        aliquotaAplicada = faixaS.aliquota;
        valr_iptu_bruto = valr_venal_simulado * aliquotaAplicada;

        // Cap de 5%
        valr_iptu_cap = valr_imposto_anterior * 1.05 * (1 + parseFloat(ipcaAnoDestino as any));
        if (aplicar_cap_5pct && valr_iptu_cap > 0) {
          valr_imposto_lan = Math.min(valr_iptu_bruto, valr_iptu_cap);
        } else {
          valr_imposto_lan = valr_iptu_bruto;
        }

        // Imposto Mínimo
        if (valr_imposto_lan > 0 && valr_imposto_lan < limiteImpostoMinimo) {
          valr_imposto_lan = limiteImpostoMinimo;
          tipo_lancamento = 2; // Mínimo
        }
      }

      valoresInsert.push(`(
        '${simulacaoId}', ${imovel.ISN_SIA_LANCIPTU_ASG}, ${imovel.CODG_INSCRICAO_LAN}, ${exercicio_destino}, 
        ${imovel.TIPO_IMPOSTO_LAN}, ${tipo_lancamento}, ${imovel.INFO_USO_LAN}, ${imovel.INFO_POSICAO_FISCAL_LAN || 0}, 
        '${categoriaTributacao}', ${valr_venal_base}, ${valr_venal_simulado}, ${aliquotaAplicada}, 
        ${valr_iptu_bruto}, ${valr_iptu_cap}, ${valr_imposto_lan}, ${valr_imposto_anterior}, '${imovel.INFO_CPF_CGC_LAN || ''}'
      )`);
    }

    // Inserção em massa do lote
    if (valoresInsert.length > 0) {
      const queryStr = `
        INSERT INTO sim_lancamentos (
          simulacao_id, isn_sia_lanciptu_asg, codg_inscricao_lan, codg_exercicio_lan,
          tipo_imposto_lan, tipo_lancamento_lan, info_uso_lan, info_posicao_fiscal_lan,
          categoria_tributacao, valr_venal_base, valr_venal_simulado, valr_aliquota_lan,
          valr_iptu_bruto, valr_iptu_cap, valr_imposto_lan, valr_imposto_anterior, cpf_contribuinte
        ) VALUES ${valoresInsert.join(', ')}
      `;
      await db.query(queryStr);
    }

    processados += imoveisRes.rows.length;
    offset += limit;
    console.log(`[Simulação ${simulacaoId}] ${processados} imóveis processados...`);
    await db.query('UPDATE sim_simulacoes SET total_processados = $1 WHERE id = $2', [processados, simulacaoId]);
  }

  // Pós processamento: IPTU Social
  // O IPTU social agrupa imóveis por CPF e Edifício
  console.log(`[Simulação ${simulacaoId}] Calculando IPTU Social...`);
  
  await db.query(`
    WITH cpfs_validos AS (
      SELECT cpf_contribuinte, COUNT(DISTINCT codg_edificio_lan) as qtd_grupos, SUM(valr_venal_simulado) as total_venal
      FROM sim_lancamentos sl
      JOIN "SIA_LANCIPTU_ASG" b ON sl.isn_sia_lanciptu_asg = b."ISN_SIA_LANCIPTU_ASG"
      WHERE sl.simulacao_id = $1 
        AND LENGTH(cpf_contribuinte) = 11 -- Apenas Pessoa Física
        AND sl.tipo_imposto_lan = 1 -- Predial
        AND sl.info_uso_lan = 1 -- Residencial
      GROUP BY cpf_contribuinte
    )
    UPDATE sim_lancamentos sl
    SET 
      valr_imposto_lan = 0,
      tipo_lancamento_lan = 3, -- IPTU Social
      motivo_isencao = 'IPTU_SOCIAL'
    FROM cpfs_validos cv
    WHERE sl.cpf_contribuinte = cv.cpf_contribuinte
      AND sl.simulacao_id = $1
      AND cv.qtd_grupos = 1
      AND cv.total_venal <= $2
  `, [simulacaoId, limiteIptuSocial]);
};
