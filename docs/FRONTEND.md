# Frontend: views, client script and styles

The UI is rendered on the server with EJS. One TypeScript file adds interactivity, and Tailwind CSS provides the styles. There is no client framework.

## How the pieces connect

```mermaid
flowchart LR
  subgraph Server
    Views["src/views/*.ejs<br/>pages + partials"]
    Helpers["utils/view-helpers.ts<br/>timeAgo, compact, describeFeeling…"]
  end
  subgraph Source["Client source"]
    TS["src/views-or-client/app.ts"]
    CSSsrc["src/views-or-client/styles.css"]
    TW["tailwind.config.js"]
  end
  subgraph Built["public/assets (generated)"]
    JS["app.js"]
    CSS["styles.css"]
  end
  TS -- "esbuild (npm run build:client)" --> JS
  CSSsrc -- "tailwindcss (npm run build:css)" --> CSS
  TW --> CSS
  Views -- "scans class names" --> CSS
  Helpers --> Views
  Views -- "&lt;script src=/assets/app.js?v=hash&gt;" --> JS
```

Built files get a `?v=<hash>` suffix (`assetVersion()` in `app.ts`), so browsers always load the latest build.

> After changing `app.ts` or `styles.css`, run `npm --workspace @oremus/web run build:client` or `build:css`. `npm run dev` builds both once at start.

## Pages

| URL | View | Needs login |
|---|---|---|
| `/` | `home.ejs` — story tray, feed, suggestions rail | Yes |
| `/login`, `/register` | `auth/index.ejs` — one page; the photo slides between the two forms without a reload | No |
| `/reset-password` | `auth/reset.ejs` | No |
| `/profile/:username` | `profile.ejs` — tabs: media grid (default when there is media, `?tab=media&type=&sort=`), posts (`?tab=posts`), about (`?tab=about&section=`) | No |
| `/posts/:postId` | `post.ejs` — single post with all comments | No (public posts) |
| `/groups` | `groups/index.ejs` — directory | No |
| `/groups/:slug`, `/g/:groupId` | `groups/detail.ejs` — tabs: discussion, about, members, requests, pending (`?tab=`) | No (visible groups) |
| `/stories`, `/stories/:username` | `stories/index.ejs` — full-screen viewer | Yes |
| `/stories/archive` | `stories/archive.ejs` | Yes |
| `/messages`, `/messages/:conversationId` | `messages.ejs` | Yes |
| `/notifications` | `notifications.ejs` | Yes |
| `/search` | `search.ejs` | Yes |
| `/settings` | `settings.ejs` — profile, photos, story audience, theme | Yes |

## Page layout

Design rules and sizes are in [DESIGN.md](DESIGN.md).

- `partials/nav.ejs` is one element with two layouts: a glass top bar under `lg`, a floating vertical tab bar from `lg` up. The reserved width is the `--rail-w` variable, applied as padding on `<body>`. It also renders the Messages pill.
- `partials/mobile-nav.ejs` is the floating tab bar under `lg`.
- `partials/foot.ejs` holds the dialogs (composer, edit post, post modal, story composer, confirm), toasts and scripts.

Reusable partials:

| Partial | Purpose |
|---|---|
| `post-card.ejs` | One post: header, media or carousel, icon actions, caption, comments |
| `comment.ejs` | One comment |
| `composer.ejs` | Group composer row. Elsewhere Create in the navigation opens the composer dialog |
| `story-tray.ejs` | Row of story circles |
| `profile-actions.ejs` | Profile header buttons |
| `avatar.ejs` | Avatar image or coloured initials |
| `follow-button.ejs`, `friend-controls.ejs` | Relationship buttons |
| `break-dialog.ejs` | Take a break / block dialog |
| `profile-dialogs.ejs` | Edit profile, Edit details (Intro switches), photo picker and cropper |
| `post-extra-views.ejs`, `post-place-card.ejs` | Feeling/activity picker, check-in search and map card shared by the Create post and Edit post dialogs |
| `profile-about.ejs` | About tab: section nav, detail rows, inline editors, audience selectors |
| `media-tile.ejs` | 3:4 photo or video tile with owner menu |
| `search-box.ejs` | Search field with the recent/suggestions dropdown (header and `/search`) |
| `icons.ejs` | Inline SVG sprite: icons (`#i-*`) and reaction emoji (`#r-*`) |

## Client script (`app.ts`)

The script is organised in sections. Each section looks for its elements by `data-*` attributes, so it only runs where the markup exists.

| Section | What it does |
|---|---|
| Shared helpers | `$`, `$$`, `request()` (fetch with CSRF header and JSON errors), toasts, avatars |
| Theme | Light / dark / system switch, saved in the `theme` cookie |
| API forms | Any `<form data-api-form>` is sent with `fetch`; shows errors inline, redirects or reloads on success |
| Confirm dialog | Promise-based "Are you sure?" |
| Menus | `<details data-menu>` dropdowns close on outside click |
| Reactions | Heart toggle sends `love`; the hover bar offers all six |
| Composer | Create post dialog, feeling/activity picker, check-in search with map, emoji picker |
| Photo picker and cropper | Choose or upload avatar/cover, then pan and zoom before saving |
| Photo actions | Draft photo/video tiles in the composer and edit dialog, "…" menus on media |
| Post modal | Opens from any post link, photo or comment button. Photo and comments side by side, arrows move between photos then posts, the address follows the open post |
| Groups | Create/edit group dialog, join questions, invites |
| Global click delegation | One `click` listener handles follow, friend, block, copy link, delete and more via `data-*` |
| Inline comments | Post a comment without reloading |
| Messenger | Send messages, append incoming ones, Socket.IO listeners |
| Story viewer | Progress bars, auto-advance, pause, reactions, replies, viewers list |
| Profile About | `<select data-autosubmit>` saves an audience as soon as it changes; `data-profile-item-delete` removes a workplace, school or link; "I currently work here" hides the end date |

Profile previews on hover live in [`hover-card.ts`](../apps/web/src/views-or-client/hover-card.ts). Post carousels live in [`carousel.ts`](../apps/web/src/views-or-client/carousel.ts) and are fully delegated, so posts added by infinite scroll need no setup. The search dropdown lives in its own module, [`search-box.ts`](../apps/web/src/views-or-client/search-box.ts), imported by `app.ts`. It sets up every `<form data-search-box>` on the page. See [Search and places](SEARCH_AND_PLACES.md#search-box-recent-searches-and-suggestions).

### Talking to the server

```mermaid
sequenceDiagram
  participant UI as Button / form
  participant R as request() helper
  participant API as /api/...
  UI->>R: request(url, { method, body })
  R->>API: fetch + x-csrf-token header + cookies
  API-->>R: { ok, data } or { ok: false, error }
  alt ok
    R-->>UI: data
  else error
    R-->>UI: throws Error(error.message)
    UI->>UI: show toast or inline error
  end
```

## Styling and theming

- Tailwind CSS 3 with design tokens in `tailwind.config.js`.
- Colours are CSS variables (`--c-ink`, `--c-surface`, `--c-brand-500`, …) defined in `styles.css` for light and dark.
- Dark mode follows the `data-theme` attribute on `<html>`: `light`, `dark`, or `system` (uses the OS setting).
- The theme is read from the cookie on the server, so the first paint already has the right colours (no flash).
- Font: the system stack (SF Pro on Apple devices), Inter elsewhere. Both handle Vietnamese diacritics.
- Component classes (`.post`, `.tile`, `.rail-link`, `.btn-primary`, `.input`, `.field-bare`, …) live in `styles.css`.

```mermaid
flowchart LR
  Cookie["theme cookie"] --> Server["Express: res.locals.theme"] --> HTML["&lt;html data-theme=…&gt;"]
  HTML --> Vars["CSS variables for light or dark"]
  Toggle["Theme toggle (client)"] --> HTML
  Toggle --> Cookie
```

## Accessibility notes

- Dialogs use the native `<dialog>` element (focus trap and Escape for free).
- Icon-only buttons have `aria-label`s.
- Keyboard users get a visible focus ring (`:focus-visible`). Borderless writing areas use `.field-bare` because the dialog around them already shows focus.
- Reactions, menus and the viewer can be used with the keyboard (arrow keys in the viewer).
- The search field is an ARIA combobox: arrow keys move through suggestions, Tab accepts the inline completion, Esc closes.
