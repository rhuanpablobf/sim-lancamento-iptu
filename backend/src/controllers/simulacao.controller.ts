import { Request, Response } from 'express';
import db from '../config/db';
import { z } from 'zod';
import { addSimulacaoJob } from '../queue/simulacao.queue';

const iniciarSimulacaoSchema = z.object({
  nome: z.string(),
  exercicio_base: z.number().int(),
  exercicio_destino: z.number().int(),
  cenario_faixa: z.enum(['SELIC', 'IPCA']),
  ano_base_faixas: z.number().int(),
  aplicar_cap_5pct: z.boolean().default(true),
  parametros_json: z.any().optional(),
});

export const iniciarSimulacao = async (req: Request, res: Response) => {
  const payload = iniciarSimulacaoSchema.parse(req.body);

  const result = await db.query(`
    INSERT INTO sim_simulacoes (
      nome, exercicio_base, exercicio_destino, cenario_faixa, 
      ano_base_faixas, aplicar_cap_5pct, parametros_json
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id
  `, [
    payload.nome, payload.exercicio_base, payload.exercicio_destino,
    payload.cenario_faixa, payload.ano_base_faixas, payload.aplicar_cap_5pct,
    payload.parametros_json
  ]);

  const simulacaoId = result.rows[0].id;

  // Envia para a fila BullMQ processar em background
  await addSimulacaoJob(simulacaoId, payload);

  res.status(202).json({
    message: 'Simulação enviada para a fila de processamento.',
    simulacaoId
  });
};

export const listarSimulacoes = async (req: Request, res: Response) => {
  const result = await db.query('SELECT * FROM sim_simulacoes ORDER BY criado_em DESC');
  res.json(result.rows);
};

export const obterSimulacao = async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await db.query('SELECT * FROM sim_simulacoes WHERE id = $1', [id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Não encontrado' });
  res.json(result.rows[0]);
};
