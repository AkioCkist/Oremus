# Oremus architecture

## Service flow

```mermaid
flowchart LR
  Browser[Responsive EJS + TypeScript client] --> Web[Express MVC + Socket.IO]
  Web --> Mongo[(MongoDB)]
  Web --> Redis[(Redis)]
  Web --> API[FastAPI ranking/search]
  API --> Mongo
  API --> Redis
  Redis <--> Socket[Socket.IO Redis adapter]
  Socket <--> Web
```

Express controllers only translate HTTP. Services own business rules, Mongoose models own persistence constraints, Zod validators own request shapes, middleware owns cross-cutting auth/CSRF/rate-limit/upload concerns, and sockets own live delivery.

## Document model

MongoDB embeds values that are read and updated with their parent: `Profile` inside `User`, `PostMedia` inside `Post`, and conversation member IDs inside `Conversation`. High-cardinality or independently updated relationships use collections.

```mermaid
erDiagram
  USER ||--|| PROFILE : embeds
  USER ||--o{ FOLLOW : follows
  USER ||--o{ POST : authors
  POST ||--o{ POST_MEDIA : embeds
  POST ||--o{ REACTION : receives
  POST ||--o{ COMMENT : receives
  COMMENT ||--o{ COMMENT : replies
  GROUP ||--o{ GROUP_MEMBER : contains
  GROUP ||--o{ GROUP_JOIN_REQUEST : receives
  GROUP ||--o{ GROUP_POST : maps
  POST ||--o| GROUP_POST : belongs
  CONVERSATION ||--o{ CONVERSATION_MEMBER : embeds
  CONVERSATION ||--o{ MESSAGE : contains
  USER ||--o{ NOTIFICATION : receives
  USER ||--o{ REFRESH_TOKEN : owns
  USER ||--o{ AUDIT_LOG : acts
```

Compound unique indexes protect follow pairs, user/post reactions, memberships, and active identity fields. TTL removes expired refresh records. Posts and comments use `deletedAt` soft deletion.

## Route map

| Surface | Routes | Responsibility |
|---|---|---|
| Pages | `/`, `/login`, `/register`, `/reset-password` | Authentication and ranked home feed |
| People | `/profile/:username`, `PATCH /api/profile`, `POST /api/users/:id/follow` | Profiles and follow graph |
| Posts | `/posts/:id`, `/api/posts/*` | Create/edit/delete, media, reactions, comments/replies |
| Groups | `/groups`, `/groups/:slug`, `/api/groups/*`, `/api/group-requests/*` | Discovery, membership, moderation, group posting |
| Messaging | `/messages/:conversationId`, `/api/conversations/*` | Conversation history and real-time messages |
| Activity | `/notifications`, `/api/notifications/*` | Notification inbox and read state |
| Discovery | `/search`, `/api/search`, FastAPI `/v1/search` | Users, posts, groups |
| Ranking | FastAPI `/v1/feed/rank` | Explainable ranking of authorized candidates |
| Operations | `/health`, FastAPI `/health`, `/api/dev/cache` | Readiness and cache diagnostics |

## Cache policy

| Data | Key | TTL | Invalidation |
|---|---|---:|---|
| Home feed | `feed:{user}:{page}:{limit}` | 45s | post, reaction, comment, follow, membership |
| Profile summary | `profile:{user}` | 120s | profile or follow change |
| Group metadata | `group:{group}` | 180s | group/membership changes plus short TTL |
| Search | `search:{sha256(query)}:{limit}` | 30s | social/content mutations plus TTL |

Cache accesses increment `cache:stats` hit/miss counters. Broad feed invalidation favors correctness for this first production slice; at scale, replace it with follower-set fanout keys.

## Verification matrix

| Acceptance path | Proof |
|---|---|
| Password/auth validation | Vitest auth policy tests + API validation |
| Refresh replay handling | hashed refresh records, family revocation branch |
| Post ownership | shared permission test + service guard |
| Six reaction types | table-driven Vitest coverage |
| Group approval | admin/moderator service guard + upserted membership |
| Message delivery | persisted message + conversation Socket.IO room emit |
| Notification delivery | persisted notification + user Socket.IO room emit |
| Redis behavior | explicit cache/invalidation service + diagnostic endpoint |
| Responsive UI | desktop grid, mobile bottom navigation, semantic forms/focus states |

