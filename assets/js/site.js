(() => {
  // Keep canonical folder-style URLs even if someone explicitly opens index.html.
  if (/\/index\.html$/i.test(window.location.pathname)) {
    const cleanPath = window.location.pathname.replace(/index\.html$/i, '');
    window.history.replaceState(null, '', `${cleanPath}${window.location.search}${window.location.hash}`);
  }

  const root = document.documentElement;
  const themeButton = document.querySelector('[data-theme-toggle]');
  const menuButton = document.querySelector('[data-menu-toggle]');
  const nav = document.querySelector('[data-site-nav]');

  const footer = document.querySelector('.site-footer');

  // Global UI click sound. Resolve it relative to this script so it works
  // on GitHub Pages, localhost, and when the HTML is opened directly.
  const siteScriptUrl = document.currentScript?.src;
  const clickSoundUrl = siteScriptUrl
    ? new URL('../sounds/click.ogg', siteScriptUrl).href
    : 'assets/sounds/click.ogg';
  const clickSound = new Audio(clickSoundUrl);
  clickSound.preload = 'auto';
  clickSound.volume = 0.65;

  const clickableSelector = [
    'a[href]',
    'button:not([disabled])',
    '[role="button"]:not([aria-disabled="true"])',
    'input:not([type="hidden"]):not([disabled])',
    'textarea:not([disabled])',
    'select:not([disabled])'
  ].join(', ');

  function playClickSound() {
    try {
      clickSound.currentTime = 0;
      const playback = clickSound.play();
      if (playback && typeof playback.catch === 'function') playback.catch(() => {});
    } catch (_) {
      // Audio should never block the underlying interaction.
    }
  }

  // Fire as soon as the pointer is pressed. This makes navigation links audible
  // before the browser leaves the page, and also covers the Request Access fields.
  document.addEventListener('pointerdown', (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const control = event.target.closest?.(clickableSelector);
    if (!control) return;
    playClickSound();
  }, true);

  // Keyboard activation (Enter/Space) produces a click without a pointerdown.
  document.addEventListener('click', (event) => {
    const control = event.target.closest?.(clickableSelector);
    if (!control) return;

    if (event.detail === 0) {
      playClickSound();
    }

    // Same-tab navigation destroys the current document (and its Audio object), so
    // wait for the click sound to finish before leaving the page. Pointer users
    // have already started the sound on pointerdown; keyboard activation starts it
    // above, so we only wait for whatever duration remains. Modified clicks,
    // downloads, hash links, and links that open elsewhere behave normally.
    if (!(control instanceof HTMLAnchorElement)) return;
    if (event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (control.hasAttribute('download')) return;
    if (control.target && control.target.toLowerCase() !== '_self') return;

    const href = control.getAttribute('href');
    if (!href || href.startsWith('#')) return;

    event.preventDefault();

    const navigate = () => {
      window.location.href = control.href;
    };

    const duration = Number.isFinite(clickSound.duration) ? clickSound.duration : 0;
    const currentTime = Number.isFinite(clickSound.currentTime) ? clickSound.currentTime : 0;
    // The bundled click.ogg is ~0.41 s long. If metadata is not ready yet,
    // use a safe fallback so the tail is still audible on first navigation.
    const remainingMs = duration > 0
      ? Math.max(0, (duration - currentTime) * 1000) + 35
      : 460;

    window.setTimeout(navigate, remainingMs);
  });

  function syncFooterHeight() {
    if (!footer) return;
    root.style.setProperty('--footer-height', `${Math.ceil(footer.getBoundingClientRect().height)}px`);
  }

  if (footer) {
    syncFooterHeight();
    window.addEventListener('resize', syncFooterHeight, { passive: true });
    window.addEventListener('load', syncFooterHeight, { once: true });

    if ('ResizeObserver' in window) {
      const footerObserver = new ResizeObserver(syncFooterHeight);
      footerObserver.observe(footer);
    }
  }

  function currentTheme() {
    return root.dataset.theme === 'light' ? 'light' : 'dark';
  }

  function updateThemeButton() {
    if (!themeButton) return;
    const isDark = currentTheme() === 'dark';
    themeButton.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
    themeButton.setAttribute('title', isDark ? 'Switch to light theme' : 'Switch to dark theme');
    themeButton.setAttribute('aria-pressed', String(!isDark));
    const icon = themeButton.querySelector('[data-theme-icon]');
    if (icon) icon.textContent = isDark ? '☀' : '☾';
  }

  updateThemeButton();

  themeButton?.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    localStorage.setItem('depths-theme', next);
    updateThemeButton();
  });

  menuButton?.addEventListener('click', () => {
    const open = nav?.classList.toggle('is-open') ?? false;
    menuButton.setAttribute('aria-expanded', String(open));
  });

  nav?.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      nav.classList.remove('is-open');
      menuButton?.setAttribute('aria-expanded', 'false');
    });
  });

  const copyButtons = [...document.querySelectorAll('[data-copy-button]')];

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('Copy command failed');
  }

  copyButtons.forEach((button) => {
    const block = button.closest('[data-copy-block]');
    const source = block?.querySelector('[data-copy-source]');
    const status = block?.querySelector('[data-copy-status]');
    const originalLabel = button.textContent;
    let resetTimer = null;

    button.addEventListener('click', async () => {
      const text = source?.textContent?.trim();
      if (!text) return;

      if (resetTimer) window.clearTimeout(resetTimer);

      try {
        await copyText(text);
        button.textContent = 'Copied!';
        if (status) status.textContent = 'JVM arguments copied to clipboard.';
      } catch (_) {
        button.textContent = 'Copy failed';
        if (status) status.textContent = 'Could not copy automatically. Select the JVM arguments manually.';
      }

      resetTimer = window.setTimeout(() => {
        button.textContent = originalLabel;
        if (status) status.textContent = '';
      }, 1800);
    });
  });

  const slideshow = document.querySelector('[data-slideshow]');
  if (!slideshow) return;

  const slides = [...slideshow.querySelectorAll('[data-slide]')];
  const dots = [...document.querySelectorAll('[data-slide-dot]')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let activeIndex = 0;
  let timer = null;
  let touchStartX = null;

  function showSlide(index, userInitiated = false) {
    const nextIndex = (index + slides.length) % slides.length;
    if (nextIndex === activeIndex && slides[activeIndex]?.classList.contains('is-active')) {
      if (userInitiated) restartAutoplay();
      return;
    }

    const outgoing = slides[activeIndex];
    const incoming = slides[nextIndex];

    // Keep the outgoing image's cinematic zoom alive while it fades away.
    if (outgoing && outgoing !== incoming) {
      outgoing.classList.add('is-leaving');
      outgoing.classList.remove('is-active');
      outgoing.setAttribute('aria-hidden', 'true');

      window.setTimeout(() => {
        // A rapid manual change can reuse a slide before this timeout fires.
        if (!outgoing.classList.contains('is-active')) {
          outgoing.classList.remove('is-leaving');
        }
      }, 950);
    }

    activeIndex = nextIndex;
    incoming?.classList.remove('is-leaving');
    incoming?.classList.add('is-active');
    incoming?.setAttribute('aria-hidden', 'false');

    slides.forEach((slide, i) => {
      if (i !== activeIndex && slide !== outgoing) {
        slide.classList.remove('is-active');
        slide.setAttribute('aria-hidden', 'true');
      }
    });

    dots.forEach((dot, i) => {
      const active = i === activeIndex;
      dot.classList.toggle('is-active', active);
      dot.setAttribute('aria-current', active ? 'true' : 'false');
    });
    if (userInitiated) restartAutoplay();
  }

  function stopAutoplay() {
    if (timer) window.clearInterval(timer);
    timer = null;
  }

  function startAutoplay() {
    if (reducedMotion || slides.length < 2 || timer) return;
    timer = window.setInterval(() => showSlide(activeIndex + 1), 5600);
  }

  function restartAutoplay() {
    stopAutoplay();
    startAutoplay();
  }

  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => showSlide(index, true));
  });

  slideshow.addEventListener('mouseenter', stopAutoplay);
  slideshow.addEventListener('mouseleave', startAutoplay);
  slideshow.addEventListener('focusin', stopAutoplay);
  slideshow.addEventListener('focusout', startAutoplay);

  slideshow.addEventListener('touchstart', (event) => {
    touchStartX = event.changedTouches[0]?.clientX ?? null;
  }, { passive: true });

  slideshow.addEventListener('touchend', (event) => {
    if (touchStartX === null) return;
    const endX = event.changedTouches[0]?.clientX ?? touchStartX;
    const delta = endX - touchStartX;
    touchStartX = null;
    if (Math.abs(delta) < 45) return;
    showSlide(activeIndex + (delta < 0 ? 1 : -1), true);
  }, { passive: true });

  slideshow.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') showSlide(activeIndex + 1, true);
    if (event.key === 'ArrowLeft') showSlide(activeIndex - 1, true);
  });

  showSlide(0);
  startAutoplay();
})();
