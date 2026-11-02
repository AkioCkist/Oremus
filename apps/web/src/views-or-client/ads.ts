/**
 * Sponsored cards in the feed (view counting, "why this ad", hide and block) and the /ads/manage page.
 * Cards arrive in later feed chunks too, so clicks are delegated and new cards are picked up by a MutationObserver.
 */
const csrf = (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement | null)?.content || '';

const VIEW_RATIO = 0.5;
const VIEW_MS = 1000;

const toast = (message: string) => document.dispatchEvent(new CustomEvent('oremus:toast', { detail: { message } }));

async function call(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...init, headers: { 'x-csrf-token': csrf, ...(init.headers || {}) } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.error?.message || 'Something went wrong. Try again.');
  return payload.data;
}
const postJson = (url: string, body: unknown) => call(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

/* ---------- View counting: half the card on screen for a full second, once. ---------- */

const timers = new WeakMap<Element, number>();
const seen = new WeakSet<Element>();
const observer = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  for (const entry of entries) {
    const card = entry.target as HTMLElement;
    if (entry.isIntersecting && entry.intersectionRatio >= VIEW_RATIO) {
      timers.set(card, window.setTimeout(() => {
        observer?.unobserve(card);
        postJson('/api/ads/impression', { token: card.dataset.adToken }).catch(() => undefined);
      }, VIEW_MS));
    } else {
      window.clearTimeout(timers.get(card));
    }
  }
}, { threshold: [VIEW_RATIO] }) : null;

function watchCards(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-ad]').forEach((card) => {
    if (seen.has(card)) return;
    seen.add(card);
    observer?.observe(card);
  });
}

const feed = document.querySelector('[data-infinite="feed"]');
if (feed) {
  watchCards(feed);
  new MutationObserver(() => watchCards(feed)).observe(feed, { childList: true });
}

/* ---------- Clicks ---------- */

const AD_MESSAGES: Record<string, string> = {
  hide_campaign: 'Ad hidden.',
  block_advertiser: "You won't see ads from them again.",
  block_topic: "You won't see ads about this topic."
};

async function changePreference(action: string, value: unknown) {
  await postJson('/api/ads/preferences', { action, value });
}

document.addEventListener('click', async (event) => {
  const target = event.target as Element;

  const why = target.closest('[data-ad-why-toggle]');
  if (why) {
    why.closest('details')?.removeAttribute('open');
    why.closest('[data-ad]')?.querySelector('[data-ad-why]')?.classList.toggle('hidden');
    return;
  }

  const action = target.closest<HTMLElement>('[data-ad-action]');
  if (action) {
    const { adAction, adValue } = action.dataset;
    if (!adAction) return;
    const card = action.closest<HTMLElement>('[data-ad]');
    try {
      await changePreference(adAction, adValue);
      card?.remove();
      toast(AD_MESSAGES[adAction] || 'Saved.');
    } catch (error) { toast((error as Error).message); }
    return;
  }

  // Settings: undo a block.
  const undo = target.closest<HTMLElement>('[data-ad-undo]');
  if (undo?.dataset.adUndo) {
    try {
      await changePreference(undo.dataset.adUndo, undo.dataset.adValue);
      undo.closest('li')?.remove();
      toast('Removed.');
    } catch (error) { toast((error as Error).message); }
    return;
  }

  const campaignAction = target.closest<HTMLElement>('[data-campaign-action]');
  if (campaignAction?.dataset.campaignAction) {
    const id = campaignAction.closest<HTMLElement>('[data-campaign]')?.dataset.campaign;
    try {
      await call(`/api/ads/campaigns/${id}/${campaignAction.dataset.campaignAction}`, { method: 'POST' });
      window.location.reload();
    } catch (error) { toast((error as Error).message); }
    return;
  }

  if (target.closest('[data-new-campaign]')) openCampaignDialog();
  const edit = target.closest<HTMLElement>('[data-edit-campaign]');
  if (edit?.dataset.editCampaign) openCampaignDialog(JSON.parse(edit.dataset.editCampaign));
});

document.querySelector<HTMLFormElement>('[data-ad-topic-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const topic = new FormData(event.target as HTMLFormElement).get('topic');
  try { await changePreference('block_topic', topic); window.location.reload(); }
  catch (error) { toast((error as Error).message); }
});

document.querySelector<HTMLInputElement>('[data-ad-personalized]')?.addEventListener('change', async (event) => {
  const input = event.target as HTMLInputElement;
  try { await changePreference('set_personalized', input.checked); toast('Saved.'); }
  catch (error) { input.checked = !input.checked; toast((error as Error).message); }
});

/* ---------- /ads/manage ---------- */

const dialog = document.querySelector<HTMLDialogElement>('#campaign-dialog');
const form = dialog?.querySelector<HTMLFormElement>('[data-campaign-form]') ?? null;
let editingId = '';
let savedMediaUrl = '';
let previewObjectUrl = '';

/** Mirrors the feed's sponsored card so advertisers see the image and headline as people will. */
function renderPreview() {
  const preview = dialog?.querySelector<HTMLElement>('[data-campaign-preview]');
  if (!preview || !form) return;
  const value = (name: string) => {
    const field = form.elements.namedItem(name);
    return field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement ? field.value : '';
  };
  const headline = preview.querySelector<HTMLElement>('[data-preview-headline]');
  if (headline) {
    const text = value('headline').trim();
    headline.textContent = text || 'Your headline';
    headline.classList.toggle('text-muted', !text);
  }
  const body = preview.querySelector<HTMLElement>('[data-preview-body]');
  if (body) {
    const text = value('body').trim();
    body.textContent = text;
    body.classList.toggle('hidden', !text);
  }
  const cta = preview.querySelector<HTMLElement>('[data-preview-cta]');
  if (cta) cta.textContent = value('ctaLabel');
}

function renderPreviewImage() {
  const image = dialog?.querySelector<HTMLImageElement>('[data-preview-image]');
  if (!image || !form) return;
  const file = (form.elements.namedItem('image') as HTMLInputElement | null)?.files?.[0];
  if (previewObjectUrl) { URL.revokeObjectURL(previewObjectUrl); previewObjectUrl = ''; }
  if (file && file.type.startsWith('image/')) previewObjectUrl = URL.createObjectURL(file);
  const src = previewObjectUrl || savedMediaUrl;
  if (src) image.src = src; else image.removeAttribute('src');
  image.classList.toggle('hidden', !src);
}

form?.addEventListener('input', renderPreview);
form?.addEventListener('change', (event) => {
  if ((event.target as HTMLInputElement).name === 'image') renderPreviewImage();
  renderPreview();
});

function openCampaignDialog(campaign?: Record<string, any>) {
  if (!dialog || !form) return;
  form.reset();
  editingId = campaign?.id ? String(campaign.id) : '';
  savedMediaUrl = campaign?.mediaUrl ? String(campaign.mediaUrl) : '';
  const title = dialog.querySelector('#campaign-title');
  if (title) title.textContent = campaign ? 'Edit campaign' : 'New campaign';
  form.querySelector('[data-form-error]')?.classList.add('hidden');
  if (campaign) {
    for (const [name, value] of Object.entries(campaign)) {
      const field = form.elements.namedItem(name);
      if ((field instanceof HTMLInputElement && field.type !== 'file') || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) field.value = String(value ?? '');
    }
    form.querySelectorAll<HTMLInputElement>('[name="topics"]').forEach((box) => { box.checked = (campaign.topics || []).includes(box.value); });
  }
  renderPreview();
  renderPreviewImage();
  dialog.showModal();
}

function showError(root: Element, error: unknown) {
  const box = root.querySelector<HTMLElement>('[data-form-error]');
  if (box) { box.textContent = (error as Error).message; box.classList.remove('hidden'); }
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  if (!(data.get('image') as File | null)?.size) data.delete('image');
  try {
    await call(editingId ? `/api/ads/campaigns/${editingId}` : '/api/ads/campaigns', { method: editingId ? 'PATCH' : 'POST', body: data });
    window.location.reload();
  } catch (error) { showError(form, error); }
});

const selfTopUp = document.querySelector<HTMLFormElement>('[data-self-topup-form]');
selfTopUp?.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await postJson('/api/ads/self-top-up', { amount: Number(new FormData(selfTopUp).get('amount')) });
    window.location.reload();
  } catch (error) { showError(selfTopUp, error); }
});

const topUp = document.querySelector<HTMLFormElement>('[data-topup-form]');
topUp?.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const { url } = await postJson('/api/ads/top-up', { amount: Number(new FormData(topUp).get('amount')) });
    window.location.assign(url);
  } catch (error) { showError(topUp, error); }
});
