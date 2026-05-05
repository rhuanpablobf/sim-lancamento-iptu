import { Request, Response } from 'express';
import db from '../config/db';
import { z } from 'zod';

const faixaSchema = z.object({
  exercicio: z.number().int(),
  categoria: z.enum(['RESIDENCIAL', 'NAO_RESIDENCIAL', 'TERRITORIAL', 'EM_CONSTRUCAO']),
  limite_inferior: z.number().min(0),
  limite_superior: z.number().nullable(),
  aliquota: z.number(),
  origem: z.enum(['MANUAL', 'PROJETADO_SELIC', 'PROJETADO_IPCA']).default('MANUAL')
});

const faixasSchema = z.array(faixaSchema);

export const listar = async (req: Request, res: Response) => {
  const exercicio = parseInt(req.params.exercicio as string, 10);
  const result = await db.query(
    'SELECT * FROM sim_faixas_aliquota WHERE exercicio = $1 ORDER BY categoria, limite_inferior ASC',
    [exercicio]
  );
  res.json(result.rows);
};

export const salvarMultiplas = async (req: Request, res: Response) => {
  const faixas = faixasSchema.parse(req.body);
  if (faixas.length === 0) return res.status(400).json({ error: 'Lista vazia' });

  const exercicio = faixas[0].exercicio;
  
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    
    // Limpa as faixas daquele exercício antes de inserir as novas
    await client.query('DELETE FROM sim_faixas_aliquota WHERE exercicio = $1', [exercicio]);
    
    for (const f of faixas) {
      await client.query(`
        INSERT INTO sim_faixas_aliquota (exercicio, categoria, limite_inferior, limite_superior, aliquota, origem)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [f.exercicio, f.categoria, f.limite_inferior, f.limite_superior, f.aliquota, f.origem]);
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Faixas salvas com sucesso' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
