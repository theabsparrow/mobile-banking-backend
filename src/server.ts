import type { Server } from 'http';
import http from 'http';
import mongoose from 'mongoose';

import { app } from './app.js';
import config from './config/index.js';
import { prisma } from './config/prismaClient.js';
import { connectRedis, disconnectRedis } from './redis/redis.client.js';
import { initializeSocket } from './socket/server.js';

let server: Server;

async function main() {
  try {
    await mongoose.connect(config.mongodb_database_url as string);
    await prisma.$connect();
    await connectRedis();

    server = http.createServer(app);
    initializeSocket(server);

    server = app.listen(config.port, () => {
      console.log(`server is running on port ${config.port as string} 😎`);
    });
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
}

main();

process.on('unhandledRejection', async () => {
  console.log(`unhandled rejection detected 😊`);
  await prisma.$disconnect();
  await mongoose.disconnect();
  await disconnectRedis();
  if (server) {
    server.close(() => {
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
});

process.on('uncaughtException', () => {
  console.log(`uncaughtException detected 😊`);
  process.exit(1);
});
