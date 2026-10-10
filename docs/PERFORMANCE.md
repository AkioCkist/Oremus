# Performance and memory

This page records the safeguards that keep database work, realtime connections and background jobs bounded. It also gives repeatable checks for future changes.

## Database query rules

- Do not issue a database query from a loop whose length comes from user data.
- Filter and limit in MongoDB before calling `lean()`, populating documents or building arrays in Node.js.
- Use `bulkWrite`, `insertMany`, `updateMany` or one aggregation when every item receives the same operation.
- Select only the fields required by counts and membership checks.
- Every production query that sorts a growing collection needs a matching compound index.

Current high-volume paths follow those rules:

| Path | Bound or batching strategy |
|---|---|
| Socket connection | Joins only `user:<id>`; it performs no per-conversation database lookup |
| Conversation list | Filters to current friends in MongoDB and returns at most 60 rows |
| Group invitations | One `bulkWrite`, one block lookup and one `insertMany` for at most 50 invitees |
| Photo deletion | Two set-based `updateMany` calls instead of loading and saving posts one at a time |
| Feed invalidation | Increments a Redis generation key in O(1); old entries expire naturally |

## Important compound indexes

Indexes live beside their Mongoose schemas in `apps/web/src/models/index.ts`. The most performance-sensitive additions are:

- `Follow(followingId, followerId)` for follower lists and counts.
- `GroupMember(userId, groupId)` for a person's group memberships.
- `Post(authorId, groupId, deletedAt, createdAt)` for profile and author feeds.
- `Post(groupId, deletedAt, groupStatus, createdAt)` for approved group feeds.
- `GroupJoinRequest(groupId, status, createdAt)` for moderation queues.
- `Notification(recipientId, readAt, createdAt)` for unread counts and newest-first lists.

Production disables Mongoose automatic index creation. Apply schema changes after deployment:

```powershell
docker compose exec web node dist/scripts/migrate.js
```

The migration synchronizes all 22 exported MongoDB models, including stories, group invites and search history.

## Memory bounds

- Multer writes uploads to disk instead of buffering complete files in the web process.
- Image compression is sequential and the Sharp cache is disabled, limiting concurrent native memory.
- Video compression runs in one dedicated worker because ffmpeg already uses multiple CPU cores.
- The media trash sweep reads and deletes at most 32 files at a time.
- Browser search suggestions retain at most 50 query results per search box.
- Feed, story, search, message and photo-library reads have explicit limits.

## Verification

Run the static and behavioural gates:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Confirm a query uses the expected index with MongoDB `explain("executionStats")`. `totalDocsExamined` should stay close to `nReturned`, and the winning plan should contain `IXSCAN`, not `COLLSCAN`.

Check live container memory and logs after a representative request:

```powershell
docker stats --no-stream oremus-web-1 oremus-media-1 oremus-mongo-1 oremus-redis-1
docker compose logs --tail 100 web media
```

These checks validate bounded behaviour and known hot paths. Before a production traffic increase, also run a load test with production-like data volume; a small development dataset cannot establish capacity limits or latency percentiles.
