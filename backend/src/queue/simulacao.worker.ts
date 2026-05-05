import { Worker, Job } from 'bullmq';
import redisConnection from '../config/redis';
import db from '../config/db';
import { executarMotorSimulacao } from '../services/simulacao.service';

const worker = new Worker('simulacao_queue', async (job: Job) => {
  const { simulacaoId, parametros } = job.data;
  console.log(`[Worker] Iniciando simulação ID: ${simulacaoId}`);

  try {
    // 1. Atualizar status para PROCESSANDO
    await db.query(`UPDATE sim_simulacoes SET status = 'PROCESSANDO' WHERE id = $1`, [simulacaoId]);

    // 2. Chamar a regra de negócios core
    await executarMotorSimulacao(simulacaoId, parametros);

    // 3. Atualizar status para CONCLUIDO
    await db.query(`UPDATE sim_simulacoes SET status = 'CONCLUIDO', concluido_em = NOW() WHERE id = $1`, [simulacaoId]);
    console.log(`[Worker] Simulação ID: ${simulacaoId} finalizada com sucesso.`);
  } catch (error: any) {
    console.error(`[Worker] Erro na simulação ${simulacaoId}:`, error);
    await db.query(`UPDATE sim_simulacoes SET status = 'ERRO', erro_mensagem = $1 WHERE id = $2`, [error.message, simulacaoId]);
  }
}, { connection: redisConnection });

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} falhou:`, err);
});

export default worker;
