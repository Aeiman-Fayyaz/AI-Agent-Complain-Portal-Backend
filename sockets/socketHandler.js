const socketHandler = (io) => {
  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    // Join specific ticket conversation room
    socket.on('join_ticket', (ticketId) => {
      if (ticketId) {
        const roomName = `ticket:${ticketId}`;
        socket.join(roomName);
        console.log(`[Socket.IO] Socket ${socket.id} joined room ${roomName}`);
      }
    });

    // Leave ticket room
    socket.on('leave_ticket', (ticketId) => {
      if (ticketId) {
        const roomName = `ticket:${ticketId}`;
        socket.leave(roomName);
        console.log(`[Socket.IO] Socket ${socket.id} left room ${roomName}`);
      }
    });

    // Join agent dashboard broadcast room
    socket.on('join_agent_dashboard', () => {
      socket.join('agent_dashboard');
      console.log(`[Socket.IO] Socket ${socket.id} joined agent_dashboard room`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });
};

module.exports = socketHandler;
