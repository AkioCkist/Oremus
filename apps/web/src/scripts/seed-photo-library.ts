import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Real photos per topic from Wikimedia Commons. The list itself is built by seed-photos-build.ts. */
export type LibraryPhoto = { id: number; url: string; title: string; author: string; license: string; source: string };

export const SEED_USER_AGENT = 'OremusSeed/1.0 (sample data for a student project)';

const file = fileURLToPath(new URL('./seed-photo-library.json', import.meta.url));
export const PHOTO_LIBRARY: Record<string, LibraryPhoto[]> = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};

const byId = new Map(Object.values(PHOTO_LIBRARY).flat().map((photo) => [photo.id, photo]));
export const libraryPhoto = (id: number) => byId.get(id);
