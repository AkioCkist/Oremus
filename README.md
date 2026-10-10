# Oremus

Oremus is an original, full-stack social network built with an Express MVC application, MongoDB/Mongoose, Redis, FastAPI, Socket.IO, and Tailwind CSS. It includes real authentication, profiles, posts, six reactions, threaded comments, groups with moderated join requests, direct messages, notifications, cross-entity search, and personalized feed ranking.

## Run locally with Docker

1. Copy `.env.example` to `.env` and replace both JWT secrets with independent random values of at least 32 characters.
2. Start the stack:

   ```powershell
   docker compose up --build -d
   ```

3. Seed realistic local data:

   ```powershell
   docker compose exec web node dist/scripts/seed.js
   ```

4. Open [http://localhost:3000](http://localhost:3000). Sign in with `maya@example.com` / `CircleSpace123`.

FastAPI OpenAPI documentation is available at [http://localhost:8001/docs](http://localhost:8001/docs). The web health endpoint is `/health`; FastAPI uses `/health`. Authenticated developers can inspect Redis cache hit/miss counts at `/api/dev/cache`.

## Run services directly

MongoDB and Redis must be available locally first.

```powershell
Copy-Item .env.example .env
npm install
python -m pip install -r apps/api/requirements.txt
npm run migrate
npm run seed
npm run dev
```

In another terminal:

```powershell
Set-Location apps/api
python -m uvicorn app.main:app --reload --port 8001
```

## Commands

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
python -m pytest -q apps/api/tests
docker compose config --quiet
```

`npm run migrate` synchronizes declared MongoDB indexes and constraints. Migrations are intentionally index-oriented because document shape is backwards-compatible and validated at both Zod and Mongoose boundaries.

## Architecture decisions

- **Mongoose instead of a relational ORM:** the direct request specified MongoDB. Mongoose supplies schema validation, indexes, lifecycle hooks, references, and an ODM query layer while retaining document-friendly embedding for profiles, media, and conversation membership.
- **Express owns transactional product behavior:** authentication, users, posts, groups, messaging, notifications, uploads, authorization, and server-rendered pages stay in the MVC application.
- **FastAPI owns ranking and search:** it applies a transparent recency/relationship/engagement ranking and performs cached, cross-collection search. Express falls back to chronological order if ranking is temporarily unavailable.
- **Redis is operational:** it backs feed/profile/group/search caches, prefix invalidation, auth and creation rate limits, access-token denylisting, cache diagnostics, and the Socket.IO pub/sub adapter.
- **Security:** bcrypt password hashes, short-lived access JWTs, rotating refresh JWTs stored as hashes, replay-family revocation, HTTP-only SameSite cookies, CSRF tokens, Helmet CSP, validation, sanitization, generated upload names, MIME/size limits, ownership checks, and redacted structured logs.
- **UI:** responsive three-column desktop layout and bottom mobile navigation, restrained green accent, native semantics, visible focus, labeled controls, local form errors, structural empty states, and a keyboard-capable native alert dialog for destructive actions.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the service map, document model, route map, cache behavior, and verification matrix.

## Intentional production integrations left to the deployer

- Uploads use a validated local volume. Replace it with S3-compatible object storage before horizontal production deployment.
- Password reset returns its token only in development; production should connect the service to a transactional email provider.
- MongoDB text indexes provide the initial search implementation. At larger scale, swap the FastAPI search internals for Atlas Search/OpenSearch without changing the Express boundary.
- Presence, typing indicators, video, stories, ads, and algorithmic ML recommendations are outside the core product scope.

