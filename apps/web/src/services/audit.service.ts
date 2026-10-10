import { AuditLog } from '../models/index.js';

export async function audit(action: string, actorId?: string, targetType?: string, targetId?: string, metadata: Record<string, unknown> = {}, ip?: string): Promise<void> {
  await AuditLog.create({ action, actorId: actorId || null, targetType, targetId, metadata, ip });
}

