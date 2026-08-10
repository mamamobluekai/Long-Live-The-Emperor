const express = require('express');
const {
  getAccessibleBatches,
  getBatchMessages,
  createBatchMessage,
  deleteBatchMessage,
  addReaction,
  removeReaction,
} = require('../controllers/chat.controller');
const authenticate = require('../middleware/verifyToken');

const router = express.Router();

router.use(authenticate);

router.get('/batches', getAccessibleBatches);
router.get('/batch/:batchId/messages', getBatchMessages);
router.post('/batch/:batchId/messages', createBatchMessage);
router.delete('/batch/:batchId/messages/:messageId', deleteBatchMessage);
router.post('/batch/:batchId/messages/:messageId/reactions', addReaction);
router.delete('/batch/:batchId/messages/:messageId/reactions', removeReaction);

module.exports = router;
