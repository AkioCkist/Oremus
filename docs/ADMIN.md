# Admin panel

`/admin` is an [AdminJS](https://adminjs.co) app for staff. It uses the site's normal sign-in: there is no second password.

## Roles

`User.role` is `user`, `moderator` or `admin`. It is unrelated to `GroupMember.role`, which only applies inside a group.

The first admin has to be made on the server, because nothing in the web app lets someone raise their own role:

```bash
npm --workspace @oremus/web run grant-role -- someone@example.com admin
```

In production, inside the container: `docker compose exec web node dist/scripts/grant-role.js someone@example.com admin`.

| Can do | moderator | admin |
|---|---|---|
| Work the moderation queue, reports and appeals | yes | yes |
| Hide posts, comments and stories | yes | yes |
| Warn or suspend a member | yes | yes |
| Ban or reinstate, change roles | | yes |
| Approve ads | | yes |
| Wallets, ledger, payments, moderation thresholds | | yes |

Every action is written to `AuditLog`. Private messages have no resource at all: staff only see a message if someone in that conversation reported it, and then only that message's text, copied into the case.

## How it is protected

- Anyone who is not staff gets the same 404 as a page that does not exist, so the route's existence is not revealed. The role is read from the database on each request, so a demotion applies at once.
- AdminJS needs inline scripts, so `/admin` has its own CSP (`admin/mount.ts`). The public site's strict policy is unchanged.
- The AdminJS client cannot send the site's CSRF header, so writes are checked by `Origin` instead (`sameOriginWrites`).
- Actions are read-only by default (`readOnly` in `admin/resources.ts`). Delete and bulk delete are off everywhere; anything that changes data is an explicit action.

## Adding to it

Register the model in `admin/resources.ts`. If a listed model references another that is not registered, AdminJS throws: register that one with `navigation: false` and no accessible actions, as `Conversation` is. Dashboard numbers come from `admin/metrics.ts` (cached for a minute) and are drawn by `admin/components/Dashboard.jsx`.

AdminJS bundles its client when the server starts, into `ADMIN_JS_TMP_DIR`. The Compose file points this at `/tmp` because the container's filesystem is read-only. It takes a few seconds, during which only `/admin` is affected.

## Not done yet

Two-factor sign-in for staff. Do this before a real launch: an admin account can ban members and move money.
