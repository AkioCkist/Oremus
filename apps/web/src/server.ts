import http from 'node:http';
import { createApp } from './app.js';
import { connectInfrastructure, disconnectInfrastructure } from './config/database.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { createSocketServer } from './sockets/index.js';

async function start() {
  await connectInfrastructure();
  logger.info('MongoDB and Redis connected');
  const app = createApp();
  const server = http.createServer(app);
  const io = await createSocketServer(server);
  app.set('io', io);
  server.listen(env.WEB_PORT, () => logger.info({ port: env.WEB_PORT }, 'Oremus web is ready'));
  const shutdown = async () => { logger.info('Shutting down'); io.close(); server.close(); await disconnectInfrastructure(); process.exit(0); };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}

start().catch((error) => { logger.fatal({ error }, 'Startup failed'); process.exit(1); });

