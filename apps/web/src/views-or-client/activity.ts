/**
 * Behaviour signals for "Suggested for you" (server side: services/activity.service.ts).
 *
 * - Reading time: a post counts as being read while at least half of it (or, for a tall post, 40% of the
 *   screen) is visible, the tab is in front and the reader has scrolled, moved or typed within the last
 *   45 seconds. Time is summed per post and sent in batches.
 * - In-post clicks that don't navigate (open a photo, play a video, open comments or the share dialog).
 *   Navigations (profile, group, post page, story) are recorded by the server when the page opens.
 *
 * Batches go out every 15 s and when the page is hidden, using keepalive so they survive navigation.
 */

const csrf = (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement | null)?.content || '';
const signedIn = !!document.body.dataset.userId;

type Event = { type: 'dwell'; postId: string; ms: number } | { type: 'click'; target: 'post' | 'user' | 'group' | 'story'; id: string };

const FLUSH_MS = 15_000;
const IDLE_MS = 45_000;
const MIN_DWELL_MS = 1500;
const MAX_BATCH = 50;
const CLICK_COOLDOWN_MS = 10_000;
const ID = /^[a-f0-9]{24}$/i;

const dwell = new Map<string, number>();
const clicks: Event[] = [];
const lastClick = new Map<string, number>();
/** Visible posts and when their current visible stretch started (null while paused). */
const visible = new Map<string, { element: Element; since: number | null }>();
let lastInput = Date.now();
let paused = false;

const active = () => document.visibilityState === 'visible' && Date.now() - lastInput < IDLE_MS;

function stopTiming(postId: string, now = Date.now()) {
  const entry = visible.get(postId);
  if (!entry || entry.since === null) return;
  dwell.set(postId, (dwell.get(postId) || 0) + (now - entry.since));
  entry.since = null;
}

function syncTimers() {
  const now = Date.now();
  const running = active();
  for (const [postId, entry] of visible) {
    if (running && entry.since === null) entry.since = now;
    else if (!running) stopTiming(postId, now);
  }
  paused = !running;
}

function send(events: Event[]) {
  for (let start = 0; start < events.length; start += MAX_BATCH) {
    void fetch('/api/activity', {
      method: 'POST', keepalive: true, credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
      body: JSON.stringify({ events: events.slice(start, start + MAX_BATCH) })
    }).catch(() => undefined);
  }
}

function flush() {
  const now = Date.now();
  // Bank the running stretches so they're included, then keep timing from now.
  for (const [postId, entry] of visible) if (entry.since !== null) { stopTiming(postId, now); entry.since = paused ? null : now; }
  const events: Event[] = [...clicks.splice(0)];
  for (const [postId, ms] of dwell) {
    if (ms >= MIN_DWELL_MS) { events.push({ type: 'dwell', postId, ms: Math.min(Math.round(ms), 600_000) }); dwell.delete(postId); }
  }
  if (events.length) send(events);
}

function isReading(entry: IntersectionObserverEntry) {
  if (!entry.isIntersecting) return false;
  const height = entry.boundingClientRect.height || 1;
  return entry.intersectionRect.height >= Math.min(height * 0.5, window.innerHeight * 0.4);
}

const observer = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  const now = Date.now();
  for (const entry of entries) {
    const postId = (entry.target as HTMLElement).dataset.postId || '';
    if (!ID.test(postId)) continue;
    if (isReading(entry)) {
      const current = visible.get(postId);
      if (!current) visible.set(postId, { element: entry.target, since: active() ? now : null });
      else if (current.element !== entry.target) current.element = entry.target;
    } else if (visible.get(postId)?.element === entry.target) {
      stopTiming(postId, now);
      visible.delete(postId);
    }
  }
}, { threshold: [0, 0.1, 0.25, 0.4, 0.5, 0.75, 1] }) : null;

const observed = new WeakSet<Element>();
function observePosts(root: ParentNode = document) {
  if (!observer) return;
  root.querySelectorAll<HTMLElement>('article[data-post-id]').forEach((card) => {
    if (observed.has(card)) return;
    observed.add(card); observer.observe(card);
  });
}

/** Clicks inside a post that open something in place (navigation and reactions are recorded on the server). */
function onClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const card = target?.closest<HTMLElement>('article[data-post-id]');
  if (!card || !target) return;
  if (target.closest('a[href^="/"], [data-react], [data-reaction-toggle], form, details[data-menu], [data-edit-post], [data-delete-post]')) return;
  if (!target.closest('button, video, a, [data-lightbox], [data-post-content]')) return;
  const postId = card.dataset.postId || '';
  if (!ID.test(postId)) return;
  const now = Date.now();
  if (now - (lastClick.get(postId) || 0) < CLICK_COOLDOWN_MS) return;
  lastClick.set(postId, now);
  clicks.push({ type: 'click', target: 'post', id: postId });
}

export function initActivityTracking() {
  if (!signedIn || !csrf) return;
  observePosts();
  // Endless lists and live updates add posts later.
  new MutationObserver((mutations) => {
    for (const mutation of mutations) mutation.addedNodes.forEach((node) => { if (node instanceof Element) observePosts(node.matches('article[data-post-id]') ? node.parentElement || node : node); });
  }).observe(document.body, { childList: true, subtree: true });

  const markInput = () => { lastInput = Date.now(); if (paused) syncTimers(); };
  for (const type of ['scroll', 'pointermove', 'pointerdown', 'keydown', 'touchstart', 'wheel']) window.addEventListener(type, markInput, { passive: true, capture: true });
  document.addEventListener('click', onClick, { capture: true });
  document.addEventListener('visibilitychange', () => { syncTimers(); if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', flush);
  window.setInterval(() => { if (!active() && !paused) syncTimers(); }, 5000);
  window.setInterval(flush, FLUSH_MS);
}
