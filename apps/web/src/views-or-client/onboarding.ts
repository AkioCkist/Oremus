/**
 * Interest survey (views/onboarding.ejs): step 1 topics, step 2 optional sub-interests, step 3 people and groups
 * suggested from the answers. Answers are saved when leaving step 2 (POST /api/onboarding), so step 3 already
 * shows recommendations built from them; "Skip for now" lets the person in without answering.
 */

type Option = { key: string; label: string; emoji: string; keywords: string[] };
type Data = { options: Option[]; selected: string[]; keywords: string[] };

const csrf = (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement | null)?.content || '';

async function api<T>(url: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: { 'x-csrf-token': csrf, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch { throw new Error(navigator.onLine ? 'Could not reach Oremus. Please try again.' : "You're offline. Check your connection and try again."); }
  const payload = await response.json().catch(() => ({ ok: false }));
  if (!response.ok || !payload.ok) throw new Error(payload.error?.message || 'Something went wrong. Please try again.');
  return payload.data as T;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string) => {
  const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node;
};
const icon = (id: string, className = 'icon size-4') => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', className); svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', `#${id}`); svg.appendChild(use); return svg;
};
const initials = (name: string) => { const parts = name.trim().split(/\s+/); return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1]![0] : '')).toUpperCase(); };

function toast(message: string, tone: 'success' | 'error' = 'success') {
  const region = document.getElementById('toast-region');
  if (!region) return;
  const node = el('div', `pointer-events-auto flex max-w-sm animate-pop-in items-center gap-3 rounded-full px-5 py-3 text-15 font-medium shadow-pop ${tone === 'success' ? 'glass-strong text-ink' : 'bg-ios-red text-white'}`, message);
  region.appendChild(node); window.setTimeout(() => node.remove(), 4000);
}

export function initOnboarding() {
  const root = document.querySelector<HTMLElement>('[data-onboarding]');
  if (!root) return;
  let data: Data;
  try { data = JSON.parse(document.getElementById('onboarding-data')?.textContent || ''); } catch { return; }

  const min = Number(root.dataset.min) || 3;
  const maxKeywords = Number(root.dataset.maxKeywords) || 30;
  const next = root.dataset.next || '/';
  const editing = root.dataset.editing === 'true';
  const options = new Map(data.options.map((option) => [option.key, option]));
  const topics = new Set(data.selected.filter((key) => options.has(key)));
  // Sub-interests keep the spelling the person chose; matching is case-insensitive.
  const keywords = new Map(data.keywords.map((keyword) => [keyword.toLowerCase(), keyword]));
  let step = 1;
  let busy = false;

  const $ = <T extends Element = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const continueButton = $<HTMLButtonElement>('[data-onb-continue]');
  const backButton = $<HTMLButtonElement>('[data-onb-back]');
  const status = $('[data-onb-status]');
  const customForm = $<HTMLFormElement>('[data-onb-custom]');
  const customInput = customForm.querySelector<HTMLInputElement>('input')!;
  const skipButton = $<HTMLButtonElement>('[data-onb-skip]');

  function setLabel(button: HTMLButtonElement, text: string, iconId?: string) {
    button.replaceChildren(document.createTextNode(text));
    if (iconId) button.appendChild(icon(iconId));
  }

  function paint() {
    root.querySelectorAll<HTMLElement>('[data-step]').forEach((section) => section.classList.toggle('hidden', section.dataset.step !== String(step)));
    root.querySelectorAll<HTMLElement>('[data-onb-progress]').forEach((item) => {
      const index = Number(item.dataset.onbProgress);
      item.querySelector<HTMLElement>('[data-onb-bar]')!.classList.toggle('w-full', index <= step);
      item.querySelector<HTMLElement>('[data-onb-label]')!.classList.toggle('text-ink', index === step);
      if (index === step) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
    });
    backButton.classList.toggle('hidden', step === 1 || step === 3);
    // Answers are saved once step 3 shows, so there is nothing left to skip.
    skipButton.classList.toggle('invisible', step === 3);
    if (step === 1) {
      const missing = Math.max(0, min - topics.size);
      status.textContent = missing ? `${topics.size} selected · pick ${missing} more` : `${topics.size} selected`;
      continueButton.disabled = missing > 0 || busy;
      setLabel(continueButton, 'Continue', 'i-chevron-right');
    } else if (step === 2) {
      status.textContent = keywords.size ? `${keywords.size} specific ${keywords.size === 1 ? 'interest' : 'interests'}` : 'Optional';
      continueButton.disabled = busy;
      setLabel(continueButton, busy ? 'Saving…' : 'Save and continue', busy ? undefined : 'i-chevron-right');
    } else {
      status.textContent = 'Your interests are saved.';
      continueButton.disabled = false;
      setLabel(continueButton, editing ? 'Done' : 'Start exploring', 'i-chevron-right');
    }
  }

  /* ---------- Step 1 ---------- */

  root.querySelectorAll<HTMLButtonElement>('[data-onb-topic]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.onbTopic!;
      if (topics.has(key)) topics.delete(key); else topics.add(key);
      button.setAttribute('aria-pressed', String(topics.has(key)));
      paint();
    });
  });

  /* ---------- Step 2 ---------- */

  function chip(label: string) {
    const on = keywords.has(label.toLowerCase());
    const button = el('button', 'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-subheadline font-medium transition-colors '
      + (on ? 'border-ink bg-ink text-canvas' : 'border-line bg-surface text-ink hover:bg-hover'));
    button.type = 'button';
    button.setAttribute('aria-pressed', String(on));
    button.append(icon(on ? 'i-check' : 'i-plus', 'icon size-3.5'), document.createTextNode(label));
    button.addEventListener('click', () => {
      const key = label.toLowerCase();
      if (keywords.has(key)) keywords.delete(key);
      else if (keywords.size >= maxKeywords) { toast(`You can pick up to ${maxKeywords} specific interests.`, 'error'); return; }
      else keywords.set(key, label);
      renderGroups(); paint();
    });
    return button;
  }

  function renderGroups() {
    const container = $('[data-onb-groups]');
    const suggested = new Set<string>();
    const sections = [...topics].map((key) => options.get(key)!).map((option) => {
      option.keywords.forEach((keyword) => suggested.add(keyword.toLowerCase()));
      const section = el('section', 'rounded-2xl bg-surface p-4 shadow-card');
      const heading = el('h2', 'flex items-center gap-2 text-headline font-semibold');
      heading.append(el('span', 'text-xl', option.emoji), document.createTextNode(option.label));
      const list = el('div', 'mt-3 flex flex-wrap gap-2');
      option.keywords.forEach((keyword) => list.appendChild(chip(keyword)));
      section.append(heading, list);
      return section;
    });
    const custom = [...keywords.values()].filter((keyword) => !suggested.has(keyword.toLowerCase()));
    if (custom.length) {
      const section = el('section', 'rounded-2xl bg-surface p-4 shadow-card');
      section.appendChild(el('h2', 'text-headline font-semibold', 'Your own'));
      const list = el('div', 'mt-3 flex flex-wrap gap-2');
      custom.forEach((keyword) => list.appendChild(chip(keyword)));
      section.appendChild(list);
      sections.push(section);
    }
    container.replaceChildren(...sections);
  }

  customForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = customInput.value.trim().replace(/\s+/g, ' ');
    if (value.length < 2) { toast('Type at least 2 characters.', 'error'); return; }
    if (keywords.size >= maxKeywords && !keywords.has(value.toLowerCase())) { toast(`You can pick up to ${maxKeywords} specific interests.`, 'error'); return; }
    keywords.set(value.toLowerCase(), keywords.get(value.toLowerCase()) || value);
    customInput.value = '';
    renderGroups(); paint();
  });

  /* ---------- Step 3 ---------- */

  function avatar(person: { displayName: string; profile?: { avatarUrl?: string } }) {
    const box = el('span', 'avatar size-11 text-sm bg-field');
    if (person.profile?.avatarUrl) { const img = el('img'); img.src = person.profile.avatarUrl; img.alt = ''; img.loading = 'lazy'; box.appendChild(img); }
    else box.appendChild(el('span', '', initials(person.displayName)));
    return box;
  }

  function actionButton(label: string, run: (button: HTMLButtonElement) => Promise<void>) {
    const button = el('button', 'btn-soft btn-sm shrink-0', label);
    button.type = 'button';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await run(button); } catch (error) { toast(error instanceof Error ? error.message : 'Something went wrong.', 'error'); button.disabled = false; }
    });
    return button;
  }

  function row(image: HTMLElement, title: string, href: string, reason: string, action: HTMLElement) {
    const item = el('li', 'inset-row');
    const link = el('a', 'flex min-w-0 flex-1 items-center gap-3'); link.href = href; link.target = '_blank'; link.rel = 'noopener';
    const text = el('span', 'min-w-0 flex-1');
    const why = el('span', 'block truncate text-footnote text-ios-purple', reason); why.title = reason;
    text.append(el('span', 'block truncate text-callout font-semibold', title), why);
    link.append(image, text);
    item.append(link, action);
    return item;
  }

  async function loadSuggestions() {
    const people = $('[data-onb-people]'), groups = $('[data-onb-groups-list]');
    try {
      const result = await api<any>('/api/recommendations');
      const empty = (text: string) => el('li', 'inset-row py-6 text-subheadline text-muted', text);
      people.replaceChildren(...(result.people.length ? result.people.slice(0, 6).map((person: any) => row(avatar(person), person.displayName, `/profile/${person.username}`, person.reason.text,
        actionButton('Follow', async (button) => { const state = await api<{ following: boolean }>(`/api/users/${person._id}/follow`, {}); button.textContent = state.following ? 'Following' : 'Follow'; button.disabled = false; button.classList.toggle('btn-secondary', state.following); }))) : [empty('No one to suggest yet.')]));
      groups.replaceChildren(...(result.groups.length ? result.groups.slice(0, 6).map((group: any) => {
        const cover = el('span', 'grid size-11 shrink-0 place-items-center overflow-hidden rounded-[0.625rem] bg-field');
        if (group.coverUrl) { const img = el('img', 'size-full object-cover'); img.src = group.coverUrl; img.alt = ''; img.loading = 'lazy'; cover.appendChild(img); }
        else cover.appendChild(icon('i-group', 'icon size-5 text-muted'));
        const action = group.privacy === 'private' || group.pending
          ? Object.assign(el('a', 'btn-soft btn-sm shrink-0', group.pending ? 'Requested' : 'View'), { href: `/groups/${group.slug}`, target: '_blank', rel: 'noopener' })
          : actionButton('Join', async (button) => { const state = await api<{ status: string }>(`/api/groups/${group._id}/join`, {}); button.textContent = state.status === 'joined' ? 'Joined' : 'Requested'; });
        return row(cover, group.name, `/groups/${group.slug}`, group.reason.text, action);
      }) : [empty('No groups to suggest yet.')]));
    } catch {
      people.replaceChildren(el('li', 'inset-row py-6 text-subheadline text-muted', 'Suggestions are not available right now. You can find them later under For you.'));
      groups.replaceChildren();
    }
  }

  /* ---------- Navigation ---------- */

  async function save() {
    busy = true; paint();
    try {
      await api('/api/onboarding', { topics: [...topics], keywords: [...keywords.values()] });
      step = 3; busy = false; paint();
      window.scrollTo({ top: 0 });
      void loadSuggestions();
    } catch (error) {
      busy = false; paint();
      toast(error instanceof Error ? error.message : 'Could not save your interests.', 'error');
    }
  }

  continueButton.addEventListener('click', () => {
    if (busy) return;
    if (step === 1) { if (topics.size < min) return; step = 2; renderGroups(); paint(); window.scrollTo({ top: 0 }); }
    else if (step === 2) void save();
    else window.location.assign(next);
  });
  backButton.addEventListener('click', () => { if (step === 2) { step = 1; paint(); window.scrollTo({ top: 0 }); } });

  skipButton.addEventListener('click', async () => {
    // Editing existing answers: cancel without changing anything. After saving (step 3), skipping just continues.
    if (editing || step === 3) { window.location.assign(next); return; }
    try { const result = await api<{ redirect: string }>('/api/onboarding/skip', { next }); window.location.assign(result.redirect); }
    catch (error) { toast(error instanceof Error ? error.message : 'Could not skip right now.', 'error'); }
  });

  paint();
}
