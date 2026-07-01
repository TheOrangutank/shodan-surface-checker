# Attack Surface Checker

A simple personal web app that uses the [Shodan API](https://developer.shodan.io/api) to check what the internet can see about your domain or IP address.

Built with **Next.js** — one project, free to host on Vercel, API key kept server-side.

## What it does

- **Monitoring dashboard** — saves domains/IPs you want to watch in Supabase
- **Cached results** — dashboard loads from the database and does not call Shodan until you click refresh
- **Per-asset refresh** — query one domain/IP at a time to protect your Shodan API cap
- **Edit / rename / delete** — update monitored targets, labels, or remove entries
- **Domain scan** — lists subdomains Shodan has indexed for a domain
- **IP scan** — shows open ports, services, and highlights risky exposures (RDP, Telnet, databases, etc.)
- **Account info** — displays your Shodan plan and remaining query credits

## Prerequisites

1. [Node.js 18+](https://nodejs.org/) installed
2. A [Shodan account](https://account.shodan.io/) and API key
3. A free [Supabase](https://supabase.com) project

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Create your local env file
cp .env.example .env.local

# 3. Edit .env.local — replace every placeholder (see Configuration checklist below)

# 4. Generate auth secrets
openssl rand -base64 48  # use once for SESSION_SECRET
openssl rand -base64 48  # use once for PASSKEY_SETUP_TOKEN

# 5. Run both SQL migrations in supabase/migrations/ inside your Supabase SQL editor

# 6. Start the dev server
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

For passkey login in local dev, set `APP_ORIGIN=http://localhost:3000` and `RP_ID=localhost` in `.env.local`. For production, use your HTTPS domain instead.

## Configuration checklist

Copy [`.env.example`](.env.example) to `.env.local` and replace **all** placeholder values before the app will work. The server rejects unconfigured placeholders at runtime.

| Variable | Set in | Required for | Example value | Notes |
|----------|--------|--------------|---------------|-------|
| `SHODAN_API_KEY` | `.env.local` | Domain/IP scans, profile panel | `abc123...` | From [account.shodan.io](https://account.shodan.io/). Server-side only. |
| `SUPABASE_URL` | `.env.local` | Dashboard, auth, rate limits | `https://xyz.supabase.co` | Project URL from Supabase dashboard → Settings → API. |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` | Dashboard, auth, rate limits | `eyJ...` | Service role key (same page). **Never expose to the browser.** |
| `APP_ORIGIN` | `.env.local` | Passkeys, CSRF, session cookies | `https://your-domain.example.com` | Full public URL with scheme, no trailing slash. |
| `RP_ID` | `.env.local` | Passkey registration and login | `your-domain.example.com` | Hostname only. **Must match the hostname in `APP_ORIGIN`.** |
| `SESSION_SECRET` | `.env.local` | Signed sessions and CSRF tokens | output of `openssl rand -base64 48` | Minimum 32 characters. |
| `PASSKEY_SETUP_TOKEN` | `.env.local` | First-time passkey setup at `/setup-passkey` | output of `openssl rand -base64 48` | One-time gate; sent in the setup form header. |
| `ALLOW_PASSKEY_REENROLL` | `.env.local` | Optional re-registration | `false` | Leave `false` after first passkey. Set `true` only to enroll again (e.g. new domain). |

**`APP_ORIGIN` vs `RP_ID`:** if `APP_ORIGIN=https://dashboard.example.com`, then `RP_ID=dashboard.example.com`. If you change your public domain after enrolling a passkey, you must set `ALLOW_PASSKEY_REENROLL=true`, visit `/setup-passkey` again, and register a new passkey for the new `RP_ID`.

## Supabase setup

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Open the SQL editor
3. Run [`supabase/migrations/001_monitored_assets.sql`](supabase/migrations/001_monitored_assets.sql)
4. Run [`supabase/migrations/002_auth_security.sql`](supabase/migrations/002_auth_security.sql)
5. Copy your project URL and service role key into `.env.local` as `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`

The dashboard reads cached rows from Supabase on load. Shodan is only queried when you click `[ REFRESH ]` on a specific monitored asset.

## First-time passkey setup

This app is a single-admin dashboard protected by passkeys. After configuring `.env.local`:

1. Deploy or run the app at the URL matching your `APP_ORIGIN`
2. Visit `https://your-domain.example.com/setup-passkey` (or `http://localhost:3000/setup-passkey` for local dev)
3. Enter your `PASSKEY_SETUP_TOKEN` value
4. Register a passkey (for example, from a synced password manager)
5. Sign in at `/login`

After the first passkey is enrolled, registration is closed unless `ALLOW_PASSKEY_REENROLL=true`.

Passkeys require HTTPS on your public domain. If you run behind nginx or another reverse proxy, make sure the proxy preserves the public host and HTTPS scheme.

## Local development vs production

| Environment | `APP_ORIGIN` | `RP_ID` | Notes |
|-------------|--------------|---------|-------|
| Local dev | `http://localhost:3000` | `localhost` | Passkeys work on localhost in modern browsers. |
| Production | `https://your-domain.example.com` | `your-domain.example.com` | HTTPS required. Match your real public URL exactly. |

All other env vars (`SHODAN_API_KEY`, Supabase keys, secrets) are the same in both environments — only the origin/RP ID pair changes.

## Project structure

```
src/
  app/
    page.tsx              ← main UI
    api/assets/          ← monitored asset CRUD
    api/auth/            ← passkey login, setup, session, logout
    api/shodan/
      profile/route.ts    ← your Shodan account info
      domain/route.ts     ← subdomain lookup
      host/route.ts       ← IP / port lookup
  components/
    AssetDashboard.tsx
    DomainScanner.tsx
    HostScanner.tsx
  lib/
    assets.ts             ← monitored asset persistence + refresh logic
    auth.ts               ← sessions, CSRF, passkey config
    db.ts                 ← server-side Supabase client
    shodan.ts             ← Shodan API calls (server-side only)
supabase/
  migrations/
    001_monitored_assets.sql
    002_auth_security.sql
```

Your Shodan API key and Supabase service role key live in `.env.local` and are only read by server-side code. They never reach the browser.

## Deploy on Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → Import project
3. Add environment variables (replace placeholders with your real values):

   | Variable | Value |
   |----------|-------|
   | `SHODAN_API_KEY` | Your Shodan API key |
   | `SUPABASE_URL` | Your Supabase project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key |
   | `APP_ORIGIN` | `https://your-domain.example.com` |
   | `RP_ID` | `your-domain.example.com` |
   | `SESSION_SECRET` | Long random secret (`openssl rand -base64 48`) |
   | `PASSKEY_SETUP_TOKEN` | Long random one-time setup token |
   | `ALLOW_PASSKEY_REENROLL` | `false` |

4. Deploy, then complete [first-time passkey setup](#first-time-passkey-setup) on your Vercel URL

## Optional: self-hosted behind nginx

If you run on your own VPS instead of Vercel:

1. Point DNS for `your-domain.example.com` at your server
2. Build and run the app (e.g. `npm run build && npm run start` on port `3000`)
3. Add an nginx server block:

```nginx
server {
    listen 443 ssl;
    server_name your-domain.example.com;

    ssl_certificate     /etc/letsencrypt/live/your-domain.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

4. Obtain certificates with [certbot](https://certbot.eff.org/)
5. Set `APP_ORIGIN=https://your-domain.example.com` and `RP_ID=your-domain.example.com` in your server environment

## Security notes

- All dashboard and Shodan APIs require a valid passkey session.
- Mutating APIs also require a CSRF token.
- Sessions use HttpOnly, Secure, SameSite=Strict cookies.
- Shodan refreshes are rate-limited and only run when you click refresh.
- Security headers are set in `next.config.ts`.

## Shodan API notes

- Domain and host lookups are the best starting points for personal use
- Search queries (`/shodan/host/search`) consume query credits — this app avoids them for now
- Free Shodan accounts have limited access; some endpoints require a membership

## Next steps (when you're ready)

- Add scan history so each refresh keeps a snapshot
- Auto-resolve subdomains → scan each IP
- Scheduled rescans with Shodan alerts
