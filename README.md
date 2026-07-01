# Attack Surface Checker

A single-admin web dashboard for checking what Shodan can see about domains and IPv4 addresses.

The app stores monitored assets, cached Shodan results, passkey metadata, sessions, and rate-limit counters in a local PostgreSQL database. Shodan is only queried when you run a quick scan or refresh a monitored asset.

## Requirements

- Node.js 20.9+ (Node.js 22+ recommended)
- PostgreSQL 13+ on the same VPS or host
- A Shodan API key from [account.shodan.io](https://account.shodan.io/)
- A public HTTPS origin for production passkey login

## Install

```bash
git clone git@github.com:TheOrangutank/shodan-surface-checker.git
cd shodan-surface-checker
npm install
cp .env.example .env.local
```

Edit `.env.local` and replace every placeholder.

## Configuration

| Variable | Required for | Example |
|----------|--------------|---------|
| `SHODAN_API_KEY` | Shodan domain/IP/profile requests | `abc123...` |
| `DATABASE_URL` | Local PostgreSQL storage | `postgresql://asc_user:password@127.0.0.1:5432/attack_surface_checker` |
| `APP_ORIGIN` | Passkey origin and CSRF checks | `https://your-domain.example.com` |
| `RP_ID` | Passkey relying party ID | `your-domain.example.com` |
| `SESSION_SECRET` | Session and CSRF token signing | output of `openssl rand -base64 48` |
| `PASSKEY_SETUP_TOKEN` | First passkey registration gate | output of `openssl rand -base64 48` |
| `ALLOW_PASSKEY_REENROLL` | Optional passkey re-registration | `false` |

For local development, use:

```env
APP_ORIGIN=http://localhost:3000
RP_ID=localhost
```

For production, `APP_ORIGIN` must be your full HTTPS URL with no trailing slash, and `RP_ID` must be only the hostname. For example:

```env
APP_ORIGIN=https://dashboard.example.com
RP_ID=dashboard.example.com
```

Changing `RP_ID` after enrolling a passkey requires a new passkey registration.

## Database Setup

Create a local PostgreSQL database and app user. Keep PostgreSQL bound to localhost or a Unix socket; do not expose it directly to the internet.

```bash
sudo -u postgres psql
```

```sql
create database attack_surface_checker;
create user asc_user with encrypted password 'replace_with_db_password';
grant all privileges on database attack_surface_checker to asc_user;
\c attack_surface_checker
grant all on schema public to asc_user;
```

Run the migrations:

```bash
psql "$DATABASE_URL" -f db/migrations/001_monitored_assets.sql
psql "$DATABASE_URL" -f db/migrations/002_auth_security.sql
```

The migrations create:

- `monitored_assets` for saved domains/IPs and cached Shodan responses
- `passkey_credentials` for WebAuthn public-key metadata
- `auth_challenges` for short-lived passkey login/setup challenges
- `app_sessions` for hashed session and CSRF tokens
- `rate_limit_buckets` for shared API throttling

Passkey private keys, biometric data, Shodan API keys, and raw session cookies are not stored in the database.

## Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

To create the admin passkey:

1. Visit `/setup-passkey`
2. Enter `PASSKEY_SETUP_TOKEN`
3. Register a passkey
4. Sign in at `/login`

After the first passkey is enrolled, registration is closed unless `ALLOW_PASSKEY_REENROLL=true`.

## Deploy On A VPS

Build the app:

```bash
npm run build
npm run start
```

For a persistent deployment, run the app behind a process manager such as systemd and put nginx in front of it for HTTPS.

Example nginx reverse proxy:

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

Set the same environment variables from `.env.local` in the production service environment.

## Use

- Add domains or IPv4 addresses to the monitoring dashboard.
- Click `[ REFRESH ]` on a saved asset to query Shodan and update the cached result.
- Use the quick domain/IP scan tabs for one-off checks.
- Use `[ LOGOUT ]` when finished.

## Security Notes

- All dashboard and Shodan API routes require a valid passkey session.
- Mutating routes require a CSRF token and matching request origin.
- Session and CSRF tokens are stored as HMAC hashes in PostgreSQL.
- Database queries use parameterized SQL.
- PostgreSQL should only listen locally.
- Security headers are configured in `next.config.ts`.
