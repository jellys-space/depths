(() => {
  const form = document.querySelector('[data-access-form]');
  if (!form) return;

  const submitButton = form.querySelector('[data-access-submit]');
  const status = form.querySelector('[data-access-status]');
  const endpoint = document.querySelector('meta[name="depths-access-endpoint"]')?.content?.trim() || '';
  const endpointConfigured = endpoint && !endpoint.includes('REPLACE-WITH-YOUR-WORKER');

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

    if (discordUsername.length < 2 || discordUsername.length > 64) {
      discordUsernameField.setAttribute('aria-invalid', 'true');
      firstInvalid ||= discordUsernameField;
    }

    if (!/^\d{15,22}$/.test(discordUserId)) {
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

    const originalLabel = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = 'Sending…';
    showStatus('Sending your whitelist request…');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discordUsername, discordUserId, minecraftUsername, website })
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch (_) {}

      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || `Request failed with status ${response.status}`);
      }

      form.reset();
      showStatus('Request sent! We’ll contact you on Discord once your whitelist request has been reviewed.', 'success');
      submitButton.textContent = 'Request Sent';
    } catch (error) {
      console.error('Whitelist request failed:', error);
      showStatus('We could not send your request right now. Please try again in a moment, or contact us through the Jelly’s Space Discord.', 'error');
      submitButton.disabled = false;
      submitButton.textContent = originalLabel;
    }
  });
})();
