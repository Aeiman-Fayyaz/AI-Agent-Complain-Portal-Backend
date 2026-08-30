const Ticket = require('../models/Ticket');
const Message = require('../models/Message');
const User = require('../models/User');
const { triageTicket } = require('../services/aiService');

// Helper to generate next unique Ticket Number (e.g., TCK-1001)
const generateTicketNumber = async () => {
  const count = await Ticket.countDocuments();
  const nextNum = 1000 + count + 1;
  return `TCK-${nextNum}`;
};

// @desc    Create a new support ticket (Customer)
// @route   POST /api/tickets
// @access  Private (Customer)
const createTicket = async (req, res) => {
  try {
    const { subject, description, category } = req.body;

    if (!subject || !description) {
      return res.status(400).json({ success: false, message: 'Please provide both subject and description' });
    }

    const ticketNumber = await generateTicketNumber();

    // Trigger AI Triage Analysis
    const aiResult = await triageTicket(subject, description);

    const finalCategory = category && ['Billing', 'Technical', 'Account', 'Feature Request', 'General'].includes(category)
      ? category
      : aiResult.category;

    const ticket = await Ticket.create({
      ticketNumber,
      customer: req.user._id,
      subject,
      description,
      category: finalCategory,
      priority: aiResult.priority,
      aiSummary: aiResult.summary,
      aiSuggestions: {
        category: aiResult.category,
        priority: aiResult.priority,
        summary: aiResult.summary
      },
      isAiApproved: false,
      status: 'New'
    });

    const populatedTicket = await Ticket.findById(ticket._id).populate('customer', 'name email role');

    // Notify connected Socket.IO clients (e.g. agents)
    const io = req.app.get('io');
    if (io) {
      io.to('agent_dashboard').emit('new_ticket_created', populatedTicket);
    }

    res.status(201).json({
      success: true,
      message: 'Ticket created successfully and analyzed by AI Triage',
      data: populatedTicket
    });
  } catch (error) {
    console.error('[Ticket Controller Create Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
  }
};

// @desc    Get all tickets (Filtered by role: Customer sees own, Agent/Admin sees all/assigned)
// @route   GET /api/tickets
// @access  Private
const getTickets = async (req, res) => {
  try {
    const { status, priority, category, search, assignedToMe } = req.query;

    const filter = {};

    // Role-based scoping
    if (req.user.role === 'customer') {
      filter.customer = req.user._id;
    } else if (req.user.role === 'agent' && assignedToMe === 'true') {
      filter.assignedAgent = req.user._id;
    }

    // Additional filters
    if (status && status !== 'All') {
      filter.status = status;
    }
    if (priority && priority !== 'All') {
      filter.priority = priority;
    }
    if (category && category !== 'All') {
      filter.category = category;
    }
    if (search) {
      filter.$or = [
        { ticketNumber: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const tickets = await Ticket.find(filter)
      .populate('customer', 'name email role')
      .populate('assignedAgent', 'name email role')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: tickets.length,
      data: tickets
    });
  } catch (error) {
    console.error('[Ticket Controller Get Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
  }
};

// @desc    Get single ticket details
// @route   GET /api/tickets/:id
// @access  Private
const getTicketById = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate('customer', 'name email role')
      .populate('assignedAgent', 'name email role');

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    // Check customer access restriction
    if (req.user.role === 'customer' && ticket.customer._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied: You can only view your own tickets' });
    }

    res.json({
      success: true,
      data: ticket
    });
  } catch (error) {
    console.error('[Ticket Controller GetById Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
  }
};

// @desc    Update ticket (Status, AI Triage edit/approval, Assignment, Resolution)
// @route   PATCH /api/tickets/:id
// @access  Private (Agent/Admin)
const updateTicket = async (req, res) => {
  try {
    const { status, category, priority, aiSummary, assignedAgentId, resolutionNote, isAiApproved } = req.body;

    let ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    // Customer security rule: Customers cannot patch ticket status/AI triage directly
    if (req.user.role === 'customer') {
      return res.status(403).json({ success: false, message: 'Customers are not authorized to update ticket properties' });
    }

    // Business rule validation: Cannot resolve without a resolution note
    if (status === 'Resolved') {
      const noteToValidate = resolutionNote !== undefined ? resolutionNote : ticket.resolutionNote;
      if (!noteToValidate || !noteToValidate.trim()) {
        return res.status(400).json({
          success: false,
          message: 'A resolution note is required before marking a ticket as Resolved'
        });
      }
    }

    // Workflow state updates
    if (category) ticket.category = category;
    if (priority) ticket.priority = priority;
    if (aiSummary !== undefined) ticket.aiSummary = aiSummary;
    if (isAiApproved !== undefined) ticket.isAiApproved = isAiApproved;
    if (resolutionNote !== undefined) ticket.resolutionNote = resolutionNote;

    if (assignedAgentId) {
      const agentUser = await User.findById(assignedAgentId);
      if (agentUser && (agentUser.role === 'agent' || agentUser.role === 'admin')) {
        ticket.assignedAgent = agentUser._id;
        // Auto transition New -> Assigned if unassigned
        if (ticket.status === 'New') {
          ticket.status = 'Assigned';
        }
      }
    } else if (req.user.role === 'agent' && !ticket.assignedAgent) {
      // Auto-assign to current acting agent if unassigned
      ticket.assignedAgent = req.user._id;
      if (ticket.status === 'New') {
        ticket.status = 'Assigned';
      }
    }

    if (status) {
      ticket.status = status;
    }

    await ticket.save();

    const updatedTicket = await Ticket.findById(ticket._id)
      .populate('customer', 'name email role')
      .populate('assignedAgent', 'name email role');

    // Socket.IO real-time emission
    const io = req.app.get('io');
    if (io) {
      // Emit to ticket specific room
      io.to(`ticket:${ticket._id}`).emit('ticket_updated', updatedTicket);
      // Emit to agent dashboard
      io.to('agent_dashboard').emit('ticket_updated', updatedTicket);
    }

    res.json({
      success: true,
      message: 'Ticket updated successfully',
      data: updatedTicket
    });
  } catch (error) {
    console.error('[Ticket Controller Update Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
  }
};

module.exports = {
  createTicket,
  getTickets,
  getTicketById,
  updateTicket
};
