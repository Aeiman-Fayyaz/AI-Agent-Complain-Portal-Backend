const express = require('express');
const router = express.Router();
const {
  createTicket,
  getTickets,
  getTicketById,
  updateTicket
} = require('../controllers/ticketController');
const { protect, authorize } = require('../middleware/auth');

router.route('/')
  .post(protect, createTicket)
  .get(protect, getTickets);

router.route('/:id')
  .get(protect, getTicketById)
  .patch(protect, updateTicket);

module.exports = router;
