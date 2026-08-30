const Message = require('../models/Message');
const Ticket = require('../models/Ticket');
const { createTicketNotification } = require('../services/notificationService');

// @desc    Add a message/reply to a ticket conversation
// @route   POST /api/tickets/:id/messages
// @access  Private
const createMessage = async (req, res) => {
  try {
    const { content, isInternal } = req.body;
    const ticketId = req.params.id;

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Message content cannot be empty' });
    }

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    // Access control check
    if (req.user.role === 'customer' && ticket.customer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied: You can only message your own ticket' });
    }

    const message = await Message.create({
      ticket: ticketId,
      sender: req.user._id,
      content: content.trim(),
      isInternal: Boolean(isInternal && req.user.role !== 'customer')
    });

    // Auto-update ticket status to 'In Progress' if agent/admin replies and status was New/Assigned
    if ((req.user.role === 'agent' || req.user.role === 'admin') && ['New', 'Assigned'].includes(ticket.status)) {
      const previousStatus = ticket.status;
      ticket.status = 'In Progress';
      if (!ticket.assignedAgent) {
        ticket.assignedAgent = req.user._id;
      }
      await ticket.save();

      if (ticket.customer && previousStatus !== 'In Progress') {
        await createTicketNotification({
          userId: ticket.customer,
          ticket: ticket._id,
          type: 'status',
          message: 'Your complaint is now under review.'
        });
      }
    }

    const populatedMessage = await Message.findById(message._id).populate('sender', 'name email role');

    // Socket.IO real-time emission
    const io = req.app.get('io');
    if (io) {
      io.to(`ticket:${ticketId}`).emit('new_message', populatedMessage);
      io.to('agent_dashboard').emit('message_added', { ticketId, message: populatedMessage });
    }

    res.status(201).json({
      success: true,
      data: populatedMessage
    });
  } catch (error) {
    console.error('[Message Controller Create Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
  }
};

// @desc    Get all messages for a ticket
// @route   GET /api/tickets/:id/messages
// @access  Private
const getTicketMessages = async (req, res) => {
  try {
    const ticketId = req.params.id;

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    if (req.user.role === 'customer' && ticket.customer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Customers should not see internal agent notes
    const query = { ticket: ticketId };
    if (req.user.role === 'customer') {
      query.isInternal = false;
    }

    const messages = await Message.find(query)
      .populate('sender', 'name email role')
      .sort({ createdAt: 1 });

    res.json({
      success: true,
      count: messages.length,
      data: messages
    });
  } catch (error) {
    console.error('[Message Controller Get Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
  }
};

module.exports = {
  createMessage,
  getTicketMessages
};
