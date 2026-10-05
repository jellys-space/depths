(() => {
  const form = document.querySelector('[data-access-form]');
  if (!form) return;

  const submitButton = form.querySelector('[data-access-submit]');
  const status = form.querySelector('[data-access-status]');
  const endpoint = document.querySelector('meta[name="depths-access-endpoint"]')?.content?.trim() || '';
  const endpointConfigured = endpoint && !endpoint.includes('REPLACE-WITH-YOUR-WORKER');
  const siteKey = document.querySelector('meta[name="depths-turnstile-site-key"]')?.content?.trim() || '';
  const turnstileEnabled = Boolean(siteKey && !siteKey.startsWith('REPLACE_'));
  let turnstileToken = '';
  let widgetId;

  if (turnstileEnabled) {
    const container = form.querySelector('[data-access-turnstile]');
    container.hidden = false;
    window.depthsTurnstileReady = () => {
      widgetId = window.turnstile.render(container, {
        sitekey: siteKey,
        action: 'request_access',
        size: 'flexible',
        theme: 'auto',
        callback: (token) => { turnstileToken = token; },
        'expired-callback': () => { turnstileToken = ''; },
        'error-callback': () => {
          turnstileToken = '';
          showStatus('The verification could not load. Please reload the page and try again.', 'error');
        }
      });
    };
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=depthsTurnstileReady&render=explicit';
    script.async = true;
    script.onerror = () => showStatus('The verification could not load. Please reload the page and try again.', 'error');
    document.head.appendChild(script);
  } else if (['localhost', '127.0.0.1'].includes(location.hostname)) {
    console.warn('Turnstile is not configured. The form is using the existing Worker submission flow until the migration is complete.');
  }

  function resetVerification() {
    turnstileToken = '';
    if (widgetId !== undefined) window.turnstile?.reset(widgetId);
  }

  function showStatus(message, type) {
    if (!status) return;
    status.hidden = false;
    status.classList.remove('is-success', 'is-error');
    if (type) status.classList.add(`is-${type}`);
    status.textContent = message;
  }

  function clearFieldErrors() {
    form.querySelectorAll('[aria-invalid="true"]').forEach((field) => field.removeAttribute('aria-invalid'));
  }

  if (!endpointConfigured) {
    submitButton.disabled = true;
    showStatus('Request submissions are not configured yet. The site owner needs to add the Cloudflare Worker URL.', 'error');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!endpointConfigured || submitButton.disabled) return;

    clearFieldErrors();

    const data = new FormData(form);
    const discordUsername = String(data.get('discordUsername') || '').trim();
    const discordUserId = String(data.get('discordUserId') || '').trim();
    const minecraftUsername = String(data.get('minecraftUsername') || '').trim();
    const website = String(data.get('website') || '').trim();

    const discordUsernameField = form.elements.discordUsername;
    const discordUserIdField = form.elements.discordUserId;
    const minecraftUsernameField = form.elements.minecraftUsername;

    let firstInvalid = null;

    if (discordUsername.length < 2 || discordUsername.length > 64 || /[\u0000-\u001f\u007f]/.test(discordUsername)) {
      discordUsernameField.setAttribute('aria-invalid', 'true');
      firstInvalid ||= discordUsernameField;
    }

    if (!/^[1-9]\d{14,21}$/.test(discordUserId)) {
      discordUserIdField.setAttribute('aria-invalid', 'true');
      firstInvalid ||= discordUserIdField;
    }

    if (!/^[A-Za-z0-9_]{3,16}$/.test(minecraftUsername)) {
      minecraftUsernameField.setAttribute('aria-invalid', 'true');
      firstInvalid ||= minecraftUsernameField;
    }

    if (firstInvalid) {
      showStatus('Please check the highlighted fields and try again.', 'error');
      firstInvalid.focus();
      return;
    }

    if (turnstileEnabled && !turnstileToken) {
      showStatus('Please complete the verification before sending your request.', 'error');
      return;
    }

    const originalLabel = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = 'Sending…';
    showStatus('Sending your whitelist request…');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discordUsername, discordUserId, minecraftUsername, website,
          ...(turnstileEnabled ? { turnstileToken } : {}) })
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch (_) {}

      if (!response.ok || payload?.ok === false) {
        const error = new Error('Request failed');
        error.code = payload?.code;
        throw error;
      }

      form.reset();
      showStatus('Request sent! We’ll contact you on Discord once your whitelist request has been reviewed.', 'success');
      submitButton.textContent = 'Request Sent';
    } catch (error) {
      const messages = {
        already_submitted: 'A whitelist request has already been submitted for that Discord account or Minecraft username.',
        not_configured: 'The request system has a server configuration problem. Please contact staff through Discord; changing your browser or VPN will not fix it.',
        storage_unavailable: 'The request database is temporarily unavailable. Please try again later or contact staff through Discord.',
        verification_unavailable: 'The verification service is temporarily unavailable. Please wait a moment, then complete verification again and retry.',
        verification_failed: 'The verification expired or could not be confirmed. Please complete it again and retry.',
        delivery_failed: 'Your request could not be delivered to Discord. Please try again later or contact staff through Discord.',
        delivery_uncertain: 'Your request may have reached staff. Please contact us through Discord before trying again so we can check it.'
      };
      showStatus(messages[error.code] || 'We could not send your request right now. Please try again in a moment, or contact us through the Jelly’s Space Discord.', 'error');
      submitButton.disabled = false;
      submitButton.textContent = originalLabel;
    } finally {
      resetVerification();
    }
  });
})();
