import type { Server as HttpServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { env } from '../config/env.js';
import { redis } from '../config/database.js';
import { User } from '../models/index.js';
import { setNotifier, setSessionTerminator } from '../services/notification.service.js';
import { accountRestriction } from '../services/permissions.js';

export async function createSocketServer(server: HttpServer) {
  const io = new Server(server, { cors: { origin: env.APP_ORIGIN, credentials: true } });
  const pub = createClient({ url: env.REDIS_URL }), sub = pub.duplicate(); await Promise.all([pub.connect(), sub.connect()]); io.adapter(createAdapter(pub, sub));
  io.use(async (socket, next) => {
    try {
      const raw = (socket.handshake.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith('access_token='))?.slice('access_token='.length);
      if (!raw) throw new Error('Missing access token');
      const claims = jwt.verify(raw, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
      if (claims.type !== 'access' || !claims.sub || !claims.jti || await redis.exists(`deny:${claims.jti}`)) throw new Error('Invalid access token');
      const user = await User.findOne({ _id: claims.sub, deletedAt: null }).select('status suspendedUntil').lean();
      if (!user || accountRestriction(user as any)) throw new Error('Account unavailable');
      socket.data.userId = claims.sub; next();
    } catch { next(new Error('Authentication required')); }
  });
  // All realtime events are delivered through the authenticated user's room.
  // Conversation rooms were never used for emitting, but joining them caused
  // one friendship lookup per conversation on every socket connection.
  io.on('connection', (socket) => {
    const userId = String(socket.data.userId); socket.join(`user:${userId}`);
  });
  setNotifier((userId, event, payload) => io.to(`user:${userId}`).emit(event, payload));
  setSessionTerminator((userId) => io.in(`user:${userId}`).disconnectSockets(true));
  return io;
}
