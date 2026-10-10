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
    icons.prepend(svgUse(`r-${active}`, 'size-[1.125rem] rounded-full ring-2 ring-white'));
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
$<HTMLInputElement>('[data-composer-files]')?.addEventListener('change', async (event) => {
  const input = event.target as HTMLInputElement;
  const previews = $('[data-composer-previews]')!;
  previews.replaceChildren();
  const files = [...(input.files || [])].slice(0, 4);
  if (input.files && input.files.length > 4) showToast('You can add up to 4 photos per post.', 'error');
  for (const file of files) {
    const img = document.createElement('img'); img.className = 'aspect-square w-full rounded-md object-cover'; img.alt = file.name;
    img.src = await readAsDataUrl(file); previews.appendChild(img);
  }
  previews.classList.toggle('hidden', files.length === 0);
  if (files.length === 1) previews.classList.replace('grid-cols-2', 'grid-cols-1'); else previews.classList.replace('grid-cols-1', 'grid-cols-2');
});

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

/* ---------- Global click delegation ---------- */

document.addEventListener('click', async (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('button, a, [data-toggle], [data-close-dialog]');
  if (!target) return;
  const data = target.dataset;
  try {
    if (data.closeDialog) { if (target.matches('[data-close-dialog]') && (event.target === target || target.tagName === 'BUTTON' || target.closest('button'))) document.querySelector<HTMLDialogElement>(`#${data.closeDialog}`)?.close(); return; }
    if (data.toggle) { const node = document.getElementById(data.toggle); node?.classList.toggle('hidden'); $<HTMLInputElement>('input:not([type=hidden]), textarea', node || document)?.focus(); return; }
    if (data.openDialog) { openDialog(data.openDialog); return; }
    if (data.openComposer !== undefined) { openComposer(target); return; }
    if (data.openStoryComposer !== undefined) { storyDialog?.showModal(); $<HTMLTextAreaElement>('[data-story-text]', storyDialog!)?.focus(); return; }
    if (data.lightbox) { const box = openDialog('lightbox'); const img = box && $<HTMLImageElement>('[data-lightbox-image]', box); if (img) img.src = data.lightbox; return; }
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
      const card = target.closest('[data-post-id]');
      const form = $<HTMLFormElement>('#edit-post-form'); const input = $<HTMLTextAreaElement>('#edit-post-content');
      target.closest<HTMLDetailsElement>('details')?.removeAttribute('open');
      if (form && input) { form.action = `/api/posts/${data.editPost}`; input.value = $('[data-post-content]', card || document)?.textContent?.trim() || ''; openDialog('edit-post-dialog'); input.focus(); }
      return;
    }
    if (data.follow) {
      const result = await request(`/api/users/${data.follow}/follow`, { method: 'POST' });
      const label = result.following ? 'Following' : 'Follow';
      if (data.followStyle !== undefined) {
        target.classList.toggle('btn-primary', !result.following); target.classList.toggle('btn-secondary', result.following);
        target.replaceChildren(svgUse(result.following ? 'i-check' : 'i-user-plus', 'icon'), Object.assign(document.createElement('span'), { textContent: label }));
      } else target.replaceChildren(svgUse(result.following ? 'i-check' : 'i-user-plus', 'icon size-4'), document.createTextNode(label));
      showToast(result.following ? 'You are now following them.' : 'Unfollowed.'); return;
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
    if (data.groupJoin) { await request(`/api/groups/${data.groupJoin}/join`, { method: 'POST' }); target.textContent = 'Request sent'; target.setAttribute('disabled', 'true'); showToast('Request sent to the group admins.'); return; }
    if (data.groupDecision && data.request) { await postJson(`/api/group-requests/${data.request}/decision`, { decision: data.groupDecision }); target.closest('li')?.remove(); showToast(data.groupDecision === 'approve' ? 'Member approved.' : 'Request declined.'); return; }
    if (data.readNotifications !== undefined) {
      await request('/api/notifications/read', { method: 'POST' });
      $$('[data-unread-dot], [data-notification-badge]').forEach((node) => node.remove());
      $$('[data-unread-time]').forEach((node) => { node.classList.remove('font-semibold', 'text-brand-600'); node.classList.add('text-muted'); });
      showToast('All notifications marked as read.'); return;
    }
    if (data.logout !== undefined) { const result = await request('/auth/logout', { method: 'POST' }); window.location.assign(result.redirect); }
  } catch (caught) { showToast(caught instanceof Error ? caught.message : 'Action failed.', 'error'); }
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
