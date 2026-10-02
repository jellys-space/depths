# Request Access Worker — dashboard setup

The website remains static on GitHub Pages. This module Worker validates the form, verifies Turnstile, atomically reserves identities in D1, and sends one Discord embed. The webhook and Turnstile secret live only in Cloudflare.

The shipped website still calls its existing Worker URL. Its obvious Turnstile placeholder keeps the old submission flow working. **The security overhaul takes effect only after the steps below. Do not replace the live Worker before the database, secrets, and public widget configuration are ready.**

## 1. Create the production Turnstile widget

In the [Cloudflare dashboard](https://dash.cloudflare.com/), select your account → **Turnstile → Add widget**. Name it `Depths Request Access`, add hostname **`depths.jellys-space.vip`** (without `https://` or a path), select **Managed**, and select **Create**. Pre-clearance is unnecessary here. Cloudflare shows two keys:

- **Site key:** public; safe to put in the website HTML.
- **Secret key:** private; put it only in the Worker's encrypted secret settings. Never put it in HTML, JavaScript, Git, screenshots, or a shared document.

See [Cloudflare's widget instructions](https://developers.cloudflare.com/turnstile/get-started/widget-management/dashboard/).

## 2. Create D1 and apply the schema

In your account's **Storage & databases → D1 SQL Database**, choose **Create database**, name it `depths-access`, and create it. Open the database → **Console**. Paste the complete contents of [`migrations/0001_submissions.sql`](migrations/0001_submissions.sql) and select **Execute**. The file creates one table with unique Discord ID and lowercase Minecraft name constraints. It has no expiry or scheduled deletion.

If your dashboard groups products differently, search for **D1** in its navigation. [Cloudflare's D1 setup guide](https://developers.cloudflare.com/d1/get-started/) documents the current interface.

The new database cannot know about submissions delivered by the old Worker. If you want those accounts permanently blocked too, enter historical requests from your staff records before switching. Use the same normalized lowercase Minecraft name and `delivered` status. Do not invent identities. An example with deliberately fictitious values:

```sql
INSERT INTO submissions
  (id, discord_user_id, discord_username, minecraft_username, minecraft_username_normalized, status, delivered_at)
VALUES
  ('historical-record-example', '000000000000000000', 'ExampleOnly', 'ExamplePlayer', 'exampleplayer', 'delivered', CURRENT_TIMESTAMP);
```

Replace every example value before executing; historical imports must reflect requests staff actually received.

## 3. Bind D1 to the existing Worker

Go to **Workers & Pages → your existing whitelist Worker → Bindings → Add binding → D1 database**. Set the variable name to **`DB`**, select `depths-access`, and add the binding. Keep the existing Worker's public URL. [D1 binding instructions](https://developers.cloudflare.com/d1/best-practices/remote-development/).

## 4. Add the two encrypted secrets

In that Worker's **Settings → Variables and Secrets → Add**, choose type **Secret**:

1. **`DISCORD_WEBHOOK_URL`**: your existing Discord webhook URL. Retain the existing secret if already present; do not copy it into the repository. The Worker adds `wait=true` itself.
2. **`TURNSTILE_SECRET_KEY`**: the private secret from step 1.

Save/deploy these settings while retaining the old code. [Cloudflare's secret instructions](https://developers.cloudflare.com/workers/configuration/secrets/).

## 5. Optional plaintext configuration

Defaults are sufficient for production. Under the same settings, **Text** variables may override:

| Variable | Default | Meaning |
| --- | --- | --- |
| `ALLOWED_ORIGINS` | `https://depths.jellys-space.vip,http://localhost:8000,http://127.0.0.1:8000` | Exact comma-separated origins; no wildcard or trailing slash. An override replaces the entire list. |
| `TURNSTILE_HOSTNAMES` | `depths.jellys-space.vip` | Exact comma-separated hostnames accepted from Siteverify. |
| `TURNSTILE_ACTION` | `request_access` | Must match the frontend widget action. Leave unchanged for production. |

The health check accepts GET without an Origin. Submission POSTs require an allowed Origin. CORS is a browser protection, not authentication; Turnstile and D1 are the abuse/identity controls. No IP or User-Agent is stored in D1.

## 6. Publish the public site key first

Edit **`request-access/index.html`** and replace only the `content` value in:

```html
<meta name="depths-turnstile-site-key" content="REPLACE_WITH_PUBLIC_TURNSTILE_SITE_KEY">
```

Use your **public site key** from step 1. Commit/push that website edit and wait for GitHub Pages to publish. Keep `depths-access-endpoint` unchanged. Confirm the live page displays a working widget and the browser sends a `turnstileToken` field. Do not send a test application to the production webhook merely to check the widget.

The old Worker remains active during this stage; it must tolerate the extra JSON field. Its manually managed source is not in this repository, so check that it validates the named application fields without rejecting unknown fields. If it rejects extra fields, first adjust that old parser to ignore `turnstileToken`, retaining its existing behaviour until the migration. The placeholder version of the site can already be deployed safely with no Cloudflare changes.

## 7. Replace the live Worker only now

Save a private copy of the old dashboard code for rollback. Once steps 1–6 are complete, open the **same Worker → Edit Code**. Replace its entry module with all of [`worker.js`](worker.js), save, and **Deploy**. It uses `export default` module syntax; there are no imports to install. Verify the `DB` binding and both secrets are still present. GET its existing URL to confirm JSON health (`ok: true`).

Current pages with the new public key now send verified tokens to the new Worker. Visitors who kept an older tab open before step 6 may need to reload; missing tokens fail closed. Do not disable server verification to accommodate stale tabs. If you roll back, understand that the old Worker does not enforce permanent D1 uniqueness; record any submissions during that interval before migrating again.

## 8. Verify safely with a staging Worker

Use a separate staging Worker, separate D1 database, and a **dedicated test Discord channel/webhook**. Copy the schema, bindings and code there. Change the endpoint only in your local website copy. Never use the production webhook for automated tests. Our repository tests mock all HTTP and do not contact Discord.

For local testing, use Cloudflare's published **test keys**:

- Public always-pass site key: `1x00000000000000000000AA`.
- Private always-pass test secret: `1x0000000000000000000000000000000AA`.
- Private always-fail test secret: `2x0000000000000000000000000000000AA`.
- Private spent-token test secret: `3x0000000000000000000000000000000AA`.

These are intentionally public test credentials from [Cloudflare's testing documentation](https://developers.cloudflare.com/turnstile/troubleshooting/testing/), **never production protection**. Set the staging Worker `TURNSTILE_HOSTNAMES=localhost,127.0.0.1` and `TURNSTILE_ACTION=test` to match Cloudflare's dummy Siteverify response. Serve the local website at port 8000. Test-only configuration belongs in your local copy or ignored `.dev.vars`, and must be restored before publishing. Real production tokens are single-use and expire; the frontend resets the widget after each submission attempt. [Siteverify reference](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

Check in staging:

1. A valid first request succeeds; the test Discord channel receives **exactly one** embed; D1 shows `delivered`.
2. Same Discord ID with another Minecraft name returns HTTP 409 / `already_submitted`, with no webhook.
3. Another Discord ID with the same Minecraft name returns the same conflict. Capitalization changes also conflict. The response does not identify which key matched.
4. Invalid/expired/spent Turnstile tokens, wrong hostname or wrong action fail before D1 insertion or Discord delivery.
5. A definitively rejected webhook (such as a nonexistent **test** webhook returning 404) removes the reservation. Correct the test webhook; the same applicant can retry with a fresh token.
6. A timeout, transport error, or Discord 5xx keeps the reservation, because delivery may already have occurred. The UI asks the applicant to contact staff. It must not automatically retry.
7. Allowed preflight returns 204 and the exact CORS origin; an unlisted origin or missing Origin POST is rejected without a webhook. GET health remains available.
8. Concurrent requests for either identity have one winner. Verify no second webhook is posted.

Run the offline regression tests with **Node 22.13+ or Node 24+** from the repository root:

```sh
node --test cloudflare-worker/worker.test.mjs
```

Tests use in-memory SQLite with the actual migration and a small D1-shaped adapter. They verify concurrency/constraints, request validation, CORS, mentions, verification, rollback and uncertain deliveries. They do not substitute for checking the actual Cloudflare bindings in staging.

## Delivery states and administrator recovery

- `reserved`: identity atomically reserved before contacting Discord. A Worker interruption may leave this state indefinitely.
- `delivered`: Discord returned a successful response. Retained permanently, even if the later status update fails (then it may still read `reserved`).
- `uncertain`: network failure, timeout, redirect, unexpected failure status or 5xx. Discord may already have received the embed. Retained indefinitely.

There is no automatic retry, TTL, cooldown or scheduled cleanup. A definitive 400/401/403/404/405/413/415/429 rejection releases only that request's reservation. If the deletion fails it stays blocked for manual review. A delivered-status write failure returns success and retains the identity. This errs toward avoiding duplicate Discord messages; exactly-once delivery across D1 and Discord cannot be guaranteed if a Worker crashes between the two services.

### Inspect records privately

In **D1 → depths-access → Console**, use:

```sql
SELECT id, discord_user_id, discord_username, minecraft_username, status, created_at, delivered_at
FROM submissions ORDER BY created_at DESC LIMIT 50;
```

These are applicant contact details. Keep results within staff tooling; do not commit database exports or post them publicly. The Worker has no public lookup endpoint.

### Deliberately allow a new application

Find the exact record in the console. For `reserved`/`uncertain`, **check Discord manually first**, and make sure no delivery is still in progress. Never clear records merely because they are old. When you deliberately choose to allow resubmission, delete by its exact ID:

```sql
SELECT id, discord_user_id, minecraft_username, status
FROM submissions WHERE id = 'PASTE_EXACT_RECORD_ID';

DELETE FROM submissions WHERE id = 'PASTE_EXACT_RECORD_ID';
```

Deleting frees both identities and permits one fresh request. Make this an explicit staff decision, including for delivered records.

## Optional burst protection

This is separate from the permanent identity rule. If you place the Worker on a Cloudflare-proxied hostname in your zone, use **zone → Security → WAF / Security rules → Rate limiting rules → Create rule** (navigation varies by account). Match the Worker hostname, submission path and `POST` method only; use a modest short burst threshold such as 10 requests per 10 seconds per source IP, and a short block period. Choose values your plan supports. This can reduce repeated fake identities without storing IPs in our database. It is optional; plan limits may differ.

A zone WAF rule does **not** protect the existing `workers.dev` hostname. For that hostname, Cloudflare's [Workers Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) is an alternative requiring explicit additional binding/code configuration. It is not enabled by this Worker and is not a prerequisite. Do not claim zone protection unless traffic actually uses the protected route.

## Optional Wrangler workflow

Dashboard deployment needs no local dependencies. For CLI administration, copy `wrangler.example.toml` to ignored `wrangler.toml`, enter your own database ID locally, apply migrations and deploy with Wrangler. Set secrets using `wrangler secret put DISCORD_WEBHOOK_URL` and `wrangler secret put TURNSTILE_SECRET_KEY`. Do not commit the filled config or local state. Continue using the existing Worker name/endpoint for production.
