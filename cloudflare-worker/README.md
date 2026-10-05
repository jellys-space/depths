# Request Access Worker — dashboard setup

The website remains static on GitHub Pages. This module Worker validates the form, verifies Turnstile, atomically reserves identities in D1, and sends one Discord embed. The webhook and Turnstile secret live only in Cloudflare.

Production setup was completed on 5 October 2026. The website uses the production Turnstile site key, and the existing `depths-whitelist` Worker now verifies tokens and reserves identities in `depths-access` through its `DB` binding. Both private keys are encrypted Cloudflare secrets. The live widget completed verification and the deployed Worker returned the expected health response; all 21 offline regression tests passed. Discord delivery still needs confirmation with the next genuine application.

The instructions below document the setup for maintenance or recreation. **Do not replace a live Worker before its database, secrets, and public widget configuration are ready.**

## Before you start

Use the Cloudflare account containing your existing **`depths-whitelist`** Worker. The website currently sends applications to `https://depths-whitelist.sylviarose4ef.workers.dev/`; keep that address.

You can do the Cloudflare setup entirely in the dashboard. You do not need to install Wrangler or move the website away from GitHub Pages. Follow sections 1–7 in order. The widget checks visitors; the Worker verifies the check; D1 remembers which Discord IDs and Minecraft names have already applied.

| Item | Exact location | What goes there |
| --- | --- | --- |
| Public site key | `request-access/index.html`, `depths-turnstile-site-key` meta tag | Turnstile **Site key** |
| Private secret | Existing Worker → Settings → Variables and Secrets | Secret named **`TURNSTILE_SECRET_KEY`** |
| Discord webhook | Same Worker settings | Secret named **`DISCORD_WEBHOOK_URL`** |
| Database connection | Existing Worker → Bindings | D1 binding named **`DB`**, selecting **`depths-access`** |

Only the public site key belongs in the website. Never put either secret in the repository or send it in chat.

## 1. Create the production Turnstile widget

1. Sign in to the [Cloudflare dashboard](https://dash.cloudflare.com/) and select the account containing `depths-whitelist`.
2. Open **Turnstile** in the account navigation. Use the dashboard search if you cannot find it.
3. Click **Add widget**.
4. Enter **`Depths Request Access`** as the widget name.
5. Under **Hostname management**, add **`depths.jellys-space.vip`**. Enter the hostname only: no `https://`, slash, or `/request-access/`.
6. Set **Widget mode** to **Managed**.
7. Leave **Pre-clearance** off; this form does not need it.
8. Click **Create**.
9. Keep the two keys available for the later steps. Store the secret privately, such as in your password manager. Do not paste it into a file in this repository.

Cloudflare shows two keys:

- **Site key:** public; safe to put in the website HTML.
- **Secret key:** private; put it only in the Worker's encrypted secret settings. Never put it in HTML, JavaScript, Git, screenshots, or a shared document.

See [Cloudflare's widget instructions](https://developers.cloudflare.com/turnstile/get-started/widget-management/dashboard/).

## 2. Create D1 and apply the schema

1. In the same Cloudflare account, open **Storage & databases → D1 SQL Database**. Searching the navigation for **D1** also works.
2. Click **Create database**.
3. Enter **`depths-access`** as the database name, leave the optional location hint at its default, and click **Create**. If you already created this database for this site, open it instead.
4. Open **`depths-access` → Console**.
5. Open [`migrations/0001_submissions.sql`](migrations/0001_submissions.sql) in your local repository. Copy its entire contents, including the final semicolon.
6. Paste it into the D1 console and click **Execute**. The SQL creates the `submissions` table and uniqueness constraints; it does not delete existing submissions.
7. Confirm there is no SQL error. Open **Tables** and check that **`submissions`** appears. Its columns should include `discord_user_id`, `minecraft_username_normalized`, and `status`.

The table has no expiry or scheduled deletion.

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

1. Open **Workers & Pages** and select **`depths-whitelist`**. Use your existing Worker, not a new Worker or your GitHub Pages website.
2. Open **Bindings** and click **Add binding**.
3. Choose **D1 database**, then **Add binding** if prompted.
4. For **Variable name**, enter **`DB`** exactly, in uppercase.
5. In the database dropdown, choose **`depths-access`**.
6. Click **Add binding** and save/deploy the configuration if prompted. Keep the old Worker code at this stage.
7. Confirm the Bindings list shows **`DB` → `depths-access`**.

Keep the existing Worker's public URL. [Cloudflare's D1 binding instructions](https://developers.cloudflare.com/d1/get-started/#3-bind-your-worker-to-your-d1-database).

## 4. Add the two encrypted secrets

1. Still inside **`depths-whitelist`**, open **Settings → Variables and Secrets**.
2. Click **Add**.
3. Set **Type** to **Secret**, not Text.
4. Set **Variable name** to **`TURNSTILE_SECRET_KEY`** exactly.
5. Set **Value** to the private **Secret key** from your production Turnstile widget. This is not the public site key.
6. Save/deploy the settings as prompted, leaving the old Worker code in place.
7. In the same list, check for **`DISCORD_WEBHOOK_URL`**. If it already exists as a secret, retain it. Cloudflare hiding its value is normal.
8. If it is absent, click **Add**, choose **Secret**, enter **`DISCORD_WEBHOOK_URL`**, and paste the existing Discord webhook URL as its Value. Save/deploy the settings. The Worker adds `wait=true` itself.
9. Confirm both secret names are listed. Neither value should be in `worker.js`, HTML, GitHub, or a screenshot.

[Cloudflare's secret instructions](https://developers.cloudflare.com/workers/configuration/secrets/).

## 5. Optional plaintext configuration

**For the normal production setup, skip this section.** The code already supplies the correct defaults. If you previously added variables with these names, check that they match the production values below; do not leave staging/test values on the production Worker. Under the same settings, **Text** variables may override:

| Variable | Default | Meaning |
| --- | --- | --- |
| `ALLOWED_ORIGINS` | `https://depths.jellys-space.vip,http://localhost:8000,http://127.0.0.1:8000` | Exact comma-separated origins; no wildcard or trailing slash. An override replaces the entire list. |
| `TURNSTILE_HOSTNAMES` | `depths.jellys-space.vip` | Exact comma-separated hostnames accepted from Siteverify. |
| `TURNSTILE_ACTION` | `request_access` | Must match the frontend widget action. Leave unchanged for production. |

The health check accepts GET without an Origin. Submission POSTs require an allowed Origin. CORS is a browser protection, not authentication; Turnstile and D1 are the abuse/identity controls. No IP or User-Agent is stored in D1.

## 6. Publish the public site key first

1. Open **`request-access/index.html`** in your local repository (the file inside the `request-access` folder, not the root homepage).
2. Near the top, find the `depths-turnstile-site-key` meta tag. The current production value is:

```html
<meta name="depths-turnstile-site-key" content="0x4AAAAAAFOlSrtjDhA348ix">
```

3. If using the existing widget, keep that value. If you created a replacement widget, replace only the `content` value with its **Site key**. Keep the quotes, the `name`, and the rest of the tag. Do not paste the Secret key here.
4. Save the file. Keep the nearby **`depths-access-endpoint`** value unchanged.
5. If the key changed, publish this website edit to the existing repository's `main` branch. If using GitHub in the browser, open [`request-access/index.html`](https://github.com/jellys-space/depths/blob/main/request-access/index.html), click the pencil/Edit button, replace the same `content` value, and **Commit changes** to `main`. If using local Git, commit and push only this file.
6. In the GitHub repository's **Actions** tab, wait for the Pages build/deployment for that commit to finish successfully.
7. Open [the live Request Access page](https://depths.jellys-space.vip/request-access/) and reload it. The Turnstile widget should load near Submit Request and complete verification. Do not submit a dummy request to the production Discord channel just to check the widget.

The antispam protection is not active merely because the widget appears. Server verification starts when you deploy the new Worker in section 7. If editing through GitHub, pull that commit into your local checkout before making further site changes.

When migrating an older Worker, keep it active during this stage and check that it tolerates the extra `turnstileToken` JSON field. If it rejects unknown fields, first adjust its parser to ignore `turnstileToken`, retaining its existing behaviour until the migration. Production has already completed this migration.

## 7. Replace the live Worker only now

1. In **Workers & Pages → `depths-whitelist`**, click **Edit Code**.
2. Save a private backup of the old dashboard code outside this repository in case it contains secrets.
3. Open the local [`worker.js`](worker.js) in this folder and copy the complete file.
4. In the dashboard editor, select the existing JavaScript entry file used by this Worker (usually `worker.js` or `index.js`). Replace its contents with the copied code, not with this README or the SQL file.
5. Click **Deploy** and wait for success. The file uses `export default` module syntax and needs no package installation.
6. Return to **Bindings** and confirm **`DB` → `depths-access`** remains. In **Settings → Variables and Secrets**, confirm **`TURNSTILE_SECRET_KEY`** and **`DISCORD_WEBHOOK_URL`** remain.
7. Open the [existing Worker URL](https://depths-whitelist.sylviarose4ef.workers.dev/) in a browser tab. It should show:

```json
{"ok":true,"service":"depths-access"}
```

This confirms the new code is responding. GET health does not test the secret keys, D1 schema, or Discord delivery. Use the staging checks below for a full dry run. For the next genuine production application, confirm the Discord embed arrives once and its D1 row becomes `delivered`. That Discord ID and Minecraft name then remain blocked until an administrator deliberately removes the record.

Current pages with the new public key now send verified tokens to the new Worker. Visitors who kept an older tab open before step 6 may need to reload; missing tokens fail closed. Do not disable server verification to accommodate stale tabs. If you roll back, understand that the old Worker does not enforce permanent D1 uniqueness; record any submissions during that interval before migrating again.

### If something does not work

| Symptom | Check |
| --- | --- |
| No widget appears | Check the live page's site-key meta tag. It must contain the public Site key, not `REPLACE_WITH_PUBLIC_TURNSTILE_SITE_KEY`. Wait for Pages deployment and reload. |
| Widget reports an invalid site key/domain | Use the production Site key and make sure the widget permits `depths.jellys-space.vip`, without a URL scheme or path. |
| Verification fails after the widget succeeds | Check that the Worker has the matching Secret key. Production hostname must be `depths.jellys-space.vip` and action `request_access`; remove unintended test overrides. Refresh expired verification and try again. |
| Submissions are temporarily unavailable | Check both encrypted secret names, the `DB` binding, and the `submissions` table. Look at the Worker's logs for configuration/database failures. Do not paste secrets into logs or code. |
| A request is already submitted | D1 has reserved one of the supplied identities. Read the administrator recovery section before deleting anything. Clearing browser data will not free it. |

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
