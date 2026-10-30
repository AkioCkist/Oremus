// Profile preview on hover: see who someone is and follow or message them without leaving the page.
// One shared element, one delegated listener, nothing runs on touch screens.

type Card = {
  _id: string; username: string; displayName: string; avatarUrl: string; bio: string; followers: number; following: number; friends: number;
  isSelf: boolean; isFollowing: boolean; photos: string[];
};
type Deps = {
  request: (url: string) => Promise<{ card: Card }>;
  avatarEl: (person: { displayName: string; avatarUrl?: string }, size: string) => HTMLElement;
};

const SHOW_DELAY = 350, HIDE_DELAY = 150;
const compact = new Intl.NumberFormat('en', { notation: 'compact' });
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) => {
  const node = document.createElement(tag); node.className = className; if (text !== undefined) node.textContent = text; return node;
};
const usernameOf = (link: HTMLAnchorElement) => /^\/profile\/([^/?#]+)$/.exec(link.getAttribute('href') || '')?.[1];

export function initHoverCards({ request, avatarEl }: Deps) {
  if (!document.body.dataset.userId || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const cache = new Map<string, Promise<Card | null>>();
  const box = el('div', 'hover-card');
  box.hidden = true; box.setAttribute('role', 'tooltip');
  document.body.appendChild(box);
  let showTimer = 0, hideTimer = 0, current: HTMLAnchorElement | null = null;

  const hide = () => { box.hidden = true; current = null; };
  const render = (card: Card) => {
    const head = el('a', 'flex items-center gap-3'); head.href = `/profile/${card.username}`;
    const names = el('span', 'min-w-0 leading-tight');
    names.append(el('span', 'block truncate text-subheadline font-semibold', card.displayName), el('span', 'block truncate text-footnote text-muted', `@${card.username}`));
    head.append(avatarEl({ displayName: card.displayName, avatarUrl: card.avatarUrl }, 'size-14 text-lg'), names);
    const stats = el('p', 'mt-3 flex gap-4 text-footnote');
    [[card.friends, 'friends'], [card.followers, 'followers'], [card.following, 'following']].forEach(([count, label]) => {
      const stat = el('span', 'text-muted', ` ${label}`); stat.prepend(el('b', 'font-semibold text-ink', compact.format(count as number))); stats.append(stat);
    });
    box.replaceChildren(head, stats);
    if (card.bio) box.append(el('p', 'mt-2 line-clamp-2 text-footnote', card.bio));
    if (card.photos.length) {
      const grid = el('div', 'mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-xl');
      card.photos.forEach((url) => { const image = el('img', 'aspect-square size-full bg-field object-cover'); image.src = url; image.alt = ''; grid.append(image); });
      box.append(grid);
    }
    if (!card.isSelf) {
      const actions = el('div', 'mt-3 grid grid-cols-2 gap-2');
      const follow = el('button', card.isFollowing ? 'btn-secondary' : 'btn-primary', card.isFollowing ? 'Following' : 'Follow');
      follow.type = 'button'; follow.dataset.follow = card._id; follow.dataset.following = String(card.isFollowing);
      const message = el('button', 'btn-secondary', 'Message'); message.type = 'button'; message.dataset.messageUser = card._id;
      actions.append(follow, message); box.append(actions);
    }
  };
  const place = (link: HTMLElement) => {
    const anchor = link.getBoundingClientRect();
    const width = box.offsetWidth, height = box.offsetHeight;
    const below = anchor.bottom + 8 + height < window.innerHeight;
    box.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8))}px`;
    box.style.top = `${below ? anchor.bottom + 8 : Math.max(8, anchor.top - height - 8)}px`;
  };

  document.addEventListener('mouseover', (event) => {
    const target = event.target as Element;
    if (box.contains(target)) { window.clearTimeout(hideTimer); return; }
    const link = target.closest<HTMLAnchorElement>('a[href^="/profile/"]');
    if (!link || link === current) return;
    const username = usernameOf(link);
    // Skip the navigation's own profile tab and profile tiles that already say who it is.
    if (!username || link.closest('.app-sidebar, .mobile-tabbar')) return;
    window.clearTimeout(hideTimer); window.clearTimeout(showTimer);
    showTimer = window.setTimeout(async () => {
      if (!cache.has(username)) cache.set(username, request(`/api/users/${encodeURIComponent(username)}/card`).then((data) => data.card).catch(() => null));
      const card = await cache.get(username)!;
      if (!card || !link.isConnected || !link.matches(':hover')) return;
      render(card); current = link; box.hidden = false; place(link);
    }, SHOW_DELAY);
  }, { passive: true });

  document.addEventListener('mouseout', (event) => {
    const target = event.target as Element;
    if (!target.closest('a[href^="/profile/"]') && !box.contains(target)) return;
    window.clearTimeout(showTimer); window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(hide, HIDE_DELAY);
  }, { passive: true });

  // A follow changes what a cached card should say next time it opens.
  box.addEventListener('click', (event) => { if ((event.target as Element).closest('[data-follow]')) { const name = current && usernameOf(current); if (name) cache.delete(name); } });
  document.addEventListener('scroll', hide, { capture: true, passive: true });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') hide(); });
}
