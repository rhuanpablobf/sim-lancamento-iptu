import { Request, Response } from 'express';
import db from '../config/db';
import { z } from 'zod';

const paramSchema = z.object({
  exercicio: z.number().int().min(2000).max(2100),
  ipca_acumulado: z.number(),
  selic_acumulado: z.number(),
  obs: z.string().optional()
});

export const listar = async (req: Request, res: Response) => {
  const result = await db.query('SELECT * FROM sim_parametros_anuais ORDER BY exercicio DESC');
  res.json(result.rows);
};

export const salvar = async (req: Request, res: Response) => {
  const data = paramSchema.parse(req.body);
  const { exercicio, ipca_acumulado, selic_acumulado, obs } = data;

  const result = await db.query(`
    INSERT INTO sim_parametros_anuais (exercicio, ipca_acumulado, selic_acumulado, obs)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (exercicio) DO UPDATE 
    SET ipca_acumulado = EXCLUDED.ipca_acumulado,
        selic_acumulado = EXCLUDED.selic_acumulado,
        obs = EXCLUDED.obs
    RETURNING *
  `, [exercicio, ipca_acumulado, selic_acumulado, obs]);

  res.status(201).json(result.rows[0]);
};
