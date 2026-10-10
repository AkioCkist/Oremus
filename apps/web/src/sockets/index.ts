import type { Server as HttpServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { env } from '../config/env.js';
import { Conversation } from '../models/index.js';
import { setNotifier } from '../services/notification.service.js';
import { areFriends } from '../services/friendship.service.js';

export async function createSocketServer(server: HttpServer) {
  const io = new Server(server, { cors: { origin: env.APP_ORIGIN, credentials: true } });
  const pub = createClient({ url: env.REDIS_URL }), sub = pub.duplicate(); await Promise.all([pub.connect(), sub.connect()]); io.adapter(createAdapter(pub, sub));
  io.use(async (socket, next) => {
    try {
      const raw = (socket.handshake.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith('access_token='))?.slice('access_token='.length);
      if (!raw) throw new Error('Missing access token');
      const claims = jwt.verify(raw, env.JWT_ACCESS_SECRET) as jwt.JwtPayload;
      socket.data.userId = claims.sub; next();
    } catch { next(new Error('Authentication required')); }
  });
  io.on('connection', async (socket) => {
    const userId = String(socket.data.userId); socket.join(`user:${userId}`);
    const conversations = await Conversation.find({ memberIds: userId }).select('_id memberIds').lean();
    for (const item of conversations) {
      const otherId = item.memberIds.map(String).find((memberId: string) => memberId !== userId);
      if (otherId && await areFriends(userId, otherId)) socket.join(`conversation:${item._id}`);
    }
    socket.on('conversation:join', async (conversationId: string) => {
      const conversation: any = await Conversation.findOne({ _id: conversationId, memberIds: userId }).select('memberIds').lean();
      const otherId = conversation?.memberIds.map(String).find((memberId: string) => memberId !== userId);
      if (otherId && await areFriends(userId, otherId)) socket.join(`conversation:${conversationId}`);
    });
  });
  setNotifier((userId, event, payload) => io.to(`user:${userId}`).emit(event, payload));
  return io;
}
