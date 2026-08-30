const express = require('express');
const router = express.Router({ mergeParams: true });
const { createMessage, getTicketMessages } = require('../controllers/messageController');
const { protect } = require('../middleware/auth');

router.route('/')
  .post(protect, createMessage)
  .get(protect, getTicketMessages);

module.exports = router;
