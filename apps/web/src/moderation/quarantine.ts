import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../config/logger.js';

/**
 * Files of removed content leave the public /uploads URL at once but stay on disk for the appeal window.
 * express.static ignores dotfiles, so nothing inside `.quarantine` can be fetched through /uploads.
 */
const UPLOADS = path.resolve(process.cwd(), 'uploads');
export const QUARANTINE = path.join(UPLOADS, '.quarantine');
export const QUARANTINE_DAYS = 30;

const localName = (url: string) => (url.startsWith('/uploads/') ? path.basename(url) : '');
const missing = (error: any) => error?.code === 'ENOENT';

async function move(from: string, to: string): Promise<void> {
  try { await fs.rename(from, to); }
  catch (error) { if (!missing(error)) logger.error({ error, from }, 'Could not move moderated file'); }
}

export async function quarantineFiles(urls: string[]): Promise<void> {
  const names = urls.map(localName).filter(Boolean);
  if (!names.length) return;
  await fs.mkdir(QUARANTINE, { recursive: true });
  await Promise.all(names.map((name) => move(path.join(UPLOADS, name), path.join(QUARANTINE, name))));
}

export async function restoreFiles(urls: string[]): Promise<void> {
  await Promise.all(urls.map(localName).filter(Boolean).map((name) => move(path.join(QUARANTINE, name), path.join(UPLOADS, name))));
}

/** Deletes quarantined files past the appeal window. */
export async function sweepQuarantine(now = Date.now()): Promise<number> {
  const names = await fs.readdir(QUARANTINE).catch((error) => { if (missing(error)) return [] as string[]; throw error; });
  let removed = 0;
  for (const name of names) {
    const file = path.join(QUARANTINE, name);
    const stat = await fs.stat(file).catch(() => null);
    // A rename keeps mtime, so ctime is what records when the file arrived here.
    if (stat && now - stat.ctimeMs > QUARANTINE_DAYS * 86_400_000) { await fs.rm(file, { force: true }); removed++; }
  }
  return removed;
}

export const quarantinePath = (name: string) => path.join(QUARANTINE, path.basename(name));
