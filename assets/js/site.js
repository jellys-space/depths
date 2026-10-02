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

  // A small pool allows overlapping clicks without rewinding an active sound.
  // Playback starts only inside trusted gestures. Ordinary page links allow a
  // bounded sound attack before unloading; failed audio releases them immediately.
  const scriptUrl = document.currentScript?.src || new URL('assets/js/site.js', location.href).href;
  const audioPool = Array.from({ length: 5 }, (_, index) => {
    const audio = document.createElement('audio');
    audio.preload = index === 0 ? 'auto' : 'none';
    audio.volume = 0.65;
    // Keep the original sound wherever OGG is supported. MP3 is a stereo fallback.
    for (const [file, type] of [['click.ogg', 'audio/ogg'], ['click.mp3', 'audio/mpeg']]) {
      const source = document.createElement('source');
      const soundUrl = new URL('../sounds/' + file, scriptUrl);
      if (file === 'click.mp3') soundUrl.searchParams.set('v', 'stereo-320k');
      source.src = soundUrl.href;
      source.type = type;
      audio.appendChild(source);
    }
    return audio;
  });
  const clickableSelector = 'a[href], button:not([disabled]), summary, [role="button"]:not([aria-disabled="true"]), input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])';
  function playClickSound(event) {
    if (!event.isTrusted || !event.target.closest?.(clickableSelector)) return;
    const audio = audioPool.find((item) => item.paused || item.ended);
    if (!audio) return;
    try {
      if (audio.readyState > 0) audio.currentTime = 0;
      const sound = { audio, failed: false };
      sound.playback = Promise.resolve(audio.play()).then(() => true, () => {
        sound.failed = true;
        return false;
      });
      return sound;
    } catch (_) { /* Sound is optional feedback; UI actions always proceed. */ }
  }
  let touchActivation = false;
  let pointerSound = null;
  const activationSounds = new WeakMap();
  document.addEventListener('pointerdown', (event) => {
    touchActivation = event.pointerType === 'touch';
    pointerSound = null;
    if (event.pointerType !== 'touch' && event.button === 0) {
      pointerSound = { control: event.target.closest?.(clickableSelector), sound: playClickSound(event) };
    }
  }, { capture: true, passive: true });
  // A trusted click is a supported activation gesture on iOS, including taps.
  document.addEventListener('click', (event) => {
    if (!event.isTrusted) return;
    const control = event.target.closest?.(clickableSelector);
    const sound = touchActivation || event.pointerType === 'touch' || event.detail === 0 || pointerSound?.control !== control
      ? playClickSound(event) : pointerSound?.sound;
    if (sound) activationSounds.set(event, sound);
    pointerSound = null;
  }, { capture: true, passive: true });

  let cancelPendingNavigation = null;
  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[href]');
    if (!event.isTrusted || !link || event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
        link.hasAttribute('download') || (link.target && link.target.toLowerCase() !== '_self')) return;
    const destination = new URL(link.href);
    if (destination.origin !== location.origin || !['http:', 'https:', 'file:'].includes(destination.protocol)) return;
    if (destination.pathname === location.pathname && destination.search === location.search && destination.hash) return;

    cancelPendingNavigation?.();
    const sound = activationSounds.get(event);
    if (!sound || sound.failed || sound.audio.ended) return;
    event.preventDefault();
    let finished = false;
    let playbackTimer;
    const cleanup = () => {
      window.clearTimeout(deadlineTimer);
      window.clearTimeout(playbackTimer);
      sound.audio.removeEventListener('ended', navigate);
      sound.audio.removeEventListener('error', navigate);
      cancelPendingNavigation = null;
    };
    const navigate = () => {
      if (finished) return;
      finished = true;
      cleanup();
      window.location.assign(destination.href);
    };
    // Never wait indefinitely for a decoder, network load or autoplay permission.
    const deadlineTimer = window.setTimeout(navigate, 300);
    cancelPendingNavigation = () => { finished = true; cleanup(); };
    sound.audio.addEventListener('ended', navigate, { once: true });
    sound.audio.addEventListener('error', navigate, { once: true });
    sound.playback.then((started) => {
      if (finished) return;
      if (!started) { navigate(); return; }
      // Both files retain the original attack. Count playback that already
      // happened while the pointer was down, allowing the main click to finish.
      const audibleWindowMs = 220;
      const waitForAttack = () => {
        if (finished) return;
        const remainingMs = Math.max(0, audibleWindowMs - sound.audio.currentTime * 1000);
        if (remainingMs === 0) navigate();
        else playbackTimer = window.setTimeout(waitForAttack, Math.max(10, remainingMs));
      };
      waitForAttack();
    });
  });

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
    try { localStorage.setItem('depths-theme', next); } catch (_) {}
    updateThemeButton();
  });

  menuButton?.addEventListener('click', () => {
    const open = nav?.classList.toggle('is-open') ?? false;
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  });

  nav?.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      nav.classList.remove('is-open');
      menuButton?.setAttribute('aria-expanded', 'false');
      menuButton?.setAttribute('aria-label', 'Open navigation');
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && nav?.classList.contains('is-open')) {
      nav.classList.remove('is-open');
      menuButton?.setAttribute('aria-expanded', 'false');
      menuButton?.setAttribute('aria-label', 'Open navigation');
      menuButton?.focus();
    }
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

  document.querySelector('[data-slide-previous]')?.addEventListener('click', () => showSlide(activeIndex - 1, true));
  document.querySelector('[data-slide-next]')?.addEventListener('click', () => showSlide(activeIndex + 1, true));

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
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    showSlide(activeIndex + (event.key === 'ArrowRight' ? 1 : -1), true);
  });

  showSlide(0);
  startAutoplay();
})();
