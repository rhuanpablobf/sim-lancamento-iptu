import { Router } from 'express';
import * as simulacaoController from '../controllers/simulacao.controller';

const router = Router();

router.post('/', simulacaoController.iniciarSimulacao);
router.get('/', simulacaoController.listarSimulacoes);
router.get('/:id', simulacaoController.obterSimulacao);

export default router;
