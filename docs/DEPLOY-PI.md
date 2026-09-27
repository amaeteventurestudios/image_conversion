# Deploying to pi-node-01 at images.amaete.com

Target: Raspberry Pi 4 (4 GB), Debian 13 (trixie), arm64, LAN address 192.168.6.235.

## Recommended setup: private, over Tailscale

```
your devices ──(Tailscale)──▶ pi-node-01 ── Caddy :443 (HTTPS) ──▶ Images :3000 (localhost only)
```

- `images.amaete.com` points at the Pi's **Tailscale** address (100.x.y.z). It only works on
  devices signed in to your tailnet (your iMac, iPhone, etc.). The internet can't reach it.
- Caddy gets a real Let's Encrypt certificate with a DNS challenge, so it works even though
  the address is private.
- The app's own login still applies on top of that.

If you later need access from devices that aren't on Tailscale, see the
[Cloudflare Tunnel option](#option-public-access-via-cloudflare-tunnel) at the end.

---

## 1. Put the Pi on your tailnet

pi-node-01 isn't in your Tailscale machine list yet. On the Pi:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --ssh
tailscale ip -4          # note this 100.x.y.z address
```

Approve the machine in the Tailscale admin console if asked, and consider
**Disable key expiry** for it (Machines → pi-node-01 → ⋯) so it doesn't drop off after 180 days.

## 2. DNS record for images.amaete.com

At whoever hosts DNS for amaete.com (Cloudflare, Namecheap, etc.), add:

| Type | Name   | Value                     | Proxy (Cloudflare only) |
|------|--------|---------------------------|-------------------------|
| A    | images | *Pi's 100.x.y.z address*  | **DNS only** (grey cloud) |

The address is only routable inside your tailnet, so publishing it reveals nothing useful.

## 3. Install and run the app

### Option A — Docker (simplest to update)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

git clone <your-repo-url> /opt/images && cd /opt/images
cp .env.example .env            # defaults are fine; CONCURRENCY=2 suits a Pi 4
mkdir -p data && sudo chown 1000:1000 data   # container runs as uid 1000 (node); Docker would create it root-owned
docker compose up -d --build    # first build on a Pi takes a few minutes
docker compose exec images node_modules/.bin/tsx server/cli.ts create amaete
```

### Option B — Native Node + systemd

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git

sudo useradd --system --home /opt/images --shell /usr/sbin/nologin images
sudo git clone <your-repo-url> /opt/images
sudo chown -R images:images /opt/images
cd /opt/images
sudo -u images cp .env.example .env
sudo -u images npm ci
sudo -u images npm run build
sudo -u images npm run user -- create amaete

sudo cp deploy/images.service /etc/systemd/system/
sudo systemctl enable --now images
journalctl -u images -f        # should say "listening on http://127.0.0.1:3000"
```

Either way the app listens only on `127.0.0.1:3000`.

## 4. HTTPS with Caddy

Caddy needs a DNS plugin for your DNS provider to issue the certificate. For Cloudflare:

1. Create an API token in Cloudflare: *My Profile → API Tokens → Create Token →
   "Edit zone DNS"*, limited to the `amaete.com` zone.
2. Install Caddy with the plugin:

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
sudo caddy add-package github.com/caddy-dns/cloudflare
```

3. Configure and start:

```bash
sudo cp /opt/images/deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl edit caddy
#   add:
#   [Service]
#   Environment=CLOUDFLARE_API_TOKEN=your-token-here
sudo systemctl restart caddy
journalctl -u caddy -f          # watch for "certificate obtained successfully"
```

If amaete.com's DNS is **not** on Cloudflare, swap the plugin for your provider
(list: https://caddyserver.com/docs/modules/ — search "dns.providers") and change the
`dns cloudflare` line in the Caddyfile to match.

## 5. Use it

From any device on your tailnet, open **https://images.amaete.com** and sign in.

## Updating

```bash
cd /opt/images && git pull
docker compose up -d --build                           # Docker
# or: sudo -u images npm ci && sudo -u images npm run build && sudo systemctl restart images
```

## Backups

Only `data/app.db` matters (user + sessions). Images are temporary by design.

## Troubleshooting

- **Site doesn't load**: check `tailscale status` on both devices; `dig images.amaete.com` should return the Pi's 100.x address.
- **Certificate errors**: `journalctl -u caddy` usually names the DNS/token problem.
- **"Session expired" right after login over plain HTTP**: expected if COOKIE_SECURE=true; use HTTPS or leave it on `auto`.
- **Slow AVIF**: AVIF encoding is CPU-heavy on a Pi. WebP is much faster and is the default.
- **Forgot password**: `npm run user -- reset-password amaete` (or the `docker compose exec` form in the README).

---

## Alternative: no custom domain

Skip steps 2 and 4 and run `sudo tailscale serve --bg 3000` on the Pi. Tailscale gives you
`https://pi-node-01.<your-tailnet>.ts.net` with a certificate automatically. This is the least setup,
but it doesn't use images.amaete.com.

## Option: public access via Cloudflare Tunnel

If you need it reachable without Tailscale (e.g. a work laptop), use a Cloudflare Tunnel
(`cloudflared`) pointing `images.amaete.com` at `http://127.0.0.1:3000`, and put
Cloudflare Access (free for up to 50 users) in front so only your email can reach the login page.
The app's login still applies. This requires amaete.com's DNS to be on Cloudflare.
