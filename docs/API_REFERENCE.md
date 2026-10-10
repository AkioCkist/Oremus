# API reference

All endpoints of the web app and the search service.

## Conventions

- Base URL in development: `http://localhost:3000` (web) and `http://localhost:8001` (search API).
- Authentication uses cookies. Log in first; the browser sends cookies automatically.
- Every non-GET request needs the CSRF token in the `x-csrf-token` header (read it from `<meta name="csrf-token">` or the `csrf` cookie).
- Bodies are JSON unless the endpoint accepts files (then `multipart/form-data`).
- Success: `{ "ok": true, "data": ... }`. Error: `{ "ok": false, "error": { "code", "message" }, "requestId" }`.
- 🔒 means sign-in required. All `/api/*` endpoints require sign-in.

## Auth (`/auth`)

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/auth/register` | `email, username, displayName, password` | Signs in right away. 10 per 15 min |
| POST | `/auth/login` | `email, password, remember?` | 10 per 15 min |
| POST | `/auth/refresh` | — | Uses the `refresh_token` cookie |
| POST | `/auth/logout` 🔒 | — | Revokes tokens, clears cookies |
| POST | `/auth/password/reset-request` | `email` | In development the response includes a reset link |
| POST | `/auth/password/reset-confirm` | `token, password` | Signs out all devices |

## Profile and people

| Method | Path | Body | Notes |
|---|---|---|---|
| PATCH | `/api/profile` | multipart: `displayName, username, bio, location, website, privacy, avatar?, cover?` | Returns `redirect` |
| PATCH | `/api/profile/details` | any of `displayName, username, bio, location, website, privacy` | Partial update |
| POST | `/api/profile/photo` | multipart: `kind (avatar or cover), photo?` or `url` or `remove` | Upload, reuse a library photo, or remove |
| GET | `/api/profile/photos` | — | Photo library |
| DELETE | `/api/profile/photos` | `url` | Remove a photo from your posts and history |
| POST | `/api/users/:userId/follow` | — | Toggle follow → `{ following }` |
| POST | `/api/users/:userId/friendship` | `action: request, cancel, accept, decline, unfriend` | → `{ state, following, conversationId? }` |
| GET | `/api/users/:userId/break` | — | → `{ blocked, blockedByMe, seeLess, restrictPosts }` |
| POST | `/api/users/:userId/break` | `seeLess, restrictPosts` | Take a break |
| POST | `/api/users/:userId/block` | `blocked: true or false` | Block or unblock |

## Posts

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/posts` | multipart: `content, visibility, groupId?, feeling? (JSON), place? (JSON), images[]` | 20 per hour. Photos and videos, no count limit |
| GET | `/api/posts/:postId` | — | → `{ post, comments }` |
| PATCH | `/api/posts/:postId` | multipart: `content, visibility?, layout? (JSON), images[]` | See [editing](POSTS_AND_FEED.md#editing-a-post-and-its-media) |
| PUT | `/api/posts/:postId/media/:mediaId` | multipart: `photo` (photo or video) | Replace one media item |
| DELETE | `/api/posts/:postId/media/:mediaId` | — | → `{ postDeleted }` |
| DELETE | `/api/posts/:postId` | — | Move to trash |
| POST | `/api/posts/:postId/reactions` | `type: like, love, haha, wow, sad, angry` | Toggle → `{ active, count }` |
| POST | `/api/posts/:postId/comments` | `content, parentId?` | 60 per hour |

## Groups

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/groups` | multipart: `payload` (JSON string with `name, description, privacy, visibility, groupType, location, tags (max 5), rules (max 10), questions (max 3), settings, coverUrl?, removeCover?, invite?`) + `cover?` file | 5 per hour. A public group is always visible |
| PATCH | `/api/groups/:groupId` | same as create | Admins only |
| POST | `/api/groups/:groupId/join` | `answers[], agreeRules` | → `{ status: joined or pending }` |
| POST | `/api/groups/:groupId/leave` | — | The creator cannot leave |
| POST | `/api/groups/:groupId/invites` | `userIds[]` | Members only |
| POST | `/api/group-requests/:requestId/decision` | `decision: approve or reject` | Join requests |
| POST | `/api/group-posts/:postId/decision` | `decision: approve or reject` | Pending posts, admins/moderators |

## Messages

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/conversations` | `memberId` | Friends only; returns the existing chat if there is one |
| POST | `/api/conversations/:conversationId/messages` | `content` (max 3000) | 120 per minute |

## Stories

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/api/stories` | — | Story tray |
| POST | `/api/stories` | multipart: `media?, text?, background, audience?` | 30 per hour |
| PATCH | `/api/stories/settings` | `audience` | Default audience |
| POST | `/api/stories/:storyId/view` | — | Record a view |
| POST | `/api/stories/:storyId/reactions` | `type` | Toggle |
| POST | `/api/stories/:storyId/replies` | `content` (max 1000) | Sent as a chat message |
| GET | `/api/stories/:storyId/viewers` | — | Author only |
| DELETE | `/api/stories/:storyId` | — | Author only |

## Other

| Method | Path | Notes |
|---|---|---|
| GET | `/api/notifications` | Latest 50 |
| POST | `/api/notifications/read` | Mark all as read |
| GET | `/api/search?q=` | Users, posts, groups |
| GET | `/api/places?q=&lat=&lon=` | Place search for check-ins |
| GET | `/api/places/nearby?lat=&lon=` | Places near a point |
| GET | `/api/dev/cache` | Cache hit/miss statistics |
| GET | `/health` | Web health (MongoDB + Redis), no auth |

## Search service (FastAPI, port 8001)

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | Pings MongoDB and Redis |
| GET | `/v1/search?q=&limit=` | `q` 2–80 chars, `limit` 1–50 |
| POST | `/v1/feed/rank` | `{ user_id, candidates[], limit }` → scored posts |
| GET | `/docs` | Interactive OpenAPI docs |

## Common error codes

| Status | Code | Meaning |
|---|---|---|
| 401 | `AUTH_REQUIRED` | Not signed in |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password |
| 401 | `REFRESH_REUSED` | A used refresh token was replayed; all sessions in that family ended |
| 403 | `CSRF_INVALID` | Missing or wrong CSRF token |
| 403 | `NOT_OWNER`, `POST_FORBIDDEN`, `USER_BLOCKED`, `FRIENDSHIP_REQUIRED` | Not allowed |
| 404 | `POST_NOT_FOUND`, `USER_NOT_FOUND`, `GROUP_NOT_FOUND`, … | Does not exist or is hidden from you |
| 409 | `IDENTITY_TAKEN`, `ALREADY_MEMBER` | Conflict |
| 413 | `MEDIA_TOO_LARGE`, `LIMIT_FILE_SIZE` | File too big |
| 415 | `INVALID_MEDIA` | File type not allowed |
| 422 | `VALIDATION_ERROR`, `EMPTY_POST`, `INVALID_IMAGE` | Invalid input |
| 429 | `RATE_LIMITED` | Too many requests |
| 503 | `PLACES_UNAVAILABLE` | External service down |
