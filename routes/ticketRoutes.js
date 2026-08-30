const express = require('express');
const router = express.Router();
const {
  checkDuplicateTicket,
  createTicket,
  getTickets,
  getTicketById,
  updateTicket
} = require('../controllers/ticketController');
const { protect, authorize } = require('../middleware/auth');

router.route('/check-duplicate')
  .post(protect, checkDuplicateTicket);

router.route('/')
  .post(protect, authorize('customer'), createTicket)
  .get(protect, getTickets);

router.route('/:id')
  .get(protect, getTicketById)
  .patch(protect, authorize('agent', 'admin'), updateTicket);

module.exports = router;
