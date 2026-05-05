import { Queue } from 'bullmq';
import redisConnection from '../config/redis';

export const simulacaoQueue = new Queue('simulacao_queue', { connection: redisConnection });

export const addSimulacaoJob = async (simulacaoId: string, parametros: any) => {
  await simulacaoQueue.add('simular', { simulacaoId, parametros });
};
