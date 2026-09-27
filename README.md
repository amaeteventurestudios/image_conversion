# Images — Private Image Converter

A small, self-hosted, password-protected web app for batch converting, compressing,
resizing, stripping metadata from and renaming images.

**Upload → Configure → Preview → Convert → Download**

- Drag in one image or a hundred (PNG, JPG, WebP, AVIF, GIF, BMP, TIFF)
- Output WebP (default), AVIF, JPG or PNG with a quality slider
- Real test-encoded size estimates: live for one image, progressive for batches, with totals and savings
- Resize by width, height, exact box or percentage, with upscaling protection
- Strip or preserve metadata
- Keep names, edit them inline, paste a list, or map them with a CSV (template included); names are made web-safe and duplicates are caught before converting
- Download one file, selected files, or everything, directly or as a ZIP
- Username/password login (Argon2id), optional 30/60/90-day trusted devices, session list with sign-out, password change
- Light and dark themes; `noindex` meta, `X-Robots-Tag` and `robots.txt`
- Temporary files live outside any public directory and are deleted automatically (6 h by default)

Image work is done by [sharp](https://sharp.pixelplumbing.com/) (libvips). BMP input is decoded with `bmp-js`
because libvips' prebuilt binaries do not include a BMP loader.

## Quick start (development)

Requires Node.js 20.9+ (22 recommended).

```bash
npm install
npm run user -- create amaete      # prompts for a password (min 10 chars)
npm run dev                        # API on :3000, UI on http://localhost:5173
```

## Production

```bash
npm ci
npm run build
npm run user -- create amaete
npm start                          # serves UI + API on http://127.0.0.1:3000
```

Put it behind HTTPS (Caddy is simplest). For the Raspberry Pi + `images.amaete.com`
setup, follow **[docs/DEPLOY-PI.md](docs/DEPLOY-PI.md)**. A `Dockerfile` and
`docker-compose.yml` are included as well.

Settings are environment variables; see [`.env.example`](.env.example).

## User management / password reset

There is no email, so a forgotten password is reset by whoever can run commands on the server:

```bash
npm run user -- reset-password amaete   # new password + signs out every device
npm run user -- revoke-sessions amaete
npm run user -- list
```

With Docker: `docker compose exec images node_modules/.bin/tsx server/cli.ts reset-password amaete`.

## Project layout

```
server/     Express API: auth, uploads, estimates, conversion, downloads, cleanup
shared/     Filename normalisation, CSV mapping, settings validation (used by both sides)
web/        React + Tailwind single-page UI
deploy/     systemd unit and Caddyfile
docs/       Deployment guide
```

## Security notes

- Every `/api` route except login requires a session; files are only reachable by their owner.
- Session tokens are random 256-bit values; only their SHA-256 is stored. Cookies are `HttpOnly`, `SameSite=Strict`, and `Secure` over HTTPS.
- State-changing requests must come from the app's own origin.
- Login attempts are throttled per IP and username.
- Filenames are sanitised on the server regardless of what the browser sends.
- `noindex`/`nofollow` only discourages search engines; the login is what keeps the tool private.

## Not in V1

AI naming, saved presets, visual before/after comparison, cropping and watermarking (see the spec's "Later / Optional").
