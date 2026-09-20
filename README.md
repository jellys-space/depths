# Depths & Beyond website

Static HTML/CSS/JavaScript site for `https://depths.jellys-space.vip`, designed for GitHub Pages.

## Files you will edit most often

- `index.html` — homepage copy, calls to action and slideshow markup.
- `faq.html` — FAQ content.
- `guide.html` — guide content and ready-to-copy video embed markup.
- `request-access.html` — whitelist request form.
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
- Guide button.

Standard Open Graph metadata is also present as a fallback.


## Request Access webhook

The Request Access page is static, but submissions are relayed through the separate Cloudflare Worker included beside this website folder. **Never put the Discord webhook URL in this repository or in browser-side JavaScript.**

After deploying the Worker, open `request-access.html` and change:

```html
<meta name="depths-access-endpoint" content="https://REPLACE-WITH-YOUR-WORKER.workers.dev/">
```

to the public URL Cloudflare gives your Worker. The browser sends only the three form fields to that Worker. The Worker keeps the Discord webhook URL secret and posts the final embed to Discord.

The form asks for:

- Discord Username
- Discord User ID
- Minecraft Username

The Discord User ID is rendered by the webhook as `<@USER_ID>` so Discord can resolve the account directly in the whitelist request.

## GitHub Pages

1. Put the contents of this folder at the root of the GitHub repository.
2. In GitHub, enable Pages for the repository/branch you want to publish.
3. The included `CNAME` file is already set to `depths.jellys-space.vip`.
4. Configure the required DNS record for your GitHub Pages setup.

The `.nojekyll` file keeps GitHub Pages from applying Jekyll processing.

## Images

The seven supplied 3839×2159 PNG screenshots were converted into responsive WebP versions:

- `*-1920.webp` for larger screens;
- `*-960.webp` for phones/smaller displays.

The slideshow uses `srcset` so browsers can choose the smaller file when appropriate.

## Fonts

- Minecraft font: supplied as Public Domain in `assets/fonts/Minecraft-font-info.txt`.
- Share Tech: supplied under SIL Open Font License 1.1 in `assets/fonts/OFL-ShareTech.txt`.

The site uses WOFF2 subsets for normal page delivery while retaining the supplied originals and license files.


## Visual notes

The default dark palette uses warm deepslate/stone, moss, torchlight gold, and a small End-purple accent rather than the earlier blue UI palette. The homepage slideshow uses a lightweight CSS transform for a slow cinematic zoom after each slide settles into view. `prefers-reduced-motion` disables the effect automatically.


## Slideshow

Each `<figure class="slide">` is explicitly reset to zero margin and fills the complete 16:9 slideshow viewport. The slide layer handles the entrance transition; the `<img>` inside handles the independent cinematic push-in. This keeps every screenshot fitted to the frame throughout the transition.


### Slideshow transition
The homepage gallery uses an in-place crossfade with a continuous slow cinematic zoom. Slides never translate horizontally, which prevents exposed edges during transitions.


### v7
- Reduced the 404-page logo to a compact, viewport-aware size and reduced its intrinsic HTML dimensions so it cannot flash at full source size while styles load.
