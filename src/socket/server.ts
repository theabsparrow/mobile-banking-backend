import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';

let io: Server;

export const initializeSocket = (httpServer: HttpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: 'http://localhost:3000',
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Option 1: Join room using handshake query parameter
    const userId = socket.handshake.query.userId as string;
    if (userId) {
      socket.join(userId);
      console.log(`Socket ${socket.id} auto-joined room ${userId}`);
    }

    // Option 2: Join room using dynamic event
    socket.on('join', (room: string) => {
      socket.join(room);
      console.log(`Socket ${socket.id} joined room: ${room}`);
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO has not been initialized');
  }
  return io;
};
