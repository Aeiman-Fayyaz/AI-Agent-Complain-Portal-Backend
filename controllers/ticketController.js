const Ticket = require('../models/Ticket');
const Message = require('../models/Message');
const User = require('../models/User');
const { triageTicket, detectDuplicateComplaint } = require('../services/aiService');
const { createTicketNotification } = require('../services/notificationService');

// Helper to generate next unique Ticket Number (e.g., TCK-1001)
const generateTicketNumber = async () => {
  const count = await Ticket.countDocuments();
  const nextNum = 1000 + count + 1;
  return `TCK-${nextNum}`;
};

const checkDuplicateTicket = async (req, res) => {
  try {
    const { subject, description } = req.body;

    if (!subject || !description || !subject.trim() || !description.trim()) {
      return res.status(400).json({ success: false, message: 'Please provide both subject and description' });
    }

    const tickets = await Ticket.find({ customer: req.user._id })
      .select('ticketNumber subject description category status aiSummary createdAt')
      .sort({ createdAt: -1 })
      .limit(30);

    let bestMatch = null;

    for (const ticket of tickets) {
      const currentText = `${subject} ${description}`;
      const historicalText = `${ticket.subject || ''} ${ticket.description || ''} ${ticket.aiSummary || ''}`;
      const result = await detectDuplicateComplaint(subject, description, historicalText);

      if (result.isDuplicate && (!bestMatch || result.score > bestMatch.score)) {
        bestMatch = {
          ticketNumber: ticket.ticketNumber,
          status: ticket.status,
          category: ticket.category,
          summary: ticket.aiSummary || ticket.subject,
          score: result.score,
          reason: result.reason
        };
      }
    }

    res.json({
      success: true,
      data: {
        isDuplicate: Boolean(bestMatch),
        match: bestMatch,
        threshold: 0.58
      }
    });
  } catch (error) {
    console.error('[Ticket Controller Duplicate Check Error]', error);
    res.json({
      success: true,
      data: {
        isDuplicate: false,
        match: null,
        threshold: 0.58
      }
    });
  }
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
      sentiment: aiResult.sentiment || 'Neutral',
      aiSummary: aiResult.summary,
      aiSuggestions: {
        category: aiResult.category,
        priority: aiResult.priority,
        summary: aiResult.summary,
        sentiment: aiResult.sentiment || 'Neutral'
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
    const { status, category, priority, aiSummary, assignedAgentId, resolutionNote, isAiApproved, sentiment } = req.body;

    let ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    if (req.user.role === 'customer') {
      return res.status(403).json({ success: false, message: 'Customers are not authorized to update ticket properties' });
    }

    const previousStatus = ticket.status;
    const previousAssignedAgent = ticket.assignedAgent ? ticket.assignedAgent.toString() : null;
    const previousResolvedStatus = !!ticket.resolvedAt;

    if (sentiment !== undefined) {
      const validSentiments = ['Positive', 'Neutral', 'Frustrated', 'Angry', 'Negative', 'Urgent'];
      ticket.sentiment = validSentiments.includes(sentiment) ? sentiment : ticket.sentiment;
    }

    if (status === 'Resolved') {
      const noteToValidate = resolutionNote !== undefined ? resolutionNote : ticket.resolutionNote;
      if (!noteToValidate || !noteToValidate.trim()) {
        return res.status(400).json({
          success: false,
          message: 'A resolution note is required before marking a ticket as Resolved'
        });
      }
    }

    if (category) ticket.category = category;
    if (priority) ticket.priority = priority;
    if (aiSummary !== undefined) ticket.aiSummary = aiSummary;
    if (isAiApproved !== undefined) ticket.isAiApproved = isAiApproved;
    if (resolutionNote !== undefined) ticket.resolutionNote = resolutionNote;

    if (assignedAgentId) {
      const agentUser = await User.findById(assignedAgentId);
      if (agentUser && (agentUser.role === 'agent' || agentUser.role === 'admin')) {
        ticket.assignedAgent = agentUser._id;
        if (ticket.status === 'New') {
          ticket.status = 'Assigned';
        }
      }
    } else if (req.user.role === 'agent' && !ticket.assignedAgent) {
      ticket.assignedAgent = req.user._id;
      if (ticket.status === 'New') {
        ticket.status = 'Assigned';
      }
    }

    if (status) {
      ticket.status = status;
      if (status === 'Resolved') {
        ticket.resolvedAt = ticket.resolvedAt || new Date();
      } else if (status !== 'Resolved') {
        ticket.resolvedAt = null;
      }
    }

    await ticket.save();

    const ticketOwnerId = ticket.customer ? ticket.customer.toString() : null;
    if (ticketOwnerId) {
      if (assignedAgentId || (req.user.role === 'agent' && !previousAssignedAgent && ticket.assignedAgent && ticket.assignedAgent.toString() !== previousAssignedAgent)) {
        await createTicketNotification({
          userId: ticketOwnerId,
          ticket: ticket._id,
          type: 'assignment',
          message: 'Your complaint has been assigned to an agent.'
        });
      }

      if (status && status === 'In Progress' && previousStatus !== 'In Progress') {
        await createTicketNotification({
          userId: ticketOwnerId,
          ticket: ticket._id,
          type: 'status',
          message: 'Your complaint is now under review.'
        });
      }

      if (status && status === 'Resolved' && !previousResolvedStatus) {
        await createTicketNotification({
          userId: ticketOwnerId,
          ticket: ticket._id,
          type: 'resolved',
          message: 'Your complaint has been resolved.'
        });
      }
    }

    const updatedTicket = await Ticket.findById(ticket._id)
      .populate('customer', 'name email role')
      .populate('assignedAgent', 'name email role');

    const io = req.app.get('io');
    if (io) {
      io.to(`ticket:${ticket._id}`).emit('ticket_updated', updatedTicket);
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
  checkDuplicateTicket,
  createTicket,
  getTickets,
  getTicketById,
  updateTicket
};
