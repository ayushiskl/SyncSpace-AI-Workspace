import { Router } from 'express';
import {
  applyExecution,
  executeCustomAI,
  improveWithAI,
  listExecutions,
  liveCheckExecution,
  rejectExecution,
  rewriteWithAI,
  summarizeWithAI,
} from '../controllers/aiController.js';
import { protect, requireDocumentAccess } from '../middleware/auth.js';

const router = Router();

router.use(protect);

router.post('/rewrite', requireDocumentAccess('edit'), rewriteWithAI);
router.post('/summarize', requireDocumentAccess('edit'), summarizeWithAI);
router.post('/improve', requireDocumentAccess('edit'), improveWithAI);
router.post('/execute', requireDocumentAccess('edit'), executeCustomAI);

router.get('/executions/:documentId', requireDocumentAccess('view', 'documentId'), listExecutions);
router.get('/executions/:id/live-check', liveCheckExecution);
router.post('/executions/:id/apply', applyExecution);
router.post('/executions/:id/reject', rejectExecution);

export default router;
