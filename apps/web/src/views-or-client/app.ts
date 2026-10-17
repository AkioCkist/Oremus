import { ACTIVITIES, FEELINGS, describeFeeling } from '../shared/feelings.js';
import { STORY_VIDEO_MAX_SECONDS, storyTextAttrs, type StoryStyle } from '../shared/story-style.js';
import { EMOJI_CATEGORIES } from './emoji-data.js';
import './search-box.js';
import { optimizeFormUploads, optimizeUpload, runImageJob } from './workers.js';
import { createInfiniteList, htmlNodes, initInfiniteLists, type InfiniteList } from './infinite.js';
import { initActivityTracking } from './activity.js';
import { initOnboarding } from './onboarding.js';

const csrf = (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement | null)?.content || '';
const me = {
  id: document.body.dataset.userId || '',
  name: document.body.dataset.userName || '',
  username: document.body.dataset.userUsername || '',
  avatar: document.body.dataset.userAvatar || ''
};
const $ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) => root.querySelector<T>(selector);
const $$ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) => [...root.querySelectorAll<T>(selector)];

/* ---------- Shared helpers ---------- */

function showToast(message: string, tone: 'success' | 'error' = 'success') {
  const region = $('#toast-region');
  if (!region) return;
  const toast = document.createElement('div');
  toast.className = `pointer-events-auto flex max-w-sm animate-pop-in items-center gap-3 rounded-full px-5 py-3 text-15 font-medium text-white shadow-pop ${tone === 'success' ? 'glass-strong !text-ink' : 'bg-ios-red'}`;
  toast.textContent = message; region.appendChild(toast); window.setTimeout(() => toast.remove(), 4000);
}

async function request(url: string, options: RequestInit = {}) {
  let response: Response;
  try { response = await fetch(url, { credentials: 'same-origin', ...options, headers: { 'x-csrf-token': csrf, ...(options.headers || {}) } }); }
  catch { throw new Error(navigator.onLine ? 'Could not reach Oremus. Please try again.' : "You're offline. Check your connection and try again."); }
  const payload = await response.json().catch(() => ({ ok: false, error: { message: 'Unexpected server response.' } }));
  if (!response.ok || !payload.ok) throw new Error(payload.error?.message || 'Request failed.');
  return payload.data;
}
const postJson = (url: string, body: unknown, method = 'POST') => request(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

function svgUse(id: string, className: string) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${id}`); svg.appendChild(use);
  return svg;
}

function toneOf(seed: string) { let hash = 0; for (const char of seed || '') hash = (hash * 31 + char.charCodeAt(0)) >>> 0; return `tone-${hash % 8}`; }
function initials(name: string) { const parts = (name || '?').trim().split(/\s+/); return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '')).toUpperCase(); }
function timeAgo(value: string | Date) {
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

function avatarEl(person: { displayName: string; avatarUrl?: string }, size: string) {
  const span = document.createElement('span');
  span.className = `avatar ${size} ${person.avatarUrl ? 'bg-field' : toneOf(person.displayName)}`;
  if (person.avatarUrl) { const img = document.createElement('img'); img.src = person.avatarUrl; img.alt = ''; span.appendChild(img); }
  else { const text = document.createElement('span'); text.textContent = initials(person.displayName); span.appendChild(text); }
  return span;
}

/** Fills a chat bubble with text whose http(s) links are clickable (shared posts arrive as links). */
function setLinkedText(element: HTMLElement, text: string) {
  element.replaceChildren(...text.split(/(https?:\/\/[^\s<>"']+)/g).map((part, index) => {
    if (index % 2 === 0) return document.createTextNode(part);
    const link = document.createElement('a'); link.className = 'underline'; link.href = part.replace(/[.,!?;:)\]]+$/, '');
    link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = part; return link;
  }));
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
}

function openDialog(id: string) { const dialog = document.getElementById(id) as HTMLDialogElement | null; if (dialog && !dialog.open) dialog.showModal(); return dialog; }

/* ---------- Theme (light / dark / system) ---------- */

type ThemeChoice = 'light' | 'dark' | 'system';
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const currentTheme = (): ThemeChoice => (document.documentElement.dataset.theme as ThemeChoice) || 'system';
const isDark = (theme = currentTheme()) => theme === 'dark' || (theme === 'system' && darkQuery.matches);

function syncThemeControls() {
  const dark = isDark();
  $$<HTMLButtonElement>('[data-theme-toggle]').forEach((button) => {
    button.setAttribute('aria-checked', String(dark));
    const track = $('[data-theme-switch]', button);
    track?.classList.toggle('switch-on', dark);
  });
  $$<HTMLInputElement>('[data-theme-choice]').forEach((input) => { input.checked = input.value === currentTheme(); });
}

function setTheme(theme: ThemeChoice) {
  document.documentElement.dataset.theme = theme;
  document.cookie = `theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
  syncThemeControls();
}

$$<HTMLInputElement>('[data-theme-choice]').forEach((input) => input.addEventListener('change', () => { if (input.checked) setTheme(input.value as ThemeChoice); }));
$$('[data-theme-toggle]').forEach((button) => button.addEventListener('click', () => setTheme(isDark() ? 'light' : 'dark')));
darkQuery.addEventListener('change', syncThemeControls);
syncThemeControls();


/* ---------- API forms ---------- */

$$<HTMLFormElement>('[data-api-form]').forEach((form) => {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = $<HTMLButtonElement>('button[type="submit"]', form);
    const error = $('[data-form-error]', form);
    const success = $('[data-form-success]', form);
    const developmentResetLink = $<HTMLAnchorElement>('[data-development-reset-link]', form);
    const repeat = $<HTMLInputElement>('[data-password-repeat]', form);
    if (repeat && repeat.value !== $<HTMLInputElement>('[data-password-source]', form)?.value) {
      if (error) { error.textContent = 'Passwords do not match.'; error.classList.remove('hidden'); }
      repeat.focus(); return;
    }
    submit?.setAttribute('disabled', 'true'); form.setAttribute('aria-busy', 'true'); error?.classList.add('hidden'); success?.classList.add('hidden'); developmentResetLink?.classList.add('hidden');
    try {
      const formData = new FormData(form); formData.delete('_csrf');
      for (const [key, value] of [...formData.entries()]) if (value instanceof File && !value.name) formData.delete(key);
      const isMultipart = form.enctype === 'multipart/form-data';
      const body: BodyInit = isMultipart ? await optimizeFormUploads(formData) : JSON.stringify(Object.fromEntries(formData));
      const data = await request(form.action, { method: form.dataset.method || form.method.toUpperCase(), body, headers: isMultipart ? {} : { 'content-type': 'application/json' } });
      if (data.redirect) window.location.assign(data.redirect);
      else if (form.dataset.reload !== undefined) window.location.reload();
      else {
        if (form.dataset.reset !== undefined) form.reset();
        const message = data.message || 'Saved.';
        if (success) { success.textContent = message; success.classList.remove('hidden'); }
        if (developmentResetLink && data.developmentResetUrl) { developmentResetLink.href = data.developmentResetUrl; developmentResetLink.classList.remove('hidden'); }
        else showToast(message);
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Something went wrong.';
      if (error) { error.textContent = message; error.classList.remove('hidden'); } else showToast(message, 'error');
    } finally { submit?.removeAttribute('disabled'); form.removeAttribute('aria-busy'); }
  });
});

// Audience pickers on the About tab save as soon as they change.
$$<HTMLSelectElement>('[data-autosubmit]').forEach((select) => select.addEventListener('change', () => {
  const icon = select.parentElement?.querySelector('use');
  icon?.setAttribute('href', `#${({ public: 'i-globe', friends: 'i-users', only_me: 'i-lock' } as Record<string, string>)[select.value] || 'i-globe'}`);
  select.form?.requestSubmit();
}));
// Workplace editor: hide the end date while "I currently work here" is checked.
$$<HTMLInputElement>('[data-current-toggle]').forEach((box) => box.addEventListener('change', () => {
  box.closest('form')?.querySelector('[data-end-date]')?.classList.toggle('hidden', box.checked);
}));

/* ---------- Confirm dialog ---------- */

async function confirmAction(title = 'Move to trash?', description = "This can't be undone.", confirmLabel = 'Delete'): Promise<boolean> {
  const dialog = $<HTMLDialogElement>('#confirm-dialog');
  if (!dialog) return window.confirm(title);
  $('#confirm-title', dialog)!.textContent = title;
  $('#confirm-description', dialog)!.textContent = description;
  $('[data-confirm-label]', dialog)!.textContent = confirmLabel;
  return new Promise((resolve) => {
    const buttons = $$<HTMLButtonElement>('button[value]', dialog);
    const handlers = new Map<HTMLButtonElement, () => void>();
    const finish = (value: boolean) => { dialog.close(); buttons.forEach((button) => button.removeEventListener('click', handlers.get(button)!)); resolve(value); };
    buttons.forEach((button) => { const handler = () => finish(button.value === 'confirm'); handlers.set(button, handler); button.addEventListener('click', handler); });
    dialog.addEventListener('cancel', () => finish(false), { once: true }); dialog.showModal();
  });
}

type FriendState = 'none' | 'outgoing' | 'incoming' | 'friends';

function friendButton(action: string, label: string, icon: string, primary: boolean, compact: boolean, full: boolean, soft = false) {
  const button = document.createElement('button');
  button.type = 'button'; button.dataset.friendAction = action;
  button.className = `${primary ? (soft ? 'btn-soft' : 'btn-primary') : 'btn-secondary'} ${compact ? 'btn-sm' : ''} ${full ? 'w-full' : ''}`.trim();
  button.append(svgUse(icon, 'icon size-4'), document.createTextNode(label));
  return button;
}

function paintFriendControls(container: HTMLElement, state: FriendState) {
  const compact = container.dataset.compact === 'true', full = container.dataset.full === 'true', soft = container.dataset.soft === 'true';
  container.replaceChildren();
  if (state === 'incoming') {
    container.append(friendButton('accept', 'Confirm', 'i-check', true, compact, full, soft), friendButton('decline', 'Delete request', 'i-x', false, compact, full));
  } else if (state === 'outgoing') {
    container.append(friendButton('cancel', 'Cancel request', 'i-clock', false, compact, full));
  } else if (state === 'friends') {
    const menu = document.createElement('details'); menu.className = `relative ${full ? 'w-full' : ''}`; menu.dataset.menu = '';
    const summary = document.createElement('summary'); summary.className = `btn-secondary cursor-pointer ${compact ? 'btn-sm' : ''} ${full ? 'w-full' : ''}`;
    summary.append(svgUse('i-users', 'icon size-4'), document.createTextNode('Friends'), svgUse('i-chevron-down', 'icon size-4'));
    const items = document.createElement('div'); items.className = 'menu right-0 top-full mt-2';
    const pause = document.createElement('button'); pause.type = 'button'; pause.className = 'menu-item'; pause.dataset.openBreak = container.dataset.userId; pause.dataset.userName = container.dataset.userName;
    pause.append(svgUse('i-pause', 'icon'), document.createTextNode('Take a break'));
    const unfriend = friendButton('unfriend', 'Unfriend', 'i-user', false, false, false); unfriend.className = 'menu-item';
    items.append(pause, unfriend); menu.append(summary, items); container.appendChild(menu);
  } else {
    container.append(friendButton('request', 'Add friend', 'i-user-plus', true, compact, full, soft));
  }
  const error = document.createElement('p');
  error.className = 'hidden basis-full text-sm text-ios-red'; error.dataset.friendError = ''; error.setAttribute('role', 'alert');
  container.appendChild(error);
  container.removeAttribute('aria-busy');
}

function syncFriendState(userId: string, state: FriendState) {
  $$<HTMLElement>('[data-friend-controls]').filter((item) => item.dataset.userId === userId).forEach((item) => paintFriendControls(item, state));
  $$<HTMLElement>('[data-friend-message]').filter((item) => item.dataset.friendMessage === userId).forEach((item) => item.classList.toggle('hidden', state !== 'friends'));
}

function syncFollowState(userId: string, following: boolean) {
  $$<HTMLButtonElement>('[data-follow]').filter((button) => button.dataset.follow === userId).forEach((button) => {
    button.dataset.following = String(following);
    button.replaceChildren(svgUse(following ? 'i-check' : 'i-user-plus', 'icon size-4'), document.createTextNode(following ? 'Following' : 'Follow'));
  });
}

const breakDialog = $<HTMLDialogElement>('#break-dialog');
const breakForm = $<HTMLFormElement>('[data-break-form]');
let socialActionPending = false;
async function openBreak(userId: string, userName: string) {
  if (!breakDialog || !breakForm) return;
  breakForm.dataset.userId = userId;
  $('#break-title', breakDialog)!.textContent = `Take a break from ${userName}`;
  const save = $<HTMLButtonElement>('[data-break-save]', breakForm)!;
  const error = $('[data-break-error]', breakForm)!;
  const checks = $$<HTMLInputElement>('input[type=checkbox]', breakForm);
  error.classList.add('hidden'); save.disabled = true; checks.forEach((check) => { check.disabled = true; });
  breakDialog.showModal();
  try {
    const state = await request(`/api/users/${userId}/break`);
    if (state.blocked) throw new Error('This person is unavailable.');
    $<HTMLInputElement>('[name=seeLess]', breakForm)!.checked = state.seeLess;
    $<HTMLInputElement>('[name=restrictPosts]', breakForm)!.checked = state.restrictPosts;
    save.disabled = false; checks.forEach((check) => { check.disabled = false; });
  } catch (caught) {
    error.textContent = caught instanceof Error ? caught.message : 'Could not load break settings.'; error.classList.remove('hidden');
  }
}

breakForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const userId = breakForm.dataset.userId;
  if (!userId) return;
  const save = $<HTMLButtonElement>('[data-break-save]', breakForm)!, error = $('[data-break-error]', breakForm)!;
  save.disabled = true; error.classList.add('hidden'); breakForm.setAttribute('aria-busy', 'true'); socialActionPending = true;
  try {
    const result = await postJson(`/api/users/${userId}/break`, {
      seeLess: $<HTMLInputElement>('[name=seeLess]', breakForm)!.checked,
      restrictPosts: $<HTMLInputElement>('[name=restrictPosts]', breakForm)!.checked
    });
    if (result.seeLess && window.location.pathname === '/') $$<HTMLElement>('[data-post-author]').filter((post) => post.dataset.postAuthor === userId).forEach((post) => post.remove());
    $$('[data-break-label]').forEach((label) => { label.textContent = result.seeLess || result.restrictPosts ? 'Edit break settings' : 'Take a break'; });
    breakDialog?.close(); showToast('Break settings saved.');
  } catch (caught) { error.textContent = caught instanceof Error ? caught.message : 'Could not save settings.'; error.classList.remove('hidden'); }
  finally { save.disabled = false; breakForm.removeAttribute('aria-busy'); socialActionPending = false; }
});

/* ---------- Menus (<details data-menu>) ---------- */

document.addEventListener('click', (event) => {
  $$<HTMLDetailsElement>('details[data-menu][open]').forEach((menu) => { if (!menu.contains(event.target as Node)) menu.open = false; });
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  $$<HTMLDetailsElement>('details[data-menu][open]').forEach((menu) => { menu.open = false; $('summary', menu)?.focus(); });
});

/* ---------- Reactions ---------- */

const REACTION_STYLE: Record<string, { label: string; color: string }> = {
  like: { label: 'Like', color: 'text-[#0088ff]' }, love: { label: 'Love', color: 'text-[#ff2d55]' }, haha: { label: 'Haha', color: 'text-[#e9a811]' },
  wow: { label: 'Wow', color: 'text-[#e9a811]' }, sad: { label: 'Sad', color: 'text-[#e9a811]' }, angry: { label: 'Angry', color: 'text-[#e9710f]' }
};

function paintReaction(card: Element, active: string | null, count: number) {
  const toggle = $<HTMLButtonElement>('[data-reaction-toggle]', card);
  if (toggle) {
    Object.values(REACTION_STYLE).forEach((style) => toggle.classList.remove(style.color));
    toggle.replaceChildren();
    if (active) { toggle.classList.add(REACTION_STYLE[active]!.color); toggle.appendChild(svgUse(`r-${active}`, 'size-[1.125rem]')); }
    else toggle.appendChild(svgUse('i-like', 'icon'));
    const label = document.createElement('span'); label.textContent = active ? REACTION_STYLE[active]!.label : 'Like'; toggle.appendChild(label);
    toggle.dataset.react = active || 'like'; toggle.setAttribute('aria-pressed', String(!!active));
  }
  const summary = $('[data-reaction-summary]', card);
  const icons = $('[data-reaction-icons]', card);
  const countLabel = $('[data-reaction-count]', card);
  if (countLabel) countLabel.textContent = new Intl.NumberFormat('en', { notation: 'compact' }).format(count);
  summary?.classList.toggle('invisible', count === 0);
  if (icons && active && !$(`use[href="#r-${active}"]`, icons)) {
    icons.prepend(svgUse(`r-${active}`, 'size-[1.125rem] rounded-full ring-2 ring-surface'));
    while (icons.children.length > 3) icons.lastElementChild?.remove();
  }
  if (icons && count === 0) icons.replaceChildren();
  $('.reaction-bar', card)?.classList.remove('is-open');
  const wrap = $('.reaction-wrap', card);
  if (wrap) { wrap.classList.add('reaction-done'); wrap.addEventListener('mouseleave', () => wrap.classList.remove('reaction-done'), { once: true }); }
}

/* ---------- Composer dialog ---------- */

const composer = $<HTMLDialogElement>('#composer-dialog');
function openComposer(trigger: HTMLElement) {
  if (!composer) return;
  const groupInput = $<HTMLInputElement>('[data-composer-group]', composer)!;
  const groupLabel = $('[data-composer-group-label]', composer)!;
  const visibility = $('[data-visibility-wrap]', composer)!;
  if (trigger.dataset.groupId) {
    groupInput.disabled = false; groupInput.value = trigger.dataset.groupId;
    groupLabel.textContent = ` ▸ ${trigger.dataset.groupName || 'Group'}`; visibility.classList.add('hidden');
  } else { groupInput.disabled = true; groupInput.value = ''; groupLabel.textContent = ''; visibility.classList.remove('hidden'); }
  composer.showModal();
  const textarea = $<HTMLTextAreaElement>('#composer-content', composer)!;
  if (trigger.dataset.feeling !== undefined && !textarea.value) textarea.value = 'Feeling 😊 ';
  if (trigger.dataset.pickPhoto !== undefined) $<HTMLInputElement>('[data-composer-files]', composer)?.click();
  textarea.focus();
}

/* ---------- Static map (OpenStreetMap tiles positioned around a point) ---------- */

function renderMap(container: HTMLElement, lat: number, lon: number, zoom = 15) {
  const width = container.clientWidth || 480, height = container.clientHeight || 200;
  const scale = 256 * 2 ** zoom;
  const worldX = ((lon + 180) / 360) * scale;
  const latRad = (lat * Math.PI) / 180;
  const worldY = ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * scale;
  const left = worldX - width / 2, top = worldY - height / 2;
  const tiles = document.createDocumentFragment();
  const max = 2 ** zoom;
  for (let tx = Math.floor(left / 256); tx <= Math.floor((left + width) / 256); tx++) {
    for (let ty = Math.floor(top / 256); ty <= Math.floor((top + height) / 256); ty++) {
      if (ty < 0 || ty >= max) continue;
      const img = document.createElement('img');
      img.src = `https://tile.openstreetmap.org/${zoom}/${((tx % max) + max) % max}/${ty}.png`;
      img.alt = ''; img.loading = 'lazy'; img.className = 'absolute max-w-none select-none';
      img.style.width = '256px'; img.style.height = '256px';
      img.style.left = `${Math.round(tx * 256 - left)}px`; img.style.top = `${Math.round(ty * 256 - top)}px`;
      tiles.appendChild(img);
    }
  }
  const pin = svgUse('i-pin', 'absolute left-1/2 top-1/2 size-9 -translate-x-1/2 -translate-y-full fill-[#ff383c] stroke-white drop-shadow');
  pin.setAttribute('stroke-width', '1.5');
  const credit = Object.assign(document.createElement('span'), { className: 'absolute bottom-1 right-1 rounded bg-surface/80 px-1 text-2xs text-muted', textContent: '© OpenStreetMap' });
  container.replaceChildren(tiles, pin, credit);
}
const renderMaps = (root: ParentNode = document) => $$('[data-map][data-lat]', root).forEach((map) => renderMap(map, Number(map.dataset.lat), Number(map.dataset.lon)));
renderMaps();

/* ---------- Emoji picker popover ---------- */

const RECENT_EMOJI_KEY = 'oremus:recent-emoji';
const readRecentEmoji = (): string[] => { try { return JSON.parse(localStorage.getItem(RECENT_EMOJI_KEY) || '[]'); } catch { return []; } };
const saveRecentEmoji = (emoji: string) => { try { localStorage.setItem(RECENT_EMOJI_KEY, JSON.stringify([emoji, ...readRecentEmoji().filter((item) => item !== emoji)].slice(0, 16))); } catch { /* storage unavailable */ } };

function insertAtCursor(field: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const start = field.selectionStart ?? field.value.length, end = field.selectionEnd ?? field.value.length;
  field.value = field.value.slice(0, start) + text + field.value.slice(end);
  const caret = start + text.length; field.focus(); field.setSelectionRange(caret, caret);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

let emojiPopover: HTMLElement | null = null;
function closeEmojiPicker() { emojiPopover?.remove(); emojiPopover = null; }

function openEmojiPicker(anchor: HTMLElement, field: HTMLInputElement | HTMLTextAreaElement) {
  closeEmojiPicker();
  const popover = document.createElement('div');
  popover.className = 'fixed z-[70] flex h-[22rem] w-[20rem] max-w-[calc(100vw-1rem)] animate-pop-in flex-col overflow-hidden rounded-xl bg-surface shadow-pop';
  popover.setAttribute('role', 'dialog'); popover.setAttribute('aria-label', 'Emoji picker');
  const search = Object.assign(document.createElement('input'), { type: 'search', className: 'pill-input h-9', placeholder: 'Search emoji' });
  search.setAttribute('aria-label', 'Search emoji');
  const head = document.createElement('div'); head.className = 'p-2'; head.appendChild(search);
  const tabs = document.createElement('div'); tabs.className = 'flex gap-0.5 border-b border-line px-2 pb-1';
  const body = document.createElement('div'); body.className = 'flex-1 overflow-y-auto px-2 pb-2';

  const grid = (title: string, items: Array<[string, string]>, id?: string) => {
    const section = document.createElement('section'); if (id) section.dataset.emojiSection = id;
    section.appendChild(Object.assign(document.createElement('p'), { className: 'sticky top-0 bg-surface py-1.5 text-xs font-semibold text-muted', textContent: title }));
    const wrap = document.createElement('div'); wrap.className = 'grid grid-cols-8';
    items.forEach(([emoji, words]) => {
      const button = Object.assign(document.createElement('button'), { type: 'button', className: 'grid size-9 place-items-center rounded-lg text-2xl hover:bg-hover', textContent: emoji, title: words.split(' ')[0] });
      button.setAttribute('aria-label', words.split(' ')[0] || emoji);
      button.addEventListener('click', () => { insertAtCursor(field, emoji); saveRecentEmoji(emoji); });
      wrap.appendChild(button);
    });
    section.appendChild(wrap); return section;
  };
  const renderAll = () => {
    const recent = readRecentEmoji();
    body.replaceChildren(...(recent.length ? [grid('Recently used', recent.map((emoji) => [emoji, emoji] as [string, string]), 'recent')] : []), ...EMOJI_CATEGORIES.map((category) => grid(category.label, category.items, category.id)));
  };
  EMOJI_CATEGORIES.forEach((category) => {
    const tab = Object.assign(document.createElement('button'), { type: 'button', className: 'grid size-8 flex-1 place-items-center rounded-md text-lg hover:bg-hover', textContent: category.icon, title: category.label });
    tab.setAttribute('aria-label', category.label);
    tab.addEventListener('click', () => { search.value = ''; renderAll(); $(`[data-emoji-section="${category.id}"]`, body)?.scrollIntoView({ block: 'start' }); });
    tabs.appendChild(tab);
  });
  search.addEventListener('input', () => {
    const term = search.value.trim().toLowerCase();
    if (!term) { renderAll(); return; }
    const matches = EMOJI_CATEGORIES.flatMap((category) => category.items).filter(([, words]) => words.includes(term));
    body.replaceChildren(matches.length ? grid('Search results', matches) : Object.assign(document.createElement('p'), { className: 'py-8 text-center text-15 text-muted', textContent: 'No emoji found' }));
  });
  renderAll();
  popover.append(head, tabs, body);
  // Inside a modal <dialog> the popover must live in the dialog to render above it.
  (anchor.closest('dialog') || document.body).appendChild(popover);
  const rect = anchor.getBoundingClientRect();
  const left = Math.min(Math.max(8, rect.right - popover.offsetWidth), window.innerWidth - popover.offsetWidth - 8);
  const above = rect.top - popover.offsetHeight - 8;
  popover.style.left = `${left}px`;
  popover.style.top = `${above > 8 ? above : Math.min(rect.bottom + 8, window.innerHeight - popover.offsetHeight - 8)}px`;
  emojiPopover = popover; search.focus();
}

document.addEventListener('click', (event) => {
  const trigger = (event.target as HTMLElement).closest<HTMLElement>('[data-emoji-for]');
  if (trigger) {
    event.preventDefault();
    if (emojiPopover) { closeEmojiPicker(); return; }
    const field = $<HTMLInputElement | HTMLTextAreaElement>(trigger.dataset.emojiFor!);
    if (field) openEmojiPicker(trigger, field);
    return;
  }
  if (emojiPopover && !emojiPopover.contains(event.target as Node)) closeEmojiPicker();
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && emojiPopover) { event.preventDefault(); event.stopPropagation(); closeEmojiPicker(); } }, true);

/* ---------- Composer: feeling/activity and check-in ---------- */

type ComposerFeeling = { type: 'feeling'; key: string } | { type: 'activity'; key: string; text: string };
type ComposerPlace = { id: string; name: string; address: string; lat: number; lon: number };

/** Wires the feeling/activity and check-in views inside a post dialog (Create post or Edit post). */
function initPostExtras(root: HTMLDialogElement) {
  const composer = root;
  const composerState: { feeling: ComposerFeeling | null; place: ComposerPlace | null } = { feeling: null, place: null };
  const feelingInput = $<HTMLInputElement>('[data-composer-feeling-input]', composer)!;
  const placeInput = $<HTMLInputElement>('[data-composer-place-input]', composer)!;
  const meta = $('[data-composer-meta]', composer)!;
  const placeCard = $('[data-composer-place-card]', composer)!;

  const showView = (view: 'main' | 'feeling' | 'place') => {
    $$('[data-composer-view]', composer).forEach((panel) => panel.classList.toggle('hidden', panel.dataset.composerView !== view));
    closeEmojiPicker();
  };

  const paintComposerMeta = () => {
    feelingInput.value = composerState.feeling ? JSON.stringify(composerState.feeling) : '';
    placeInput.value = composerState.place ? JSON.stringify(composerState.place) : '';
    meta.replaceChildren();
    const info = describeFeeling(composerState.feeling);
    if (info || composerState.place) {
      meta.append(' is ');
      if (info) {
        const chip = Object.assign(document.createElement('button'), { type: 'button', className: 'font-semibold hover:underline', textContent: `${info.emoji} ${info.text}` });
        chip.addEventListener('click', () => showView('feeling')); meta.appendChild(chip);
      }
      if (composerState.place) {
        meta.append(info ? ' at ' : 'at ');
        const chip = Object.assign(document.createElement('button'), { type: 'button', className: 'font-semibold hover:underline', textContent: composerState.place.name });
        chip.addEventListener('click', () => showView('place')); meta.appendChild(chip);
      }
      meta.append('.');
    }
    placeCard.classList.toggle('hidden', !composerState.place);
    if (composerState.place) {
      $('[data-composer-place-name]', placeCard)!.textContent = composerState.place.name;
      $('[data-composer-place-address]', placeCard)!.textContent = composerState.place.address;
      requestAnimationFrame(() => renderMap($('[data-map]', placeCard)!, composerState.place!.lat, composerState.place!.lon));
    }
  };

  $$('[data-composer-open]', composer).forEach((button) => button.addEventListener('click', () => {
    const view = button.dataset.composerOpen as 'feeling' | 'place';
    showView(view);
    if (view === 'feeling') { renderFeelingGrid(); $<HTMLInputElement>('[data-feeling-search]', composer)?.focus(); }
    else $<HTMLInputElement>('[data-place-search]', composer)?.focus();
  }));
  $$('[data-composer-back]', composer).forEach((button) => button.addEventListener('click', () => showView('main')));
  $$('[data-composer-clear]', composer).forEach((button) => button.addEventListener('click', () => { composerState.place = null; paintComposerMeta(); }));
  composer.addEventListener('close', () => { showView('main'); closeEmojiPicker(); });

  /* Feelings & activities */
  let feelingTab: 'feeling' | 'activity' = 'feeling';
  let pendingActivity: (typeof ACTIVITIES)[number] | null = null;
  const feelingGrid = $('[data-feeling-grid]', composer)!;
  const feelingSearch = $<HTMLInputElement>('[data-feeling-search]', composer)!;
  const activityDetail = $('[data-activity-detail]', composer)!;
  const activityText = $<HTMLInputElement>('[data-activity-text]', composer)!;

  const feelingButton = (emoji: string, label: string, selected: boolean, onPick: () => void) => {
    const button = document.createElement('button'); button.type = 'button';
    button.className = `flex items-center gap-3 rounded-lg p-2 text-left text-15 hover:bg-hover ${selected ? 'bg-brand-50 font-semibold text-brand-700' : ''}`;
    button.append(Object.assign(document.createElement('span'), { className: 'grid size-9 shrink-0 place-items-center rounded-full bg-field text-xl', textContent: emoji }), Object.assign(document.createElement('span'), { className: 'capitalize', textContent: label }));
    button.setAttribute('aria-pressed', String(selected)); button.addEventListener('click', onPick); return button;
  };
  function renderFeelingGrid() {
    const term = feelingSearch.value.trim().toLowerCase();
    $('[data-feeling-title]', composer)!.textContent = feelingTab === 'feeling' ? 'How are you feeling?' : 'What are you doing?';
    $$('[data-feeling-tab]', composer).forEach((tab) => { const on = tab.dataset.feelingTab === feelingTab; tab.classList.toggle('tab-active', on); tab.setAttribute('aria-selected', String(on)); });
    const current = composerState.feeling;
    const buttons = feelingTab === 'feeling'
      ? FEELINGS.filter((item) => !term || item.label.includes(term)).map((item) => feelingButton(item.emoji, item.label, current?.type === 'feeling' && current.key === item.key, () => {
        composerState.feeling = current?.type === 'feeling' && current.key === item.key ? null : { type: 'feeling', key: item.key };
        paintComposerMeta(); showView('main');
      }))
      : ACTIVITIES.filter((item) => !term || item.verb.includes(term)).map((item) => feelingButton(item.emoji, item.verb, current?.type === 'activity' && current.key === item.key, () => {
        pendingActivity = item;
        $('[data-activity-emoji]', composer)!.textContent = item.emoji; $('[data-activity-verb]', composer)!.textContent = item.verb;
        activityText.placeholder = item.placeholder; activityText.value = current?.type === 'activity' && current.key === item.key ? current.text : '';
        activityDetail.classList.remove('hidden'); feelingGrid.classList.add('hidden'); activityText.focus();
      }));
    feelingGrid.replaceChildren(...(buttons.length ? buttons : [Object.assign(document.createElement('p'), { className: 'col-span-2 py-8 text-center text-muted', textContent: 'No matches' })]));
    if (current) {
      const clear = Object.assign(document.createElement('button'), { type: 'button', className: 'col-span-2 mt-1 rounded-lg p-2 text-15 font-semibold text-ios-red hover:bg-ios-red/10', textContent: 'Remove feeling/activity' });
      clear.addEventListener('click', () => { composerState.feeling = null; paintComposerMeta(); showView('main'); });
      feelingGrid.appendChild(clear);
    }
  }
  $$('[data-feeling-tab]', composer).forEach((tab) => tab.addEventListener('click', () => {
    feelingTab = tab.dataset.feelingTab as 'feeling' | 'activity'; feelingSearch.value = '';
    activityDetail.classList.add('hidden'); feelingGrid.classList.remove('hidden'); renderFeelingGrid();
  }));
  feelingSearch.addEventListener('input', renderFeelingGrid);
  const finishActivity = () => {
    const text = activityText.value.trim();
    if (!pendingActivity || !text) { activityText.focus(); return; }
    composerState.feeling = { type: 'activity', key: pendingActivity.key, text };
    activityDetail.classList.add('hidden'); feelingGrid.classList.remove('hidden'); paintComposerMeta(); showView('main');
  };
  $('[data-activity-done]', composer)!.addEventListener('click', finishActivity);
  activityText.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); finishActivity(); } });
  $('[data-activity-cancel]', composer)!.addEventListener('click', () => { activityDetail.classList.add('hidden'); feelingGrid.classList.remove('hidden'); });

  /* Check-in */
  const placeSearch = $<HTMLInputElement>('[data-place-search]', composer)!;
  const placeResults = $('[data-place-results]', composer)!;
  const placeStatus = $('[data-place-status]', composer)!;
  let near: { lat: number; lon: number } | null = null;
  let placeTimer = 0;
  let placeAbort: AbortController | null = null;

  const renderPlaces = (places: ComposerPlace[], emptyText: string) => {
    placeStatus.textContent = places.length ? '' : emptyText;
    placeResults.replaceChildren(...places.map((place) => {
      const item = document.createElement('li');
      const button = document.createElement('button'); button.type = 'button';
      button.className = `flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-hover ${composerState.place?.id === place.id ? 'bg-brand-50' : ''}`;
      const icon = document.createElement('span'); icon.className = 'icon-btn shrink-0 text-[#ff383c]'; icon.appendChild(svgUse('i-pin', 'icon'));
      const text = document.createElement('span'); text.className = 'min-w-0';
      text.append(Object.assign(document.createElement('span'), { className: 'block truncate font-semibold', textContent: place.name }), Object.assign(document.createElement('span'), { className: 'block truncate text-[0.8125rem] text-muted', textContent: place.address }));
      button.append(icon, text);
      button.addEventListener('click', () => { composerState.place = place; paintComposerMeta(); showView('main'); });
      item.appendChild(button); return item;
    }));
  };
  const loadPlaces = async (url: string, emptyText: string) => {
    placeAbort?.abort(); placeAbort = new AbortController();
    placeStatus.textContent = 'Searching…';
    try {
      const response = await fetch(url, { credentials: 'same-origin', signal: placeAbort.signal });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message || 'Search failed.');
      renderPlaces(payload.data.places, emptyText);
    } catch (caught) {
      if ((caught as Error).name === 'AbortError') return;
      placeResults.replaceChildren(); placeStatus.textContent = caught instanceof Error ? caught.message : 'Search failed.';
    }
  };
  placeSearch.addEventListener('input', () => {
    window.clearTimeout(placeTimer);
    const q = placeSearch.value.trim();
    if (q.length < 2) { placeAbort?.abort(); placeResults.replaceChildren(); placeStatus.textContent = q ? 'Keep typing…' : ''; return; }
    placeTimer = window.setTimeout(() => void loadPlaces(`/api/places?q=${encodeURIComponent(q)}${near ? `&lat=${near.lat}&lon=${near.lon}` : ''}`, `No places found for "${q}".`), 350);
  });
  $('[data-place-locate]', composer)!.addEventListener('click', () => {
    if (!navigator.geolocation) { placeStatus.textContent = 'Your browser cannot share your location.'; return; }
    placeStatus.textContent = 'Finding your location…';
    navigator.geolocation.getCurrentPosition((position) => {
      near = { lat: Number(position.coords.latitude.toFixed(4)), lon: Number(position.coords.longitude.toFixed(4)) };
      void loadPlaces(`/api/places/nearby?lat=${near.lat}&lon=${near.lon}`, 'No places found near you.');
    }, () => { placeStatus.textContent = 'Location permission was denied. Search for a place instead.'; }, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 });
  });

  return {
    state: composerState,
    set(feeling: ComposerFeeling | null, place: ComposerPlace | null) {
      composerState.feeling = feeling; composerState.place = place;
      placeSearch.value = ''; placeResults.replaceChildren(); placeStatus.textContent = '';
      showView('main'); paintComposerMeta();
    }
  };
}
if (composer) initPostExtras(composer);

/* ---------- Story composer ---------- */

// The CSP forbids inline style attributes, so server-rendered story styling ships as data and is applied here.
const applyStoryStyles = (root: ParentNode = document) => $$('[data-story-style]', root).forEach((element) => { element.style.cssText = element.dataset.storyStyle || ''; });
applyStoryStyles();

const STORY_IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/gif';
const STORY_VIDEO_TYPES = 'video/mp4,video/webm,video/quicktime';
const STORY_VIDEO_MAX_BYTES = 100 * 1024 * 1024;
const LIGHT_STORY_BACKGROUNDS = new Set(['sun', 'mint', 'paper', 'candy']);

/** Reads a video's length without attaching it to the page; NaN when the browser cannot decode it. */
function videoDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const probe = document.createElement('video');
    probe.preload = 'metadata'; probe.muted = true;
    probe.addEventListener('loadedmetadata', () => resolve(probe.duration), { once: true });
    probe.addEventListener('error', () => resolve(Number.NaN), { once: true });
    probe.src = url;
  });
}

const storyDialog = $<HTMLDialogElement>('#story-dialog');
if (storyDialog) {
  const form = $<HTMLFormElement>('form', storyDialog)!;
  const preview = $('[data-story-preview]', storyDialog)!;
  const previewText = $('[data-story-preview-text]', storyDialog)!;
  const previewImage = $<HTMLImageElement>('[data-story-preview-image]', storyDialog)!;
  const previewVideo = $<HTMLVideoElement>('[data-story-preview-video]', storyDialog)!;
  const textInput = $<HTMLTextAreaElement>('[data-story-text]', storyDialog)!;
  const fileInput = $<HTMLInputElement>('[data-story-file]', storyDialog)!;
  const xInput = $<HTMLInputElement>('[data-story-x]', storyDialog)!;
  const yInput = $<HTMLInputElement>('[data-story-y]', storyDialog)!;
  const counter = $('[data-story-count]', storyDialog)!;
  const backgrounds = $('[data-story-bg-section]', storyDialog)!;
  const mediaActions = $('[data-story-photo-actions]', storyDialog)!;
  const customRadio = $<HTMLInputElement>('[data-story-custom-radio]', storyDialog)!;
  const customColor = $<HTMLInputElement>('[data-story-custom-color]', storyDialog)!;
  const customSwatch = $('[data-story-custom-swatch]', storyDialog)!;
  let mediaUrl: string | null = null;

  const field = (name: string) => String((form.elements.namedItem(name) as RadioNodeList | HTMLInputElement | null)?.value ?? '');
  const setField = (name: string, value: string) => { const input = $<HTMLInputElement>(`input[name="${name}"][value="${value}"]`, form); if (input) input.checked = true; };
  const currentStyle = (): Partial<StoryStyle> => ({
    font: field('font') as StoryStyle['font'], color: field('textColor'), align: field('textAlign') as StoryStyle['align'],
    effect: field('textEffect') as StoryStyle['effect'], animation: field('textAnimation') as StoryStyle['animation'],
    size: Number(field('textSize')), x: Number(xInput.value), y: Number(yInput.value)
  });

  const paint = () => {
    const hasMedia = !!fileInput.files?.length;
    [...preview.classList].filter((name) => name.startsWith('bg-story-')).forEach((name) => preview.classList.remove(name));
    if (!hasMedia) preview.classList.add(`bg-story-${field('background')}`);
    backgrounds.classList.toggle('hidden', hasMedia);
    const attrs = storyTextAttrs(currentStyle(), true);
    previewText.className = `${attrs.className} cursor-move`;
    previewText.style.cssText = attrs.style;
    const text = textInput.value;
    previewText.firstElementChild!.textContent = text || 'Start typing';
    previewText.toggleAttribute('data-empty', !text);
    previewText.classList.toggle('hidden', hasMedia && !text);
    counter.textContent = `${text.length}/250`;
  };

  const showMedia = () => {
    const file = fileInput.files?.[0] ?? null;
    const isVideo = !!file?.type.startsWith('video/');
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    mediaUrl = file ? URL.createObjectURL(file) : null;
    if (file && !isVideo) previewImage.src = mediaUrl!; else previewImage.removeAttribute('src');
    previewImage.classList.toggle('hidden', !file || isVideo);
    previewVideo.classList.toggle('hidden', !isVideo);
    if (isVideo) { previewVideo.src = mediaUrl!; void previewVideo.play().catch(() => undefined); }
    else { previewVideo.pause(); previewVideo.removeAttribute('src'); previewVideo.load(); }
    mediaActions.classList.toggle('hidden', !file); mediaActions.classList.toggle('flex', !!file);
    paint();
  };

  const useFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.type.startsWith('video/')) {
      if (file.size > STORY_VIDEO_MAX_BYTES) { showToast('Story videos must be 100 MB or smaller.', 'error'); return; }
      const url = URL.createObjectURL(file);
      const seconds = await videoDuration(url); URL.revokeObjectURL(url);
      if (Number.isNaN(seconds)) { showToast('This video can’t be played in your browser. Try an MP4 file.', 'error'); return; }
      if (seconds > STORY_VIDEO_MAX_SECONDS + 0.5) { showToast(`Story videos can be up to ${STORY_VIDEO_MAX_SECONDS} seconds long.`, 'error'); return; }
    }
    setInputFiles(fileInput, [file]); showMedia();
  };

  const moveText = (x: number, y: number) => {
    const clampPercent = (value: number) => Math.round(Math.min(Math.max(value, 5), 95) * 10) / 10;
    xInput.value = String(clampPercent(x)); yInput.value = String(clampPercent(y)); paint();
  };

  form.addEventListener('input', paint);
  form.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement;
    // Keep text readable when switching between light and dark backgrounds.
    if (target.name === 'background' && ['#ffffff', '#000000'].includes(field('textColor'))) setField('textColor', LIGHT_STORY_BACKGROUNDS.has(target.value) ? '#000000' : '#ffffff');
    paint();
    if (target.name === 'textAnimation') previewText.getAnimations().forEach((animation) => { animation.cancel(); animation.play(); });
  });
  customColor.addEventListener('input', () => { customRadio.value = customColor.value; customRadio.checked = true; customSwatch.style.background = customColor.value; paint(); });
  customColor.addEventListener('click', () => { customRadio.checked = true; paint(); });

  $$('[data-story-pick]', storyDialog).forEach((button) => button.addEventListener('click', async () => {
    const [file] = await pickImageFiles(false, button.dataset.storyPick === 'video' ? STORY_VIDEO_TYPES : STORY_IMAGE_TYPES); await useFile(file);
  }));
  $$('[data-story-photo]', storyDialog).forEach((button) => button.addEventListener('click', async () => {
    if (button.dataset.storyPhoto === 'replace') { const [file] = await pickImageFiles(false, `${STORY_IMAGE_TYPES},${STORY_VIDEO_TYPES}`); await useFile(file); }
    else { setInputFiles(fileInput, []); showMedia(); }
  }));

  // Drag the text anywhere on the card (pointer) or nudge it with the arrow keys.
  previewText.addEventListener('pointerdown', (event) => {
    event.preventDefault(); previewText.focus(); previewText.setPointerCapture(event.pointerId);
    const rect = preview.getBoundingClientRect();
    const start = { x: event.clientX, y: event.clientY, left: Number(xInput.value), top: Number(yInput.value) };
    const move = (moveEvent: PointerEvent) => moveText(start.left + ((moveEvent.clientX - start.x) / rect.width) * 100, start.top + ((moveEvent.clientY - start.y) / rect.height) * 100);
    const stop = () => { previewText.removeEventListener('pointermove', move); previewText.removeEventListener('pointerup', stop); previewText.removeEventListener('pointercancel', stop); };
    previewText.addEventListener('pointermove', move); previewText.addEventListener('pointerup', stop); previewText.addEventListener('pointercancel', stop);
  });
  previewText.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 10 : 2;
    const delta = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[event.key];
    if (!delta) return;
    event.preventDefault(); moveText(Number(xInput.value) + delta[0], Number(yInput.value) + delta[1]);
  });
  $('[data-story-center]', storyDialog)?.addEventListener('click', () => moveText(50, 50));

  storyDialog.addEventListener('close', () => previewVideo.pause());
  storyDialog.addEventListener('focusin', () => { if (previewVideo.getAttribute('src') && previewVideo.paused) void previewVideo.play().catch(() => undefined); });
  $('[data-story-reset]', storyDialog)?.addEventListener('click', () => {
    // Hidden inputs keep script-set values through reset(), so put the text back in the middle explicitly.
    form.reset(); xInput.value = '50'; yInput.value = '50'; customSwatch.style.background = ''; setInputFiles(fileInput, []); showMedia(); storyDialog.close();
  });
  paint();
}

/* ---------- Profile photo picker (Choose profile picture / cover photo) ---------- */

const picker = $<HTMLDialogElement>('[data-photo-picker]');
type PickerKind = 'avatar' | 'cover' | 'group-cover';
type PickerResult = { url?: string; blob?: Blob; preview: string };
let pickerKind: PickerKind = 'avatar';
let pickerChoice: { url?: string; file?: File } | null = null;
// When set, Save hands the chosen/cropped photo back to the caller (e.g. the group form) instead of updating the profile.
let pickerTarget: ((result: PickerResult) => void) | null = null;

function pickerStep(step: 'list' | 'preview') {
  if (!picker) return;
  $('[data-picker-list]', picker)!.classList.toggle('hidden', step !== 'list');
  $('[data-picker-preview]', picker)!.classList.toggle('hidden', step !== 'preview');
  $$('[data-picker-back]', picker).forEach((button) => { if (button.closest('.relative.border-b')) button.classList.toggle('hidden', step !== 'preview'); });
  $('[data-picker-error]', picker)!.classList.add('hidden');
}

/* Cropper: the image is scaled to cover the frame, then panned (drag / arrows) and zoomed (slider / wheel / +-). */
const CROP_OUTPUT = { avatar: { width: 720, height: 720 }, cover: { width: 1600, height: 600 }, 'group-cover': { width: 1600, height: 600 } };
const MAX_ZOOM = 4;
const crop = { zoom: 1, left: 0, top: 0, baseScale: 1, frameW: 0, frameH: 0, changed: false };

function cropElements() {
  return {
    frame: $('[data-crop-frame]', picker!)!,
    image: $<HTMLImageElement>('[data-picker-image]', picker!)!,
    slider: $<HTMLInputElement>('[data-crop-zoom-input]', picker!)!
  };
}

function cropSize() {
  const { image } = cropElements();
  const scale = crop.baseScale * crop.zoom;
  return { width: image.naturalWidth * scale, height: image.naturalHeight * scale };
}

function renderCrop() {
  const { image, slider } = cropElements();
  const { width, height } = cropSize();
  crop.left = Math.min(0, Math.max(crop.frameW - width, crop.left));
  crop.top = Math.min(0, Math.max(crop.frameH - height, crop.top));
  image.style.width = `${width}px`; image.style.height = `${height}px`;
  image.style.transform = `translate(${crop.left}px, ${crop.top}px)`;
  slider.value = String(crop.zoom);
}

/** Zooms around a point in frame coordinates (defaults to the centre) so the spot under the cursor stays put. */
function setCropZoom(zoom: number, originX = crop.frameW / 2, originY = crop.frameH / 2) {
  const next = Math.min(MAX_ZOOM, Math.max(1, zoom));
  const ratio = next / crop.zoom;
  crop.left = originX - (originX - crop.left) * ratio;
  crop.top = originY - (originY - crop.top) * ratio;
  crop.zoom = next; crop.changed = true; renderCrop();
}

function layoutCropFrame() {
  const { frame, image } = cropElements();
  const mask = $('[data-crop-mask]', picker!)!;
  if (pickerKind === 'avatar') {
    const side = Math.min(320, Math.round(window.innerWidth * 0.72));
    frame.style.width = `${side}px`; frame.style.height = `${side}px`; frame.classList.remove('rounded-lg'); frame.classList.add('rounded-md');
    mask.className = 'pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(255,255,255,0.55)] ring-2 ring-surface';
  } else {
    const width = Math.min(picker!.clientWidth - 48, 640);
    frame.style.width = `${width}px`; frame.style.height = `${Math.round(width * 6 / 16)}px`; frame.classList.add('rounded-lg');
    mask.className = 'pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-white/40';
  }
  crop.frameW = frame.clientWidth; crop.frameH = frame.clientHeight;
  crop.baseScale = Math.max(crop.frameW / image.naturalWidth, crop.frameH / image.naturalHeight);
  crop.zoom = 1;
  const { width, height } = cropSize();
  crop.left = (crop.frameW - width) / 2; crop.top = (crop.frameH - height) / 2;
  crop.changed = false;
  renderCrop();
}

async function showPickerPreview(src: string, choice: { url?: string; file?: File }) {
  if (!picker) return;
  pickerChoice = choice;
  const { image } = cropElements();
  $('[data-picker-note]', picker)!.textContent = pickerKind === 'avatar' ? 'Your profile picture is public and appears next to your posts, comments and messages.' : pickerKind === 'group-cover' ? 'The cover appears at the top of the group and in group suggestions.' : 'Your cover photo is public and appears at the top of your profile.';
  $('[data-crop-hint]', picker)!.classList.remove('hidden');
  pickerStep('preview');
  image.src = src;
  try { await image.decode(); } catch { showToast('This photo could not be opened.', 'error'); pickerStep('list'); return; }
  layoutCropFrame();
}

/** Draws exactly what is inside the frame at the output size and returns it as a JPEG, in a worker when possible. */
async function croppedBlob(): Promise<Blob> {
  const { image } = cropElements();
  const output = CROP_OUTPUT[pickerKind];
  const ratio = output.width / crop.frameW;
  const { width, height } = cropSize();
  const source = pickerChoice?.file || pickerChoice?.url;
  if (source) {
    try {
      const blob = await runImageJob({ task: 'crop', source, draw: { x: crop.left * ratio, y: crop.top * ratio, width: width * ratio, height: height * ratio }, output, quality: 0.9 });
      if (blob) return blob;
    } catch { /* fall back to the main thread */ }
  }
  const canvas = document.createElement('canvas'); canvas.width = output.width; canvas.height = output.height;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, crop.left * ratio, crop.top * ratio, width * ratio, height * ratio);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not crop this photo.'))), 'image/jpeg', 0.9));
}

if (picker) {
  const { frame, slider } = cropElements();
  let drag: { x: number; y: number; left: number; top: number } | null = null;
  frame.addEventListener('pointerdown', (event) => {
    drag = { x: event.clientX, y: event.clientY, left: crop.left, top: crop.top };
    frame.setPointerCapture(event.pointerId); $('[data-crop-hint]', picker)!.classList.add('hidden');
  });
  frame.addEventListener('pointermove', (event) => {
    if (!drag) return;
    crop.left = drag.left + event.clientX - drag.x; crop.top = drag.top + event.clientY - drag.y; crop.changed = true; renderCrop();
  });
  const endDrag = () => { drag = null; };
  frame.addEventListener('pointerup', endDrag); frame.addEventListener('pointercancel', endDrag);
  frame.addEventListener('wheel', (event) => {
    event.preventDefault();
    const rect = frame.getBoundingClientRect();
    setCropZoom(crop.zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08), event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });
  frame.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 40 : 10;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[event.key]) { event.preventDefault(); crop.left += moves[event.key]![0]; crop.top += moves[event.key]![1]; crop.changed = true; renderCrop(); }
    else if (event.key === '+' || event.key === '=') { event.preventDefault(); setCropZoom(crop.zoom + 0.1); }
    else if (event.key === '-') { event.preventDefault(); setCropZoom(crop.zoom - 0.1); }
  });
  slider.addEventListener('input', () => setCropZoom(Number(slider.value)));
  $$('[data-crop-zoom]', picker).forEach((button) => button.addEventListener('click', () => setCropZoom(crop.zoom + Number(button.dataset.cropZoom) * 0.2)));
}

let pickerArtwork: string[] = [];
let pickerDirty = false;

async function deleteLibraryPhoto(url: string) {
  if (!(await confirmAction('Delete this photo?', 'It is removed from your photos, your profile and any post that uses it. Empty posts move to trash.', 'Delete'))) return;
  try {
    await request('/api/profile/photos', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
    pickerDirty = true; showToast('Photo deleted.');
    void openPhotoPicker(pickerKind, pickerTarget, pickerArtwork);
  } catch (caught) { showToast(caught instanceof Error ? caught.message : 'Could not delete photo.', 'error'); }
}

function pickerSection(title: string, urls: string[], deletable = true) {
  const section = document.createElement('section'); section.className = 'mt-5';
  const heading = document.createElement('h3'); heading.className = 'text-[1.0625rem] font-bold'; heading.textContent = title;
  const grid = document.createElement('div'); grid.className = 'mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6';
  urls.forEach((url, index) => {
    const tile = document.createElement('div');
    tile.className = `group/tile relative aspect-square overflow-hidden rounded-md bg-field ${index >= 6 ? 'hidden' : ''}`;
    const button = document.createElement('button'); button.type = 'button';
    button.className = 'block size-full ring-brand-600 transition hover:opacity-90 focus-visible:ring-4';
    button.setAttribute('aria-label', pickerKind === 'avatar' ? 'Use this photo as your profile picture' : 'Use this photo as the cover');
    const img = document.createElement('img'); img.src = url; img.alt = ''; img.loading = 'lazy'; img.className = 'size-full object-cover';
    button.appendChild(img); button.addEventListener('click', () => showPickerPreview(url, { url }));
    tile.appendChild(button);
    if (deletable) {
      const remove = document.createElement('button'); remove.type = 'button';
      remove.className = 'absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-surface/95 text-ink shadow-float transition-opacity hover:bg-surface sm:opacity-0 sm:group-hover/tile:opacity-100 sm:focus-visible:opacity-100';
      remove.setAttribute('aria-label', 'Delete this photo'); remove.title = 'Delete photo';
      remove.appendChild(svgUse('i-trash', 'icon size-4')); remove.addEventListener('click', () => void deleteLibraryPhoto(url));
      tile.appendChild(remove);
    }
    grid.appendChild(tile);
  });
  section.append(heading, grid);
  if (urls.length > 6) {
    const more = document.createElement('button'); more.type = 'button'; more.className = 'btn-secondary mt-2 w-full'; more.textContent = 'See more';
    more.addEventListener('click', () => { $$('.hidden', grid).forEach((item) => item.classList.remove('hidden')); more.remove(); });
    section.appendChild(more);
  }
  return section;
}

async function openPhotoPicker(kind: PickerKind, target: ((result: PickerResult) => void) | null = null, artwork: string[] = []) {
  if (!picker) return;
  pickerKind = kind; pickerChoice = null; pickerTarget = target; pickerArtwork = artwork;
  $('[data-picker-title]', picker)!.textContent = kind === 'avatar' ? 'Choose profile picture' : kind === 'group-cover' ? 'Choose group cover' : 'Choose cover photo';
  $<HTMLInputElement>('[data-picker-file]', picker)!.value = '';
  pickerStep('list'); if (!picker.open) picker.showModal();
  const sections = $('[data-picker-sections]', picker)!;
  sections.replaceChildren(Object.assign(document.createElement('p'), { className: 'py-8 text-center text-muted', textContent: 'Loading your photos…' }));
  try {
    const library = await request('/api/profile/photos');
    const current = kind === 'avatar' ? library.current.avatarUrl : library.current.coverUrl;
    $('[data-picker-remove]', picker)!.classList.toggle('hidden', !current || kind === 'group-cover');
    const yourPhotos = [...new Set([...library.uploads, ...library.coverPhotos, ...library.profilePictures])] as string[];
    const groups: Array<[string, string[]]> = kind === 'group-cover'
      ? [['Artwork', artwork], ['Your photos', yourPhotos]]
      : [['Suggested photos', library.suggested], ['Uploads', library.uploads], kind === 'avatar' ? ['Profile pictures', library.profilePictures] : ['Cover photos', library.coverPhotos]];
    const filled = groups.filter(([, urls]) => urls.length);
    sections.replaceChildren(...(filled.length ? filled.map(([title, urls]) => pickerSection(title, urls, title !== 'Artwork')) : [Object.assign(document.createElement('p'), { className: 'py-10 text-center text-muted', textContent: 'No photos yet. Upload one to get started.' })]));
  } catch (caught) {
    sections.replaceChildren(Object.assign(document.createElement('p'), { className: 'py-8 text-center text-ios-red', textContent: caught instanceof Error ? caught.message : 'Could not load photos.' }));
  }
}

if (picker) {
  // Deleting photos can change the current avatar/cover, so refresh the page once the picker closes.
  picker.addEventListener('close', () => { if (pickerDirty && !pickerTarget) window.location.reload(); pickerDirty = false; });
  $<HTMLInputElement>('[data-picker-file]', picker)!.addEventListener('change', async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) showPickerPreview(await readAsDataUrl(file), { file });
  });
  $$('[data-picker-back]', picker).forEach((button) => button.addEventListener('click', () => { pickerChoice = null; pickerStep('list'); }));
  const savePhoto = async (body: FormData | Record<string, unknown>, button: HTMLButtonElement) => {
    button.disabled = true;
    try {
      if (body instanceof FormData) await request('/api/profile/photo', { method: 'POST', body });
      else await postJson('/api/profile/photo', body);
      window.location.reload();
    } catch (caught) {
      const error = $('[data-picker-error]', picker)!;
      error.textContent = caught instanceof Error ? caught.message : 'Could not update photo.'; error.classList.remove('hidden');
      if ($('[data-picker-preview]', picker)!.classList.contains('hidden')) showToast(error.textContent, 'error');
    } finally { button.disabled = false; }
  };
  $<HTMLButtonElement>('[data-picker-save]', picker)!.addEventListener('click', (event) => {
    if (!pickerChoice) return;
    const button = event.currentTarget as HTMLButtonElement;
    if (pickerTarget) {
      const deliver = pickerTarget;
      if (!pickerChoice.file && !crop.changed) { deliver({ url: pickerChoice.url, preview: pickerChoice.url! }); picker.close(); return; }
      button.disabled = true;
      croppedBlob().then(async (blob) => { deliver({ blob, preview: await readAsDataUrl(new File([blob], 'cover.jpg', { type: blob.type })) }); picker.close(); })
        .catch((caught) => showToast(caught instanceof Error ? caught.message : 'Could not crop this photo.', 'error'))
        .finally(() => { button.disabled = false; });
      return;
    }
    // An untouched library photo is reused as-is; anything uploaded or repositioned is saved as the cropped result.
    if (!pickerChoice.file && !crop.changed) { void savePhoto({ kind: pickerKind, url: pickerChoice.url }, button); return; }
    button.disabled = true;
    croppedBlob().then((blob) => {
      const form = new FormData(); form.append('kind', pickerKind); form.append('photo', blob, `${pickerKind}.jpg`);
      return savePhoto(form, button);
    }).catch((caught) => { button.disabled = false; showToast(caught instanceof Error ? caught.message : 'Could not crop this photo.', 'error'); });
  });
  $<HTMLButtonElement>('[data-picker-remove]', picker)!.addEventListener('click', async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    if (!(await confirmAction(pickerKind === 'avatar' ? 'Remove profile picture?' : 'Remove cover photo?', 'You can choose it again later from your photos.', 'Remove'))) return;
    void savePhoto({ kind: pickerKind, remove: true }, button);
  });
}

// Live "characters remaining" counters.
$$<HTMLTextAreaElement>('[data-char-count]').forEach((field) => field.addEventListener('input', () => {
  const counter = document.getElementById(field.dataset.charCount!); if (counter) counter.textContent = String(field.maxLength - field.value.length);
}));

/* ---------- Photo actions: file picking, action menu, editable thumbnails ---------- */

const IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/gif';
const MEDIA_TYPES = `${IMAGE_TYPES},video/mp4,video/webm,video/quicktime`;

/** Opens the OS file chooser without needing an <input> in the markup. Resolves with [] when cancelled. */
function pickImageFiles(multiple = false, accept = IMAGE_TYPES): Promise<File[]> {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept, multiple, className: 'hidden' });
    const done = (files: File[]) => { input.remove(); resolve(files); };
    input.addEventListener('change', () => done([...(input.files || [])]), { once: true });
    input.addEventListener('cancel', () => done([]), { once: true });
    document.body.appendChild(input); input.click();
  });
}

const pickMediaFiles = (multiple = false) => pickImageFiles(multiple, MEDIA_TYPES);
const isVideoUrl = (url: string) => /\.(mp4|webm|mov)(#.*)?$/i.test(url);

/** Object URLs avoid base64-encoding large videos; one URL per file is reused across repaints. */
const previewUrls = new WeakMap<File, string>();
function previewUrl(file: File) {
  let url = previewUrls.get(file);
  if (!url) { url = URL.createObjectURL(file); previewUrls.set(file, url); }
  return url;
}

function setInputFiles(input: HTMLInputElement, files: File[]) {
  const transfer = new DataTransfer();
  files.forEach((file) => transfer.items.add(file));
  input.files = transfer.files;
}

type PhotoMenuItem = { label: string; icon: string; danger?: boolean; run: () => unknown };
let photoMenuEl: HTMLElement | null = null;
const closePhotoMenu = () => { photoMenuEl?.remove(); photoMenuEl = null; };

function openPhotoMenu(anchor: HTMLElement, items: PhotoMenuItem[]) {
  closePhotoMenu();
  const menu = document.createElement('div');
  menu.className = 'menu fixed w-64';
  menu.setAttribute('role', 'menu');
  items.forEach((item) => {
    const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'menuitem');
    button.className = `menu-item ${item.danger ? 'text-ios-red' : ''}`;
    const icon = document.createElement('span'); icon.className = 'menu-icon'; icon.appendChild(svgUse(item.icon, 'icon'));
    button.append(icon, item.label);
    button.addEventListener('click', () => { closePhotoMenu(); void item.run(); });
    menu.appendChild(button);
  });
  (anchor.closest('dialog') || document.body).appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  const left = Math.min(Math.max(8, rect.right - menu.offsetWidth), window.innerWidth - menu.offsetWidth - 8);
  const below = rect.bottom + 6;
  menu.style.left = `${left}px`;
  menu.style.top = `${below + menu.offsetHeight > window.innerHeight - 8 ? Math.max(8, rect.top - menu.offsetHeight - 6) : below}px`;
  photoMenuEl = menu;
  ($('button', menu) as HTMLButtonElement | null)?.focus();
}

/** Thumbnail grid where every photo/video has Replace / Remove buttons, plus an "Add" tile (while below `max`, if one is set). */
function renderPhotoTiles(container: HTMLElement, tiles: Array<{ src: string; video?: boolean }>, actions: { replace: (index: number) => void; remove: (index: number) => void; add?: () => void; max?: number }) {
  const max = actions.max ?? Infinity;
  const canAdd = !!actions.add && tiles.length < max;
  const single = tiles.length === 1 && !canAdd;
  const tileButton = (icon: string, label: string, onClick: () => void) => {
    const button = document.createElement('button'); button.type = 'button';
    button.className = 'grid size-8 place-items-center rounded-full bg-surface/95 text-ink shadow-float hover:bg-surface';
    button.setAttribute('aria-label', label); button.title = label;
    button.appendChild(svgUse(icon, 'icon size-4')); button.addEventListener('click', onClick);
    return button;
  };
  const nodes: HTMLElement[] = tiles.map((tile, index) => {
    const wrap = document.createElement('div');
    wrap.className = `relative overflow-hidden rounded-md bg-field ${single ? 'aspect-[4/3]' : 'aspect-square'}`;
    const kind = tile.video ? 'video' : 'photo';
    const preview = tile.video
      ? Object.assign(document.createElement('video'), { src: tile.src, muted: true, playsInline: true, preload: 'metadata', className: 'size-full bg-black object-cover' })
      : Object.assign(document.createElement('img'), { src: tile.src, alt: `Photo ${index + 1}`, className: 'size-full object-cover' });
    wrap.appendChild(preview);
    if (tile.video) {
      const badge = document.createElement('span'); badge.className = 'pointer-events-none absolute inset-0 grid place-items-center';
      const circle = document.createElement('span'); circle.className = 'grid size-10 place-items-center rounded-full bg-black/55 text-white';
      circle.appendChild(svgUse('i-play', 'icon size-5 translate-x-px fill-current')); badge.appendChild(circle); wrap.appendChild(badge);
    }
    const bar = document.createElement('div'); bar.className = 'absolute right-1.5 top-1.5 flex gap-1';
    bar.append(tileButton('i-edit', `Replace ${kind} ${index + 1}`, () => actions.replace(index)), tileButton('i-x', `Remove ${kind} ${index + 1}`, () => actions.remove(index)));
    wrap.appendChild(bar); return wrap;
  });
  if (canAdd) {
    const add = document.createElement('button'); add.type = 'button';
    add.className = 'grid aspect-square place-items-center rounded-md border-2 border-dashed border-strong text-muted hover:bg-hover';
    const inner = document.createElement('span'); inner.className = 'flex flex-col items-center gap-1 text-[0.8125rem] font-semibold';
    inner.append(svgUse('i-plus', 'icon size-6'), Number.isFinite(max) ? `Add photos/videos (${tiles.length}/${max})` : 'Add photos/videos');
    add.appendChild(inner); add.addEventListener('click', actions.add); nodes.push(add);
  }
  container.replaceChildren(...nodes);
  const columns = single ? 1 : nodes.length > 4 ? 3 : 2;
  container.classList.toggle('grid-cols-1', columns === 1); container.classList.toggle('grid-cols-2', columns === 2); container.classList.toggle('grid-cols-3', columns === 3);
}

/* Create post: draft photos and videos */
const composerFilesInput = $<HTMLInputElement>('[data-composer-files]');
let draftFiles: File[] = [];
async function paintDraftPhotos() {
  if (!composerFilesInput) return;
  setInputFiles(composerFilesInput, draftFiles);
  const previews = $('[data-composer-previews]')!;
  renderPhotoTiles(previews, draftFiles.map((file) => ({ src: previewUrl(file), video: file.type.startsWith('video/') })), {
    replace: async (index) => { const [file] = await pickMediaFiles(); if (file) { draftFiles[index] = file; void paintDraftPhotos(); } },
    remove: (index) => { draftFiles.splice(index, 1); void paintDraftPhotos(); },
    add: async () => addDraftPhotos(await pickMediaFiles(true))
  });
  previews.classList.toggle('hidden', draftFiles.length === 0);
}
function addDraftPhotos(files: File[]) {
  if (!files.length) return;
  draftFiles = [...draftFiles, ...files];
  void paintDraftPhotos();
}
composerFilesInput?.addEventListener('change', () => addDraftPhotos([...(composerFilesInput.files || [])]));

/* Edit post: keep, replace, remove or add photos and videos */
const editPostForm = $<HTMLFormElement>('[data-edit-post-form]');
let editSlots: Array<{ id?: string; file?: File; src: string; video?: boolean }> = [];
const fileSlot = (file: File) => ({ file, src: previewUrl(file), video: file.type.startsWith('video/') });
function paintEditSlots() {
  const container = $('[data-edit-media]', editPostForm!);
  if (!container) return;
  renderPhotoTiles(container, editSlots, {
    replace: async (index) => { const [file] = await pickMediaFiles(); if (file) { editSlots[index] = fileSlot(file); paintEditSlots(); } },
    remove: (index) => { editSlots.splice(index, 1); paintEditSlots(); },
    add: async () => { editSlots.push(...(await pickMediaFiles(true)).map(fileSlot)); paintEditSlots(); }
  });
}
const editDialog = $<HTMLDialogElement>('#edit-post-dialog');
const editExtras = editDialog ? initPostExtras(editDialog) : null;
const VISIBILITY_ICONS: Record<string, string> = { public: 'i-globe', followers: 'i-users', private: 'i-lock' };
const editVisibility = editPostForm ? $<HTMLSelectElement>('[data-edit-visibility]', editPostForm) : null;
const paintEditVisibility = () => $('[data-edit-visibility-icon]', editPostForm!)?.setAttribute('href', `#${VISIBILITY_ICONS[editVisibility!.value] || 'i-globe'}`);
editVisibility?.addEventListener('change', paintEditVisibility);
$('[data-edit-add-media]', editPostForm || document)?.addEventListener('click', async () => { editSlots.push(...(await pickMediaFiles(true)).map(fileSlot)); paintEditSlots(); });

type EditablePost = { visibility?: string; feeling?: ComposerFeeling | null; place?: ComposerPlace | null; group?: string };
function openEditPost(postId: string, card: Element | null) {
  if (!editPostForm) return;
  editPostForm.dataset.postId = postId;
  $<HTMLTextAreaElement>('#edit-post-content', editPostForm)!.value = $('[data-post-content]', card || document)?.textContent?.trim() || '';
  try { editSlots = JSON.parse((card as HTMLElement | null)?.dataset.postMedia || '[]').map((media: { id: string; url: string; mimeType?: string }) => ({ id: media.id, src: media.url, video: String(media.mimeType).startsWith('video/') })); } catch { editSlots = []; }
  let post: EditablePost = {};
  try { post = JSON.parse((card as HTMLElement | null)?.dataset.postEdit || '{}'); } catch { post = {}; }
  // Group posts follow the group's privacy, so they have no audience of their own.
  editPostForm.dataset.inGroup = post.group ? 'true' : '';
  $('[data-edit-visibility-wrap]', editPostForm)!.classList.toggle('hidden', !!post.group);
  $('[data-edit-group-label]', editPostForm)!.textContent = post.group ? ` ▸ ${post.group}` : '';
  if (editVisibility) { editVisibility.value = post.visibility || 'public'; paintEditVisibility(); }
  editExtras?.set(post.feeling || null, post.place || null);
  $('[data-form-error]', editPostForm)!.classList.add('hidden');
  paintEditSlots(); openDialog('edit-post-dialog'); $<HTMLTextAreaElement>('#edit-post-content', editPostForm)!.focus();
}
editPostForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = $<HTMLButtonElement>('button[type="submit"]', editPostForm)!;
  const error = $('[data-form-error]', editPostForm)!;
  const body = new FormData();
  body.append('content', $<HTMLTextAreaElement>('#edit-post-content', editPostForm)!.value);
  if (!editPostForm.dataset.inGroup && editVisibility) body.append('visibility', editVisibility.value);
  // Always sent so removing a feeling or check-in also saves ("" = remove).
  body.append('feeling', editExtras?.state.feeling ? JSON.stringify(editExtras.state.feeling) : '');
  body.append('place', editExtras?.state.place ? JSON.stringify(editExtras.state.place) : '');
  submit.disabled = true; error.classList.add('hidden');
  let upload = 0;
  const optimized = await Promise.all(editSlots.map((slot) => (slot.file ? optimizeUpload(slot.file) : null)));
  const layout = editSlots.map((slot, index) => {
    if (slot.id) return { id: slot.id };
    body.append('images', optimized[index]!); return { upload: upload++ };
  });
  body.append('layout', JSON.stringify(layout));
  try { await request(`/api/posts/${editPostForm.dataset.postId}`, { method: 'PATCH', body }); window.location.reload(); }
  catch (caught) { error.textContent = caught instanceof Error ? caught.message : 'Could not save the post.'; error.classList.remove('hidden'); }
  finally { submit.disabled = false; }
});

/* "…" menus on photos (post images, profile picture, cover) */
async function photoMenuFor(trigger: HTMLElement): Promise<PhotoMenuItem[]> {
  const { photoMenu: kind, url = '', post, media } = trigger.dataset;
  const noun = kind === 'post' && isVideoUrl(url) ? 'video' : 'photo';
  const view: PhotoMenuItem = { label: kind === 'avatar' ? 'View profile picture' : kind === 'cover' ? 'View cover photo' : `View ${noun}`, icon: 'i-eye', run: () => openPhotoViewer(url, post) };
  if (kind === 'post') {
    return [view,
      { label: `Replace ${noun}`, icon: 'i-edit', run: async () => {
        const [file] = await pickMediaFiles(); if (!file) return;
        const body = new FormData(); body.append('photo', await optimizeUpload(file));
        try { await request(`/api/posts/${post}/media/${media}`, { method: 'PUT', body }); window.location.reload(); }
        catch (caught) { showToast(caught instanceof Error ? caught.message : `Could not replace ${noun}.`, 'error'); }
      } },
      { label: `Delete ${noun}`, icon: 'i-trash', danger: true, run: async () => {
        if (!(await confirmAction(`Delete this ${noun}?`, 'It will be removed from the post. A post left empty moves to trash.', 'Delete'))) return;
        try { const result = await request(`/api/posts/${post}/media/${media}`, { method: 'DELETE' }); showToast(result.message); window.setTimeout(() => window.location.reload(), 500); }
        catch (caught) { showToast(caught instanceof Error ? caught.message : `Could not delete ${noun}.`, 'error'); }
      } }];
  }
  const photoKind = kind === 'cover' ? 'cover' : 'avatar';
  const items: PhotoMenuItem[] = url ? [view] : [];
  items.push({ label: url ? (photoKind === 'avatar' ? 'Replace profile picture' : 'Replace cover photo') : (photoKind === 'avatar' ? 'Add profile picture' : 'Add cover photo'), icon: 'i-camera', run: () => openPhotoPicker(photoKind) });
  if (url) items.push({ label: 'Remove', icon: 'i-trash', danger: true, run: async () => {
    if (!(await confirmAction(photoKind === 'avatar' ? 'Remove profile picture?' : 'Remove cover photo?', 'You can choose it again later from your photos.', 'Remove'))) return;
    try { await postJson('/api/profile/photo', { kind: photoKind, remove: true }); window.location.reload(); }
    catch (caught) { showToast(caught instanceof Error ? caught.message : 'Could not remove photo.', 'error'); }
  } });
  return items;
}

document.addEventListener('click', async (event) => {
  const trigger = (event.target as HTMLElement).closest<HTMLElement>('[data-photo-menu]');
  if (trigger) {
    event.preventDefault(); event.stopPropagation();
    if (photoMenuEl) { closePhotoMenu(); return; }
    openPhotoMenu(trigger, await photoMenuFor(trigger));
    return;
  }
  if (photoMenuEl && !photoMenuEl.contains(event.target as Node)) closePhotoMenu();
}, true);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && photoMenuEl) { event.preventDefault(); event.stopPropagation(); closePhotoMenu(); } }, true);

/* ---------- Photo viewer (Facebook "theater": photo on black + post column) ---------- */

const photoViewer = $<HTMLDialogElement>('[data-photo-viewer]');
let openPhotoViewer: (url: string, postId?: string) => void = () => undefined;

if (photoViewer) {
  const stage = $('[data-viewer-stage]', photoViewer)!;
  const image = $<HTMLImageElement>('[data-lightbox-image]', photoViewer)!;
  const video = $<HTMLVideoElement>('[data-lightbox-video]', photoViewer)!;
  const panel = $('[data-viewer-panel]', photoViewer)!;
  const commentsList = $('[data-viewer-comments]', photoViewer)!;
  const commentForm = $<HTMLFormElement>('[data-viewer-comment-form]', photoViewer)!;
  const commentInput = $<HTMLInputElement>('#viewer-comment', photoViewer)!;
  const MAX_ZOOM = 3;
  let photos: string[] = [];
  let index = 0;
  let post: any = null;
  let comments: any[] = [];
  let commentsFeed: InfiniteList | null = null;
  let replyTo: { id: string; name: string } | null = null;
  let canModerate = false;
  let zoom = 1, panX = 0, panY = 0;
  let loadToken = 0;

  /* Photo + zoom */
  const applyZoom = () => {
    if (zoom === 1) { panX = 0; panY = 0; }
    image.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    image.style.cursor = zoom > 1 ? 'grab' : 'zoom-in';
    $<HTMLButtonElement>('[data-viewer-zoom="in"]', photoViewer)!.disabled = zoom >= MAX_ZOOM;
    $<HTMLButtonElement>('[data-viewer-zoom="out"]', photoViewer)!.disabled = zoom <= 1;
  };
  const setZoom = (value: number) => { zoom = Math.min(MAX_ZOOM, Math.max(1, Math.round(value * 100) / 100)); applyZoom(); };
  const stopVideo = () => { video.pause(); video.removeAttribute('src'); video.load(); };
  const showPhoto = (next: number) => {
    index = (next + photos.length) % photos.length;
    const url = photos[index]!;
    const isVideo = isVideoUrl(url);
    image.classList.toggle('hidden', isVideo); video.classList.toggle('hidden', !isVideo);
    $$<HTMLButtonElement>('[data-viewer-zoom]', photoViewer).forEach((button) => button.classList.toggle('hidden', isVideo));
    if (isVideo) {
      image.removeAttribute('src');
      if (video.getAttribute('src') !== url) { video.src = url; void video.play().catch(() => undefined); }
      video.setAttribute('aria-label', post?.media?.[index]?.alt || `Video ${index + 1}`);
    } else { stopVideo(); image.src = url; image.alt = post?.media?.[index]?.alt || `Photo ${index + 1}`; }
    zoom = 1; applyZoom();
    const multiple = photos.length > 1;
    $$('[data-viewer-nav]', photoViewer).forEach((button) => { button.classList.toggle('hidden', !multiple); button.classList.toggle('grid', multiple); });
    const counter = $('[data-viewer-counter]', photoViewer)!; counter.classList.toggle('hidden', !multiple); counter.textContent = `${index + 1} / ${photos.length}`;
  };
  $$('[data-viewer-nav]', photoViewer).forEach((button) => button.addEventListener('click', () => showPhoto(index + Number(button.dataset.viewerNav))));
  $$('[data-viewer-zoom]', photoViewer).forEach((button) => button.addEventListener('click', () => setZoom(zoom + (button.dataset.viewerZoom === 'in' ? 0.5 : -0.5))));
  image.addEventListener('dblclick', () => setZoom(zoom > 1 ? 1 : 2));
  image.addEventListener('click', () => { if (zoom === 1) setZoom(2); });
  stage.addEventListener('wheel', (event) => { if (!image.src || image.classList.contains('hidden')) return; event.preventDefault(); setZoom(zoom + (event.deltaY < 0 ? 0.25 : -0.25)); }, { passive: false });
  let drag: { x: number; y: number; panX: number; panY: number } | null = null;
  image.addEventListener('pointerdown', (event) => { if (zoom === 1) return; drag = { x: event.clientX, y: event.clientY, panX, panY }; image.setPointerCapture(event.pointerId); image.style.cursor = 'grabbing'; image.classList.remove('transition-transform'); });
  image.addEventListener('pointermove', (event) => { if (!drag) return; panX = drag.panX + event.clientX - drag.x; panY = drag.panY + event.clientY - drag.y; applyZoom(); });
  const endDrag = () => { if (!drag) return; drag = null; image.classList.add('transition-transform'); applyZoom(); };
  image.addEventListener('pointerup', endDrag); image.addEventListener('pointercancel', endDrag);

  const fullscreenButton = $('[data-viewer-fullscreen]', photoViewer)!;
  fullscreenButton.addEventListener('click', () => { if (document.fullscreenElement) void document.exitFullscreen(); else void stage.requestFullscreen?.(); });
  document.addEventListener('fullscreenchange', () => {
    const on = document.fullscreenElement === stage;
    fullscreenButton.setAttribute('aria-label', on ? 'Exit full screen' : 'Enter full screen');
    $('use', fullscreenButton)?.setAttribute('href', on ? '#i-shrink' : '#i-expand');
  });
  photoViewer.addEventListener('keydown', (event) => {
    if ((event.target as HTMLElement).closest('input, textarea')) return;
    if (event.key === 'ArrowRight' && photos.length > 1) showPhoto(index + 1);
    else if (event.key === 'ArrowLeft' && photos.length > 1) showPhoto(index - 1);
    else if ((event.target as HTMLElement).closest('video')) return;
    else if (event.key === '+' || event.key === '=') setZoom(zoom + 0.5);
    else if (event.key === '-') setZoom(zoom - 0.5);
  });
  // `close` fires asynchronously; skip the reset if the viewer was reopened in the meantime.
  photoViewer.addEventListener('close', () => { if (document.fullscreenElement) void document.exitFullscreen(); if (!photoViewer.open) { image.removeAttribute('src'); stopVideo(); loadToken++; } });

  /* Post column */
  const togglePanelButtons = $$('[data-viewer-toggle-panel]', photoViewer);
  togglePanelButtons.forEach((button) => button.addEventListener('click', () => panel.classList.toggle('max-lg:hidden')));

  const paintReactions = () => {
    const holder = $('[data-viewer-reactions]', photoViewer)!;
    const top: string[] = post.topReactions?.length ? post.topReactions : post.reactionCount ? ['like'] : [];
    const icons = document.createElement('span'); icons.className = 'flex -space-x-1';
    top.forEach((type) => icons.appendChild(svgUse(`r-${type}`, 'size-[1.125rem] rounded-full ring-2 ring-surface')));
    holder.replaceChildren(...(post.reactionCount ? [icons, document.createTextNode(new Intl.NumberFormat('en', { notation: 'compact' }).format(post.reactionCount))] : []));
    $('[data-viewer-comment-count]', photoViewer)!.textContent = post.commentCount ? `${post.commentCount} ${post.commentCount === 1 ? 'comment' : 'comments'}` : '';
    const like = $<HTMLButtonElement>('[data-viewer-like]', photoViewer)!;
    Object.values(REACTION_STYLE).forEach((style) => like.classList.remove(style.color));
    like.replaceChildren();
    if (post.myReaction) { like.classList.add(REACTION_STYLE[post.myReaction]!.color); like.appendChild(svgUse(`r-${post.myReaction}`, 'size-[1.125rem]')); }
    else like.appendChild(svgUse('i-like', 'icon'));
    like.append(Object.assign(document.createElement('span'), { textContent: post.myReaction ? REACTION_STYLE[post.myReaction]!.label : 'Like' }));
    like.setAttribute('aria-pressed', String(!!post.myReaction));
  };

  const commentNode = (comment: any, isReply: boolean) => {
    const author = comment.authorId || {};
    const item = document.createElement('li'); item.className = `flex gap-2 ${isReply ? 'ml-10' : ''}`;
    item.dataset.commentId = String(comment._id); item.dataset.commentPost = String(post?._id || '');
    const link = Object.assign(document.createElement('a'), { href: `/profile/${author.username}`, className: 'shrink-0' });
    link.appendChild(avatarEl({ displayName: author.displayName, avatarUrl: author.profile?.avatarUrl || author.avatarUrl }, isReply ? 'size-7 text-2xs' : 'size-8 text-xs'));
    const body = document.createElement('div'); body.className = 'min-w-0 flex-1';
    const bubble = document.createElement('div'); bubble.className = 'comment-bubble';
    const text = Object.assign(document.createElement('p'), { className: 'whitespace-pre-wrap break-words text-15 leading-snug', textContent: comment.content }); text.dataset.commentText = '';
    bubble.append(Object.assign(document.createElement('a'), { href: `/profile/${author.username}`, className: 'block text-[0.8125rem] font-semibold hover:underline', textContent: author.displayName }), text);
    const own = !!me.id && String(author._id || '') === me.id;
    const menu = commentMenu(String(comment._id), own, own || canModerate);
    const meta = document.createElement('div'); meta.className = 'mt-0.5 flex gap-3 px-3 text-xs font-semibold text-muted'; meta.dataset.commentMeta = '';
    meta.append(Object.assign(document.createElement('span'), { className: 'font-normal', textContent: timeAgo(comment.createdAt) }));
    const reply = Object.assign(document.createElement('button'), { type: 'button', className: 'hover:underline', textContent: 'Reply' });
    reply.addEventListener('click', () => {
      replyTo = { id: String(comment.parentId || comment._id), name: author.displayName };
      const banner = $('[data-viewer-replying]', photoViewer)!; banner.classList.remove('hidden'); banner.classList.add('flex');
      $('span', banner)!.textContent = `Replying to ${author.displayName}`; commentInput.focus();
    });
    meta.append(reply, editedLabel(comment.editedAt));
    body.append(commentRow(bubble, menu), meta); item.append(link, body); return item;
  };
  // Keep the viewer's copy in sync when a comment is edited or deleted from any rendering.
  document.addEventListener('oremus:comment-edited', (event) => {
    const { id, content, editedAt } = (event as CustomEvent).detail;
    comments = comments.map((comment) => String(comment._id) === id ? { ...comment, content, editedAt } : comment);
  });
  document.addEventListener('oremus:comment-removed', (event) => {
    const { removed, postId, commentCount } = (event as CustomEvent).detail;
    if (!post || String(post._id) !== postId) return;
    comments = comments.filter((comment) => !removed.includes(String(comment._id)));
    post.commentCount = commentCount; paintComments(); paintReactions();
  });
  /** Top-level comments (keyed, so the endless list can count them) each followed by their replies. */
  const threadNodes = (source: any[]) => source.filter((comment) => !comment.parentId).flatMap((root) => {
    const node = commentNode(root, false); node.dataset.key = String(root._id);
    return [node, ...source.filter((comment) => String(comment.parentId) === String(root._id)).map((child) => commentNode(child, true))];
  });
  const paintComments = () => {
    const nodes = threadNodes(comments);
    commentsList.replaceChildren(...(nodes.length ? nodes : [Object.assign(document.createElement('li'), { className: 'py-6 text-center text-15 text-muted', textContent: 'No comments yet. Be the first to comment.' })]));
    commentsFeed?.refresh();
  };
  const clearReply = () => { replyTo = null; const banner = $('[data-viewer-replying]', photoViewer)!; banner.classList.add('hidden'); banner.classList.remove('flex'); };
  $('[data-viewer-cancel-reply]', photoViewer)!.addEventListener('click', clearReply);

  const paintPanel = () => {
    const author = post.authorId || {};
    const avatarHolder = $('[data-viewer-avatar]', photoViewer)!;
    avatarHolder.replaceChildren(avatarEl({ displayName: author.displayName, avatarUrl: author.profile?.avatarUrl }, 'size-10 text-sm'));
    $<HTMLAnchorElement>('[data-viewer-author-link]', photoViewer)!.href = `/profile/${author.username}`;
    const title = $('[data-viewer-title]', photoViewer)!;
    title.replaceChildren(Object.assign(document.createElement('a'), { href: `/profile/${author.username}`, className: 'font-semibold hover:underline', textContent: author.displayName }));
    const feeling = describeFeeling(post.feeling);
    if (feeling || post.place) title.append(` is${feeling ? ` ${feeling.emoji} ${feeling.text}` : ''}${post.place ? ` at ${post.place.name}` : ''}.`);
    const time = $<HTMLAnchorElement>('[data-viewer-time]', photoViewer)!; time.href = `/posts/${post._id}`; time.textContent = timeAgo(post.createdAt);
    $('[data-viewer-privacy]', photoViewer)!.setAttribute('href', post.visibility === 'private' ? '#i-lock' : post.visibility === 'followers' ? '#i-users' : '#i-globe');
    const content = $('[data-viewer-content]', photoViewer)!; content.textContent = post.content || ''; content.classList.toggle('hidden', !post.content);
    $('[data-viewer-me]', photoViewer)!.replaceChildren(avatarEl({ displayName: me.name, avatarUrl: me.avatar }, 'size-8 text-xs'));
    paintReactions(); paintComments(); clearReply();
  };

  // Reaction bar (built once).
  const bar = $('[data-viewer-reaction-bar]', photoViewer)!;
  Object.entries(REACTION_STYLE).forEach(([type, style]) => {
    const button = Object.assign(document.createElement('button'), { type: 'button', className: 'reaction-choice' });
    button.setAttribute('aria-label', style.label); button.appendChild(svgUse(`r-${type}`, '')); button.addEventListener('click', () => void react(type));
    bar.appendChild(button);
  });
  async function react(type: string) {
    if (!post) return;
    try {
      const result = await postJson(`/api/posts/${post._id}/reactions`, { type });
      post.myReaction = result.active; post.reactionCount = result.count;
      post.topReactions = post.topReactions || [];
      if (result.active && !post.topReactions.includes(result.active)) post.topReactions = [result.active, ...post.topReactions].slice(0, 3);
      if (!result.count) post.topReactions = [];
      paintReactions();
      const card = document.querySelector(`[data-post-id="${post._id}"]`); if (card) paintReaction(card, result.active, result.count);
      const wrap = $('[data-viewer-react-wrap]', photoViewer)!; wrap.classList.add('reaction-done'); wrap.addEventListener('mouseleave', () => wrap.classList.remove('reaction-done'), { once: true });
    } catch (caught) { showToast(caught instanceof Error ? caught.message : 'Could not react.', 'error'); }
  }
  $('[data-viewer-like]', photoViewer)!.addEventListener('click', () => void react(post?.myReaction || 'like'));
  $('[data-viewer-share]', photoViewer)!.addEventListener('click', () => {
    if (!post) return;
    // Reuse the card's share details when the post is on the page; otherwise derive them from the post itself.
    const fromCard = document.querySelector<HTMLElement>(`[data-post-id="${post._id}"] [data-share-post]`)?.dataset.sharePost;
    const author = post.authorId || {};
    openShare(fromCard ? JSON.parse(fromCard) : { id: String(post._id), author: author.displayName || '', authorId: String(author._id || post.authorId || ''), visibility: post.visibility, group: !!post.groupId, groupPrivate: null });
  });
  $('[data-viewer-focus-comment]', photoViewer)!.addEventListener('click', () => { panel.classList.remove('max-lg:hidden'); commentInput.focus(); });

  commentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const content = commentInput.value.trim(); if (!content || !post) return;
    commentInput.disabled = true;
    try {
      const result = await postJson(`/api/posts/${post._id}/comments`, { content, ...(replyTo ? { parentId: replyTo.id } : {}) });
      comments.push({ ...result.comment, authorId: { _id: me.id, username: me.username, displayName: me.name, profile: { avatarUrl: me.avatar } } });
      post.commentCount = (post.commentCount || 0) + 1;
      commentInput.value = ''; clearReply(); paintComments(); paintReactions();
      const scroller = $('[data-viewer-scroll]', photoViewer)!; scroller.scrollTop = scroller.scrollHeight;
      const card = document.querySelector(`[data-post-id="${post._id}"]`);
      const counter = card && $('[data-comment-count]', card);
      if (counter) { counter.textContent = String(post.commentCount); $('[data-comment-count-label]', card!)?.classList.remove('hidden'); }
    } catch (caught) { showToast(caught instanceof Error ? caught.message : 'Could not post comment.', 'error'); }
    finally { commentInput.disabled = false; commentInput.focus(); }
  });

  openPhotoViewer = (url: string, postId?: string) => {
    const token = ++loadToken;
    photos = [url]; post = null; comments = []; canModerate = false;
    panel.classList.add('hidden'); panel.classList.remove('flex');
    togglePanelButtons[0]?.classList.add('hidden');
    showPhoto(0);
    if (!photoViewer.open) photoViewer.showModal();
    if (!postId || !me.id) return;
    request(`/api/posts/${postId}`).then((data) => {
      if (token !== loadToken) return;
      post = data.post; comments = data.comments || []; canModerate = !!data.canModerate;
      // Older comments load in chunks as the reader scrolls the side panel.
      commentsFeed?.destroy();
      commentsFeed = createInfiniteList({
        list: commentsList, root: $('[data-viewer-scroll]', photoViewer), next: data.commentsNext || null,
        load: async (cursor) => {
          const chunk = await request(`/api/lists/comments?cursor=${encodeURIComponent(cursor)}&post=${post._id}`);
          const known = new Set(comments.map((comment) => String(comment._id)));
          const fresh = (chunk.items as any[]).filter((comment) => !known.has(String(comment._id)));
          comments = [...comments, ...fresh];
          return { nodes: threadNodes(fresh), next: chunk.next };
        }
      });
      const urls = (post.media || []).map((media: any) => media.url);
      if (urls.length) { photos = urls; showPhoto(Math.max(0, urls.indexOf(url))); }
      panel.classList.remove('hidden'); panel.classList.add('flex', 'max-lg:hidden');
      togglePanelButtons[0]?.classList.remove('hidden'); togglePanelButtons[0]?.classList.add('grid');
      paintPanel();
    }).catch(() => { /* photo still viewable without the post column */ });
  };
}

/* ---------- Group create / edit popup ---------- */

type GroupRule = { title: string; details: string };
type GroupState = {
  name: string; description: string; privacy: 'public' | 'private'; visibility: 'visible' | 'hidden'; groupType: string; location: string;
  tags: string[]; rules: GroupRule[]; questions: string[]; settings: { whoCanPost: string; postApproval: boolean; whoCanApprove: string };
};
const GROUP_STEPS = ['basics', 'personalize', 'membership'] as const;
const groupDialog = $<HTMLDialogElement>('[data-group-dialog]');
const groupFormData = (() => { try { return JSON.parse($('#group-form-data')?.textContent || 'null'); } catch { return null; } })();
let openGroupDialog: (step?: string) => void = () => undefined;

if (groupDialog && groupFormData) {
  const editing = groupFormData.mode === 'edit';
  const DEFAULT_COVER = '/assets/img/default-cover.svg';
  const state: GroupState = groupFormData.group
    ? structuredClone(groupFormData.group)
    : { name: '', description: '', privacy: 'public', visibility: 'visible', groupType: 'general', location: '', tags: [], rules: [], questions: [], settings: { whoCanPost: 'anyone', postApproval: false, whoCanApprove: 'admins' } };
  const cover: { url: string; blob: Blob | null; remove: boolean; changed: boolean } = { url: groupFormData.group?.coverUrl || '', blob: null, remove: false, changed: false };
  let step = 0;

  const getPath = (path: string): unknown => path.split('.').reduce<any>((value, key) => value?.[key], state);
  const setPath = (path: string, value: unknown) => {
    const keys = path.split('.'); const last = keys.pop()!;
    const parent = keys.reduce<any>((target, key) => target[key], state); parent[last] = value;
  };
  const errorBox = $('[data-group-error]', groupDialog)!;
  const showError = (message: string) => { errorBox.textContent = message; errorBox.classList.toggle('hidden', !message); };

  /* Live preview */
  const paintPreview = () => {
    const name = state.name.trim();
    const nameEl = $('[data-gp-name]', groupDialog)!; nameEl.textContent = name || 'Group name'; nameEl.classList.toggle('text-muted', !name);
    const hidden = state.privacy === 'private' && state.visibility === 'hidden';
    $('[data-gp-privacy]', groupDialog)!.textContent = `${state.privacy === 'private' ? 'Private' : 'Public'} group`;
    $('[data-gp-privacy-icon]', groupDialog)!.setAttribute('href', state.privacy === 'private' ? '#i-lock' : '#i-globe');
    $('[data-gp-visibility]', groupDialog)!.textContent = hidden ? 'Hidden' : 'Visible';
    $('[data-gp-visibility-icon]', groupDialog)!.setAttribute('href', hidden ? '#i-eye-off' : '#i-eye');
    $('[data-gp-type]', groupDialog)!.textContent = groupFormData.types[state.groupType] || 'General';
    const description = $('[data-gp-description]', groupDialog)!; description.textContent = state.description.trim() || 'Your description will appear here.'; description.classList.toggle('text-muted', !state.description.trim());
    const locationRow = $('[data-gp-location-row]', groupDialog)!; locationRow.classList.toggle('hidden', !state.location.trim()); locationRow.classList.toggle('flex', !!state.location.trim());
    $('[data-gp-location]', groupDialog)!.textContent = state.location.trim();
    $('[data-gp-tags]', groupDialog)!.replaceChildren(...state.tags.map((tag) => Object.assign(document.createElement('span'), { className: 'rounded-full bg-field px-2 py-0.5 font-semibold', textContent: `#${tag}` })));
    const rulesCount = state.rules.filter((rule) => rule.title.trim()).length;
    const rulesEl = $('[data-gp-rules]', groupDialog)!; rulesEl.classList.toggle('hidden', !rulesCount); rulesEl.textContent = `${rulesCount} group ${rulesCount === 1 ? 'rule' : 'rules'}`;
    $('[data-g-visibility-block]', groupDialog)!.classList.toggle('hidden', state.privacy === 'public');
  };
  const paintCover = (src: string) => {
    $$<HTMLImageElement>('[data-gp-cover], [data-g-cover-thumb]', groupDialog).forEach((img) => { img.src = src || DEFAULT_COVER; });
    $('[data-g-remove-cover]', groupDialog)!.classList.toggle('hidden', !src);
  };

  /* Simple fields */
  const syncInputs = () => $$<HTMLInputElement>('[data-g]', groupDialog).forEach((input) => {
    const value = getPath(input.dataset.g!);
    if (input.type === 'radio') input.checked = input.value === value;
    else if (input.type === 'checkbox') input.checked = !!value;
    else input.value = String(value ?? '');
    if (input.dataset.charCount) input.dispatchEvent(new Event('input'));
  });
  groupDialog.addEventListener('input', (event) => {
    const input = (event.target as HTMLElement).closest<HTMLInputElement>('[data-g]'); if (!input) return;
    if (input.type === 'radio') { if (input.checked) setPath(input.dataset.g!, input.value); }
    else if (input.type === 'checkbox') setPath(input.dataset.g!, input.checked);
    else setPath(input.dataset.g!, input.value);
    showError(''); paintPreview();
  });
  groupDialog.addEventListener('change', (event) => { if ((event.target as HTMLElement).matches('input[type=radio][data-g], input[type=checkbox][data-g], select[data-g]')) (event.target as HTMLElement).dispatchEvent(new Event('input', { bubbles: true })); });

  /* Topics */
  const tagBox = $('[data-g-tags]', groupDialog)!;
  const tagInput = $<HTMLInputElement>('[data-g-tag-input]', groupDialog)!;
  const renderTags = () => {
    $$('[data-g-tag]', tagBox).forEach((chip) => chip.remove());
    state.tags.forEach((tag, index) => {
      const chip = document.createElement('span'); chip.dataset.gTag = ''; chip.className = 'inline-flex items-center gap-1 rounded-full bg-brand-50 py-1 pl-2.5 pr-1 text-[0.8125rem] font-semibold text-brand-700';
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'grid size-5 place-items-center rounded-full hover:bg-brand-100'; remove.setAttribute('aria-label', `Remove ${tag}`);
      remove.appendChild(svgUse('i-x', 'icon size-3')); remove.addEventListener('click', () => { state.tags.splice(index, 1); renderTags(); });
      chip.append(`#${tag}`, remove); tagBox.insertBefore(chip, tagInput);
    });
    tagInput.disabled = state.tags.length >= 5; tagInput.placeholder = state.tags.length >= 5 ? 'Maximum 5 topics' : 'Add a topic and press Enter';
    $$<HTMLButtonElement>('[data-g-add-tag]', groupDialog).forEach((button) => button.classList.toggle('hidden', state.tags.includes(button.dataset.gAddTag!)));
    paintPreview();
  };
  const addTag = (raw: string) => {
    const tag = raw.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-').slice(0, 30);
    if (tag && !state.tags.includes(tag) && state.tags.length < 5) state.tags.push(tag);
    renderTags();
  };
  tagInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addTag(tagInput.value); tagInput.value = ''; }
    else if (event.key === 'Backspace' && !tagInput.value && state.tags.length) { state.tags.pop(); renderTags(); }
  });
  tagInput.addEventListener('blur', () => { if (tagInput.value.trim()) { addTag(tagInput.value); tagInput.value = ''; } });
  $$('[data-g-add-tag]', groupDialog).forEach((button) => button.addEventListener('click', () => addTag(button.dataset.gAddTag!)));

  /* Rules and membership questions */
  const rulesList = $('[data-g-rules]', groupDialog)!;
  const questionsList = $('[data-g-questions]', groupDialog)!;
  const renderRules = () => {
    rulesList.replaceChildren(...state.rules.map((rule, index) => {
      const item = document.createElement('li'); item.className = 'rounded-lg border border-line p-2.5';
      const head = document.createElement('div'); head.className = 'flex items-center gap-2';
      const number = Object.assign(document.createElement('span'), { className: 'grid size-6 shrink-0 place-items-center rounded-full bg-field text-xs font-bold', textContent: String(index + 1) });
      const title = Object.assign(document.createElement('input'), { className: 'input h-9 flex-1', value: rule.title, maxLength: 80, placeholder: 'Rule title' });
      title.setAttribute('aria-label', `Rule ${index + 1} title`); title.addEventListener('input', () => { rule.title = title.value; paintPreview(); });
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'icon-btn-ghost size-8'; remove.setAttribute('aria-label', `Remove rule ${index + 1}`);
      remove.appendChild(svgUse('i-trash', 'icon size-4')); remove.addEventListener('click', () => { state.rules.splice(index, 1); renderRules(); });
      head.append(number, title, remove);
      const details = Object.assign(document.createElement('textarea'), { className: 'input mt-2 w-full resize-none text-sm', value: rule.details, maxLength: 500, rows: 2, placeholder: 'Details (optional)' });
      details.setAttribute('aria-label', `Rule ${index + 1} details`); details.addEventListener('input', () => { rule.details = details.value; });
      item.append(head, details); return item;
    }));
    $('[data-g-rule-count]', groupDialog)!.textContent = String(state.rules.length);
    $<HTMLButtonElement>('[data-g-add-rule]', groupDialog)!.disabled = state.rules.length >= 10;
    $$<HTMLButtonElement>('[data-g-example-rule]', groupDialog).forEach((button) => button.classList.toggle('hidden', state.rules.some((rule) => rule.title === button.dataset.gExampleRule)));
    paintPreview();
  };
  const renderQuestions = () => {
    questionsList.replaceChildren(...state.questions.map((question, index) => {
      const item = document.createElement('li'); item.className = 'flex items-center gap-2';
      const input = Object.assign(document.createElement('input'), { className: 'input h-10 flex-1', value: question, maxLength: 250, placeholder: `Question ${index + 1}` });
      input.setAttribute('aria-label', `Membership question ${index + 1}`); input.addEventListener('input', () => { state.questions[index] = input.value; });
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'icon-btn-ghost size-8'; remove.setAttribute('aria-label', `Remove question ${index + 1}`);
      remove.appendChild(svgUse('i-trash', 'icon size-4')); remove.addEventListener('click', () => { state.questions.splice(index, 1); renderQuestions(); });
      item.append(input, remove); return item;
    }));
    $('[data-g-question-count]', groupDialog)!.textContent = String(state.questions.length);
    $<HTMLButtonElement>('[data-g-add-question]', groupDialog)!.disabled = state.questions.length >= 3;
  };
  $('[data-g-add-rule]', groupDialog)!.addEventListener('click', () => { if (state.rules.length < 10) { state.rules.push({ title: '', details: '' }); renderRules(); $<HTMLInputElement>('li:last-child input', rulesList)?.focus(); } });
  $$('[data-g-example-rule]', groupDialog).forEach((button) => button.addEventListener('click', () => { if (state.rules.length < 10) { state.rules.push({ title: button.dataset.gExampleRule!, details: '' }); renderRules(); } }));
  $('[data-g-add-question]', groupDialog)!.addEventListener('click', () => { if (state.questions.length < 3) { state.questions.push(''); renderQuestions(); $<HTMLInputElement>('li:last-child input', questionsList)?.focus(); } });

  /* Cover */
  $('[data-g-pick-cover]', groupDialog)!.addEventListener('click', () => void openPhotoPicker('group-cover', (result) => {
    cover.url = result.url || ''; cover.blob = result.blob || null; cover.remove = false; cover.changed = true; paintCover(result.preview);
  }, groupFormData.artwork));
  $('[data-g-remove-cover]', groupDialog)!.addEventListener('click', () => { cover.url = ''; cover.blob = null; cover.remove = true; cover.changed = true; paintCover(''); });

  /* Steps */
  const validateStep = (index: number) => {
    if (index === 0 && state.name.trim().length < 3) { showError('Group name needs at least 3 characters.'); goToStep(0); $<HTMLInputElement>('#g-name')?.focus(); return false; }
    return true;
  };
  const goToStep = (index: number) => {
    step = index;
    GROUP_STEPS.forEach((name, i) => {
      $(`[data-group-step="${name}"]`, groupDialog)!.classList.toggle('hidden', i !== index);
      const tab = $(`[data-group-step-tab="${name}"]`, groupDialog)!;
      tab.setAttribute('aria-selected', String(i === index)); tab.classList.toggle('chip-active', i === index);
      const badge = $('[data-step-number]', tab)!; badge.classList.toggle('bg-brand-600', i <= index || editing); badge.classList.toggle('text-white', i <= index || editing);
    });
    $('[data-group-back]', groupDialog)!.classList.toggle('hidden', editing || index === 0);
    $('[data-group-next]', groupDialog)!.classList.toggle('hidden', editing || index === GROUP_STEPS.length - 1);
    $('[data-group-submit]', groupDialog)!.classList.toggle('hidden', !editing && index !== GROUP_STEPS.length - 1);
  };
  $$('[data-group-step-tab]', groupDialog).forEach((tab) => tab.addEventListener('click', () => {
    const target = GROUP_STEPS.indexOf(tab.dataset.groupStepTab as typeof GROUP_STEPS[number]);
    if (target > 0 && !validateStep(0)) return;
    goToStep(target);
  }));
  $('[data-group-next]', groupDialog)!.addEventListener('click', () => { if (validateStep(step)) goToStep(Math.min(step + 1, GROUP_STEPS.length - 1)); });
  $('[data-group-back]', groupDialog)!.addEventListener('click', () => goToStep(Math.max(step - 1, 0)));

  /* Invite list inside the create form */
  $$<HTMLInputElement>('[data-invite-filter]').forEach((input) => input.addEventListener('input', () => {
    const term = input.value.trim().toLowerCase();
    $$(`[data-invite-list="${input.dataset.inviteFilter}"] [data-invite-name]`).forEach((row) => row.classList.toggle('hidden', !!term && !row.dataset.inviteName!.includes(term)));
  }));

  /* Submit */
  $<HTMLFormElement>('[data-group-form]', groupDialog)!.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!validateStep(0)) return;
    const submit = $<HTMLButtonElement>('[data-group-submit]', groupDialog)!;
    const payload = {
      ...state,
      name: state.name.trim(),
      visibility: state.privacy === 'public' ? 'visible' : state.visibility,
      rules: state.rules.map((rule) => ({ title: rule.title.trim(), details: rule.details.trim() })).filter((rule) => rule.title),
      questions: state.questions.map((question) => question.trim()).filter(Boolean),
      invite: $$<HTMLInputElement>('[data-g-invite]:checked', groupDialog).map((input) => input.value),
      removeCover: cover.remove,
      ...(cover.changed && cover.url && !cover.blob ? { coverUrl: cover.url } : {})
    };
    const body = new FormData();
    body.append('payload', JSON.stringify(payload));
    if (cover.blob) body.append('cover', cover.blob, 'group-cover.jpg');
    submit.disabled = true; showError('');
    try {
      const result = await request(editing ? `/api/groups/${groupFormData.groupId}` : '/api/groups', { method: editing ? 'PATCH' : 'POST', body });
      window.location.assign(result.redirect);
    } catch (caught) { showError(caught instanceof Error ? caught.message : 'Could not save the group.'); }
    finally { submit.disabled = false; }
  });

  openGroupDialog = (stepName?: string) => {
    showError(''); syncInputs(); renderTags(); renderRules(); renderQuestions(); paintCover(cover.blob ? $<HTMLImageElement>('[data-gp-cover]', groupDialog)!.src : cover.url);
    const target = stepName ? Math.max(GROUP_STEPS.indexOf(stepName as typeof GROUP_STEPS[number]), 0) : 0;
    goToStep(target); groupDialog.showModal();
    if (target === 0) $<HTMLInputElement>('#g-name')?.focus();
  };
  if ($('[data-open-create-group]')) openGroupDialog();
}

/* ---------- Join (questions + rules) and invite popups ---------- */

$<HTMLFormElement>('[data-group-join-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const error = $('[data-form-error]', form)!;
  const answers = $$<HTMLTextAreaElement>('[data-join-answer]', form).map((field) => field.value.trim());
  const agree = $<HTMLInputElement>('[data-join-agree]', form);
  if (answers.some((answer) => !answer)) { error.textContent = 'Please answer all questions.'; error.classList.remove('hidden'); return; }
  if (agree && !agree.checked) { error.textContent = 'Please agree to the group rules.'; error.classList.remove('hidden'); return; }
  try {
    const result = await postJson(`/api/groups/${form.dataset.groupJoinForm}/join`, { answers, agreeRules: !!agree?.checked });
    showToast(result.message); window.setTimeout(() => window.location.reload(), 600);
  } catch (caught) { error.textContent = caught instanceof Error ? caught.message : 'Could not send request.'; error.classList.remove('hidden'); }
});

const inviteForm = $<HTMLFormElement>('[data-group-invite-form]');
if (inviteForm) {
  const updateCount = () => { $('[data-invite-count]', inviteForm)!.textContent = String($$('[data-invite-pick]:checked', inviteForm).length); };
  inviteForm.addEventListener('change', updateCount);
  if (!groupDialog) $$<HTMLInputElement>('[data-invite-filter]').forEach((input) => input.addEventListener('input', () => {
    const term = input.value.trim().toLowerCase();
    $$(`[data-invite-list="${input.dataset.inviteFilter}"] [data-invite-name]`).forEach((row) => row.classList.toggle('hidden', !!term && !row.dataset.inviteName!.includes(term)));
  }));
  inviteForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const picked = $$<HTMLInputElement>('[data-invite-pick]:checked', inviteForm);
    const error = $('[data-form-error]', inviteForm)!;
    if (!picked.length) { error.textContent = 'Select at least one person.'; error.classList.remove('hidden'); return; }
    try {
      const result = await postJson(`/api/groups/${inviteForm.dataset.groupInviteForm}/invites`, { userIds: picked.map((input) => input.value) });
      picked.forEach((input) => { input.checked = false; input.disabled = true; const label = input.closest('label')?.querySelector('.min-w-0'); if (label && !label.querySelector('.text-xs')) label.appendChild(Object.assign(document.createElement('span'), { className: 'block text-xs text-muted', textContent: 'Invite sent' })); });
      updateCount(); error.classList.add('hidden'); showToast(result.message); (inviteForm.closest('dialog') as HTMLDialogElement).close();
    } catch (caught) { error.textContent = caught instanceof Error ? caught.message : 'Could not send invites.'; error.classList.remove('hidden'); }
  });
}

/* ---------- Global click delegation ---------- */

document.addEventListener('click', async (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('button, a, [data-toggle], [data-close-dialog]');
  if (!target) return;
  const data = target.dataset;
  try {
    if (data.closeDialog) { if (target.matches('[data-close-dialog]') && (event.target === target || target.tagName === 'BUTTON' || target.closest('button'))) document.querySelector<HTMLDialogElement>(`#${data.closeDialog}`)?.close(); return; }
    if (data.toggle) { const node = document.getElementById(data.toggle); node?.classList.toggle('hidden'); $<HTMLInputElement>('input:not([type=hidden]), textarea', node || document)?.focus(); return; }
    if (data.pickPhotoKind) { void openPhotoPicker(data.pickPhotoKind === 'cover' ? 'cover' : 'avatar'); return; }
    if (data.commentEdit || data.commentDelete) {
      target.closest<HTMLDetailsElement>('details')?.removeAttribute('open');
      if (data.commentEdit) { const root = target.closest<HTMLElement>('[data-comment-id]'); if (root) startCommentEdit(root); }
      else await deleteCommentById(data.commentDelete!);
      return;
    }
    if (data.dismissSuggestion) { dismissSuggestion(data.dismissSuggestion); return; }
    if (data.clearActivity !== undefined) {
      if (!(await confirmAction('Clear activity history?', 'Suggestions will forget what you searched, read and opened. Your posts, reactions and follows stay.', 'Clear history'))) return;
      const result = await request('/api/activity', { method: 'DELETE' }); showToast(result.message); window.setTimeout(() => window.location.reload(), 600); return;
    }
    if (data.profileItemDelete) {
      if (!(await confirmAction('Remove from profile?', 'This detail will be removed from your About info.', 'Remove'))) return;
      await request(data.profileItemDelete, { method: 'DELETE' }); window.location.reload(); return;
    }
    if (data.openGroupDialog !== undefined) { openGroupDialog(data.groupStepOpen); return; }
    if (data.groupLeave) {
      if (!(await confirmAction('Leave group?', "You won't see new posts from this group in your feed.", 'Leave group'))) return;
      await request(`/api/groups/${data.groupLeave}/leave`, { method: 'POST' }); window.location.reload(); return;
    }
    if (data.postDecision && data.post) {
      await postJson(`/api/group-posts/${data.post}/decision`, { decision: data.postDecision });
      target.closest('li')?.remove(); showToast(data.postDecision === 'approve' ? 'Post approved and published.' : 'Post declined.'); return;
    }
    if (data.openDialog) {
      openDialog(data.openDialog);
      if (data.openDialog === 'profile-search-dialog') $<HTMLInputElement>('#profile-search-query')?.focus();
      if (data.focusBio !== undefined) { const form = $('#bio-form'); form?.classList.remove('hidden'); $<HTMLTextAreaElement>('textarea', form || document)?.focus(); }
      return;
    }
    if (data.openComposer !== undefined) { openComposer(target); return; }
    if (data.openStoryComposer !== undefined) { storyDialog?.showModal(); $<HTMLTextAreaElement>('[data-story-text]', storyDialog!)?.focus(); return; }
    if (data.lightbox) { openPhotoViewer(data.lightbox, data.post || target.closest<HTMLElement>('[data-post-id]')?.dataset.postId); return; }
    if (data.togglePassword) {
      const input = document.getElementById(data.togglePassword) as HTMLInputElement | null; if (!input) return;
      const show = input.type === 'password'; input.type = show ? 'text' : 'password';
      target.setAttribute('aria-pressed', String(show)); target.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      target.replaceChildren(svgUse(show ? 'i-eye' : 'i-eye-off', 'icon size-[1.125rem]')); return;
    }
    if (data.insertEmoji) {
      const field = (target.closest('form, dialog')?.querySelector<HTMLInputElement | HTMLTextAreaElement>('textarea[name="content"], input[name="content"]')) || null;
      if (field) { field.value += data.insertEmoji; field.focus(); } return;
    }
    if (data.focusComment) { $<HTMLInputElement>(`#comment-${data.focusComment}`)?.focus(); return; }
    if (data.scrollRail !== undefined) { (target.closest('[data-rail-wrap]')?.querySelector('[data-rail]') || $('[data-story-rail]'))?.scrollBy({ left: 360, behavior: 'smooth' }); return; }
    if (data.toggleDetails !== undefined) {
      const panel = $('[data-chat-details]'); if (!panel) return;
      const opening = getComputedStyle(panel).display === 'none';
      panel.classList.toggle('!flex', opening); panel.classList.toggle('!hidden', !opening);
      $$('[data-toggle-details][aria-expanded]').forEach((button) => button.setAttribute('aria-expanded', String(opening))); return;
    }
    if (data.editPost) {
      target.closest<HTMLDetailsElement>('details')?.removeAttribute('open');
      openEditPost(data.editPost, target.closest('[data-post-id]'));
      return;
    }
    if (data.friendAction) {
      const controls = target.closest<HTMLElement>('[data-friend-controls]');
      const userId = controls?.dataset.userId, userName = controls?.dataset.userName || 'this person';
      if (!controls || !userId) return;
      target.closest('details')?.removeAttribute('open');
      if (data.friendAction === 'unfriend' && !await confirmAction(`Unfriend ${userName}?`, 'They will disappear from Chats and neither of you can message the other until you become friends again.', 'Unfriend')) return;
      const buttons = $$<HTMLButtonElement>('button', controls), error = $('[data-friend-error]', controls);
      buttons.forEach((button) => { button.disabled = true; }); controls.setAttribute('aria-busy', 'true'); error?.classList.add('hidden');
      try {
        const result = await postJson(`/api/users/${userId}/friendship`, { action: data.friendAction });
        syncFriendState(userId, result.state);
        if (result.following !== undefined) syncFollowState(userId, result.following);
        const messages: Record<string, string> = { request: 'Friend request sent.', cancel: 'Friend request canceled.', accept: `You and ${userName} are now friends.`, decline: 'Friend request deleted.', unfriend: `You and ${userName} are no longer friends.` };
        showToast(messages[data.friendAction] || 'Friendship updated.');
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'Could not update this friendship.';
        if (error) { error.textContent = message; error.classList.remove('hidden'); }
        buttons.forEach((button) => { button.disabled = false; }); controls.removeAttribute('aria-busy');
      }
      return;
    }
    if (data.follow) {
      const button = target as HTMLButtonElement, previouslyFollowing = data.following === 'true';
      button.disabled = true;
      try {
        const result = await request(`/api/users/${data.follow}/follow`, { method: 'POST' });
        syncFollowState(data.follow, result.following);
        const count = $('[data-profile-followers]');
        if (count && result.following !== previouslyFollowing) {
          const next = Math.max(0, Number(count.dataset.count) + (result.following ? 1 : -1));
          count.dataset.count = String(next); count.textContent = `${new Intl.NumberFormat('en', { notation: 'compact' }).format(next)} ${next === 1 ? 'follower' : 'followers'}`;
        }
        showToast(result.following ? 'Following. Their posts are now prioritized in your home feed.' : 'Unfollowed.');
      } finally { button.disabled = false; }
      return;
    }
    if (data.openBreak) { target.closest('details')?.removeAttribute('open'); await openBreak(data.openBreak, data.userName || 'this person'); return; }
    if (data.copyProfile) { target.closest('details')?.removeAttribute('open'); await navigator.clipboard.writeText(`${window.location.origin}${data.copyProfile}`); showToast('Profile link copied.'); return; }
    if (data.blockUser) {
      target.closest('details')?.removeAttribute('open');
      const unblock = data.unblock === 'true', userName = data.userName || 'this person';
      if (!await confirmAction(`${unblock ? 'Unblock' : 'Block'} ${userName}?`, unblock ? 'You can see each other again. Your friendship and follows will not be restored automatically.' : 'You will be unfriended and unfollow each other. Neither of you can see the other’s profile, add as a friend or send messages. You can unblock them later.', unblock ? 'Unblock' : 'Block')) return;
      socialActionPending = true; (target as HTMLButtonElement).disabled = true;
      try {
        await postJson(`/api/users/${data.blockUser}/block`, { blocked: !unblock });
        window.location.reload();
      } finally { socialActionPending = false; (target as HTMLButtonElement).disabled = false; }
      return;
    }
    if (data.messageUser) { const result = await postJson('/api/conversations', { memberId: data.messageUser }); window.location.assign(result.redirect); return; }
    if (data.react && data.post) {
      const result = await postJson(`/api/posts/${data.post}/reactions`, { type: data.react });
      const card = target.closest('[data-post-id]'); if (card) paintReaction(card, result.active, result.count); return;
    }
    if (data.sharePost) { openShare(JSON.parse(data.sharePost)); return; }
    if (data.copy) { target.closest<HTMLDetailsElement>('details')?.removeAttribute('open'); await navigator.clipboard.writeText(`${window.location.origin}/posts/${data.copy}`); showToast('Link copied to clipboard.'); return; }
    if (data.deletePost) {
      target.closest<HTMLDetailsElement>('details')?.removeAttribute('open');
      if (!(await confirmAction('Move to trash?', 'This post will be removed from your profile and feed.', 'Move'))) return;
      await request(`/api/posts/${data.deletePost}`, { method: 'DELETE' }); target.closest('[data-post-id]')?.remove(); showToast('Post moved to trash.'); return;
    }
    if (data.deleteStory) {
      if (!(await confirmAction('Delete story?', 'This story will be removed for everyone, including from your archive.', 'Delete'))) return;
      await request(`/api/stories/${data.deleteStory}`, { method: 'DELETE' }); target.closest('[data-archive-story]')?.remove(); showToast('Story deleted.'); return;
    }
    if (data.groupJoin) {
      const result = await postJson(`/api/groups/${data.groupJoin}/join`, {});
      if (result.status === 'joined') { window.location.reload(); return; }
      target.textContent = 'Request sent'; target.setAttribute('disabled', 'true'); showToast(result.message); return;
    }
    if (data.groupDecision && data.request) { await postJson(`/api/group-requests/${data.request}/decision`, { decision: data.groupDecision }); target.closest('li')?.remove(); showToast(data.groupDecision === 'approve' ? 'Member approved.' : 'Request declined.'); return; }
    if (data.readNotifications !== undefined) {
      await request('/api/notifications/read', { method: 'POST' });
      $$('[data-unread-dot]').forEach((node) => node.remove()); setUnread('notifications', 0);
      $$('[data-unread-time]').forEach((node) => { node.classList.remove('font-semibold', 'text-brand-600'); node.classList.add('text-muted'); });
      showToast('All notifications marked as read.'); return;
    }
    if (data.logout !== undefined) { await clearUserCaches(); const result = await request('/auth/logout', { method: 'POST' }); window.location.assign(result.redirect); }
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Action failed.';
    const error = target.closest('.profile-actions')?.querySelector<HTMLElement>('[data-profile-action-error]');
    if (error) { error.textContent = message; error.classList.remove('hidden'); }
    showToast(message, 'error');
  }
});

// Touch devices have no hover: a long press on Like opens the reaction bar.
const bindReactionToggles = (root: ParentNode = document) => $$('[data-reaction-toggle]', root).forEach((button) => {
  let timer = 0;
  button.addEventListener('touchstart', () => { timer = window.setTimeout(() => button.parentElement?.querySelector('.reaction-bar')?.classList.add('is-open'), 450); }, { passive: true });
  button.addEventListener('touchend', () => window.clearTimeout(timer));
});
bindReactionToggles();

/* ---------- Group tabs: old #about style links ---------- */

// Group sections used to be anchors on one page; they are now ?tab= pages.
{
  const legacy: Record<string, string> = { '#about': 'about', '#rules': 'about', '#requests': 'requests', '#pending-posts': 'pending', '#members': 'members' };
  const target = legacy[window.location.hash];
  if (target && $('[data-group-tabs]') && !new URLSearchParams(window.location.search).has('tab')) {
    const url = new URL(window.location.href); url.searchParams.set('tab', target); url.hash = window.location.hash === '#rules' ? 'rules' : '';
    window.location.replace(url.toString());
  }
}

/* ---------- People you may know: dismissed suggestions ---------- */

// Remembered in this browser only; the server keeps suggesting them elsewhere (search page).
const DISMISSED_KEY = 'oremus:dismissed-suggestions';
const readDismissed = (): string[] => { try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]'); } catch { return []; } };
function hideEmptySuggestions() {
  const section = $('[data-suggestions]');
  if (section && !$$('[data-suggestion]', section).length) { section.remove(); $('[data-suggestions-divider]')?.remove(); }
}
function dismissSuggestion(id: string) {
  const ids = [...new Set([id, ...readDismissed()])].slice(0, 200);
  try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids)); } catch { /* storage unavailable: hide for this page only */ }
  $$(`[data-suggestion="${id}"]`).forEach((item) => item.remove());
  hideEmptySuggestions();
}
if ($('[data-suggestions]')) {
  const dismissed = new Set(readDismissed());
  $$<HTMLElement>('[data-suggestion]').forEach((item) => { if (dismissed.has(item.dataset.suggestion!)) item.remove(); });
  hideEmptySuggestions();
}

/* ---------- Comment edit & delete ---------- */

// Every rendering of a comment (post page, feed card, photo viewer) carries data-comment-id, a
// [data-comment-bubble] holding [data-comment-text], a [data-comment-meta] row and a [data-comment-edited] label.
function commentMenu(id: string, canEdit: boolean, canDelete: boolean): HTMLElement | null {
  if (!canDelete) return null;
  const details = document.createElement('details'); details.className = 'group/menu relative shrink-0'; details.dataset.menu = ''; details.dataset.commentMenu = '';
  const summary = document.createElement('summary');
  summary.className = 'icon-btn-ghost size-8 cursor-pointer list-none text-muted transition-opacity group-open/menu:opacity-100 group-hover/comment:opacity-100 focus-visible:opacity-100 sm:opacity-0';
  summary.setAttribute('aria-label', 'Comment options'); summary.appendChild(svgUse('i-more', 'icon size-[1.125rem]'));
  const menu = document.createElement('div'); menu.className = 'menu left-0 top-full mt-1 min-w-[11rem]';
  const item = (label: string, icon: string, attr: 'commentEdit' | 'commentDelete') => {
    const button = Object.assign(document.createElement('button'), { type: 'button', className: 'menu-item' }); button.dataset[attr] = id;
    const badge = document.createElement('span'); badge.className = 'menu-icon'; badge.appendChild(svgUse(icon, 'icon'));
    button.append(badge, label); return button;
  };
  if (canEdit) menu.appendChild(item('Edit', 'i-edit', 'commentEdit'));
  menu.appendChild(item('Delete', 'i-trash', 'commentDelete'));
  details.append(summary, menu); return details;
}
/** Wraps a bubble in the hover row that holds its "…" menu. */
function commentRow(bubble: HTMLElement, menu: HTMLElement | null) {
  const row = document.createElement('div'); row.className = 'group/comment flex items-center gap-1';
  bubble.classList.add('min-w-0'); bubble.dataset.commentBubble = '';
  row.appendChild(bubble); if (menu) row.appendChild(menu); return row;
}
function editedLabel(editedAt?: string | null) {
  const label = Object.assign(document.createElement('span'), { className: `font-normal ${editedAt ? '' : 'hidden'}`, textContent: 'Edited' });
  label.dataset.commentEdited = ''; return label;
}

function startCommentEdit(root: HTMLElement) {
  const id = root.dataset.commentId!;
  const existing = $<HTMLTextAreaElement>('[data-comment-editor] textarea', root);
  if (existing) { existing.focus(); return; }
  const row = $('[data-comment-bubble]', root)!.parentElement!;
  const meta = $('[data-comment-meta]', root);
  const text = $('[data-comment-text]', root)!;
  const form = document.createElement('form'); form.dataset.commentEditor = ''; form.className = 'min-w-0';
  const field = document.createElement('textarea');
  field.className = 'w-full resize-none rounded-2xl bg-field px-3 py-2 text-15 leading-snug text-ink focus:outline-none focus:ring-2 focus:ring-brand-100';
  field.maxLength = 1500; field.value = text.textContent || ''; field.setAttribute('aria-label', 'Edit comment');
  const fit = () => { field.style.height = 'auto'; field.style.height = `${field.scrollHeight}px`; };
  const hint = document.createElement('p'); hint.className = 'mt-0.5 px-3 text-xs text-muted';
  const cancel = Object.assign(document.createElement('button'), { type: 'button', className: 'font-semibold text-brand-600 hover:underline', textContent: 'cancel' });
  const save = Object.assign(document.createElement('button'), { type: 'submit', className: 'ml-2 font-semibold text-brand-600 hover:underline', textContent: 'Save' });
  hint.append('Press Esc to ', cancel, '.', save);
  form.append(field, hint);
  const close = () => { form.remove(); row.classList.remove('hidden'); meta?.classList.remove('hidden'); };
  cancel.addEventListener('click', close);
  field.addEventListener('input', fit);
  field.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const content = field.value.trim();
    if (!content) { field.focus(); return; }
    if (content === (text.textContent || '').trim()) { close(); return; }
    field.disabled = true;
    try {
      const result = await postJson(`/api/comments/${id}`, { content }, 'PATCH');
      $$(`[data-comment-id="${id}"]`).forEach((copy) => {
        const copyText = $('[data-comment-text]', copy); if (copyText) copyText.textContent = result.comment.content;
        $('[data-comment-edited]', copy)?.classList.remove('hidden');
      });
      document.dispatchEvent(new CustomEvent('oremus:comment-edited', { detail: { id, content: result.comment.content, editedAt: result.comment.editedAt } }));
      close();
    } catch (caught) { showToast(caught instanceof Error ? caught.message : 'Could not save the comment.', 'error'); field.disabled = false; field.focus(); }
  });
  row.classList.add('hidden'); meta?.classList.add('hidden');
  row.insertAdjacentElement('afterend', form);
  fit(); field.focus(); field.setSelectionRange(field.value.length, field.value.length);
}

async function deleteCommentById(id: string) {
  if (!(await confirmAction('Delete comment?', 'Are you sure you want to delete this comment? Replies to it will be deleted too.', 'Delete'))) return;
  try {
    const result = await request(`/api/comments/${id}`, { method: 'DELETE' });
    (result.removed as string[]).forEach((removedId) => $$(`[data-comment-id="${removedId}"]`).forEach((node) => (node.closest('li') || node).remove()));
    const count = Number(result.commentCount) || 0;
    $$(`[data-post-id="${result.postId}"]`).forEach((card) => {
      const counter = $('[data-comment-count]', card); if (counter) counter.textContent = String(count);
      const label = $('[data-comment-count-label]', card);
      if (label) { label.classList.toggle('hidden', count === 0); label.lastChild!.textContent = count === 1 ? ' comment' : ' comments'; }
    });
    const total = $('[data-comments-total]'); if (total) total.textContent = `${count} ${count === 1 ? 'comment' : 'comments'}`;
    document.dispatchEvent(new CustomEvent('oremus:comment-removed', { detail: result }));
    showToast('Comment deleted.');
  } catch (caught) { showToast(caught instanceof Error ? caught.message : 'Could not delete the comment.', 'error'); }
}

/* ---------- Inline comments ---------- */

const bindCommentForms = (root: ParentNode = document) => $$<HTMLFormElement>('[data-comment-form]', root).forEach((form) => {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = $<HTMLInputElement>('input[name="content"]', form)!; const content = input.value.trim(); if (!content) return;
    input.disabled = true;
    try {
      const { comment } = await postJson(form.action, { content });
      const card = form.closest<HTMLElement>('[data-post-id]')!;
      const item = document.createElement('li'); item.className = 'flex animate-fade-in gap-2';
      item.dataset.commentId = String(comment._id); item.dataset.commentPost = card.dataset.postId || '';
      const bubble = document.createElement('div'); bubble.className = 'comment-bubble';
      const name = document.createElement('a'); name.className = 'block text-[0.8125rem] font-semibold hover:underline'; name.href = `/profile/${me.username}`; name.textContent = me.name;
      const text = document.createElement('p'); text.className = 'whitespace-pre-wrap break-words text-15 leading-snug'; text.textContent = comment.content; text.dataset.commentText = '';
      bubble.append(name, text);
      const body = document.createElement('div'); body.className = 'min-w-0 flex-1'; body.append(commentRow(bubble, commentMenu(String(comment._id), true, true)));
      const when = document.createElement('p'); when.className = 'flex gap-3 px-3 text-xs text-muted'; when.dataset.commentMeta = ''; when.append('Just now', editedLabel()); body.append(when);
      item.append(avatarEl({ displayName: me.name, avatarUrl: me.avatar }, 'size-8 text-xs'), body);
      $('[data-comment-list]', card)?.appendChild(item);
      const counter = $('[data-comment-count]', card);
      if (counter) { const next = Number(counter.textContent || 0) + 1; counter.textContent = String(next); const label = $('[data-comment-count-label]', card); label?.classList.remove('hidden'); if (label) label.lastChild!.textContent = next === 1 ? ' comment' : ' comments'; }
      input.value = '';
    } catch (caught) { showToast(caught instanceof Error ? caught.message : 'Could not post comment.', 'error'); }
    finally { input.disabled = false; input.focus(); }
  });
});
bindCommentForms();

/* ---------- Share dialog (Facebook-style: feed, group, Messenger, elsewhere) ---------- */

type ShareInfo = { id: string; author: string; authorId: string; visibility: string; group: boolean; groupPrivate: boolean | null };
type ShareFriend = { _id: string; username: string; displayName: string; avatarUrl: string };
type ShareGroup = { _id: string; name: string; slug: string; coverUrl: string; privacy: string; canPost: boolean; needsApproval: boolean };

const shareDialog = $<HTMLDialogElement>('[data-share-dialog]');
const AUDIENCE_RANK: Record<string, number> = { private: 0, followers: 1, public: 2 };
const shareState = { info: null as ShareInfo | null, groupId: '', picked: new Set<string>(), sent: new Set<string>() };
let shareTargets: Promise<{ friends: ShareFriend[]; groups: ShareGroup[] }> | null = null;
const loadShareTargets = () => (shareTargets ||= request('/api/share/targets').catch((error) => { shareTargets = null; throw error; }));

/** Widest audience the viewer may re-share to, mirroring share.service (null: send or copy the link only). */
function shareLimit(info: ShareInfo): string | null {
  if (info.group) return info.groupPrivate ? null : 'public';
  if (info.visibility === 'public') return 'public';
  return info.authorId === me.id ? info.visibility : null;
}

function openShare(info: ShareInfo) {
  if (!shareDialog) return;
  Object.assign(shareState, { info, groupId: '', picked: new Set(), sent: new Set() });
  const form = $<HTMLFormElement>('[data-share-form]', shareDialog)!;
  form.reset(); $('[data-form-error]', form)!.classList.add('hidden');
  $<HTMLInputElement>('[data-share-send-note]', shareDialog)!.value = '';
  $<HTMLInputElement>('[data-share-friend-search]', shareDialog)!.value = '';
  $<HTMLInputElement>('[data-share-group-search]', shareDialog)!.value = '';
  const limit = shareLimit(info);
  const visibility = $<HTMLSelectElement>('[data-share-visibility]', shareDialog)!;
  [...visibility.options].forEach((option) => { option.disabled = !!limit && AUDIENCE_RANK[option.value]! > AUDIENCE_RANK[limit]!; });
  visibility.value = limit || 'public';
  const note = $('[data-share-note]', shareDialog)!;
  note.textContent = !limit
    ? `Only public posts can be shared to a feed or group. You can still send ${info.author ? `${info.author}'s` : 'this'} post to friends who can see it, or copy the link.`
    : limit !== 'public' ? `Your post is shared with ${limit === 'private' ? 'only you' : 'your followers'}, so it can't be shared more widely.` : '';
  note.classList.toggle('hidden', !note.textContent);
  $$<HTMLButtonElement>('textarea, button, select', form).forEach((control) => { control.disabled = !limit; });
  setShareDestination('');
  paintShareLinks();
  paintShareSendBar();
  $('[data-share-action="native"]', shareDialog)!.classList.toggle('hidden', typeof navigator.share !== 'function');
  showShareView('main');
  shareDialog.showModal();
  if (limit) $<HTMLTextAreaElement>('[data-share-content]', shareDialog)!.focus();
  void paintShareFriends();
}

const shareUrl = () => `${window.location.origin}/posts/${shareState.info!.id}`;
function paintShareLinks() {
  const url = encodeURIComponent(shareUrl());
  const title = encodeURIComponent(shareState.info?.author ? `${shareState.info.author}'s post on Oremus` : 'A post on Oremus');
  const links: Record<string, string> = {
    email: `mailto:?subject=${title}&body=${url}`,
    whatsapp: `https://wa.me/?text=${url}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
    x: `https://twitter.com/intent/tweet?url=${url}`
  };
  $$<HTMLAnchorElement>('[data-share-external]', shareDialog!).forEach((link) => { link.href = links[link.dataset.shareExternal!] || '#'; });
}

function showShareView(view: 'main' | 'destinations') {
  $$('[data-share-view]', shareDialog!).forEach((node) => node.classList.toggle('hidden', node.dataset.shareView !== view));
  if (view === 'destinations') { void paintShareGroups(); $<HTMLInputElement>('[data-share-group-search]', shareDialog!)?.focus(); }
}

function setShareDestination(groupId: string, groupName = '') {
  shareState.groupId = groupId;
  $('[data-share-destination-label]', shareDialog!)!.textContent = groupId ? groupName : 'Feed';
  $('[data-share-destination-icon]', shareDialog!)!.setAttribute('href', groupId ? '#i-group' : '#i-feed');
  // Group shares follow the group's privacy, like group posts.
  $('[data-share-audience-wrap]', shareDialog!)!.classList.toggle('hidden', !!groupId);
  paintShareAudienceIcon();
}
const paintShareAudienceIcon = () => $('[data-share-audience-icon]', shareDialog!)!.setAttribute('href', `#${VISIBILITY_ICONS[$<HTMLSelectElement>('[data-share-visibility]', shareDialog!)!.value] || 'i-globe'}`);

function shareListStatus(list: HTMLElement, text: string, className: string) {
  const item = document.createElement('li'); item.className = className; item.textContent = text; list.replaceChildren(item);
}

async function paintShareFriends() {
  const list = $('[data-share-friends]', shareDialog!)!;
  const status = (text: string) => shareListStatus(list, text, 'px-1 py-6 text-15 text-muted');
  let friends: ShareFriend[];
  try { friends = (await loadShareTargets()).friends; } catch (caught) { status(caught instanceof Error ? caught.message : 'Could not load friends.'); return; }
  const term = $<HTMLInputElement>('[data-share-friend-search]', shareDialog!)!.value.trim().toLowerCase();
  const shown = friends.filter((friend) => !term || friend.displayName.toLowerCase().includes(term) || friend.username.toLowerCase().includes(term));
  if (!friends.length) { status('Add friends to send posts in Messenger.'); return; }
  if (!shown.length) { status('No friends match your search.'); return; }
  list.replaceChildren(...shown.map((friend) => {
    const sent = shareState.sent.has(friend._id);
    const button = document.createElement('button'); button.type = 'button'; button.className = 'share-friend'; button.dataset.shareFriend = friend._id; button.title = friend.displayName;
    button.setAttribute('aria-pressed', String(shareState.picked.has(friend._id))); button.disabled = sent;
    const check = document.createElement('span'); check.className = 'share-friend-check'; check.appendChild(svgUse('i-check', 'icon size-3'));
    const name = document.createElement('span'); name.className = `line-clamp-2 break-words${sent ? ' font-semibold text-brand-600' : ''}`; name.textContent = sent ? 'Sent' : friend.displayName;
    button.append(avatarEl({ displayName: friend.displayName, avatarUrl: friend.avatarUrl }, 'size-14 text-lg'), check, name);
    const item = document.createElement('li'); item.appendChild(button); return item;
  }));
}

function paintShareSendBar() {
  const count = shareState.picked.size;
  const bar = $('[data-share-send-bar]', shareDialog!)!;
  bar.classList.toggle('hidden', !count); bar.classList.toggle('flex', !!count);
  $('[data-share-send]', shareDialog!)!.textContent = count > 1 ? `Send to ${count}` : 'Send';
}

async function paintShareGroups() {
  const list = $('[data-share-groups]', shareDialog!)!;
  const status = (text: string) => shareListStatus(list, text, 'px-2 py-4 text-15 text-muted');
  const allowed = !!shareState.info && shareLimit(shareState.info) === 'public';
  $('[data-share-groups-note]', shareDialog!)!.classList.toggle('hidden', allowed);
  let groups: ShareGroup[];
  try { groups = (await loadShareTargets()).groups; } catch (caught) { status(caught instanceof Error ? caught.message : 'Could not load groups.'); return; }
  const term = $<HTMLInputElement>('[data-share-group-search]', shareDialog!)!.value.trim().toLowerCase();
  const shown = groups.filter((group) => !term || group.name.toLowerCase().includes(term));
  if (!groups.length) { status("You haven't joined any groups yet."); return; }
  if (!shown.length) { status('No groups match your search.'); return; }
  list.replaceChildren(...shown.map((group) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'menu-item disabled:cursor-not-allowed disabled:opacity-50';
    button.dataset.shareDestination = group._id; button.dataset.shareGroupName = group.name;
    button.disabled = !allowed || !group.canPost;
    const cover = document.createElement('span'); cover.className = 'size-10 shrink-0 overflow-hidden rounded-lg bg-field';
    if (group.coverUrl) { const img = document.createElement('img'); img.src = group.coverUrl; img.alt = ''; img.className = 'size-full object-cover'; cover.appendChild(img); }
    const title = document.createElement('span'); title.className = 'block truncate font-semibold'; title.textContent = group.name;
    const meta = document.createElement('span'); meta.className = 'block text-[0.8125rem] font-normal text-muted';
    meta.textContent = !group.canPost ? 'Only admins can post' : `${group.privacy === 'private' ? 'Private' : 'Public'} group${group.needsApproval ? ' · Posts need approval' : ''}`;
    const text = document.createElement('span'); text.className = 'min-w-0'; text.append(title, meta);
    button.append(cover, text);
    const item = document.createElement('li'); item.appendChild(button); return item;
  }));
}

function bumpShareCount(postId: string) {
  $$(`[data-post-id="${postId}"]`).forEach((card) => {
    const counter = $('[data-share-count]', card), label = $('[data-share-count-label]', card);
    if (!counter || !label) return;
    const next = Number(counter.textContent || 0) + 1; counter.textContent = String(next);
    label.classList.remove('hidden'); label.lastChild!.textContent = next === 1 ? ' share' : ' shares';
  });
}

if (shareDialog) {
  const form = $<HTMLFormElement>('[data-share-form]', shareDialog)!;
  $('[data-share-visibility]', shareDialog)!.addEventListener('change', paintShareAudienceIcon);
  $('[data-share-friend-search]', shareDialog)!.addEventListener('input', () => void paintShareFriends());
  $('[data-share-group-search]', shareDialog)!.addEventListener('input', () => void paintShareGroups());
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const info = shareState.info; if (!info) return;
    const error = $('[data-form-error]', form)!; error.classList.add('hidden');
    const submit = $<HTMLButtonElement>('[data-share-submit]', form)!; submit.disabled = true;
    try {
      const body = { content: $<HTMLTextAreaElement>('[data-share-content]', form)!.value, visibility: $<HTMLSelectElement>('[data-share-visibility]', form)!.value, ...(shareState.groupId ? { groupId: shareState.groupId } : {}) };
      const result = await postJson(`/api/posts/${info.id}/shares`, body);
      bumpShareCount(info.id); shareDialog.close(); showToast(result.message);
    } catch (caught) { error.textContent = caught instanceof Error ? caught.message : 'Could not share this post.'; error.classList.remove('hidden'); }
    finally { submit.disabled = false; }
  });
  shareDialog.addEventListener('click', async (event) => {
    if (event.target === shareDialog) { shareDialog.close(); return; }
    const target = (event.target as HTMLElement).closest<HTMLElement>('button, a');
    if (!target || !shareState.info) return;
    const data = target.dataset;
    if (data.shareOpen === 'destinations' || data.shareAction === 'group') { showShareView('destinations'); return; }
    if (data.shareBack !== undefined) { showShareView('main'); return; }
    if (data.shareDestination !== undefined) { setShareDestination(data.shareDestination, data.shareGroupName || ''); showShareView('main'); $<HTMLTextAreaElement>('[data-share-content]', shareDialog)!.focus(); return; }
    if (data.shareFriend) {
      if (shareState.picked.has(data.shareFriend)) shareState.picked.delete(data.shareFriend); else shareState.picked.add(data.shareFriend);
      target.setAttribute('aria-pressed', String(shareState.picked.has(data.shareFriend))); paintShareSendBar(); return;
    }
    if (data.shareSend !== undefined) {
      const userIds = [...shareState.picked]; if (!userIds.length) return;
      const button = target as HTMLButtonElement; button.disabled = true;
      try {
        const note = $<HTMLInputElement>('[data-share-send-note]', shareDialog)!;
        const result = await postJson(`/api/posts/${shareState.info.id}/send`, { userIds, content: note.value });
        userIds.forEach((userId) => { shareState.sent.add(userId); shareState.picked.delete(userId); });
        note.value = ''; paintShareSendBar(); void paintShareFriends(); showToast(result.message);
      } catch (caught) { showToast(caught instanceof Error ? caught.message : 'Could not send.', 'error'); }
      finally { button.disabled = false; }
      return;
    }
    if (data.shareAction === 'messenger') { $<HTMLInputElement>('[data-share-friend-search]', shareDialog)!.focus(); return; }
    if (data.shareAction === 'copy') {
      try { await navigator.clipboard.writeText(shareUrl()); showToast('Link copied to clipboard.'); } catch { showToast('Could not copy the link.', 'error'); }
      return;
    }
    if (data.shareAction === 'native') {
      try { await navigator.share({ title: 'Oremus', url: shareUrl() }); }
      catch (caught) { if ((caught as DOMException)?.name !== 'AbortError') showToast('Could not open the share menu.', 'error'); }
    }
  });
}

/* ---------- Endless lists (feed, comments, chats, notifications, groups, archive…) ---------- */

/** Wires up items that arrive after page load; everything else on them uses delegated listeners. */
function initDynamic(root: ParentNode) {
  renderMaps(root); bindReactionToggles(root); bindCommentForms(root); applyStoryStyles(root);
}

/** An older chunk ending close in time to the first message shown makes that message's date separator redundant. */
function joinMessageDates(fragment: DocumentFragment) {
  const rows = $('[data-message-rows]'); const first = rows?.firstElementChild as HTMLElement | null;
  const last = [...fragment.querySelectorAll<HTMLElement>('[data-at]')].pop();
  if (first?.dataset.messageTime && last && Number(first.dataset.messageTime) - Number(last.dataset.at) <= 20 * 60_000) first.remove();
}

initInfiniteLists(request, (name, fragment) => {
  if (name === 'messages') joinMessageDates(fragment);
  initDynamic(fragment);
});

// Reading time and in-post clicks feed "Suggested for you".
initActivityTracking();
// Interest survey before using the app (only on /onboarding).
initOnboarding();

/* ---------- Filters (chats, groups) ---------- */

$<HTMLInputElement>('[data-chat-filter]')?.addEventListener('input', (event) => {
  const term = (event.target as HTMLInputElement).value.trim().toLowerCase();
  $$('[data-chat-name]').forEach((row) => row.classList.toggle('hidden', !!term && !row.dataset.chatName!.includes(term)));
});
$<HTMLInputElement>('[data-group-filter]')?.addEventListener('input', (event) => {
  const term = (event.target as HTMLInputElement).value.trim().toLowerCase(); let shown = 0;
  $$('[data-group-name]').forEach((card) => { const match = !term || card.dataset.groupName!.includes(term); card.classList.toggle('hidden', !match); if (match) shown++; });
  $('[data-group-empty]')?.classList.toggle('hidden', shown > 0);
});

/* ---------- Messenger ---------- */

const miniChatDock = $('[data-mini-chat-dock]');
const miniChatPanel = (conversationId: string) => miniChatDock?.querySelector<HTMLElement>(`[data-mini-conversation="${CSS.escape(conversationId)}"]`) || null;

function setMiniChatCollapsed(panel: HTMLElement, collapsed: boolean) {
  panel.classList.toggle('h-[28rem]', !collapsed); panel.classList.toggle('h-12', collapsed);
  $('[data-mini-message-list]', panel)?.classList.toggle('hidden', collapsed);
  $('[data-mini-message-form]', panel)?.classList.toggle('hidden', collapsed);
  const toggle = $('[data-mini-toggle]', panel); toggle?.setAttribute('aria-expanded', String(!collapsed));
}

function miniMessageRow(message: any) {
  const mine = senderIdOf(message) === me.id;
  const row = document.createElement('div'); row.className = `flex ${mine ? 'justify-end' : 'justify-start'}`;
  if (message._id) row.dataset.key = String(message._id);
  const bubble = document.createElement('p'); bubble.className = `bubble ${mine ? 'bubble-me' : 'bubble-them'}`;
  setLinkedText(bubble, String(message.content || ''));
  bubble.title = new Date(message.createdAt || Date.now()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  row.appendChild(bubble);
  return row;
}

function appendMiniMessage(panel: HTMLElement, message: any) {
  const list = $('[data-mini-message-list]', panel); if (!list) return;
  if (message._id && $(`[data-key="${CSS.escape(String(message._id))}"]`, list)) return;
  $('[data-mini-empty]', list)?.remove();
  list.appendChild(miniMessageRow(message)); list.scrollTop = list.scrollHeight;
}

function createMiniChatShell(conversationId: string, displayName: string, avatarUrl: string) {
  const panel = document.createElement('section');
  panel.className = 'flex h-[28rem] w-80 flex-col overflow-hidden rounded-t-xl bg-surface shadow-pop ring-1 ring-black/10';
  panel.dataset.miniConversation = conversationId; panel.setAttribute('aria-label', `Chat with ${displayName}`);

  const header = document.createElement('header'); header.className = 'flex h-12 shrink-0 items-center gap-2 border-b border-line px-2';
  const person = document.createElement('a'); person.className = 'flex min-w-0 flex-1 items-center gap-2 rounded-lg p-1 hover:bg-hover'; person.href = `/messages/${conversationId}`;
  const name = document.createElement('span'); name.className = 'truncate font-semibold'; name.textContent = displayName;
  person.append(avatarEl({ displayName, avatarUrl }, 'size-8 text-xs'), name);
  const full = document.createElement('a'); full.className = 'icon-btn-ghost size-8 text-brand-600'; full.href = `/messages/${conversationId}`; full.setAttribute('aria-label', 'Open full chat'); full.appendChild(svgUse('i-expand', 'icon size-4'));
  const minimize = document.createElement('button'); minimize.type = 'button'; minimize.className = 'icon-btn-ghost size-8 text-brand-600'; minimize.dataset.miniToggle = ''; minimize.setAttribute('aria-label', `Minimize chat with ${displayName}`); minimize.setAttribute('aria-expanded', 'true'); minimize.appendChild(svgUse('i-minus', 'icon size-4'));
  const close = document.createElement('button'); close.type = 'button'; close.className = 'icon-btn-ghost size-8 text-brand-600'; close.setAttribute('aria-label', `Close chat with ${displayName}`); close.appendChild(svgUse('i-x', 'icon size-4'));
  minimize.addEventListener('click', () => setMiniChatCollapsed(panel, minimize.getAttribute('aria-expanded') === 'true'));
  close.addEventListener('click', () => panel.remove()); header.append(person, full, minimize, close);

  const list = document.createElement('div'); list.className = 'flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-canvas px-3 py-3'; list.dataset.miniMessageList = ''; list.setAttribute('aria-live', 'polite');
  const skeleton = document.createElement('div'); skeleton.className = 'space-y-2'; skeleton.dataset.miniLoading = '';
  for (const width of ['w-2/3', 'ml-auto w-3/4', 'w-1/2']) { const line = document.createElement('span'); line.className = `block h-9 ${width} rounded-[1.125rem] bg-control`; skeleton.appendChild(line); }
  list.appendChild(skeleton);

  const form = document.createElement('form'); form.className = 'flex shrink-0 items-center gap-2 border-t border-line p-2'; form.dataset.miniMessageForm = '';
  const label = document.createElement('label'); label.className = 'sr-only'; label.htmlFor = `mini-chat-${conversationId}`; label.textContent = `Message ${displayName}`;
  const input = document.createElement('input'); input.id = label.htmlFor; input.name = 'content'; input.className = 'pill-input h-9 min-w-0 flex-1'; input.placeholder = 'Aa'; input.maxLength = 3000; input.autocomplete = 'off'; input.disabled = true;
  const send = document.createElement('button'); send.type = 'submit'; send.className = 'grid size-9 shrink-0 place-items-center rounded-full text-brand-600 hover:bg-hover disabled:opacity-40'; send.setAttribute('aria-label', 'Send message'); send.disabled = true; send.appendChild(svgUse('i-send', 'icon'));
  form.append(label, input, send); panel.append(header, list, form);
  return panel;
}

async function openMiniChat(link: HTMLAnchorElement) {
  if (!miniChatDock) return;
  const conversationId = link.dataset.miniChat; if (!conversationId) return;
  const existing = miniChatPanel(conversationId);
  if (existing) { setMiniChatCollapsed(existing, false); $<HTMLInputElement>('[name="content"]', existing)?.focus(); return; }
  const panels = $$<HTMLElement>('[data-mini-conversation]', miniChatDock);
  if (panels.length >= 2) panels[0]?.remove();
  const displayName = link.dataset.chatName || 'Chat';
  const panel = createMiniChatShell(conversationId, displayName, link.dataset.chatAvatar || ''); miniChatDock.appendChild(panel);
  try {
    const result = await request(`/api/conversations/${conversationId}/preview`);
    const list = $('[data-mini-message-list]', panel)!; list.replaceChildren();
    if (result.messages.length) {
      result.messages.forEach((message: any) => appendMiniMessage(panel, message));
      // Scrolling up in the mini chat loads earlier messages.
      createInfiniteList({
        list, root: list, reverse: true, next: result.next || null,
        load: async (cursor) => {
          const chunk = await request(`/api/lists/messages?cursor=${encodeURIComponent(cursor)}&conversation=${encodeURIComponent(conversationId)}`);
          return { nodes: (chunk.items as any[]).map(miniMessageRow), next: chunk.next };
        }
      });
    }
    else { const empty = document.createElement('p'); empty.className = 'm-auto text-pretty text-center text-sm text-muted'; empty.dataset.miniEmpty = ''; empty.textContent = `No messages yet. Say hello to ${firstNameOf(result.conversation.partner.displayName)}.`; list.appendChild(empty); }
    const input = $<HTMLInputElement>('[name="content"]', panel)!, send = $<HTMLButtonElement>('button[type="submit"]', panel)!;
    input.disabled = false; send.disabled = false; setUnreadCounts(result); $('[data-mini-unread]', link)?.remove(); input.focus();
    const person = $('header a', panel); if (person && result.conversation.partner.username) person.setAttribute('href', `/profile/${result.conversation.partner.username}`);
    $<HTMLFormElement>('[data-mini-message-form]', panel)!.addEventListener('submit', async (event) => {
      event.preventDefault(); const content = input.value.trim(); if (!content) return;
      input.disabled = true; send.disabled = true;
      try { const sent = await postJson(`/api/conversations/${conversationId}/messages`, { content }); input.value = ''; appendMiniMessage(panel, sent.message); }
      catch (caught) { showToast(caught instanceof Error ? caught.message : 'Message failed.', 'error'); }
      finally { input.disabled = false; send.disabled = false; input.focus(); }
    });
  } catch (caught) {
    const list = $('[data-mini-message-list]', panel)!; list.replaceChildren();
    const error = document.createElement('p'); error.className = 'm-auto px-5 text-pretty text-center text-sm text-ios-red'; error.setAttribute('role', 'alert'); error.textContent = caught instanceof Error ? caught.message : 'Could not open this chat.'; list.appendChild(error);
  }
}

document.addEventListener('click', (event) => {
  const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('[data-mini-chat]');
  if (!link || window.innerWidth < 1024 || !(event instanceof MouseEvent) || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault(); link.closest<HTMLDetailsElement>('details')?.removeAttribute('open'); void openMiniChat(link);
});

const messageList = $('#message-list');
if (messageList) messageList.scrollTop = messageList.scrollHeight;
const activeConversation = $('[data-conversation]')?.dataset.conversation || '';

type ChatPerson = { _id?: string; displayName: string; username?: string; profile?: { avatarUrl?: string } };
const senderOf = (message: any): ChatPerson | null => (message.senderId && typeof message.senderId === 'object' ? message.senderId : null);
const senderIdOf = (message: any) => String(message.senderId?._id ?? message.senderId);
const firstNameOf = (name: string) => (name || '').trim().split(/\s+/)[0] || name;

function appendMessage(message: any) {
  if (!messageList) return;
  if (message._id && $(`[data-key="${CSS.escape(String(message._id))}"]`, messageList)) return;
  const mine = senderIdOf(message) === me.id;
  const nearBottom = mine || messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 160;
  const row = document.createElement('div'); row.className = `mb-2 flex animate-fade-in items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`;
  if (!mine) {
    const slot = document.createElement('span'); slot.className = 'w-7 shrink-0';
    const sender = senderOf(message); if (sender) slot.appendChild(avatarEl({ displayName: sender.displayName, avatarUrl: sender.profile?.avatarUrl }, 'size-7 text-2xs'));
    row.appendChild(slot);
  }
  const bubble = document.createElement('p'); bubble.className = `bubble ${mine ? 'bubble-me' : 'bubble-them'}`; setLinkedText(bubble, String(message.content || ''));
  bubble.title = new Date(message.createdAt || Date.now()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (message._id) row.dataset.key = String(message._id);
  row.dataset.at = String(new Date(message.createdAt || Date.now()).getTime());
  row.appendChild(bubble); ($('[data-message-rows]', messageList) || messageList).appendChild(row);
  if (nearBottom) messageList.scrollTop = messageList.scrollHeight;
}

/** Keeps the conversation list in sync: newest chat on top, fresh preview, unread styling. */
function updateChatRow(message: any, unread: boolean) {
  const list = $('[data-chat-list]'); if (!list) return;
  const conversationId = String(message.conversationId);
  const mine = senderIdOf(message) === me.id;
  const sender = senderOf(message);
  let row = $<HTMLElement>(`[data-chat-id="${CSS.escape(conversationId)}"]`, list);
  if (!row) {
    if (mine || !sender) return; // a chat we start ourselves is always rendered by the server first
    row = document.createElement('li'); row.dataset.chatId = conversationId; row.dataset.chatName = sender.displayName.toLowerCase(); row.dataset.chatFirstName = firstNameOf(sender.displayName);
    const link = document.createElement('a'); link.className = 'chat-row'; link.href = `/messages/${conversationId}`;
    const body = document.createElement('span'); body.className = 'min-w-0 flex-1';
    const title = document.createElement('span'); title.className = 'block truncate text-15 font-medium'; title.dataset.chatTitle = ''; title.textContent = sender.displayName;
    const snippet = document.createElement('span'); snippet.className = 'flex gap-1 text-[0.8125rem] text-muted'; snippet.dataset.chatSnippet = '';
    const preview = document.createElement('span'); preview.className = 'truncate'; preview.dataset.chatPreview = '';
    const sep = document.createElement('span'); sep.setAttribute('aria-hidden', 'true'); sep.dataset.chatSep = ''; sep.textContent = '·';
    const time = document.createElement('span'); time.className = 'shrink-0 font-normal text-muted'; time.dataset.chatTime = '';
    const dot = document.createElement('span'); dot.className = 'hidden size-3 shrink-0 rounded-full bg-brand-600'; dot.setAttribute('aria-label', 'Unread'); dot.dataset.chatDot = '';
    snippet.append(preview, sep, time); body.append(title, snippet);
    link.append(avatarEl({ displayName: sender.displayName, avatarUrl: sender.profile?.avatarUrl }, 'size-14 text-lg'), body, dot); row.appendChild(link);
  }
  const who = mine ? 'You' : row.dataset.chatFirstName || firstNameOf(sender?.displayName || '');
  $('[data-chat-preview]', row)!.textContent = `${who}: ${message.content}`;
  $('[data-chat-sep]', row)?.classList.remove('hidden');
  $('[data-chat-time]', row)!.textContent = timeAgo(message.createdAt || new Date());
  setChatRowUnread(row, unread);
  list.prepend(row);
}

function setChatRowUnread(row: HTMLElement, unread: boolean) {
  const title = $('[data-chat-title]', row), snippet = $('[data-chat-snippet]', row);
  title?.classList.toggle('font-bold', unread); title?.classList.toggle('font-medium', !unread);
  snippet?.classList.toggle('font-bold', unread); snippet?.classList.toggle('text-brand-600', unread); snippet?.classList.toggle('text-muted', !unread);
  $('[data-chat-dot]', row)?.classList.toggle('hidden', !unread);
}

/* Unread counters: header badges (desktop + mobile) and the "(3) Chats · Oremus" tab title. */
const unreadCounts = {
  notifications: Number(document.body.dataset.unreadNotifications) || 0,
  messages: Number(document.body.dataset.unreadMessages) || 0
};
const baseTitle = document.title.replace(/^\(\d+\+?\)\s*/, '');
let titleAlert = '', titleFlashTimer = 0, titleFlashOn = false;

function renderTitle() {
  const total = unreadCounts.notifications + unreadCounts.messages;
  const counted = total ? `(${total > 99 ? '99+' : total}) ${baseTitle}` : baseTitle;
  document.title = titleAlert && titleFlashOn ? titleAlert : counted;
}

/** Messenger-style blinking tab title while the tab is in the background. */
function flashTitle(text: string) {
  if (!document.hidden) return;
  titleAlert = text; titleFlashOn = true; renderTitle();
  window.clearInterval(titleFlashTimer);
  titleFlashTimer = window.setInterval(() => { titleFlashOn = !titleFlashOn; renderTitle(); }, 1500);
}

function stopTitleFlash() { window.clearInterval(titleFlashTimer); titleAlert = ''; titleFlashOn = false; renderTitle(); }

/** Applies the badge counts a read/preview response carries. */
function setUnreadCounts(result: { unreadMessages?: number; unreadNotifications?: number }) {
  if (typeof result.unreadMessages === 'number') setUnread('messages', result.unreadMessages);
  if (typeof result.unreadNotifications === 'number' && !notificationList) setUnread('notifications', result.unreadNotifications);
}

function setUnread(kind: 'notifications' | 'messages', count: number) {
  const value = unreadCounts[kind] = Math.max(0, count);
  $$<HTMLElement>(`[data-badge-link="${kind}"]`).forEach((link) => {
    let badge = $('[data-badge]', link);
    if (!value) badge?.remove();
    else {
      if (!badge) { badge = document.createElement('span'); badge.className = `badge ${link.dataset.badgeClass || ''}`.trim(); badge.dataset.badge = ''; link.appendChild(badge); }
      badge.textContent = value > 9 ? '9+' : String(value);
    }
    if (link.dataset.badgeLabel) link.setAttribute('aria-label', value ? `${link.dataset.badgeLabel}, ${value} unread` : link.dataset.badgeLabel);
  });
  renderTitle();
}
renderTitle();

const readMenuInFlight: Partial<Record<'notifications' | 'messages', Promise<void>>> = {};
function markMenuRead(kind: 'notifications' | 'messages') {
  if (!unreadCounts[kind] || readMenuInFlight[kind]) return;
  const endpoint = kind === 'notifications' ? '/api/notifications/read' : '/api/conversations/read';
  readMenuInFlight[kind] = postJson(endpoint, {})
    .then((result) => {
      setUnreadCounts(result); setUnread(kind, 0);
      if (kind === 'notifications') {
        $$('[data-unread-dot]').forEach((node) => node.remove());
        $$('[data-unread-time]').forEach((node) => { node.classList.remove('font-semibold', 'text-brand-600'); node.classList.add('text-muted'); });
      }
      scheduleLiveSync(0);
    })
    .catch(() => undefined)
    .finally(() => { delete readMenuInFlight[kind]; });
}

$$<HTMLDetailsElement>('details[data-read-on-open]').forEach((menu) => menu.addEventListener('toggle', () => {
  if (!menu.open) return;
  const kind = menu.dataset.readOnOpen;
  if (kind === 'notifications' || kind === 'messages') markMenuRead(kind);
}));

/* Notification sounds are synthesized, so there is no audio file to ship. Browsers only allow audio after a user gesture. */
let audioContext: AudioContext | null = null, lastSoundAt = 0;
const unlockAudio = () => {
  try { audioContext ??= new AudioContext(); if (audioContext.state === 'suspended') void audioContext.resume(); } catch { /* audio unsupported */ }
};
['pointerdown', 'keydown', 'touchstart'].forEach((type) => window.addEventListener(type, unlockAudio, { once: true, passive: true }));

function playSound(kind: 'message' | 'notification') {
  const ctx = audioContext; if (!ctx || ctx.state !== 'running') return;
  const now = performance.now(); if (now - lastSoundAt < 600) return; lastSoundAt = now;
  const notes: Array<[number, number]> = kind === 'message' ? [[784, 0], [1175, 0.09]] : [[660, 0]];
  for (const [frequency, offset] of notes) {
    const osc = ctx.createOscillator(), gain = ctx.createGain(), at = ctx.currentTime + offset;
    osc.type = 'sine'; osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(0.22, at + 0.015); gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
    osc.connect(gain).connect(ctx.destination); osc.start(at); osc.stop(at + 0.3);
  }
}

/* The open chat is marked read right away while the tab is visible, otherwise once the user comes back to it. */
let pendingRead = false, readInFlight: Promise<void> | null = null;
function markActiveRead() {
  if (!activeConversation) return;
  if (document.hidden) { pendingRead = true; return; }
  pendingRead = false;
  readInFlight ??= postJson(`/api/conversations/${activeConversation}/read`, {})
    .then(setUnreadCounts)
    .catch(() => undefined)
    .finally(() => { readInFlight = null; });
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  stopTitleFlash();
  if (pendingRead) markActiveRead();
});
window.addEventListener('focus', () => { if (titleAlert) stopTitleFlash(); });

const messageForm = $<HTMLFormElement>('[data-message-form]');
messageForm?.addEventListener('submit', async (event) => {
  event.preventDefault(); const input = $<HTMLInputElement>('[name="content"]', messageForm); if (!input?.value.trim()) return;
  const content = input.value; input.value = '';
  try { const result = await postJson(messageForm.action, { content }); appendMessage(result.message); updateChatRow(result.message, false); }
  catch (caught) { input.value = content; showToast(caught instanceof Error ? caught.message : 'Message failed.', 'error'); }
});

/* ---------- Live updates ---------- */

/*
 * Realtime events arrive over the socket; GET /api/live is the source of truth the page catches up from.
 * It runs after every event (debounced), after the socket reconnects, when the connection comes back and
 * when a tab that sat in the background is shown again, so the page never needs a manual refresh.
 */
const notificationList = $('[data-infinite="notifications"]');
const chatList = $('[data-chat-list]');
let liveTimer = 0, liveInFlight = false, liveQueued = false, liveSyncedAt = Date.now();

function scheduleLiveSync(delay = 400) {
  window.clearTimeout(liveTimer);
  liveTimer = window.setTimeout(() => void syncLive(), delay);
}

function paintLivePanel(name: string, html: unknown) {
  const panel = $(`[data-live-panel="${name}"]`); if (!panel || typeof html !== 'string') return;
  const scrollTop = $('ul', panel)?.scrollTop || 0;
  panel.innerHTML = html;
  const fresh = $('ul', panel); if (fresh) fresh.scrollTop = scrollTop;
}

/** Puts rows the list does not show yet on top, newest first, and leaves everything already shown alone. */
function prependNewRows(list: HTMLElement, html: string) {
  const known = new Set($$<HTMLElement>(':scope > [data-key]', list).map((row) => row.dataset.key));
  const fragment = document.createDocumentFragment();
  htmlNodes(html).forEach((node) => { if (node instanceof HTMLElement && node.dataset.key && !known.has(node.dataset.key)) fragment.appendChild(node); });
  if (!fragment.childNodes.length) return;
  initDynamic(fragment); list.prepend(fragment);
  $('[data-notifications-empty]')?.classList.add('hidden');
}

/** The newest chats move to the top in the server's order, replacing their stale rows. */
function mergeChatRows(list: HTMLElement, html: string) {
  const rows = htmlNodes(html).filter((node): node is HTMLElement => node instanceof HTMLElement && !!node.dataset.chatId);
  for (const row of rows.reverse()) {
    $(`[data-chat-id="${CSS.escape(row.dataset.chatId!)}"]`, list)?.remove();
    list.prepend(row);
  }
  if (rows.length) { list.classList.remove('hidden'); $('[data-chats-empty]')?.classList.add('hidden'); }
  $('[data-chat-filter]')?.dispatchEvent(new Event('input'));
}

/** Fills in messages the open chat missed (sent while the socket was down or the tab was asleep). */
function appendMissedMessages(messages: any[]) {
  if (!messageList) return;
  const missed = messages.filter((message) => !$(`[data-key="${CSS.escape(String(message._id))}"]`, messageList));
  missed.forEach((message) => appendMessage(message));
  if (missed.length && missed.some((message) => senderIdOf(message) !== me.id)) markActiveRead();
}

async function catchUpMiniChats() {
  await Promise.all($$<HTMLElement>('[data-mini-conversation]').map(async (panel) => {
    const list = $('[data-mini-message-list]', panel); if (!list || $('[data-mini-loading]', list)) return;
    try {
      const result = await request(`/api/conversations/${panel.dataset.miniConversation}/preview`);
      (result.messages as any[]).filter((message) => !$(`[data-key="${CSS.escape(String(message._id))}"]`, list)).forEach((message) => appendMiniMessage(panel, message));
      setUnreadCounts(result);
    } catch { /* the next sync tries again */ }
  }));
}

/** Returns false when the session is gone (signed out elsewhere), so callers stop retrying. */
async function syncLive(full = false): Promise<boolean> {
  if (!me.id) return false;
  if (liveInFlight) { liveQueued = true; return true; }
  liveInFlight = true;
  try {
    const params = new URLSearchParams();
    if (notificationList) {
      const query = new URLSearchParams(notificationList.dataset.infiniteQuery || '');
      params.set('notifications', query.get('opened') || String(Date.now())); params.set('filter', query.get('filter') || 'all');
    }
    if (chatList) params.set('chats', activeConversation);
    if (activeConversation) params.set('conversation', activeConversation);
    // A plain fetch so an expired session (401) can be told apart from a network error.
    const response = await fetch(`/api/live?${params}`, { credentials: 'same-origin', headers: { 'x-csrf-token': csrf } });
    if (response.status === 401) return false;
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) return true;
    const data = payload.data;
    liveSyncedAt = Date.now();
    paintLivePanel('chats', data.chatsHtml); paintLivePanel('notifications', data.notificationsHtml);
    setUnread('messages', data.unreadMessages);
    // The notifications page keeps everything read while it is open.
    setUnread('notifications', notificationList ? 0 : data.unreadNotifications);
    if (notificationList && typeof data.notificationRows === 'string') prependNewRows(notificationList, data.notificationRows);
    if (chatList && typeof data.chatRows === 'string') mergeChatRows(chatList, data.chatRows);
    if (Array.isArray(data.messages)) appendMissedMessages(data.messages);
    if (full) await catchUpMiniChats();
    return true;
  } catch {
    return true; // offline: the 'online' listener syncs again
  } finally {
    liveInFlight = false;
    if (liveQueued) { liveQueued = false; scheduleLiveSync(); }
  }
}

if (me.id) {
  // Tabs that were hidden or offline may have missed events (or slept through a socket reconnect).
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - liveSyncedAt > 30_000) void syncLive(true); });
  window.addEventListener('online', () => void syncLive(true));
  window.addEventListener('pageshow', (event) => { if (event.persisted) void syncLive(true); }); // restored from the back/forward cache
  // Socket delivery is immediate; this heartbeat is the safety net for silent proxy/adapter failures.
  window.setInterval(() => { if (!document.hidden) void syncLive(); }, 30_000);
}

type LiveSocket = {
  active: boolean;
  connect: () => void;
  on: (event: string, callback: (payload: any) => void) => void;
};
declare const io: undefined | ((options?: Record<string, unknown>) => LiveSocket);

if (typeof io === 'function' && me.id) {
  const socket = io({ withCredentials: true });
  let authRetry = 0, authTimer = 0;
  socket.on('connect', () => {
    authRetry = 0;
    void syncLive(true); // also closes the race between server-rendering the page and the first socket connection
  });
  // The server refused the handshake (socket.active is false): the 15-minute access token expired.
  // Any authenticated request renews it from the refresh token cookie, then the socket can connect again.
  // Network errors keep socket.active true and socket.io retries those on its own.
  socket.on('connect_error', () => {
    if (socket.active || authTimer) return;
    authTimer = window.setTimeout(async () => {
      authTimer = 0;
      if (!navigator.onLine) { window.addEventListener('online', () => socket.connect(), { once: true }); return; }
      if (await syncLive(true)) socket.connect();
    }, Math.min(30_000, 500 * 2 ** authRetry++));
  });
  socket.on('disconnect', (reason: string) => { if (reason === 'io server disconnect') socket.connect(); });

  socket.on('friendship:changed', (relation: any) => {
    syncFriendState(relation.userId, relation.state);
    syncFollowState(relation.userId, relation.following);
    if (window.location.pathname.startsWith('/messages')) window.location.assign('/messages');
    else scheduleLiveSync();
  });
  socket.on('social:changed', (relation: any) => {
    if (socialActionPending) return;
    if (relation.unavailable || relation.blocked !== undefined) {
      if (window.location.pathname.startsWith('/messages')) window.location.assign('/messages');
      else window.location.reload();
    }
  });
  socket.on('notification:new', (notification: any) => {
    const isMessage = notification?.type === 'message';
    if (isMessage && String(notification.entityId) === activeConversation) return;
    // Already looking at the notifications page: keep it read and show the new row at the top.
    if (notificationList) void request('/api/notifications/read', { method: 'POST' }).catch(() => undefined).finally(() => scheduleLiveSync(0));
    else {
      setUnread('notifications', unreadCounts.notifications + 1);
      if ($('details[data-read-on-open="notifications"][open]')) markMenuRead('notifications'); else scheduleLiveSync();
    }
    if (isMessage) return; // message:new shows its own toast and plays its own sound
    const actor = notification.actorId && typeof notification.actorId === 'object' ? String(notification.actorId.displayName || '') : '';
    showToast(actor ? `${actor} ${notification.text}` : 'You have a new notification.');
    playSound('notification');
    flashTitle(actor ? `${firstNameOf(actor)} ${notification.text}` : 'New notification');
  });
  socket.on('live:sync', () => scheduleLiveSync(0));
  socket.on('message:new', (message: any) => {
    const mine = senderIdOf(message) === me.id;
    const name = senderOf(message)?.displayName || 'Someone';
    const inActiveChat = String(message.conversationId) === activeConversation;
    const openMini = miniChatPanel(String(message.conversationId));
    if (inActiveChat) {
      appendMessage(message); updateChatRow(message, false);
      if (document.hidden && typeof message.unreadMessages === 'number') setUnread('messages', message.unreadMessages);
      markActiveRead();
    } else if (openMini) {
      appendMiniMessage(openMini, message); updateChatRow(message, false);
      void postJson(`/api/conversations/${message.conversationId}/read`, {})
        .then(setUnreadCounts)
        .catch(() => undefined);
    } else {
      updateChatRow(message, !mine);
      if (typeof message.unreadMessages === 'number') setUnread('messages', message.unreadMessages);
      if (!mine) showToast(`${firstNameOf(name)}: ${String(message.content).slice(0, 80)}`);
    }
    if (!mine && (!inActiveChat || document.hidden)) playSound('message');
    if (!mine) flashTitle(`${name} messaged you`);
    if ($('details[data-read-on-open="messages"][open]')) markMenuRead('messages');
    scheduleLiveSync(); // the chats popover shows the new preview
  });
}

/* ---------- Story viewer ---------- */

type Story = { id: string; mediaUrl: string | null; mediaType: 'image' | 'video' | null; text: string; background: string; style: Partial<StoryStyle> | null; createdAt: string; seen: boolean; myReaction: string | null; viewCount?: number };
type StoryGroup = { author: { _id: string; username: string; displayName: string; avatarUrl: string }; isSelf: boolean; hasUnseen: boolean; startIndex: number; stories: Story[] };

const viewer = $('[data-story-viewer]');
const storyData = $('#story-data');
if (viewer && storyData && Number(viewer.dataset.activeIndex) >= 0) {
  const { tray } = JSON.parse(storyData.textContent || '{}') as { tray: StoryGroup[] };
  const DURATION = 6000;
  let groupIndex = Number(viewer.dataset.activeIndex);
  let storyIndex = tray[groupIndex]?.startIndex ?? 0;
  let elapsed = 0, last = performance.now(), paused = false, holdPause = false;

  const card = $('[data-story-card]', viewer)!;
  const body = $('[data-story-body]', viewer)!;
  const image = $<HTMLImageElement>('[data-story-image]', viewer)!;
  const video = $<HTMLVideoElement>('[data-story-video]', viewer)!;
  const muteButton = $('[data-story-mute]', viewer)!;
  const textEl = $('[data-story-text]', viewer)!;
  const legacyTextClass = textEl.className.replace(/\bhidden\b/, '').trim();
  let muted = false, playPending = false, autoplayBlocked = false;
  const caption = $('[data-story-caption]', viewer)!;
  const progress = $('[data-story-progress]', viewer)!;
  const reply = $<HTMLFormElement>('[data-story-reply]', viewer)!;
  const viewersButton = $('[data-story-viewers]', viewer)!;
  const reactions = $('[data-story-reactions]', viewer)!;
  const deleteButton = $('[data-story-delete]', viewer)!;
  const pauseButton = $('[data-story-pause]', viewer)!;

  const current = () => ({ group: tray[groupIndex]!, story: tray[groupIndex]!.stories[storyIndex]! });

  const paintSide = (slot: 'prev' | 'next', group?: StoryGroup) => {
    const side = $(`[data-story-side="${slot}"]`, viewer); if (!side) return;
    side.replaceChildren(); side.classList.toggle('invisible', !group);
    if (!group) return;
    const cover = group.stories[group.startIndex] || group.stories[0]!;
    if (cover.mediaUrl && cover.mediaType === 'video') { const clip = document.createElement('video'); clip.src = `${cover.mediaUrl}#t=0.1`; clip.muted = true; clip.preload = 'metadata'; clip.className = 'absolute inset-0 size-full object-cover'; side.appendChild(clip); }
    else if (cover.mediaUrl) { const img = document.createElement('img'); img.src = cover.mediaUrl; img.alt = ''; img.className = 'absolute inset-0 size-full object-cover'; side.appendChild(img); }
    if (cover.style && cover.text) {
      const canvas = document.createElement('div'); canvas.className = `story-canvas absolute inset-0 ${cover.mediaUrl ? '' : `bg-story-${cover.background}`}`;
      const attrs = storyTextAttrs(cover.style); const text = document.createElement('p'); text.className = attrs.className; text.style.cssText = attrs.style;
      const span = document.createElement('span'); span.textContent = cover.text; text.appendChild(span); canvas.appendChild(text); side.appendChild(canvas);
    } else if (!cover.mediaUrl) { const block = document.createElement('div'); block.className = `absolute inset-0 grid place-items-center p-3 text-center font-display text-sm font-bold text-white bg-story-${cover.background}`; block.textContent = cover.text.slice(0, 80); side.appendChild(block); }
    const shade = document.createElement('div'); shade.className = 'absolute inset-0 bg-black/30'; side.appendChild(shade);
    const head = document.createElement('div'); head.className = 'absolute left-3 top-3 flex items-center gap-2 text-left';
    const who = document.createElement('div'); who.className = 'leading-tight';
    const name = document.createElement('p'); name.className = 'text-[0.8125rem] font-semibold text-white'; name.textContent = group.author.displayName;
    const when = document.createElement('p'); when.className = 'text-xs text-white/80'; when.textContent = timeAgo(cover.createdAt);
    who.append(name, when); head.append(avatarEl({ displayName: group.author.displayName, avatarUrl: group.author.avatarUrl }, 'size-8 text-2xs'), who); side.appendChild(head);
  };

  const markSeen = async (group: StoryGroup, story: Story) => {
    if (group.isSelf || story.seen) return;
    story.seen = true;
    try { await request(`/api/stories/${story.id}/view`, { method: 'POST' }); } catch { /* viewing still works offline */ }
    const row = $(`[data-story-row="${tray.indexOf(group)}"]`);
    if (row && group.stories.every((item) => item.seen)) {
      group.hasUnseen = false;
      $('.avatar-ring', row)?.classList.add('avatar-ring-seen');
      const meta = $('[data-story-row-meta]', row); if (meta) { meta.className = 'block text-[0.8125rem] text-muted'; meta.textContent = timeAgo(group.stories[group.stories.length - 1]!.createdAt); }
    }
  };

  const render = () => {
    const { group, story } = current();
    elapsed = 0;
    // Progress bars
    progress.replaceChildren(...group.stories.map((_, i) => { const bar = document.createElement('div'); bar.className = 'story-progress'; const fill = document.createElement('span'); fill.style.width = i < storyIndex ? '100%' : '0%'; bar.appendChild(fill); return bar; }));
    // Author
    const avatar = avatarEl({ displayName: group.author.displayName, avatarUrl: group.author.avatarUrl }, 'size-10 text-sm ring-2 ring-brand-600');
    avatar.dataset.storyAvatar = '';
    $('[data-story-avatar]', viewer)!.replaceWith(avatar);
    $('[data-story-author]', viewer)!.textContent = group.author.displayName;
    $('[data-story-time]', viewer)!.textContent = timeAgo(story.createdAt);
    $<HTMLAnchorElement>('[data-story-author-link]', viewer)!.href = `/profile/${group.author.username}`;
    $<HTMLAnchorElement>('[data-story-profile-link]', viewer)!.href = `/profile/${group.author.username}`;
    // Content
    [...body.classList].filter((name) => name.startsWith('bg-story-')).forEach((name) => body.classList.remove(name));
    const isVideo = !!story.mediaUrl && story.mediaType === 'video';
    if (story.mediaUrl && !isVideo) { image.src = story.mediaUrl; image.alt = story.text ? story.text : `Story from ${group.author.displayName}`; image.classList.remove('hidden'); }
    else { image.classList.add('hidden'); image.removeAttribute('src'); }
    video.classList.toggle('hidden', !isVideo); muteButton.classList.toggle('hidden', !isVideo); muteButton.classList.toggle('grid', isVideo);
    if (isVideo) { video.src = story.mediaUrl!; video.muted = muted; video.setAttribute('aria-label', story.text || `Story video from ${group.author.displayName}`); autoplayBlocked = false; void playVideo(); }
    else if (video.getAttribute('src')) { video.pause(); video.removeAttribute('src'); video.load(); }
    if (!story.mediaUrl) body.classList.add(`bg-story-${story.background}`);
    if (story.style) {
      // Styled text sits where the author placed it, over the background, photo or video.
      const attrs = storyTextAttrs(story.style, true);
      textEl.className = attrs.className; textEl.style.cssText = attrs.style;
      const span = document.createElement('span'); span.textContent = story.text; textEl.replaceChildren(span);
      textEl.classList.toggle('hidden', !story.text); caption.classList.add('hidden');
      textEl.getAnimations().forEach((animation) => { animation.cancel(); animation.play(); });
    } else {
      // Stories from before text styling: centred text on a background, or a caption under the photo.
      textEl.className = legacyTextClass; textEl.style.cssText = ''; textEl.textContent = story.text;
      textEl.classList.toggle('hidden', !!story.mediaUrl);
      caption.textContent = story.text; caption.classList.toggle('hidden', !story.mediaUrl || !story.text);
    }
    // Own vs others
    reply.classList.toggle('hidden', group.isSelf); reply.classList.toggle('flex', !group.isSelf);
    reactions.classList.toggle('invisible', group.isSelf);
    viewersButton.classList.toggle('hidden', !group.isSelf); viewersButton.classList.toggle('flex', group.isSelf);
    deleteButton.classList.toggle('hidden', !group.isSelf);
    if (group.isSelf) $('[data-story-viewers-label]', viewer)!.textContent = `${story.viewCount ?? 0} ${story.viewCount === 1 ? 'viewer' : 'viewers'}`;
    $$('[data-story-react]', reactions).forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.storyReact === story.myReaction)));
    $<HTMLInputElement>('input', reply)!.placeholder = `Reply to ${group.author.displayName.split(' ')[0]}…`;
    // Neighbours + list
    paintSide('prev', tray[groupIndex - 1]); paintSide('next', tray[groupIndex + 1]);
    $$('[data-story-row]').forEach((row) => row.classList.toggle('story-row-active', Number(row.dataset.storyRow) === groupIndex));
    $(`[data-story-row="${groupIndex}"]`)?.scrollIntoView({ block: 'nearest' });
    history.replaceState(null, '', `/stories/${group.author.username}`);
    void markSeen(group, story);
  };

  const go = (direction: 1 | -1) => {
    const { group } = current();
    if (direction === 1) {
      if (storyIndex < group.stories.length - 1) storyIndex++;
      else if (groupIndex < tray.length - 1) { groupIndex++; const next = tray[groupIndex]!; storyIndex = Math.max(next.stories.findIndex((item) => !item.seen), 0); }
      else { window.location.assign('/'); return; }
    } else if (storyIndex > 0) storyIndex--;
    else if (groupIndex > 0) { groupIndex--; storyIndex = 0; }
    else { elapsed = 0; return; }
    render();
  };

  const setMuted = (value: boolean) => {
    muted = value; video.muted = value;
    muteButton.setAttribute('aria-label', value ? 'Unmute' : 'Mute');
    $('use', muteButton)?.setAttribute('href', value ? '#i-volume-off' : '#i-volume');
  };
  // Browsers may refuse autoplay with sound; fall back to muted playback, as Facebook does.
  const playVideo = async () => {
    playPending = true;
    try { await video.play(); }
    catch (caught) {
      if ((caught as DOMException).name !== 'NotAllowedError') return;
      if (!video.muted) { setMuted(true); try { await video.play(); return; } catch { /* still blocked */ } }
      autoplayBlocked = true;
    } finally { playPending = false; }
  };

  const setPaused = (value: boolean) => {
    paused = value; autoplayBlocked = false;
    pauseButton.setAttribute('aria-label', paused ? 'Play' : 'Pause');
    $('use', pauseButton)?.setAttribute('href', paused ? '#i-play' : '#i-pause');
  };

  const tick = (now: number) => {
    const delta = now - last; last = now;
    const blocked = paused || holdPause || document.hidden || !!document.querySelector('dialog[open]') || reply.contains(document.activeElement) || !!$('details[data-menu][open]', card);
    const fill = progress.children[storyIndex]?.firstElementChild as HTMLElement | undefined;
    if (video.getAttribute('src')) {
      // Videos drive their own progress bar and advance when they end (or reach the story length limit).
      if (blocked) { if (!video.paused) video.pause(); }
      else if (video.paused && !video.ended && !playPending && !autoplayBlocked) void playVideo();
      const total = Math.min(Number.isFinite(video.duration) ? video.duration : 0, STORY_VIDEO_MAX_SECONDS);
      if (fill && total) fill.style.width = `${Math.min(video.currentTime / total, 1) * 100}%`;
      if (video.ended || (total && video.currentTime >= total)) go(1);
    } else if (!blocked) {
      elapsed += delta;
      if (fill) fill.style.width = `${Math.min(elapsed / DURATION, 1) * 100}%`;
      if (elapsed >= DURATION) go(1);
    }
    requestAnimationFrame(tick);
  };

  $$('[data-story-nav]', viewer).forEach((button) => button.addEventListener('click', () => go(button.dataset.storyNav === 'next' ? 1 : -1)));
  $$('[data-story-side]', viewer).forEach((button) => button.addEventListener('click', () => {
    const target = groupIndex + (button.dataset.storySide === 'next' ? 1 : -1);
    if (tray[target]) { groupIndex = target; storyIndex = tray[target]!.startIndex; render(); }
  }));
  $$('[data-story-jump]').forEach((button) => button.addEventListener('click', () => { groupIndex = Number(button.dataset.storyJump); storyIndex = tray[groupIndex]!.startIndex; setPaused(false); render(); }));
  pauseButton.addEventListener('click', () => setPaused(!paused));
  muteButton.addEventListener('click', () => setMuted(!muted));
  // A video that cannot be decoded should not freeze the viewer.
  video.addEventListener('error', () => { if (video.getAttribute('src')) go(1); });
  card.addEventListener('pointerdown', (event) => { if ((event.target as HTMLElement).closest('[data-story-nav]')) { holdPause = true; } });
  window.addEventListener('pointerup', () => { holdPause = false; });
  document.addEventListener('keydown', (event) => {
    if ((event.target as HTMLElement).closest('input, textarea, dialog')) return;
    if (event.key === 'ArrowRight') go(1);
    else if (event.key === 'ArrowLeft') go(-1);
    else if (event.key === ' ') { event.preventDefault(); setPaused(!paused); }
    else if (event.key.toLowerCase() === 'm' && video.getAttribute('src')) setMuted(!muted);
    else if (event.key === 'Escape' && !$('details[data-menu][open]')) window.location.assign('/');
  });

  $$('[data-story-react]', reactions).forEach((button) => button.addEventListener('click', async () => {
    const { story } = current();
    try {
      const result = await postJson(`/api/stories/${story.id}/reactions`, { type: button.dataset.storyReact });
      story.myReaction = result.active; story.seen = true;
      $$('[data-story-react]', reactions).forEach((item) => item.setAttribute('aria-pressed', String(item.dataset.storyReact === result.active)));
      if (result.active) { button.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35) translateY(-6px)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' }); showToast(`Sent ${button.getAttribute('aria-label')?.toLowerCase()} to ${current().group.author.displayName.split(' ')[0]}.`); }
    } catch (caught) { showToast(caught instanceof Error ? caught.message : 'Could not react.', 'error'); }
  }));

  reply.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = $<HTMLInputElement>('input', reply)!; const content = input.value.trim(); if (!content) return;
    try { await postJson(`/api/stories/${current().story.id}/replies`, { content }); input.value = ''; input.blur(); showToast('Reply sent. You can continue the chat in Messages.'); }
    catch (caught) { showToast(caught instanceof Error ? caught.message : 'Could not send reply.', 'error'); }
  });

  viewersButton.addEventListener('click', async () => {
    const list = $('[data-story-viewers-list]'); const dialog = openDialog('story-viewers-dialog'); if (!list || !dialog) return;
    list.replaceChildren(Object.assign(document.createElement('li'), { className: 'p-4 text-center text-muted', textContent: 'Loading…' }));
    try {
      const result = await request(`/api/stories/${current().story.id}/viewers`);
      if (!result.viewers.length) { list.replaceChildren(Object.assign(document.createElement('li'), { className: 'p-6 text-center text-muted', textContent: 'No viewers yet. Check back later.' })); return; }
      list.replaceChildren(...result.viewers.map((viewerItem: any) => {
        const row = document.createElement('li');
        const link = document.createElement('a'); link.className = 'flex items-center gap-3 rounded-lg p-2 hover:bg-hover'; link.href = `/profile/${viewerItem.user.username}`;
        const name = document.createElement('span'); name.className = 'flex-1 font-semibold'; name.textContent = viewerItem.user.displayName;
        link.append(avatarEl({ displayName: viewerItem.user.displayName, avatarUrl: viewerItem.user.profile?.avatarUrl }, 'size-10 text-sm'), name);
        if (viewerItem.reaction) link.appendChild(svgUse(`r-${viewerItem.reaction}`, 'size-6'));
        row.appendChild(link); return row;
      }));
    } catch (caught) { list.replaceChildren(Object.assign(document.createElement('li'), { className: 'p-4 text-center text-ios-red', textContent: caught instanceof Error ? caught.message : 'Could not load viewers.' })); }
  });

  deleteButton.addEventListener('click', async () => {
    $<HTMLDetailsElement>('details[data-menu]', card)?.removeAttribute('open');
    if (!(await confirmAction('Delete story?', 'This story will be removed for everyone.', 'Delete'))) return;
    const { group, story } = current();
    try {
      await request(`/api/stories/${story.id}`, { method: 'DELETE' });
      group.stories.splice(storyIndex, 1); showToast('Story deleted.');
      if (!group.stories.length) { window.location.assign('/stories'); return; }
      storyIndex = Math.min(storyIndex, group.stories.length - 1); render();
    } catch (caught) { showToast(caught instanceof Error ? caught.message : 'Could not delete story.', 'error'); }
  });

  render();
  requestAnimationFrame((now) => { last = now; tick(now); });
}

/* ---------- Offline support: service worker and connection status ---------- */

// Must match UPLOADS_CACHE in sw.ts.
const UPLOADS_CACHE = 'oremus-uploads';

/** Cached photos can come from private posts, so they are dropped when the user logs out. */
async function clearUserCaches() {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'clear-user-cache' });
    if (typeof caches !== 'undefined') await caches.delete(UPLOADS_CACHE);
  } catch { /* storage unavailable */ }
}

if ('serviceWorker' in navigator && window.isSecureContext) {
  // Same content hash as this bundle, so every deploy installs a fresh worker and drops old caches.
  const register = () => navigator.serviceWorker.register(`/sw.js${new URL(import.meta.url).search}`).catch(() => undefined);
  if (document.readyState === 'complete') void register(); else window.addEventListener('load', () => void register(), { once: true });
}

function paintConnection(announce: boolean) {
  document.documentElement.toggleAttribute('data-offline', !navigator.onLine);
  if (announce) showToast(navigator.onLine ? 'Back online.' : "You're offline. Some features won't work until you reconnect.", navigator.onLine ? 'success' : 'error');
}
window.addEventListener('online', () => paintConnection(true));
window.addEventListener('offline', () => paintConnection(true));
if (!navigator.onLine) paintConnection(true);
