import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import db from './config/db';
import redisConnection from './config/redis';
import './queue/simulacao.worker'; // Inicia o worker

import parametrosRoutes from './routes/parametros.routes';
import faixasRoutes from './routes/faixas.routes';
import simulacaoRoutes from './routes/simulacao.routes';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    const dbRes = await db.query('SELECT 1 as online');
    const redisRes = await redisConnection.ping();
    res.json({
      status: 'OK',
      db: dbRes.rows[0].online === 1 ? 'OK' : 'ERROR',
      redis: redisRes === 'PONG' ? 'OK' : 'ERROR'
    });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', error: String(error) });
  }
});

// Importação das rotas
app.use('/api/parametros', parametrosRoutes);
app.use('/api/faixas', faixasRoutes);
app.use('/api/simulacoes', simulacaoRoutes);

// Error handler default
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Erro interno no servidor' });
});

const PORT = process.env.PORT || 3333;

app.listen(PORT, () => {
  console.log(`Backend rodando na porta ${PORT}`);
});
