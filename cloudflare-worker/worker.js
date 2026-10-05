// Module Worker. Configure DB and secrets in Cloudflare, never in this file.
const DEFAULT_ORIGINS = ['https://depths.jellys-space.vip', 'http://localhost:8000', 'http://127.0.0.1:8000'];
const MAX_BODY_BYTES = 4096;
const DEFINITE_REJECTIONS = new Set([400, 401, 403, 404, 405, 413, 415, 429]);
const DISCORD_WEBHOOK_HOSTS = new Set(['discord.com', 'discordapp.com', 'canary.discord.com', 'ptb.discord.com', 'canary.discordapp.com', 'ptb.discordapp.com']);

function list(value, defaults) {
  return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : defaults;
}

export function validateFields(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const names = ['discordUsername', 'discordUserId', 'minecraftUsername'];
  if (names.some((name) => typeof body[name] !== 'string')) return null;
  if (body.website !== undefined && typeof body.website !== 'string') return null;
  const [discordUsername, discordUserId, minecraftUsername] = names.map((name) => body[name].trim());
  if (discordUsername.length < 2 || discordUsername.length > 64 || /[\u0000-\u001f\u007f]/.test(discordUsername)) return null;
  if (!/^[1-9]\d{14,21}$/.test(discordUserId) || !/^[A-Za-z0-9_]{3,16}$/.test(minecraftUsername)) return null;
  return { discordUsername, discordUserId, minecraftUsername, minecraftUsernameNormalized: minecraftUsername.toLowerCase() };
}

function safeDiscordText(value) {
  return value.replace(/@/g, '＠').replace(/([\\`*_~|<>])/g, '\\$1');
}

function configuredWebhook(env) {
  if (typeof env.DISCORD_WEBHOOK_URL !== 'string' || !env.DISCORD_WEBHOOK_URL.trim()) throw new Error('webhook_missing');
  let webhook;
  try { webhook = new URL(env.DISCORD_WEBHOOK_URL); }
  catch (_) { throw new Error('webhook_url'); }
  if (webhook.protocol !== 'https:' || webhook.port || webhook.username || webhook.password) throw new Error('webhook_protocol');
  if (!DISCORD_WEBHOOK_HOSTS.has(webhook.hostname)) throw new Error('webhook_host');
  if (!/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[^/]+$/.test(webhook.pathname)) throw new Error('webhook_path');
  if (!env.DB || typeof env.DB.prepare !== 'function') throw new Error('database_binding');
  if (typeof env.TURNSTILE_SECRET_KEY !== 'string' || !env.TURNSTILE_SECRET_KEY.trim()) throw new Error('turnstile_secret');
  // URLs copied from Canary/PTB use those hosts; execute on the canonical API.
  webhook.hostname = 'discord.com';
  try { webhook.searchParams.set('wait', 'true'); }
  catch (_) { throw new Error('webhook_query'); }
  return webhook;
}

async function readJson(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES) throw new Error('body_too_large');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('invalid_json');
  let total = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error('body_too_large');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes));
  } catch (error) {
    if (error.message === 'body_too_large') throw error;
    throw new Error('invalid_json');
  } finally {
    reader.releaseLock();
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const origins = list(env.ALLOWED_ORIGINS, DEFAULT_ORIGINS);
    const originAllowed = origins.includes(origin);
    const cors = originAllowed ? {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600'
    } : {};
    const respond = (status, payload) => new Response(JSON.stringify(payload), {
      status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' }
    });
    const fail = (status, code, error) => respond(status, { ok: false, code, error });
    if (origin && !originAllowed) return fail(403, 'origin_forbidden', 'Origin is not allowed.');
    if (request.method === 'GET') {
      try { configuredWebhook(env); }
      catch (error) {
        console.error('access: configuration check failed', { reason: error.message });
        return fail(503, 'not_configured', 'Submissions are temporarily unavailable.');
      }
      return respond(200, { ok: true, service: 'depths-access' });
    }
    if (!originAllowed) return fail(403, 'origin_forbidden', 'An allowed Origin is required.');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, Vary: 'Origin' } });
    if (request.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST for submissions.');
    if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return fail(415, 'json_required', 'Send application/json.');
    }

    let body;
    try { body = await readJson(request); } catch (error) {
      return fail(error.message === 'body_too_large' ? 413 : 400, error.message, 'Invalid or oversized request body.');
    }
    // Pretend success for the honeypot without consuming a token or writing D1.
    if (typeof body?.website === 'string' && body.website.trim()) return respond(200, { ok: true });
    const fields = validateFields(body);
    if (!fields) return fail(400, 'invalid_fields', 'Please check your Discord and Minecraft details.');
    if (typeof body.turnstileToken !== 'string' || !body.turnstileToken.trim() || body.turnstileToken.length > 2048) {
      return fail(400, 'verification_failed', 'Please complete the verification.');
    }

    let webhook;
    try {
      webhook = configuredWebhook(env);
    } catch (error) {
      console.error('access: configuration check failed', { reason: error.message });
      return fail(503, 'not_configured', 'Submissions are temporarily unavailable.');
    }

    let verificationStage = 'fetch';
    let verificationStatus;
    try {
      const verification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: body.turnstileToken }),
        // workerd supports follow/manual; manual also keeps secrets off redirects.
        signal: AbortSignal.timeout(10000), redirect: 'manual'
      });
      verificationStatus = verification.status;
      verificationStage = 'json';
      const result = await verification.json();
      const knownCodes = new Set(['missing-input-secret', 'invalid-input-secret', 'missing-input-response', 'invalid-input-response', 'bad-request', 'timeout-or-duplicate', 'internal-error']);
      const codes = Array.isArray(result['error-codes']) ? result['error-codes'].filter(code => knownCodes.has(code)) : [];
      if (codes.includes('missing-input-secret') || codes.includes('invalid-input-secret')) {
        console.error('access: Turnstile secret rejected', { status: verificationStatus, codes });
        return fail(503, 'not_configured', 'Submissions are temporarily unavailable.');
      }
      if (codes.includes('internal-error') || (verification.status >= 300 && verification.status < 400) || verification.status >= 500) {
        console.error('access: verification service error', { status: verificationStatus, codes });
        return fail(503, 'verification_unavailable', 'Verification is temporarily unavailable.');
      }
      const hostnames = list(env.TURNSTILE_HOSTNAMES, ['depths.jellys-space.vip']);
      const action = env.TURNSTILE_ACTION || 'request_access';
      if (!verification.ok || result.success !== true || !hostnames.includes(result.hostname) || result.action !== action) {
        console.warn('access: verification rejected', { status: verificationStatus, codes,
          hostnameMatched: hostnames.includes(result.hostname), actionMatched: result.action === action });
        return fail(400, 'verification_failed', 'Verification could not be confirmed.');
      }
    } catch (error) {
      const errorType = ['TypeError', 'SyntaxError', 'AbortError', 'TimeoutError'].includes(error?.name) ? error.name : 'Error';
      console.error('access: verification service unavailable', { stage: verificationStage, status: verificationStatus, errorType });
      return fail(503, 'verification_unavailable', 'Verification is temporarily unavailable.');
    }

    const id = crypto.randomUUID();
    try {
      // The UNIQUE constraints decide who wins, including concurrent requests.
      const reservation = await env.DB.prepare(`INSERT INTO submissions
        (id, discord_user_id, discord_username, minecraft_username, minecraft_username_normalized)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`)
        .bind(id, fields.discordUserId, fields.discordUsername, fields.minecraftUsername, fields.minecraftUsernameNormalized).run();
      if (reservation.meta.changes === 0) {
        return fail(409, 'already_submitted', 'A request already exists for that Discord account or Minecraft username.');
      }
    } catch (_) {
      console.error('access: database reservation failed');
      return fail(503, 'storage_unavailable', 'Submissions are temporarily unavailable.');
    }

    async function retainUncertain() {
      try { await env.DB.prepare("UPDATE submissions SET status = 'uncertain' WHERE id = ? AND status = 'reserved'").bind(id).run(); }
      catch (_) { console.error('access: could not mark uncertain delivery; reservation retained'); }
      return fail(502, 'delivery_uncertain', 'Delivery could not be confirmed. Contact staff before retrying.');
    }
    let delivery;
    try {
      delivery = await fetch(webhook.href, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allowed_mentions: { parse: [] },
          embeds: [{ title: 'Depths & Beyond — Whitelist Request', color: 0x739a4b,
            fields: [
              { name: 'Discord Username', value: safeDiscordText(fields.discordUsername), inline: false },
              { name: 'Discord UserID', value: `<@${fields.discordUserId}>`, inline: false },
              { name: 'Minecraft Username', value: safeDiscordText(fields.minecraftUsername), inline: false }
            ], timestamp: new Date().toISOString() }]
        }), signal: AbortSignal.timeout(10000), redirect: 'manual'
      });
    } catch (_) {
      // A timeout/disconnect may occur AFTER Discord accepts the message.
      console.error('access: delivery transport failure; reservation retained');
      return retainUncertain();
    }
    if (delivery.ok) {
      try {
        await env.DB.prepare("UPDATE submissions SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
      } catch (_) { console.error('access: delivered status update failed; reservation retained'); }
      return respond(200, { ok: true });
    }
    console.error('access: Discord rejected delivery', { status: delivery.status });
    if (!DEFINITE_REJECTIONS.has(delivery.status)) return retainUncertain();
    try {
      await env.DB.prepare("DELETE FROM submissions WHERE id = ? AND status = 'reserved'").bind(id).run();
    } catch (_) {
      console.error('access: reservation release failed; administrator review required');
      return fail(503, 'delivery_uncertain', 'Contact staff to check your request before retrying.');
    }
    return fail(502, 'delivery_failed', 'Your request was not delivered. Please try again later.');
  }
};
