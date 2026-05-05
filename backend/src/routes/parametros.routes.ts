import { Router } from 'express';
import * as parametrosController from '../controllers/parametros.controller';

const router = Router();

router.get('/', parametrosController.listar);
router.post('/', parametrosController.salvar);

export default router;
