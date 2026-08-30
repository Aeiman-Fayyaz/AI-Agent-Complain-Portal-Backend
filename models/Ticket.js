const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema(
  {
    ticketNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    assignedAgent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    subject: {
      type: String,
      required: [true, 'Please provide a subject'],
      trim: true
    },
    description: {
      type: String,
      required: [true, 'Please provide a description'],
      trim: true
    },
    category: {
      type: String,
      enum: ['Billing', 'Technical', 'Account', 'Feature Request', 'General'],
      default: 'General'
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Critical'],
      default: 'Medium'
    },
    sentiment: {
      type: String,
      enum: ['Positive', 'Neutral', 'Frustrated', 'Angry', 'Negative', 'Urgent'],
      default: 'Neutral'
    },
    aiSummary: {
      type: String,
      default: ''
    },
    aiSuggestions: {
      category: { type: String, default: 'General' },
      priority: { type: String, default: 'Medium' },
      summary: { type: String, default: '' },
      sentiment: { type: String, default: 'Neutral' }
    },
    isAiApproved: {
      type: Boolean,
      default: false
    },
    status: {
      type: String,
      enum: ['New', 'Assigned', 'In Progress', 'Resolved'],
      default: 'New'
    },
    resolutionNote: {
      type: String,
      default: ''
    },
    resolvedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Ticket', ticketSchema);
