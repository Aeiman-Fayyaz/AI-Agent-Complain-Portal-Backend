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
      criticalPriorityTickets,
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
      Ticket.countDocuments({ ...filter, priority: 'Critical' }),
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
        criticalPriorityTickets,
        categories: categoriesFormatted
      }
    });
  } catch (error) {
    console.error('[Dashboard Controller Stats Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
  }
};

const getDashboardAnalytics = async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === 'customer') {
      filter.customer = req.user._id;
    }

    const period = (req.query.period || 'month').toString().toLowerCase();

    const [totalComplaints, resolvedComplaints, pendingComplaints, criticalComplaints, categoryStats, avgResolutionData, trendStats] = await Promise.all([
      Ticket.countDocuments(filter),
      Ticket.countDocuments({ ...filter, status: 'Resolved' }),
      Ticket.countDocuments({ ...filter, status: { $in: ['New', 'Assigned', 'In Progress'] } }),
      Ticket.countDocuments({ ...filter, priority: 'Critical' }),
      Ticket.aggregate([
        { $match: filter },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } }
      ]),
      Ticket.aggregate([
        { $match: { ...filter, status: 'Resolved', resolvedAt: { $ne: null } } },
        {
          $project: {
            resolutionMs: {
              $subtract: ['$resolvedAt', '$createdAt']
            }
          }
        },
        {
          $group: {
            _id: null,
            avgResolutionMs: { $avg: '$resolutionMs' }
          }
        }
      ]),
      Ticket.aggregate([
        { $match: filter },
        {
          $project: {
            dateValue: {
              $switch: {
                branches: [
                  {
                    case: { $eq: [period, 'day'] },
                    then: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
                  },
                  {
                    case: { $eq: [period, 'week'] },
                    then: { $dateToString: { format: '%Y-%U', date: '$createdAt' } }
                  },
                  {
                    case: { $eq: [period, 'month'] },
                    then: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }
                  }
                ],
                default: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }
              }
            }
          }
        },
        {
          $group: {
            _id: '$dateValue',
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);

    const complaintsByCategory = categoryStats.reduce((acc, item) => {
      if (item._id) acc[item._id] = item.count;
      return acc;
    }, {});

    const complaintsOverTime = trendStats.map((item) => ({
      label: item._id,
      value: item.count
    }));

    const averageResolutionTime = avgResolutionData.length > 0 && avgResolutionData[0].avgResolutionMs
      ? Number((avgResolutionData[0].avgResolutionMs / (1000 * 60 * 60)))
      : 0;

    res.json({
      success: true,
      data: {
        totalComplaints,
        resolvedComplaints,
        pendingComplaints,
        criticalComplaints,
        complaintsByCategory,
        complaintsOverTime,
        averageResolutionTime
      }
    });
  } catch (error) {
    console.error('[Dashboard Controller Analytics Error]', error);
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
  }
};

module.exports = {
  getDashboardStats,
  getDashboardAnalytics
};
