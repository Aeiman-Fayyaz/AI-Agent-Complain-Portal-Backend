const dotenv = require('dotenv');
dotenv.config();

const mongoose = require('mongoose');
const User = require('./models/User');
const Ticket = require('./models/Ticket');
const Message = require('./models/Message');

const seedData = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ai_support_tickets';
    await mongoose.connect(mongoUri);
    console.log('[Seed Script] Connected to MongoDB database...');

    // Clear existing collections
    await User.deleteMany({});
    await Ticket.deleteMany({});
    await Message.deleteMany({});

    console.log('[Seed Script] Cleared existing Users, Tickets, and Messages.');

    // Create Demo Users
    const customer = await User.create({
      name: 'Alex Johnson (Customer)',
      email: 'customer@demo.com',
      password: 'password123',
      role: 'customer'
    });

    const agent = await User.create({
      name: 'Sarah Connor (Support Agent)',
      email: 'agent@demo.com',
      password: 'password123',
      role: 'agent'
    });

    const admin = await User.create({
      name: 'Michael Scott (Admin)',
      email: 'admin@demo.com',
      password: 'password123',
      role: 'admin'
    });

    console.log('[Seed Script] Created Demo Users:');
    console.log(' - Customer: customer@demo.com / password123');
    console.log(' - Agent:    agent@demo.com / password123');
    console.log(' - Admin:    admin@demo.com / password123');

    // Create Initial Sample Tickets
    const ticket1 = await Ticket.create({
      ticketNumber: 'TCK-1001',
      customer: customer._id,
      assignedAgent: agent._id,
      subject: 'I was charged twice for the same order and need one payment refunded.',
      description: 'Checked my bank statement this morning and noticed order #88493 was billed $149.99 twice at 09:15 AM. Please refund the duplicate payment.',
      category: 'Billing',
      priority: 'High',
      aiSummary: 'Possible duplicate payment reported by customer on order #88493.',
      aiSuggestions: {
        category: 'Billing',
        priority: 'High',
        summary: 'Possible duplicate payment reported by customer on order #88493.'
      },
      isAiApproved: true,
      status: 'In Progress',
      resolutionNote: ''
    });

    const ticket2 = await Ticket.create({
      ticketNumber: 'TCK-1002',
      customer: customer._id,
      assignedAgent: null,
      subject: 'Unable to access dashboard after password reset.',
      description: 'I reset my password 10 minutes ago, but the login form keeps showing invalid token error when submitting from Chrome browser.',
      category: 'Account',
      priority: 'Medium',
      aiSummary: 'Authentication error encountered following password reset.',
      aiSuggestions: {
        category: 'Account',
        priority: 'Medium',
        summary: 'Authentication error encountered following password reset.'
      },
      isAiApproved: false,
      status: 'New',
      resolutionNote: ''
    });

    const ticket3 = await Ticket.create({
      ticketNumber: 'TCK-1003',
      customer: customer._id,
      assignedAgent: agent._id,
      subject: 'Dark mode toggle is missing in user settings.',
      description: 'Would love to see a native dark theme option added to the web portal navigation bar.',
      category: 'Feature Request',
      priority: 'Low',
      aiSummary: 'Feature request for dark mode theme option in UI.',
      aiSuggestions: {
        category: 'Feature Request',
        priority: 'Low',
        summary: 'Feature request for dark mode theme option in UI.'
      },
      isAiApproved: true,
      status: 'Resolved',
      resolutionNote: 'Feature request recorded in backlog board (JIRA-4029). Customer informed.'
    });

    // Create Sample Messages for Ticket 1
    await Message.create([
      {
        ticket: ticket1._id,
        sender: customer._id,
        content: 'Hi! Here is a screenshot reference of the duplicate charge. Transaction IDs: TXN-9941 and TXN-9942.'
      },
      {
        ticket: ticket1._id,
        sender: agent._id,
        content: 'Hello Alex, thank you for reaching out! I am investigating the duplicate transaction with our billing department right now.'
      }
    ]);

    console.log('[Seed Script] Sample tickets and conversation messages created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('[Seed Script Error]', error);
    process.exit(1);
  }
};

seedData();
