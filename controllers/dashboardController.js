const Ticket = require('../models/Ticket');

// @desc    Get system & agent dashboard statistics calculated from database
// @route   GET /api/dashboard/stats
// @access  Private
const getDashboardStats = async (req, res) => {
  try {
    const filter = {};

    // If logged in as customer, limit stats to their own tickets
    if (req.user.role === 'customer') {
      filter.customer = req.user._id;
    }

    const [
      totalTickets,
      newTickets,
      assignedTickets,
      inProgressTickets,
      resolvedTickets,
      highPriorityTickets,
      mediumPriorityTickets,
      lowPriorityTickets,
      categoryStats
    ] = await Promise.all([
      Ticket.countDocuments(filter),
      Ticket.countDocuments({ ...filter, status: 'New' }),
      Ticket.countDocuments({ ...filter, status: 'Assigned' }),
      Ticket.countDocuments({ ...filter, status: 'In Progress' }),
      Ticket.countDocuments({ ...filter, status: 'Resolved' }),
      Ticket.countDocuments({ ...filter, priority: 'High' }),
      Ticket.countDocuments({ ...filter, priority: 'Medium' }),
      Ticket.countDocuments({ ...filter, priority: 'Low' }),
      Ticket.aggregate([
        { $match: filter },
        { $group: { _id: '$category', count: { $sum: 1 } } }
      ])
    ]);

    const categoriesFormatted = {};
    categoryStats.forEach(item => {
      if (item._id) categoriesFormatted[item._id] = item.count;
    });

    res.json({
      success: true,
      data: {
        totalTickets,
        newTickets,
        assignedTickets,
        inProgressTickets,
        resolvedTickets,
        highPriorityTickets,
        mediumPriorityTickets,
        lowPriorityTickets,
        categories: categoriesFormatted
      }
    });
  } catch (error) {
    console.error('[Dashboard Controller Stats Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
  }
};

module.exports = {
  getDashboardStats
};
