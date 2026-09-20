const express = require('express');
const authenticate = require('../middleware/verifyToken');
const controller = require('../controllers/notification.controller');

const router = express.Router();
router.use(authenticate);

router.get('/', controller.getNotifications);
router.get('/unread-count', controller.getUnreadCount);
router.patch('/:id/read', controller.markRead);
router.patch('/read-all', controller.markAllRead);
router.delete('/', controller.deleteAll);

module.exports = router;
