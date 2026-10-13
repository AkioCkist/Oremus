/**
 * Endless lists. A list loads more items when the reader reaches the item that is `prefetch` positions
 * from its end (4 by default), so the next chunk is usually ready before they get to the bottom.
 *
 * Declarative use (server-rendered lists):
 *   <ul data-infinite="comments" data-infinite-next="<cursor>" data-infinite-query="post=123">…</ul>
 *   - data-infinite-root="self" | "<selector>"  scroll container (default: the page)
 *   - data-infinite-reverse                    older items load at the top (chat)
 *   - data-infinite-prefetch="8"               trigger distance in items (grids load earlier)
 *   - [data-infinite-done="comments"]          element shown once everything is loaded
 * Chunks come from GET /api/lists/<name>?cursor=…&<query> as { html, next }.
 *
 * Programmatic use (client-rendered lists such as the photo viewer and mini chat): `createInfiniteList`.
 */

export type ChunkResult = { nodes: Node[]; next: string | null };

export type InfiniteOptions = {
  list: HTMLElement;
  next: string | null;
  load: (cursor: string) => Promise<ChunkResult>;
  reverse?: boolean;
  prefetch?: number;
  root?: HTMLElement | null;
  done?: HTMLElement | null;
  /** Called with the inserted elements before they are attached (bind listeners, apply styles). */
  onInsert?: (fragment: DocumentFragment) => void;
};

export type InfiniteList = { refresh: () => void; loadMore: () => Promise<void>; setNext: (next: string | null) => void; destroy: () => void };

const keyOf = (element: Element) => (element as HTMLElement).dataset?.key || (element as HTMLElement).dataset?.postId || '';

function statusRow(reverse: boolean) {
  const row = document.createElement('div');
  row.className = 'hidden justify-center py-4';
  row.dataset.infiniteStatus = '';
  const spinner = document.createElement('span');
  spinner.className = 'size-7 animate-spin rounded-full border-[3px] border-line border-t-brand-600';
  spinner.setAttribute('role', 'status'); spinner.setAttribute('aria-label', reverse ? 'Loading earlier items' : 'Loading more');
  const error = document.createElement('p');
  error.className = 'hidden text-center text-sm text-muted';
  error.append('Couldn’t load more. ');
  const retry = document.createElement('button');
  retry.type = 'button'; retry.className = 'font-semibold text-brand-600 hover:underline'; retry.textContent = 'Try again';
  error.appendChild(retry);
  row.append(spinner, error);
  return { row, spinner, error, retry };
}

export function createInfiniteList(options: InfiniteOptions): InfiniteList {
  const { list, load, reverse = false, root = null, done = null } = options;
  const prefetch = Math.max(1, options.prefetch ?? 4);
  let next = options.next;
  let loading = false;
  let failed = false;
  const status = statusRow(reverse);
  // The status row lives outside the list so it never counts as an item.
  if (reverse) list.before(status.row); else list.after(status.row);

  // Items are the list's children that carry a key; anything else (date separators) is ignored.
  const items = () => [...list.children].filter(keyOf) as HTMLElement[];
  const keys = () => new Set(items().map(keyOf));

  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) void loadMore();
  }, { root });

  function refresh() {
    observer.disconnect();
    done?.classList.toggle('hidden', !!next);
    if (!next || failed) return;
    const all = items();
    const trigger = reverse ? all[Math.min(prefetch - 1, all.length - 1)] : all[Math.max(0, all.length - prefetch)];
    // An empty list (e.g. everything filtered out) has nothing to watch, so it loads straight away.
    if (trigger) observer.observe(trigger); else void loadMore();
  }

  function show(state: 'idle' | 'loading' | 'error') {
    status.row.classList.toggle('hidden', state === 'idle'); status.row.classList.toggle('flex', state !== 'idle');
    status.spinner.classList.toggle('hidden', state !== 'loading');
    status.error.classList.toggle('hidden', state !== 'error');
  }

  async function loadMore() {
    if (loading || !next) return;
    loading = true; failed = false; observer.disconnect(); show('loading');
    try {
      const chunk = await load(next);
      const seen = keys();
      const fragment = document.createDocumentFragment();
      // A post or message published while scrolling can shift later chunks; skip anything already shown.
      chunk.nodes.forEach((node) => { if (!(node instanceof Element) || !keyOf(node) || !seen.has(keyOf(node))) fragment.appendChild(node); });
      options.onInsert?.(fragment);
      if (reverse) {
        // Keep the reader's place: content added above would otherwise push what they are reading down.
        const scroller = root || document.scrollingElement || document.documentElement;
        const before = scroller.scrollHeight;
        list.prepend(fragment);
        scroller.scrollTop += scroller.scrollHeight - before;
      } else list.appendChild(fragment);
      next = chunk.next;
      show('idle');
    } catch {
      failed = true; show('error');
    } finally {
      loading = false;
      refresh();
    }
  }

  status.retry.addEventListener('click', () => void loadMore());
  // A chunk that failed while offline is retried as soon as the connection returns.
  const onOnline = () => { if (failed) void loadMore(); };
  window.addEventListener('online', onOnline);
  refresh();

  return {
    refresh, loadMore,
    setNext: (value) => { next = value; refresh(); },
    destroy: () => { observer.disconnect(); window.removeEventListener('online', onOnline); status.row.remove(); }
  };
}

/** Parses server-rendered chunk HTML into nodes. */
export function htmlNodes(html: string): Node[] {
  const template = document.createElement('template');
  template.innerHTML = html;
  return [...template.content.childNodes];
}

type RequestFn = (url: string) => Promise<any>;

/** Wires every `[data-infinite]` list on the page to GET /api/lists/<name>. */
export function initInfiniteLists(request: RequestFn, onInsert: (name: string, fragment: DocumentFragment) => void, scope: ParentNode = document) {
  const lists = new Map<HTMLElement, InfiniteList>();
  scope.querySelectorAll<HTMLElement>('[data-infinite]').forEach((list) => {
    const name = list.dataset.infinite!;
    const rootSetting = list.dataset.infiniteRoot;
    const root = rootSetting === 'self' ? list : rootSetting ? document.querySelector<HTMLElement>(rootSetting) : null;
    const query = list.dataset.infiniteQuery ? `&${list.dataset.infiniteQuery}` : '';
    lists.set(list, createInfiniteList({
      list, root,
      next: list.dataset.infiniteNext || null,
      reverse: list.dataset.infiniteReverse !== undefined,
      prefetch: Number(list.dataset.infinitePrefetch) || undefined,
      done: document.querySelector<HTMLElement>(`[data-infinite-done="${CSS.escape(name)}"]`),
      onInsert: (fragment) => onInsert(name, fragment),
      load: async (cursor) => {
        const data = await request(`/api/lists/${encodeURIComponent(name)}?cursor=${encodeURIComponent(cursor)}${query}`);
        return { nodes: htmlNodes(data.html), next: data.next };
      }
    }));
  });
  return lists;
}
