import type { HydratedDocument } from 'mongoose';
import type { IUser } from '../models/index.js';

declare global {
  namespace Express {
    interface Request {
      user?: HydratedDocument<IUser>;
      auth?: { sub: string; jti: string };
      requestId?: string;
    }
  }
}

export {};

