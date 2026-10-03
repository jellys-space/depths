# Depths & Beyond website

Static HTML/CSS/JavaScript site for `https://depths.jellys-space.vip`, designed for GitHub Pages.

## Files you will edit most often

- `index.html` — homepage copy, calls to action and slideshow markup.
- `faq/index.html` — FAQ content (`/faq/`).
- `guide/index.html` — guide content and ready-to-copy video embed markup (`/guide/`).
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

The form keeps its Discord Username, numeric Discord User ID, Minecraft Username, validation, honeypot and Discord ID help. Configuring the public `depths-turnstile-site-key` meta value activates a Managed Turnstile widget and sends its single-use token. While `REPLACE_WITH_PUBLIC_TURNSTILE_SITE_KEY` remains, the form keeps the old submission flow and does not load the widget. Once configured, verification failures do not fall back to unverified submission.

The new Worker verifies Turnstile's success, hostname and action before an atomic D1 insertion. UNIQUE constraints permanently protect Discord ID and lowercase Minecraft username. A duplicate returns `already_submitted` and a friendly message without disclosing which identifier matched. There is no cooldown, expiry, fingerprinting or browser-based security. Successful Discord delivery retains the record permanently; definite rejection releases it; ambiguous delivery stays reserved for staff review.

**Safe order:** ship this redesign with the placeholder and old Worker first; create Turnstile and D1, apply the SQL, add `DB` and the two secrets; publish the real public site key and wait for Pages; then replace the existing Worker's dashboard code. Follow the [complete dashboard guide](cloudflare-worker/README.md), including staging tests and historical-record import if required. No production secrets or deployment are supplied by this repository.

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

All routes use the supplied `assets/images/minecraft-world-bg.png` once on a stationary CSS layer: zoomed to fill the viewport, top-aligned below the header, and darkened/tinted for text contrast. Content scrolls over this single world composition; the wallpaper never repeats. The fixed layer belongs to the root element, outside the scrolling body, and spans the full viewport with a large-viewport minimum height to avoid clipping when mobile browser bars collapse. Only the image is offset below the header. This uses no `background-attachment: fixed` or scroll animation scripts. Dark mode is primary; the light theme uses pale stone surfaces and its own contrast values. Local Minecraft and Share Tech fonts, cursors, logos, screenshots, OG metadata and Discord embed are preserved.

Navigation, game-style buttons, cards, guide/code panels and the application menu use hard corners, bevels, inset slots and stone/moss/gold accents. The footer stays in document flow so it cannot cover mobile content. The homepage logo uses a responsive 240–360px desktop width and a smaller mobile range. Pixel SVG icons are decorative; headings and copy carry their meaning.

## Slideshow

The twelve responsive screenshots retain their in-place crossfade and independent slow cinematic zoom. Each figure fills the 16:9 viewport with zero margin. Square previous/next controls, dots with 44px touch targets, left/right keyboard controls and swipes all use the same wraparound/manual navigation behaviour and restart autoplay. Reduced motion disables autoplay and the zoom's visible motion. Hover/focus pauses autoplay until manual navigation or leaving the gallery.

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
