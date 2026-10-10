// Facebook-style search box: recent searches when empty; while typing, keyword completions
// (with inline ghost text you can accept with Tab / →), matching people and groups.

type Entry = { id: string; kind: 'query' | 'user' | 'group'; title: string; subtitle: string; url: string; imageUrl: string; tone: string; query?: string; entityId?: string };
type Suggestions = { query: string; completions: Array<{ text: string; recent: boolean }>; users: Entry[]; groups: Entry[] };
type Option = { el: HTMLElement; run: () => void };

const csrf = (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement | null)?.content || '';

async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', ...init, headers: { 'x-csrf-token': csrf, ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers || {}) } });
  const payload = await response.json().catch(() => ({ ok: false }));
  if (!response.ok || !payload.ok) throw new Error(payload.error?.message || 'Request failed.');
  return payload.data as T;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string) => {
  const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node;
};
const icon = (id: string, className = 'icon') => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', className); svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', `#${id}`); svg.appendChild(use); return svg;
};
const initials = (name: string) => { const parts = name.trim().split(/\s+/); return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1]![0] : '')).toUpperCase(); };

/** Leading picture: photo, initials (people), a tile (groups) or an icon (keywords). */
function thumb(entry: Pick<Entry, 'kind' | 'imageUrl' | 'tone' | 'title'>, keywordIcon = 'i-search') {
  if (entry.kind === 'query') { const box = el('span', 'grid size-9 shrink-0 place-items-center rounded-full bg-control text-muted'); box.append(icon(keywordIcon, 'icon size-[1.125rem]')); return box; }
  const box = el('span', `${entry.kind === 'group' ? 'rounded-lg' : 'rounded-full'} relative grid size-9 shrink-0 place-items-center overflow-hidden font-display text-xs font-bold text-white ${entry.imageUrl ? 'bg-field' : entry.tone}`);
  if (entry.imageUrl) { const img = el('img', 'size-full object-cover'); img.src = entry.imageUrl; img.alt = ''; img.loading = 'lazy'; box.append(img); }
  else if (entry.kind === 'group') box.append(icon('i-group', 'icon size-[1.125rem]'));
  else box.append(el('span', '', initials(entry.title)));
  return box;
}

/** Shows the typed part normally and the completion in bold, like Facebook. */
function completionLabel(text: string, typed: string) {
  const label = el('span', 'min-w-0 flex-1 truncate text-15');
  if (typed && text.toLowerCase().startsWith(typed.toLowerCase())) { label.append(text.slice(0, typed.length)); label.append(el('strong', 'font-semibold', text.slice(typed.length))); }
  else label.append(el('strong', 'font-semibold', text));
  return label;
}

function initSearchBox(form: HTMLFormElement) {
  const input = form.querySelector<HTMLInputElement>('input[name="q"]')!;
  const panel = form.querySelector<HTMLElement>('[data-search-panel]')!;
  const ghost = form.querySelector<HTMLElement>('[data-search-ghost]');
  const ghostTyped = form.querySelector<HTMLElement>('[data-ghost-typed]');
  const ghostRest = form.querySelector<HTMLElement>('[data-ghost-rest]');
  const listId = panel.id;
  const cache = new Map<string, Suggestions>();
  let recent: Entry[] | null = null;
  let options: Option[] = [];
  let active = -1;
  let completion = '';
  let timer = 0;
  let controller: AbortController | null = null;

  const record = (body: Record<string, string>) => fetch('/api/search/recent', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => undefined);
  const go = (url: string) => { window.location.assign(url); };
  const searchFor = (query: string) => { input.value = query; close(); form.requestSubmit(); };
  const openEntity = (entry: Entry) => { void record({ kind: entry.kind, id: entry.entityId! }); go(entry.url); };

  function setGhost(value: string) {
    completion = value;
    const typed = input.value;
    const show = !!value && !!typed && value.toLowerCase().startsWith(typed.toLowerCase()) && value.length > typed.length
      && input.selectionStart === typed.length && input.scrollWidth <= input.clientWidth;
    if (ghostTyped) ghostTyped.textContent = show ? typed : '';
    if (ghostRest) ghostRest.textContent = show ? value.slice(typed.length) : '';
    ghost?.classList.toggle('hidden', !show);
    if (!show) completion = '';
  }

  function setActive(index: number) {
    options[active]?.el.classList.remove('bg-hover');
    options[active]?.el.setAttribute('aria-selected', 'false');
    active = index;
    const option = options[active];
    if (option) { option.el.classList.add('bg-hover'); option.el.setAttribute('aria-selected', 'true'); option.el.scrollIntoView({ block: 'nearest' }); input.setAttribute('aria-activedescendant', option.el.id); }
    else input.removeAttribute('aria-activedescendant');
  }

  function open() { panel.classList.remove('hidden'); input.setAttribute('aria-expanded', 'true'); }
  function close() { panel.classList.add('hidden'); input.setAttribute('aria-expanded', 'false'); setActive(-1); setGhost(''); }

  /** One selectable row; `extra` is an optional trailing control (e.g. remove from recent). */
  function row(lead: Node, label: Node, sub: string, run: () => void, extra?: HTMLElement) {
    const item = el('div', 'group/row flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-hover');
    item.id = `${listId}-opt-${options.length}`;
    item.setAttribute('role', 'option'); item.setAttribute('aria-selected', 'false');
    const text = el('span', 'flex min-w-0 flex-1 flex-col');
    text.append(label); if (sub) text.append(el('span', 'truncate text-[0.8125rem] text-muted', sub));
    item.append(lead, text); if (extra) item.append(extra);
    item.addEventListener('mousedown', (event) => event.preventDefault()); // keep focus in the input
    item.addEventListener('click', (event) => { if (!(event.target as HTMLElement).closest('[data-row-extra]')) run(); });
    options.push({ el: item, run });
    return item;
  }

  function heading(text: string, action?: HTMLElement) {
    const head = el('div', 'flex items-center justify-between px-2 pb-1 pt-1.5');
    head.append(el('h3', 'text-[1.0625rem] font-bold', text)); if (action) head.append(action);
    return head;
  }

  function renderRecent() {
    options = []; active = -1; panel.replaceChildren();
    const items = recent || [];
    const clear = el('button', 'rounded-md px-2 py-1 text-15 text-brand-600 hover:bg-hover', 'Clear all'); clear.type = 'button';
    clear.addEventListener('mousedown', (event) => event.preventDefault());
    clear.addEventListener('click', async () => { recent = []; renderRecent(); await api('/api/search/recent', { method: 'DELETE' }).catch(() => undefined); });
    panel.append(heading('Recent', items.length ? clear : undefined));
    if (!items.length) { panel.append(el('p', 'px-2 py-6 text-center text-15 text-muted', 'No recent searches')); return; }
    items.forEach((entry) => {
      const remove = el('button', 'icon-btn-ghost size-8 shrink-0 text-muted'); remove.type = 'button'; remove.dataset.rowExtra = '';
      remove.setAttribute('aria-label', `Remove ${entry.title} from recent searches`); remove.append(icon('i-x', 'icon size-4'));
      remove.addEventListener('mousedown', (event) => event.preventDefault());
      remove.addEventListener('click', async () => {
        recent = (recent || []).filter((item) => item.id !== entry.id); renderRecent();
        await api(`/api/search/recent/${entry.id}`, { method: 'DELETE' }).catch(() => undefined);
      });
      const label = el('span', 'truncate text-15 font-medium', entry.title);
      panel.append(row(thumb(entry, 'i-clock'), label, entry.subtitle, () => (entry.kind === 'query' ? searchFor(entry.query!) : openEntity(entry)), remove));
    });
  }

  function renderSuggestions(data: Suggestions) {
    options = []; active = -1; panel.replaceChildren();
    const typed = input.value.trim();
    data.completions.forEach((item) => panel.append(row(thumb({ kind: 'query', imageUrl: '', tone: '', title: item.text }, item.recent ? 'i-clock' : 'i-search'), completionLabel(item.text, typed), '', () => searchFor(item.text))));
    [...data.users, ...data.groups].forEach((entry) => panel.append(row(thumb(entry), el('span', 'truncate text-15 font-medium', entry.title), entry.subtitle, () => openEntity(entry))));
    const all = el('span', 'min-w-0 flex-1 truncate text-15'); all.append('Search for '); all.append(el('strong', 'font-semibold', `“${typed}”`));
    const lead = el('span', 'grid size-9 shrink-0 place-items-center rounded-full bg-brand-600 text-white'); lead.append(icon('i-search', 'icon size-[1.125rem]'));
    panel.append(row(lead, all, '', () => searchFor(typed)));
    // Inline completion: the best keyword, else a name, that continues what was typed.
    const names = [...data.users, ...data.groups].map((entry) => entry.title);
    setGhost([...data.completions.map((item) => item.text), ...names].find((text) => text.toLowerCase().startsWith(typed.toLowerCase()) && text.length > typed.length) || '');
  }

  async function refresh() {
    const query = input.value.trim();
    window.clearTimeout(timer);
    if (!query) {
      setGhost('');
      if (recent) renderRecent(); else panel.replaceChildren(el('p', 'px-2 py-6 text-center text-15 text-muted', 'Loading…'));
      open();
      if (!recent) { recent = await api<{ items: Entry[] }>('/api/search/recent').then((data) => data.items).catch(() => []); if (!input.value.trim()) renderRecent(); }
      return;
    }
    const cached = cache.get(query.toLowerCase());
    if (cached) { renderSuggestions(cached); open(); return; }
    // Keep the previous ghost while waiting if it still continues the new input.
    setGhost(completion);
    timer = window.setTimeout(async () => {
      controller?.abort(); controller = new AbortController();
      try {
        const data = await api<Suggestions>(`/api/search/suggest?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        cache.set(query.toLowerCase(), data);
        if (input.value.trim() === query && document.activeElement === input) { renderSuggestions(data); open(); }
      } catch { /* aborted or offline: keep what is shown */ }
    }, 120);
  }

  function acceptCompletion() {
    if (!completion) return false;
    input.value = completion; setGhost(''); void refresh(); return true;
  }

  input.addEventListener('focus', () => { void refresh(); });
  input.addEventListener('input', () => { void refresh(); });
  input.addEventListener('blur', () => window.setTimeout(close, 120));
  input.addEventListener('keydown', (event) => {
    const isOpen = !panel.classList.contains('hidden');
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!isOpen) { void refresh(); return; }
      event.preventDefault();
      if (!options.length) return;
      // Cycle through the rows and back to the input itself (index -1).
      const total = options.length + 1;
      setActive((((active + 1 + (event.key === 'ArrowDown' ? 1 : -1)) % total) + total) % total - 1);
      return;
    }
    if ((event.key === 'Tab' && !event.shiftKey) || (event.key === 'ArrowRight' && input.selectionStart === input.value.length)) { if (acceptCompletion()) event.preventDefault(); return; }
    if (event.key === 'Enter' && isOpen && active >= 0) { event.preventDefault(); options[active]!.run(); return; }
    if (event.key === 'Escape' && isOpen) { event.preventDefault(); close(); }
  });
  form.addEventListener('submit', (event) => { if (input.value.trim().length < 2) { event.preventDefault(); input.focus(); } else recent = null; });
}

document.querySelectorAll<HTMLFormElement>('[data-search-box]').forEach(initSearchBox);
