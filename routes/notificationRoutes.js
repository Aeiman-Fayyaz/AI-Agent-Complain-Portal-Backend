const express = require('express');
const router = express.Router();
const {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead
} = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');

router.route('/')
  .get(protect, getNotifications);

router.route('/read-all')
  .patch(protect, markAllNotificationsAsRead);

router.route('/:id/read')
  .patch(protect, markNotificationAsRead);

module.exports = router;
