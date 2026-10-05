# Depths & Beyond website

Static HTML/CSS/JavaScript site for `https://depths.jellys-space.vip`, designed for GitHub Pages.

## Files you will edit most often

- `index.html` — homepage copy, calls to action, YouTube embed and slideshow markup.
- `faq/index.html` — FAQ content (`/faq/`).
- `guide/index.html` — installation instructions and screenshots (`/guide/`).
- `request-access/index.html` — whitelist request form (`/request-access/`).
- `discord-embed.json` — Discord Components V2 link preview.
- `assets/css/site.css` — all site styling.
- `assets/js/site.js` — theme toggle, mobile navigation and slideshow behavior.
- `assets/js/request-access.js` — Request Access form submission and validation.

## Modpack download link

The modpack link intentionally points back to the homepage for now.

When the Google Drive download is ready, open `discord-embed.json` and change the URL on the button labeled `Download Modpack`:

```json
{
  "type": 2,
  "style": 5,
  "url": "YOUR_GOOGLE_DRIVE_URL_HERE",
  "label": "Download Modpack"
}
```

There is also a placeholder `Download Modpack` button near the bottom of `index.html`; change its `href` if you want the visible website button to use the same link.

## Discord component embed

All main pages include:

```html
<link rel="discord:component-embed" type="application/json" href="https://depths.jellys-space.vip/discord-embed.json">
```

`discord-embed.json` contains a Components V2 Container with:

- server icon as the thumbnail;
- logo as the large Media Gallery image;
- Visit Website button;
- Download Modpack button;
- Guide button;
- Request Access button.

Standard Open Graph metadata is also present as a fallback.


## Request Access and Cloudflare

The existing public Worker endpoint in `request-access/index.html` is retained. The version-controlled module Worker, D1 migration, example Wrangler configuration and dashboard setup guide live in [cloudflare-worker/](cloudflare-worker/README.md). The Discord webhook URL and Turnstile secret belong only in Cloudflare's encrypted Worker secrets; never put them in the website or Git.

The form keeps its Discord Username, numeric Discord User ID, Minecraft Username, validation, honeypot and Discord ID help. The production public `depths-turnstile-site-key` is configured, activating the Managed Turnstile widget and sending its single-use token. Verification failures do not fall back to unverified submission.

The new Worker verifies Turnstile's success, hostname and action before an atomic D1 insertion. UNIQUE constraints permanently protect Discord ID and lowercase Minecraft username. A duplicate returns `already_submitted` and a friendly message without disclosing which identifier matched. There is no cooldown, expiry, fingerprinting or browser-based security. Successful Discord delivery retains the record permanently; definite rejection releases it; ambiguous delivery stays reserved for staff review.

**Production setup completed on 5 October 2026:** Turnstile and D1 are configured, the schema is applied, `DB` and both encrypted secrets are present, the public site key is live, and the existing Worker's dashboard code is deployed. The production repair accepts Discord Canary/PTB webhook URLs and uses Cloudflare-compatible manual redirect handling for both external requests. The live widget, configuration health and CORS preflight were checked; a deliberately invalid live token now returns `verification_failed`, and all 32 offline tests passed. The owner confirmed a live submission showed “Request sent” and arrived in Discord. Follow the [complete dashboard guide](cloudflare-worker/README.md) for maintenance, staging checks and historical-record import if required. Production secrets remain outside this repository.

## GitHub Pages

1. Put the contents of this folder at the root of the GitHub repository.
2. In GitHub, enable Pages for the repository/branch you want to publish.
3. The included `CNAME` file is already set to `depths.jellys-space.vip`.
4. Configure the required DNS record for your GitHub Pages setup.

The `.nojekyll` file keeps GitHub Pages from applying Jekyll processing.

## Images

The twelve supplied 3839×2159 PNG screenshots were converted into responsive WebP versions:

- `*-1920.webp` for larger screens;
- `*-960.webp` for phones/smaller displays.

The slideshow uses `srcset` so browsers can choose the smaller file when appropriate. Only optimized WebPs are used by the website; newly supplied original PNGs are preserved locally and are not included in the deployment commit.

## Fonts

- Minecraft font: supplied as Public Domain in `assets/fonts/Minecraft-font-info.txt`.
- Share Tech: supplied under SIL Open Font License 1.1 in `assets/fonts/OFL-ShareTech.txt`.

The site uses WOFF2 subsets for normal page delivery while retaining the supplied originals and license files.


## Visual design and background

All routes use the supplied `assets/images/minecraft-world-bg.png` as one stationary world composition: zoomed to fill the viewport, top-aligned below the header, and darkened/tinted for text contrast. The wallpaper never repeats. Desktop uses a fixed root pseudo-element. At narrow widths and on touch devices (including landscape), the wallpaper paints directly on the document canvas to avoid Safari clipping fixed layers above its floating toolbar. A passive scroll listener schedules at most one frame to offset the image by the current scroll position, keeping the composition visually stationary; there is no idle animation loop. Large-viewport units keep its scale stable as browser bars move. Without JavaScript, mobile uses one image covering the document. This uses no `background-attachment: fixed`. Dark mode is primary; the light theme uses pale stone surfaces and its own contrast values. Local Minecraft and Share Tech fonts, cursors, logos, screenshots, OG metadata and Discord embed are preserved.

Navigation, game-style buttons, cards, guide/code panels and the application menu use hard corners, bevels, inset slots and stone/moss/gold accents. On desktop (above 820px), the footer stays fixed at the bottom of the screen so its copyright text is always visible. Its measured height reserves space at the end of the page, including when text wraps or fonts resize. On mobile, the footer stays in document flow. The homepage logo uses a responsive 240–360px desktop width and a smaller mobile range. Pixel SVG icons are decorative; headings and copy carry their meaning.

## Slideshow

The twelve responsive screenshots retain their in-place crossfade and independent slow cinematic zoom. Each figure fills the 16:9 viewport with zero margin. Square previous/next controls with at least 44px touch targets, left/right keyboard controls and swipes all use the same wraparound/manual navigation behaviour and restart autoplay. Reduced motion disables autoplay and the zoom's visible motion. Hover/focus pauses autoplay until manual navigation or leaving the gallery.

The homepage embeds `5j0u4T3r1qU` from YouTube below the coming-soon text, in the same bevelled frame as the gallery. It is centered at up to 720px wide, uses a responsive player with a 200px minimum height, loads lazily from `youtube-nocookie.com`, and supports inline playback and fullscreen. The installation guide uses written steps and screenshots.

## UI sounds

`assets/js/site.js` uses five independent HTMLAudio slots so rapid interactions can overlap. Playback is attempted only from trusted mouse/pen, touch-click or keyboard activation gestures. Ordinary same-tab links to this site allow 220ms of playback so the main click finishes before the page unloads, counting playback since pointer-down. A 300ms hard deadline bounds audio loading; blocked/failed audio releases navigation immediately. Hash links, modified clicks, downloads and new-tab links keep their native behaviour. The quiet tail may still end when the page unloads.

The unchanged original `assets/sounds/click.ogg` is offered first wherever OGG is supported. `click.mp3` is a direct 320kbps stereo conversion of that OGG using VLC's MP3 encoder, with no manual trimming, channel removal, equalization or gain changes. The fallback preserves the original's channel levels; its versioned URL avoids reusing the earlier quiet MP3 from browser caches. No external sound or library was added. Browser autoplay restrictions still apply.

## Local verification

Serve this repository root on port 8000 (for example, `python -m http.server 8000`) and visit `http://localhost:8000/`. Check the homepage, FAQ, guide, Request Access and 404 at desktop and phone widths in both themes. Keep automated form requests mocked or use a staging Worker with a dedicated test Discord webhook; never send automated tests to production.

Run offline security tests with Node 22.13+ / 24+:

```sh
node --test cloudflare-worker/worker.test.mjs
```

They use in-memory SQLite and mocked HTTP, with no install/build step for the website.

## Clean URLs

The public routes use folder-style URLs so visitors see `/faq/`, `/guide/`, and `/request-access/` rather than `.html` filenames. Legacy `faq.html`, `guide.html`, and `request-access.html` files are retained only as redirects for old links/bookmarks. Internal navigation points to the clean routes.
