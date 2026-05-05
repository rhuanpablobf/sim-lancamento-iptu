import { Router } from 'express';
import * as faixasController from '../controllers/faixas.controller';

const router = Router();

router.get('/:exercicio', faixasController.listar);
router.post('/', faixasController.salvarMultiplas);

export default router;
