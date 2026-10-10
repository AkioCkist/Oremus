import { ACTIVITIES, FEELINGS, describeFeeling } from '../shared/feelings.js';
import { EMOJI_CATEGORIES } from './emoji-data.js';

declare const io: undefined | (() => { on: (event: string, callback: (payload: any) => void) => void; emit: (event: string, payload: unknown) => void });

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
  toast.className = `pointer-events-auto flex max-w-sm animate-pop-in items-center gap-3 rounded-lg px-4 py-3 text-15 font-medium text-white shadow-pop ${tone === 'success' ? 'bg-[#242526]' : 'bg-red-600'}`;
  toast.textContent = message; region.appendChild(toast); window.setTimeout(() => toast.remove(), 4000);
}

async function request(url: string, options: RequestInit = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { 'x-csrf-token': csrf, ...(options.headers || {}) } });
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
    track?.classList.toggle('bg-brand-600', dark); track?.classList.toggle('bg-strong', !dark); track?.classList.toggle('after:translate-x-5', dark);
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
      const body: BodyInit = isMultipart ? formData : JSON.stringify(Object.fromEntries(formData));
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

function friendButton(action: string, label: string, icon: string, primary: boolean, compact: boolean, full: boolean) {
  const button = document.createElement('button');
  button.type = 'button'; button.dataset.friendAction = action;
  button.className = `${primary ? 'btn-primary' : 'btn-secondary'} ${compact ? 'btn-sm' : ''} ${full ? 'w-full' : ''}`.trim();
  button.append(svgUse(icon, 'icon size-4'), document.createTextNode(label));
  return button;
}

function paintFriendControls(container: HTMLElement, state: FriendState) {
  const compact = container.dataset.compact === 'true', full = container.dataset.full === 'true';
  container.replaceChildren();
  if (state === 'incoming') {
    container.append(friendButton('accept', 'Confirm', 'i-check', true, compact, full), friendButton('decline', 'Delete request', 'i-x', false, compact, full));
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
    container.append(friendButton('request', 'Add friend', 'i-user-plus', true, compact, full));
  }
  const error = document.createElement('p');
  error.className = 'hidden basis-full text-sm text-red-600'; error.dataset.friendError = ''; error.setAttribute('role', 'alert');
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
  like: { label: 'Like', color: 'text-[#0866ff]' }, love: { label: 'Love', color: 'text-[#f33e58]' }, haha: { label: 'Haha', color: 'text-[#e9a811]' },
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
  const pin = svgUse('i-pin', 'absolute left-1/2 top-1/2 size-9 -translate-x-1/2 -translate-y-full fill-[#f5533d] stroke-white drop-shadow');
  pin.setAttribute('stroke-width', '1.5');
  const credit = Object.assign(document.createElement('span'), { className: 'absolute bottom-1 right-1 rounded bg-surface/80 px-1 text-2xs text-muted', textContent: '© OpenStreetMap' });
  container.replaceChildren(tiles, pin, credit);
}
$$('[data-map][data-lat]').forEach((map) => renderMap(map, Number(map.dataset.lat), Number(map.dataset.lon)));

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

if (composer) {
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
      const clear = Object.assign(document.createElement('button'), { type: 'button', className: 'col-span-2 mt-1 rounded-lg p-2 text-15 font-semibold text-red-600 hover:bg-red-500/10', textContent: 'Remove feeling/activity' });
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
      const icon = document.createElement('span'); icon.className = 'icon-btn shrink-0 text-[#f5533d]'; icon.appendChild(svgUse('i-pin', 'icon'));
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
}

/* ---------- Story composer ---------- */

const storyDialog = $<HTMLDialogElement>('#story-dialog');
if (storyDialog) {
  const preview = $('[data-story-preview]', storyDialog)!;
  const previewText = $('[data-story-preview-text]', storyDialog)!;
  const previewImage = $<HTMLImageElement>('[data-story-preview-image]', storyDialog)!;
  const textInput = $<HTMLTextAreaElement>('[data-story-text]', storyDialog)!;
  const bgInput = $<HTMLInputElement>('[data-story-background]', storyDialog)!;
  const fileInput = $<HTMLInputElement>('[data-story-file]', storyDialog)!;
  const setBackground = (bg: string) => {
    [...preview.classList].filter((name) => name.startsWith('bg-story-')).forEach((name) => preview.classList.remove(name));
    preview.classList.add(`bg-story-${bg}`); bgInput.value = bg;
    $$('[data-story-bg]', storyDialog).forEach((button) => button.setAttribute('aria-checked', String(button.dataset.storyBg === bg)));
  };
  const syncText = () => {
    const hasImage = !previewImage.classList.contains('hidden');
    previewText.textContent = textInput.value || (hasImage ? '' : 'Start typing');
    previewText.className = hasImage
      ? 'absolute inset-x-3 bottom-6 z-10 whitespace-pre-wrap break-words text-center text-15 font-semibold text-white text-shadow'
      : 'relative z-10 whitespace-pre-wrap break-words px-5 text-center font-display text-xl font-bold text-white text-shadow';
  };
  textInput.addEventListener('input', syncText);
  $$('[data-story-bg]', storyDialog).forEach((button) => button.addEventListener('click', () => setBackground(button.dataset.storyBg!)));
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (file) { previewImage.src = await readAsDataUrl(file); previewImage.classList.remove('hidden'); }
    else { previewImage.removeAttribute('src'); previewImage.classList.add('hidden'); }
    syncText();
  });
  $('[data-story-reset]', storyDialog)?.addEventListener('click', () => {
    ($('form', storyDialog) as HTMLFormElement).reset(); previewImage.classList.add('hidden'); setBackground('ocean'); syncText(); storyDialog.close();
  });
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

/** Draws exactly what is inside the frame onto a canvas at the output size and returns it as a JPEG. */
function croppedBlob(): Promise<Blob> {
  const { image } = cropElements();
  const output = CROP_OUTPUT[pickerKind];
  const ratio = output.width / crop.frameW;
  const { width, height } = cropSize();
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
    sections.replaceChildren(Object.assign(document.createElement('p'), { className: 'py-8 text-center text-red-600', textContent: caught instanceof Error ? caught.message : 'Could not load photos.' }));
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
    button.className = `menu-item ${item.danger ? 'text-red-600' : ''}`;
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
function openEditPost(postId: string, card: Element | null) {
  if (!editPostForm) return;
  editPostForm.dataset.postId = postId;
  $<HTMLTextAreaElement>('#edit-post-content', editPostForm)!.value = $('[data-post-content]', card || document)?.textContent?.trim() || '';
  try { editSlots = JSON.parse((card as HTMLElement | null)?.dataset.postMedia || '[]').map((media: { id: string; url: string; mimeType?: string }) => ({ id: media.id, src: media.url, video: String(media.mimeType).startsWith('video/') })); } catch { editSlots = []; }
  $('[data-form-error]', editPostForm)!.classList.add('hidden');
  paintEditSlots(); openDialog('edit-post-dialog'); $<HTMLTextAreaElement>('#edit-post-content', editPostForm)!.focus();
}
editPostForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = $<HTMLButtonElement>('button[type="submit"]', editPostForm)!;
  const error = $('[data-form-error]', editPostForm)!;
  const body = new FormData();
  body.append('content', $<HTMLTextAreaElement>('#edit-post-content', editPostForm)!.value);
  let upload = 0;
  const layout = editSlots.map((slot) => {
    if (slot.id) return { id: slot.id };
    body.append('images', slot.file!); return { upload: upload++ };
  });
  body.append('layout', JSON.stringify(layout));
  submit.disabled = true; error.classList.add('hidden');
  try { await request(`/api/posts/${editPostForm.dataset.postId}`, { method: 'PATCH', body }); window.location.reload(); }
  catch (caught) { error.textContent = caught instanceof Error ? caught.message : 'Could not save the post.'; error.classList.remove('hidden'); }
  finally { submit.disabled = false; }
});

/* Story composer: replace / remove the photo */
if (storyDialog) {
  const storyFile = $<HTMLInputElement>('[data-story-file]', storyDialog)!;
  const storyActions = $('[data-story-photo-actions]', storyDialog)!;
  storyFile.addEventListener('change', () => { const has = !!storyFile.files?.length; storyActions.classList.toggle('hidden', !has); storyActions.classList.toggle('flex', has); });
  $$('[data-story-photo]', storyDialog).forEach((button) => button.addEventListener('click', async () => {
    if (button.dataset.storyPhoto === 'replace') { const [file] = await pickImageFiles(); if (!file) return; setInputFiles(storyFile, [file]); }
    else setInputFiles(storyFile, []);
    storyFile.dispatchEvent(new Event('change'));
  }));
}

/* "…" menus on photos (post images, profile picture, cover) */
async function photoMenuFor(trigger: HTMLElement): Promise<PhotoMenuItem[]> {
  const { photoMenu: kind, url = '', post, media } = trigger.dataset;
  const noun = kind === 'post' && isVideoUrl(url) ? 'video' : 'photo';
  const view: PhotoMenuItem = { label: kind === 'avatar' ? 'View profile picture' : kind === 'cover' ? 'View cover photo' : `View ${noun}`, icon: 'i-eye', run: () => openPhotoViewer(url, post) };
  if (kind === 'post') {
    return [view,
      { label: `Replace ${noun}`, icon: 'i-edit', run: async () => {
        const [file] = await pickMediaFiles(); if (!file) return;
        const body = new FormData(); body.append('photo', file);
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
  let replyTo: { id: string; name: string } | null = null;
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
    const link = Object.assign(document.createElement('a'), { href: `/profile/${author.username}`, className: 'shrink-0' });
    link.appendChild(avatarEl({ displayName: author.displayName, avatarUrl: author.profile?.avatarUrl || author.avatarUrl }, isReply ? 'size-7 text-2xs' : 'size-8 text-xs'));
    const body = document.createElement('div'); body.className = 'min-w-0';
    const bubble = document.createElement('div'); bubble.className = 'comment-bubble';
    bubble.append(Object.assign(document.createElement('a'), { href: `/profile/${author.username}`, className: 'block text-[0.8125rem] font-semibold hover:underline', textContent: author.displayName }),
      Object.assign(document.createElement('p'), { className: 'whitespace-pre-wrap break-words text-15 leading-snug', textContent: comment.content }));
    const meta = document.createElement('div'); meta.className = 'mt-0.5 flex gap-3 px-3 text-xs font-semibold text-muted';
    meta.append(Object.assign(document.createElement('span'), { className: 'font-normal', textContent: timeAgo(comment.createdAt) }));
    const reply = Object.assign(document.createElement('button'), { type: 'button', className: 'hover:underline', textContent: 'Reply' });
    reply.addEventListener('click', () => {
      replyTo = { id: String(comment.parentId || comment._id), name: author.displayName };
      const banner = $('[data-viewer-replying]', photoViewer)!; banner.classList.remove('hidden'); banner.classList.add('flex');
      $('span', banner)!.textContent = `Replying to ${author.displayName}`; commentInput.focus();
    });
    meta.appendChild(reply);
    body.append(bubble, meta); item.append(link, body); return item;
  };
  const paintComments = () => {
    const roots = comments.filter((comment) => !comment.parentId);
    const nodes: HTMLElement[] = [];
    roots.forEach((root) => {
      nodes.push(commentNode(root, false));
      comments.filter((comment) => String(comment.parentId) === String(root._id)).forEach((child) => nodes.push(commentNode(child, true)));
    });
    commentsList.replaceChildren(...(nodes.length ? nodes : [Object.assign(document.createElement('li'), { className: 'py-6 text-center text-15 text-muted', textContent: 'No comments yet. Be the first to comment.' })]));
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
    const button = Object.assign(document.createElement('button'), { type: 'button', className: 'reaction-choice', title: style.label });
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
  $('[data-viewer-share]', photoViewer)!.addEventListener('click', async () => { if (!post) return; await navigator.clipboard.writeText(`${window.location.origin}/posts/${post._id}`); showToast('Link copied to clipboard.'); });
  $('[data-viewer-focus-comment]', photoViewer)!.addEventListener('click', () => { panel.classList.remove('max-lg:hidden'); commentInput.focus(); });

  commentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const content = commentInput.value.trim(); if (!content || !post) return;
    commentInput.disabled = true;
    try {
      const result = await postJson(`/api/posts/${post._id}/comments`, { content, ...(replyTo ? { parentId: replyTo.id } : {}) });
      comments.push({ ...result.comment, authorId: { username: me.username, displayName: me.name, profile: { avatarUrl: me.avatar } } });
      post.commentCount = (post.commentCount || 0) + 1;
      commentInput.value = ''; clearReply(); paintComments(); paintReactions();
      const scroller = $('[data-viewer-scroll]', photoViewer)!; scroller.scrollTop = scroller.scrollHeight;
      const card = document.querySelector(`[data-post-id="${post._id}"]`);
      const counter = card && $('[data-comment-count]', card);
      if (counter) { counter.textContent = String(post.commentCount); $('[data-comment-count-label]', card!)?.classList.remove('invisible'); }
    } catch (caught) { showToast(caught instanceof Error ? caught.message : 'Could not post comment.', 'error'); }
    finally { commentInput.disabled = false; commentInput.focus(); }
  });

  openPhotoViewer = (url: string, postId?: string) => {
    const token = ++loadToken;
    photos = [url]; post = null; comments = [];
    panel.classList.add('hidden'); panel.classList.remove('flex');
    togglePanelButtons[0]?.classList.add('hidden');
    showPhoto(0);
    if (!photoViewer.open) photoViewer.showModal();
    if (!postId || !me.id) return;
    request(`/api/posts/${postId}`).then((data) => {
      if (token !== loadToken) return;
      post = data.post; comments = data.comments || [];
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
    if (data.scrollRail !== undefined) { $('[data-story-rail]')?.scrollBy({ left: 360, behavior: 'smooth' }); return; }
    if (data.toggleDetails !== undefined) {
      const panel = $('[data-chat-details]'); if (!panel) return;
      const hidden = panel.classList.toggle('xl:flex'); panel.classList.toggle('hidden', !hidden);
      $$('[data-toggle-details][aria-expanded]').forEach((button) => button.setAttribute('aria-expanded', String(hidden))); return;
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
      $$('[data-unread-dot], [data-notification-badge]').forEach((node) => node.remove());
      $$('[data-unread-time]').forEach((node) => { node.classList.remove('font-semibold', 'text-brand-600'); node.classList.add('text-muted'); });
      showToast('All notifications marked as read.'); return;
    }
    if (data.logout !== undefined) { const result = await request('/auth/logout', { method: 'POST' }); window.location.assign(result.redirect); }
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Action failed.';
    const error = target.closest('.profile-actions')?.querySelector<HTMLElement>('[data-profile-action-error]');
    if (error) { error.textContent = message; error.classList.remove('hidden'); }
    showToast(message, 'error');
  }
});

// Touch devices have no hover: a long press on Like opens the reaction bar.
$$('[data-reaction-toggle]').forEach((button) => {
  let timer = 0;
  button.addEventListener('touchstart', () => { timer = window.setTimeout(() => button.parentElement?.querySelector('.reaction-bar')?.classList.add('is-open'), 450); }, { passive: true });
  button.addEventListener('touchend', () => window.clearTimeout(timer));
});

/* ---------- Inline comments ---------- */

$$<HTMLFormElement>('[data-comment-form]').forEach((form) => {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = $<HTMLInputElement>('input[name="content"]', form)!; const content = input.value.trim(); if (!content) return;
    input.disabled = true;
    try {
      await postJson(form.action, { content });
      const card = form.closest('[data-post-id]')!;
      const item = document.createElement('li'); item.className = 'flex animate-fade-in gap-2';
      const bubble = document.createElement('div'); bubble.className = 'comment-bubble';
      const name = document.createElement('a'); name.className = 'block text-[0.8125rem] font-semibold hover:underline'; name.href = `/profile/${me.username}`; name.textContent = me.name;
      const text = document.createElement('p'); text.className = 'whitespace-pre-wrap break-words text-15 leading-snug'; text.textContent = content;
      bubble.append(name, text);
      const body = document.createElement('div'); body.className = 'min-w-0'; body.append(bubble);
      const when = document.createElement('p'); when.className = 'px-3 text-xs text-muted'; when.textContent = 'Just now'; body.append(when);
      item.append(avatarEl({ displayName: me.name, avatarUrl: me.avatar }, 'size-8 text-xs'), body);
      $('[data-comment-list]', card)?.appendChild(item);
      const counter = $('[data-comment-count]', card);
      if (counter) { const next = Number(counter.textContent || 0) + 1; counter.textContent = String(next); const label = $('[data-comment-count-label]', card); label?.classList.remove('invisible'); if (label) label.lastChild!.textContent = next === 1 ? ' comment' : ' comments'; }
      input.value = '';
    } catch (caught) { showToast(caught instanceof Error ? caught.message : 'Could not post comment.', 'error'); }
    finally { input.disabled = false; input.focus(); }
  });
});

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

const messageList = $('#message-list');
if (messageList) messageList.scrollTop = messageList.scrollHeight;

function appendMessage(message: any) {
  if (!messageList) return;
  const senderId = String(message.senderId?._id ?? message.senderId);
  const mine = senderId === me.id;
  const row = document.createElement('div'); row.className = `mb-2 flex animate-fade-in items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`;
  if (!mine) { const spacer = document.createElement('span'); spacer.className = 'w-7 shrink-0'; row.appendChild(spacer); }
  const bubble = document.createElement('p'); bubble.className = `bubble ${mine ? 'bubble-me' : 'bubble-them'}`; bubble.textContent = message.content;
  row.appendChild(bubble); messageList.appendChild(row); messageList.scrollTop = messageList.scrollHeight;
}

const messageForm = $<HTMLFormElement>('[data-message-form]');
messageForm?.addEventListener('submit', async (event) => {
  event.preventDefault(); const input = $<HTMLInputElement>('[name="content"]', messageForm); if (!input?.value.trim()) return;
  const content = input.value; input.value = '';
  try { const result = await postJson(messageForm.action, { content }); appendMessage(result.message); }
  catch (caught) { input.value = content; showToast(caught instanceof Error ? caught.message : 'Message failed.', 'error'); }
});

if (typeof io === 'function' && me.id) {
  const socket = io();
  const activeConversation = $('[data-conversation]')?.dataset.conversation;
  if (activeConversation) socket.emit('conversation:join', activeConversation);
  socket.on('friendship:changed', (relation: any) => {
    syncFriendState(relation.userId, relation.state);
    syncFollowState(relation.userId, relation.following);
    if (window.location.pathname.startsWith('/messages')) window.location.assign('/messages');
  });
  socket.on('social:changed', (relation: any) => {
    if (socialActionPending) return;
    if (relation.unavailable || relation.blocked !== undefined) {
      if (window.location.pathname.startsWith('/messages')) window.location.assign('/messages');
      else window.location.reload();
    }
  });
  socket.on('notification:new', (notification: any) => {
    if (notification?.type === 'message' && String(notification.entityId) === activeConversation) return;
    showToast('You have a new notification.');
    const link = $('[data-notification-link]'); if (!link) return;
    let badge = $('[data-notification-badge]', link);
    if (!badge) { badge = document.createElement('span'); badge.className = 'badge'; badge.dataset.notificationBadge = ''; badge.textContent = '0'; link.appendChild(badge); }
    const count = Number.parseInt(badge.textContent || '0', 10) + 1; badge.textContent = count > 9 ? '9+' : String(count);
  });
  socket.on('message:new', (message: any) => {
    if (String(message.conversationId) !== activeConversation) return;
    if (String(message.senderId?._id ?? message.senderId) === me.id) return; // already rendered from the POST response
    appendMessage(message);
  });
}

/* ---------- Story viewer ---------- */

type Story = { id: string; mediaUrl: string | null; text: string; background: string; createdAt: string; seen: boolean; myReaction: string | null; viewCount?: number };
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
  const textEl = $('[data-story-text]', viewer)!;
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
    if (cover.mediaUrl) { const img = document.createElement('img'); img.src = cover.mediaUrl; img.alt = ''; img.className = 'absolute inset-0 size-full object-cover'; side.appendChild(img); }
    else { const block = document.createElement('div'); block.className = `absolute inset-0 grid place-items-center p-3 text-center font-display text-sm font-bold text-white bg-story-${cover.background}`; block.textContent = cover.text.slice(0, 80); side.appendChild(block); }
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
    if (story.mediaUrl) {
      image.src = story.mediaUrl; image.alt = story.text ? story.text : `Story from ${group.author.displayName}`; image.classList.remove('hidden');
      textEl.classList.add('hidden'); caption.textContent = story.text; caption.classList.toggle('hidden', !story.text);
    } else {
      image.classList.add('hidden'); image.removeAttribute('src'); body.classList.add(`bg-story-${story.background}`);
      textEl.textContent = story.text; textEl.classList.remove('hidden'); caption.classList.add('hidden');
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

  const setPaused = (value: boolean) => {
    paused = value;
    pauseButton.setAttribute('aria-label', paused ? 'Play' : 'Pause');
    $('use', pauseButton)?.setAttribute('href', paused ? '#i-play' : '#i-pause');
  };

  const tick = (now: number) => {
    const delta = now - last; last = now;
    const blocked = paused || holdPause || document.hidden || !!document.querySelector('dialog[open]') || reply.contains(document.activeElement) || !!$('details[data-menu][open]', card);
    if (!blocked) {
      elapsed += delta;
      const fill = progress.children[storyIndex]?.firstElementChild as HTMLElement | undefined;
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
  card.addEventListener('pointerdown', (event) => { if ((event.target as HTMLElement).closest('[data-story-nav]')) { holdPause = true; } });
  window.addEventListener('pointerup', () => { holdPause = false; });
  document.addEventListener('keydown', (event) => {
    if ((event.target as HTMLElement).closest('input, textarea, dialog')) return;
    if (event.key === 'ArrowRight') go(1);
    else if (event.key === 'ArrowLeft') go(-1);
    else if (event.key === ' ') { event.preventDefault(); setPaused(!paused); }
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
    } catch (caught) { list.replaceChildren(Object.assign(document.createElement('li'), { className: 'p-4 text-center text-red-600', textContent: caught instanceof Error ? caught.message : 'Could not load viewers.' })); }
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
