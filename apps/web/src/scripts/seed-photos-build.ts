import fs from 'node:fs/promises';
import { PHOTO_LIBRARY, SEED_USER_AGENT, type LibraryPhoto } from './seed-photo-library.js';

/**
 * Rebuilds `seed-photo-library.json`: real, freely licensed photos per topic from Wikimedia Commons, so every
 * generated post can have its own image. The list is committed, which keeps the seed deterministic and keeps the
 * author and license of every photo on record. Only re-run this to change the library: `npm run seed:photos`.
 */

const API = 'https://commons.wikimedia.org/w/api.php';
const TARGET_PER_TOPIC = 320;
const THUMB_WIDTH = 1280;
const PAGE = 50;

/** Specific subjects, so a photo matches the captions of its topic. */
const QUERIES: Record<string, string[]> = {
  travel: ['street market asia', 'old town street', 'mountain village', 'railway station train', 'lanterns street', 'harbor boats', 'temple architecture asia', 'scenic road landscape', 'rice terraces', 'historic city square'],
  food: ['noodle soup', 'street food', 'grilled fish dish', 'vegetables market', 'rice dish', 'salad plate', 'dumplings', 'cooking pan kitchen', 'spices', 'fruit market'],
  coffee: ['cup of coffee', 'espresso', 'coffee beans', 'cafe interior', 'latte', 'coffee roasting', 'barista', 'moka pot', 'coffee shop'],
  pets: ['dog portrait', 'cat portrait', 'puppy', 'kitten', 'domestic cat', 'golden retriever', 'dog running', 'rabbit pet', 'cat sleeping'],
  nature: ['forest path', 'hiking trail mountain', 'waterfall', 'mountain lake', 'alpine meadow', 'mountain summit', 'national park landscape', 'valley sunrise', 'forest stream'],
  photography: ['street photography city', 'city night lights', 'photographer camera', 'reflection building', 'long exposure', 'rangefinder camera', 'night skyline', 'shadow architecture', 'lens camera'],
  art: ['street art mural', 'watercolor painting', 'pottery ceramic', 'sculpture contemporary', 'graffiti wall', 'art gallery', 'glass art', 'artist studio', 'handicraft workshop'],
  music: ['guitar player', 'concert stage', 'piano keys', 'violin', 'jazz musician', 'drum kit', 'vinyl record', 'orchestra', 'saxophone', 'music festival'],
  books: ['library shelves', 'old books', 'bookshop', 'reading room', 'open book', 'bookcase', 'library interior', 'book stack'],
  study: ['university library study', 'classroom', 'lecture hall', 'university campus', 'notebook pen', 'blackboard', 'school students', 'calligraphy writing', 'desk study'],
  ai: ['computer server room', 'data center', 'robot', 'circuit board', 'computer keyboard', 'microchip', 'supercomputer', 'computer programming', 'electronics laboratory'],
  gaming: ['video game console', 'arcade machine', 'board game', 'gamepad controller', 'chess pieces', 'esports', 'retro computer game', 'gaming computer', 'playing cards table', 'dice', 'chessboard', 'pinball machine', 'mahjong', 'computer mouse keyboard', 'gaming convention', 'cosplay convention', 'go game stones', 'game fair', 'domino tiles', 'computer screen'],
  running: ['marathon runners', 'running race', 'trail running', 'athletics track', 'half marathon', 'sprint athlete', 'runner road', 'city marathon'],
  sport: ['football match', 'gym weights', 'basketball game', 'volleyball', 'tennis player', 'rowing sport', 'cycling race', 'badminton', 'swimming pool sport', 'climbing wall'],
  baking: ['bread loaf', 'croissant', 'pastry bakery', 'cake', 'tart fruit', 'cookies', 'bakery shop', 'baguette', 'muffin'],
  fashion: ['textile fabric pattern', 'sewing machine', 'tailor workshop', 'embroidery', 'shoes leather', 'clothing shop', 'weaving loom', 'hat market', 'traditional dress', 'handbag leather'],
  ocean: ['coral reef', 'scuba diver', 'sea turtle', 'tropical beach', 'ocean waves', 'underwater fish', 'lighthouse sea', 'sea cliffs', 'sailboat sea', 'jellyfish'],
  film: ['movie theater', 'cinema building', 'film projector', 'film camera vintage', 'cinema interior', 'film set', 'movie clapperboard', 'film festival', 'neon cinema sign'],
  work: ['modern office', 'coworking space', 'office desk', 'business meeting', 'laptop computer', 'office building glass', 'conference room', 'open plan office', 'workshop startup'],
  city: ['bicycle city', 'cycling lane', 'bicycle street', 'city tram', 'urban street', 'bridge city', 'bicycle parking', 'pedestrian street', 'skyscrapers', 'city park']
};

/** Photos only, nothing that would look wrong or be unsafe in a demo feed. */
const BLOCKED = /\b(map|diagram|chart|logo|plan|coat of arms|stamp|poster|flag|scan|nude|naked|topless|erotic|bikini|lingerie|sex|corpse|dead|blood|war|weapon|gun|rifle|military|grave|cemetery|memorial|skull|execution|protest|church|cathedral|mosque)\b/i;
const stripTags = (value: string) => value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

type Page = { pageid: number; title: string; imageinfo?: Array<{ mime: string; width: number; height: number; thumburl: string; descriptionurl: string; extmetadata?: Record<string, { value: string }> }> };

async function search(query: string, offset: number): Promise<{ pages: Page[]; next: number | null }> {
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', generator: 'search', gsrnamespace: '6', gsrlimit: String(PAGE), gsroffset: String(offset),
    gsrsearch: `${query} filetype:bitmap hastemplate:"Quality image"`, prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: String(THUMB_WIDTH),
    iiextmetadatafilter: 'Artist|LicenseShortName'
  });
  let response = await fetch(`${API}?${params}`, { headers: { 'user-agent': SEED_USER_AGENT } });
  // Commons rate-limits anonymous clients. Wait as long as it asks and carry on.
  for (let attempt = 1; response.status === 429 && attempt <= 10; attempt += 1) {
    const wait = Math.max(Number(response.headers.get('retry-after')) || 0, attempt * 15);
    console.log(`  rate limited, waiting ${wait}s`);
    await new Promise((resolve) => setTimeout(resolve, wait * 1000));
    response = await fetch(`${API}?${params}`, { headers: { 'user-agent': SEED_USER_AGENT } });
  }
  if (!response.ok) throw new Error(`${response.status} for "${query}"`);
  const data = await response.json() as { query?: { pages?: Page[] }; continue?: { gsroffset?: number } };
  return { pages: data.query?.pages || [], next: data.continue?.gsroffset ?? null };
}

const usable = (page: Page): LibraryPhoto | null => {
  const info = page.imageinfo?.[0];
  if (!info || info.mime !== 'image/jpeg' || info.width < THUMB_WIDTH || BLOCKED.test(page.title)) return null;
  const ratio = info.width / info.height;
  if (ratio < 0.65 || ratio > 1.8) return null;
  return {
    id: page.pageid, url: info.thumburl, title: page.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, ''),
    author: stripTags(info.extmetadata?.Artist?.value || 'Unknown').slice(0, 120), license: info.extmetadata?.LicenseShortName?.value || '', source: info.descriptionurl
  };
};

async function build() {
  // `npm run seed:photos -- gaming film` tops up those topics and leaves the rest of the library alone.
  const only = process.argv.slice(2);
  const library: Record<string, LibraryPhoto[]> = only.length ? { ...PHOTO_LIBRARY } : {};
  const seen = new Set<number>(Object.values(library).flat().map((photo) => photo.id));
  for (const [topic, queries] of Object.entries(QUERIES)) {
    if (only.length && !only.includes(topic)) continue;
    const photos: LibraryPhoto[] = only.length ? [...(library[topic] || [])] : [];
    // One pass per query keeps the mix varied before any single subject fills the topic.
    const offsets = new Map<string, number | null>(queries.map((query) => [query, 0]));
    while (photos.length < TARGET_PER_TOPIC && [...offsets.values()].some((offset) => offset !== null)) {
      for (const query of queries) {
        const offset = offsets.get(query);
        if (offset === null || offset === undefined || photos.length >= TARGET_PER_TOPIC) continue;
        const { pages, next } = await search(query, offset);
        offsets.set(query, next !== null && next < 600 ? next : null);
        for (const page of pages) {
          const photo = usable(page);
          if (photo && !seen.has(photo.id) && photos.length < TARGET_PER_TOPIC) { seen.add(photo.id); photos.push(photo); }
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    library[topic] = photos;
    console.log(`${topic}: ${photos.length}`);
    // Saved after every topic, so a long run that gets interrupted still leaves something usable.
    await fs.writeFile(new URL('./seed-photo-library.json', import.meta.url), `${JSON.stringify(library)}\n`);
  }
  console.log(`Saved ${seen.size} photos.`);
}

if (process.argv[1]?.includes('seed-photos-build')) void build();
