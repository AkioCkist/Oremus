declare const io: undefined | (() => { on: (event: string, callback: (payload: any) => void) => void; emit: (event: string, payload: unknown) => void });

const csrf = (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement | null)?.content || '';

function showToast(message: string, tone: 'success' | 'error' = 'success') {
  const region = document.querySelector('#toast-region');
  if (!region) return;
  const toast = document.createElement('div');
  toast.className = `rounded-lg px-4 py-3 text-sm font-medium shadow-md ${tone === 'success' ? 'bg-ink text-white' : 'bg-red-700 text-white'}`;
  toast.textContent = message; region.appendChild(toast); window.setTimeout(() => toast.remove(), 4000);
}

async function request(url: string, options: RequestInit = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { 'x-csrf-token': csrf, ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({ ok: false, error: { message: 'Unexpected server response.' } }));
  if (!response.ok || !payload.ok) throw new Error(payload.error?.message || 'Request failed.');
  return payload.data;
}

document.querySelectorAll<HTMLFormElement>('[data-api-form]').forEach((form) => {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const error = form.querySelector<HTMLElement>('[data-form-error]');
    const success = form.querySelector<HTMLElement>('[data-form-success]');
    submit?.setAttribute('disabled', 'true'); form.setAttribute('aria-busy', 'true'); error?.classList.add('hidden'); success?.classList.add('hidden');
    try {
      const formData = new FormData(form); formData.delete('_csrf');
      const isMultipart = form.enctype === 'multipart/form-data';
      const body: BodyInit = isMultipart ? formData : JSON.stringify(Object.fromEntries(formData));
      const data = await request(form.action, { method: form.dataset.method || form.method.toUpperCase(), body, headers: isMultipart ? {} : { 'content-type': 'application/json' } });
      if (data.redirect) window.location.assign(data.redirect);
      else if (form.dataset.reload !== undefined) window.location.reload();
      else {
        if (form.dataset.reset !== undefined) form.reset();
        const message = data.message || 'Saved successfully.';
        if (success) { success.textContent = data.developmentToken ? `${message} Development token: ${data.developmentToken}` : message; success.classList.remove('hidden'); }
        else showToast(message);
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Something went wrong.';
      if (error) { error.textContent = message; error.classList.remove('hidden'); } else showToast(message, 'error');
    } finally { submit?.removeAttribute('disabled'); form.removeAttribute('aria-busy'); }
  });
});

async function confirmDelete(): Promise<boolean> {
  const dialog = document.querySelector<HTMLDialogElement>('#confirm-dialog');
  if (!dialog) return false;
  return new Promise((resolve) => {
    const buttons = dialog.querySelectorAll<HTMLButtonElement>('button[value]');
    const finish = (value: boolean) => { dialog.close(); buttons.forEach((button) => button.removeEventListener('click', handlers.get(button)!)); resolve(value); };
    const handlers = new Map<HTMLButtonElement, () => void>();
    buttons.forEach((button) => { const handler = () => finish(button.value === 'confirm'); handlers.set(button, handler); button.addEventListener('click', handler); });
    dialog.addEventListener('cancel', () => finish(false), { once: true }); dialog.showModal();
  });
}

document.addEventListener('click', async (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('button, [data-toggle]'); if (!target) return;
  try {
    if (target.dataset.toggle) { document.querySelector(`#${target.dataset.toggle}`)?.classList.toggle('hidden'); return; }
    if (target.dataset.closeDialog) { document.querySelector<HTMLDialogElement>(`#${target.dataset.closeDialog}`)?.close(); return; }
    if (target.dataset.editPost) {
      const card = target.closest('[data-post-id]');
      const dialog = document.querySelector<HTMLDialogElement>('#edit-post-dialog');
      const form = document.querySelector<HTMLFormElement>('#edit-post-form');
      const input = document.querySelector<HTMLTextAreaElement>('#edit-post-content');
      if (dialog && form && input) { form.action = `/api/posts/${target.dataset.editPost}`; input.value = card?.querySelector<HTMLElement>('p.whitespace-pre-wrap')?.textContent?.trim() || ''; dialog.showModal(); input.focus(); }
      return;
    }
    if (target.dataset.follow) { const data = await request(`/api/users/${target.dataset.follow}/follow`, { method: 'POST' }); target.textContent = data.following ? 'Following' : 'Follow'; showToast(data.following ? 'Following.' : 'Unfollowed.'); }
    if (target.dataset.messageUser) { const data = await request('/api/conversations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ memberId: target.dataset.messageUser }) }); window.location.assign(data.redirect); }
    if (target.dataset.react && target.dataset.post) { const data = await request(`/api/posts/${target.dataset.post}/reactions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: target.dataset.react }) }); const card = target.closest('[data-post-id]'); const label = card?.querySelector('[data-reaction-count]'); if (label) label.textContent = `${data.count} reactions`; showToast(data.active ? `Reacted ${data.active}.` : 'Reaction removed.'); }
    if (target.dataset.copy) { await navigator.clipboard.writeText(`${window.location.origin}/posts/${target.dataset.copy}`); showToast('Post link copied.'); }
    if (target.dataset.deletePost) { if (!(await confirmDelete())) return; await request(`/api/posts/${target.dataset.deletePost}`, { method: 'DELETE' }); target.closest('[data-post-id]')?.remove(); showToast('Post deleted.'); }
    if (target.dataset.groupJoin) { await request(`/api/groups/${target.dataset.groupJoin}/join`, { method: 'POST' }); target.textContent = 'Request pending'; target.setAttribute('disabled', 'true'); }
    if (target.dataset.groupDecision && target.dataset.request) { await request(`/api/group-requests/${target.dataset.request}/decision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: target.dataset.groupDecision }) }); target.closest('li')?.remove(); showToast(`Request ${target.dataset.groupDecision}d.`); }
    if (target.dataset.readNotifications !== undefined) { await request('/api/notifications/read', { method: 'POST' }); document.querySelectorAll('.bg-accent-50').forEach((node) => node.classList.remove('bg-accent-50')); showToast('Notifications marked as read.'); }
    if (target.dataset.logout !== undefined) { const data = await request('/auth/logout', { method: 'POST' }); window.location.assign(data.redirect); }
  } catch (caught) { showToast(caught instanceof Error ? caught.message : 'Action failed.', 'error'); }
});

const messageForm = document.querySelector<HTMLFormElement>('[data-message-form]');
messageForm?.addEventListener('submit', async (event) => {
  event.preventDefault(); const input = messageForm.querySelector<HTMLInputElement>('[name="content"]'); if (!input?.value.trim()) return;
  const content = input.value; input.value = '';
  try { await request(messageForm.action, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content }) }); }
  catch (caught) { input.value = content; showToast(caught instanceof Error ? caught.message : 'Message failed.', 'error'); }
});

if (typeof io === 'function') {
  const socket = io();
  socket.on('notification:new', () => showToast('You have a new notification.'));
  socket.on('message:new', (message: any) => {
    const list = document.querySelector('#message-list'); if (!list) return;
    const wrapper = document.createElement('div'); wrapper.className = 'flex justify-start';
    const bubble = document.createElement('div'); bubble.className = 'max-w-[80%] rounded-xl bg-stone-100 px-4 py-2';
    const text = document.createElement('p'); text.className = 'whitespace-pre-wrap text-pretty'; text.textContent = message.content;
    bubble.appendChild(text); wrapper.appendChild(bubble); list.appendChild(wrapper); list.scrollTop = list.scrollHeight;
  });
}
