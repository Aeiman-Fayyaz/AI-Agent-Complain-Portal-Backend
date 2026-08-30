const Notification = require('../models/Notification');

const createTicketNotification = async ({ userId, ticket, type, message }) => {
  if (!userId || !ticket) {
    return null;
  }

  const safeTicketId = typeof ticket === 'object' ? ticket._id || ticket.id : ticket;
  const safeUserId = typeof userId === 'object' ? userId._id || userId.id : userId;

  if (!safeTicketId || !safeUserId) {
    return null;
  }

  try {
    const notification = await Notification.create({
      user: safeUserId,
      ticket: safeTicketId,
      type,
      message
    });

    return notification;
  } catch (error) {
    if (error && error.code === 11000) {
      return await Notification.findOne({ user: safeUserId, ticket: safeTicketId, type });
    }
    console.error('[Notification Service Error]', error.message);
    return null;
  }
};

module.exports = {
  createTicketNotification
};
