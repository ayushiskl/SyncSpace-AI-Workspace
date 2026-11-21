import { Router } from 'express';
import {
  createDocument,
  deleteDocument,
  getDocumentActivity,
  getDocumentById,
  getDocumentSnapshot,
  listDocuments,
  saveDocumentSnapshot,
  updateDocument,
} from '../controllers/documentController.js';
import { protect, requireDocumentAccess } from '../middleware/auth.js';

const router = Router();

router.use(protect);

router.post('/', createDocument);
router.get('/', listDocuments);
router.get('/:id', requireDocumentAccess('view'), getDocumentById);
router.patch('/:id', requireDocumentAccess('edit'), updateDocument);
router.delete('/:id', requireDocumentAccess('owner'), deleteDocument);

router.get('/:id/snapshot', requireDocumentAccess('view'), getDocumentSnapshot);
router.post('/:id/snapshot', requireDocumentAccess('edit'), saveDocumentSnapshot);
router.get('/:id/activity', requireDocumentAccess('view'), getDocumentActivity);

export default router;
