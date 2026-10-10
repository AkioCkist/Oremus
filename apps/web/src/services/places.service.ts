import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { cacheGet, cacheSet } from './cache.service.js';

// Place search for check-ins, backed by Photon (OpenStreetMap data, built for search-as-you-type).
// Requests go through the server so results are cached and the browser never talks to third parties.

export type Place = { id: string; name: string; address: string; lat: number; lon: number; kind: string };

const CACHE_SECONDS = 60 * 60 * 24;
const USER_AGENT = 'Oremus/1.0 (social app check-ins)';

function toPlace(feature: any): Place | null {
  const props = feature?.properties || {};
  const [lon, lat] = feature?.geometry?.coordinates || [];
  const name = props.name || props.street || props.city || props.county || props.state || props.country;
  if (!name || typeof lat !== 'number' || typeof lon !== 'number') return null;
  const parts = [props.street && props.street !== name ? `${props.housenumber ? props.housenumber + ' ' : ''}${props.street}` : '', props.district, props.city !== name ? props.city : '', props.state, props.country !== name ? props.country : '']
    .filter(Boolean);
  return { id: `${props.osm_type || 'X'}${props.osm_id || `${lat},${lon}`}`, name, address: [...new Set(parts)].join(', '), lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)), kind: props.osm_value || props.type || 'place' };
}

function dedupe(places: Array<Place | null>): Place[] {
  const seen = new Set<string>();
  return places.filter((place): place is Place => {
    if (!place) return false;
    const key = `${place.name}|${place.address}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

async function photon(path: string, cacheKey: string): Promise<Place[]> {
  const cached = await cacheGet<Place[]>(cacheKey);
  if (cached) return cached;
  let response: Response;
  try {
    response = await fetch(`${env.PLACES_URL}${path}`, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'vi,en' }, signal: AbortSignal.timeout(6000) });
  } catch {
    throw new AppError(503, 'Location search is unavailable right now. Try again in a moment.', 'PLACES_UNAVAILABLE');
  }
  if (!response.ok) throw new AppError(503, 'Location search is unavailable right now. Try again in a moment.', 'PLACES_UNAVAILABLE');
  const data = (await response.json()) as { features?: unknown[] };
  const places = dedupe((data.features || []).map(toPlace)).slice(0, 10);
  await cacheSet(cacheKey, places, CACHE_SECONDS);
  return places;
}

const hash = (value: string) => crypto.createHash('sha1').update(value).digest('hex').slice(0, 16);

export function searchPlaces(query: string, near?: { lat: number; lon: number }) {
  const q = query.trim().replace(/\s+/g, ' ').slice(0, 100);
  // Bias towards the user's area (rounded so nearby users share cache entries).
  const bias = near ? `&lat=${near.lat.toFixed(1)}&lon=${near.lon.toFixed(1)}` : '';
  return photon(`/api/?q=${encodeURIComponent(q)}&limit=12&lang=default${bias}`, `places:v2:q:${hash(q.toLowerCase() + bias)}`);
}

export function nearbyPlaces(lat: number, lon: number) {
  const roundedLat = lat.toFixed(4), roundedLon = lon.toFixed(4);
  return photon(`/reverse?lat=${roundedLat}&lon=${roundedLon}&limit=10&radius=1&lang=default`, `places:v2:r:${roundedLat},${roundedLon}`);
}
