# Deploying Vidyanexa

Vidyanexa runs on one Linux server with Docker. Five containers:

| Container | What it does |
|---|---|
| `nginx` | The only thing open to the internet. Sends `/api/v1/*` and `/iclock` to the API, and everything else to the web app. |
| `web` | The website and web app (Next.js). |
| `api` | The API (FastAPI). It applies database migrations when it starts, and makes the daily backup. |
| `postgres` | The database (PostgreSQL 16) with row-level security. |
| `redis` | Rate limits, sign-in codes, and short-lived locks. |

Uploaded files and backups live in the `api_storage` volume; the database lives in `pg_data`.

## What you need

- A server with 2 CPUs, 4 GB RAM and 40 GB disk (Ubuntu 22.04 or later).
- Docker Engine 24+ with the Compose plugin.
- The server's address. A custom domain isn't needed: an IP address, or a hostname your cloud provider gives you, works.

## 1. Settings

```sh
git clone <this repository> eduvia && cd eduvia/infra/compose
cp .env.prod.example .env.prod
```

Fill in `.env.prod`:

- `PUBLIC_URL`: the address people will open, with no trailing slash. For example `http://203.0.113.10` or `https://eduvia.example-cloud.app`.
- `OWNER_DB_PASSWORD`, `APP_DB_PASSWORD` and `JWT_SECRET_KEY`: long random values. Make each one with:
  `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`.
- `COOKIE_SECURE`: leave it at `true` whenever the site is served over **https**. Set it to `false` only for a short trial over plain http on an IP address, never with real school data.
- Email, SMS, WhatsApp, push and AI keys: optional. While a provider is set to `console`, its messages are written to the API log instead of being sent.

`.env.prod` holds secrets: it is in `.gitignore`, and should be readable only by the admin (`chmod 600 .env.prod`).

## 2. Start

```sh
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

On its first start, Postgres creates the two database roles:

- `eduvia` owns the tables and runs migrations.
- `eduvia_app` is used by the API. It doesn't own the tables, so row-level security always applies to it.

Then open `PUBLIC_URL`.

## 3. The first platform admin

```sh
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api \
  python -m app.create_super_admin --email you@example.in --name "Your Name"
```

It prints a temporary password. Sign in with it, leaving the school ID empty, and you are asked to choose your own. From **Platform → Schools** you then add schools; each school admin gets their own sign-in.

For a demo server (with `ENVIRONMENT=staging`, not `production`) you can load the sample school instead:
`docker compose ... exec api python -m app.seed`.

## HTTPS

Schools should only use Vidyanexa over https.

- **If your cloud gives you a hostname with a certificate** (a load balancer, or a platform such as Render or Railway): point it at port 80 of this server, and set `PUBLIC_URL` to the https address.
- **On a plain server**: put a TLS-terminating proxy in front of nginx. For example, Caddy obtains certificates automatically for any hostname that resolves to the server.

## API on its own server, website on Vercel

The setup for `www.vidyanexa.com` (website, Vercel) and `apis.vidyanexa.com` (API, an AWS EC2 server). The website's
server code calls the API, so the website and the API should be in the same region (both Sydney: `syd1`, set in
`web/vercel.json`; change it there if the API moves, e.g. Mumbai `bom1`).

**Server** (Ubuntu, 2 GB memory or more, 30 GB disk; firewall: 22 from your IP, 80 and 443 from anywhere):

1. Point `apis.vidyanexa.com` at the server's Elastic IP (an A record; on Cloudflare, "DNS only").
2. Connect: `ssh -i vidyanexa-api.pem ubuntu@apis.vidyanexa.com`.
3. Get the code onto the server (for a private repository, add a read-only deploy key in GitHub first), then run the
   setup once and log out and back in:

   ```sh
   git clone git@github.com:RSPTechSolution/EDUVIA.git vidyanexa && cd vidyanexa
   bash scripts/server-setup.sh
   ```

4. Fill in the settings (`openssl rand -base64 36` makes each secret) and start:

   ```sh
   cd ~/vidyanexa/infra/compose
   cp .env.api.example .env.api && nano .env.api
   docker compose -f docker-compose.api.yml --env-file .env.api up -d --build
   curl https://apis.vidyanexa.com/api/v1/health      # {"status":"ok","database":"ok","redis":"ok"}
   ```

5. Create the platform admin (see section 3, with `-f docker-compose.api.yml --env-file .env.api`).

**Website** (Vercel): import the repository with **Root Directory `web`**, and set these environment variables:

| Name | Value |
|---|---|
| `API_URL` | `https://apis.vidyanexa.com` |
| `NEXT_PUBLIC_SITE_URL` | `https://www.vidyanexa.com` |
| `COOKIE_SECURE` | `true` |
| `WEB_PROXY_SECRET` | the same value as in `.env.api` |
| `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | optional |

Then add the domains `www.vidyanexa.com` and `vidyanexa.com` (redirecting to `www`) and create the DNS records Vercel
shows. `WEB_PROXY_SECRET` matters: without it the API sees every website visitor as Vercel's address, and sign-in
limits would be shared by everyone.

**Updating the API:** `cd ~/vidyanexa && git pull && cd infra/compose && docker compose -f docker-compose.api.yml --env-file .env.api up -d --build`.
The website updates itself on every push to GitHub.

## File storage (Cloudflare R2)

Uploaded files (photos, documents, homework) belong in a bucket, not on the server's disk. Each school's plan includes storage (Basic 10 GB, Pro 50 GB, Max 500 GB): the app counts what each school has uploaded, warns its admins at 80%, and refuses new uploads when the plan is full. Photos are shrunk to WebP on upload.

1. In Cloudflare, under **R2**, create two private buckets (location hint: Asia-Pacific): one for files (e.g. `vidyanexa-files`) and one for backups (e.g. `vidyanexa-backups`). Leave public access off.
2. Under **R2 → Manage API tokens**, create a token with **Object Read & Write** on those two buckets only. Note the Access Key ID, the Secret Access Key (shown once) and the endpoint.
3. Add to `.env.prod` on the server (never commit these):

   ```sh
   STORAGE_BACKEND=s3
   S3_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
   S3_REGION=auto
   S3_ACCESS_KEY_ID=...
   S3_SECRET_ACCESS_KEY=...
   S3_BUCKET=vidyanexa-files
   S3_BACKUP_BUCKET=vidyanexa-backups
   ```

4. If the server already has uploaded files, copy them into the bucket once, then restart the API:

   ```sh
   docker compose -f docker-compose.prod.yml --env-file .env.prod exec api python -m app.storage_migrate --check
   docker compose -f docker-compose.prod.yml --env-file .env.prod exec api python -m app.storage_migrate
   docker compose -f docker-compose.prod.yml --env-file .env.prod restart api
   ```

The same settings work for Wasabi or AWS S3 (Mumbai: `S3_REGION=ap-south-1`, leave `S3_ENDPOINT_URL` empty): moving provider is copying the bucket (e.g. with rclone) and changing these lines. In development, files stay on disk (`STORAGE_BACKEND=local`); `docker compose -f infra/compose/docker-compose.dev.yml up -d s3` starts a local stand-in bucket on port 9090 for trying `s3`.

## Backups and restore

- With `BACKUP_DAILY=true`, the API writes one backup a day to `/data/storage/backups` and keeps the newest `BACKUP_KEEP`. The backup is one consistent snapshot of every table, as CSV files in a zip.
- With `S3_BACKUP_BUCKET` set, each backup is also copied to that bucket (keeping the newest `BACKUP_KEEP` there too), so losing the server doesn't lose the backups.
- The platform admin can also make, download and delete backups under **Platform → System → Backups**.
- Without a backup bucket, **keep copies off the server**: download backups regularly, or copy the volume out:
  `docker run --rm -v eduvia-prod_api_storage:/s alpine tar -C /s -czf - backups > backups.tgz`

To restore, the database must be at the same migration revision as the backup. The revision is in the backup's `manifest.json`.

```sh
docker compose -f docker-compose.prod.yml --env-file .env.prod cp eduvia-YYYYMMDD-HHMMSS.zip api:/tmp/
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api python -m app.restore /tmp/eduvia-YYYYMMDD-HHMMSS.zip --yes
```

A restore replaces all data and signs everyone out.

## Updating

```sh
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Migrations run automatically when the API starts. Make a backup first.

## Health and logs

- **Platform → System → Health** shows:
  - The database, Redis, disk space and the age of the newest backup.
  - Which email, SMS, push, payment and AI providers are live.
  - Usage.
- `GET /api/v1/health` returns `{"status": "ok"}` for an uptime monitor.
- Logs: `docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f api web`

## Mobile apps

The parent, staff and driver apps talk to `PUBLIC_URL/api/v1`. Build them with that address:

```sh
cd mobile
flutter build apk --dart-define=FLAVOR=parent --dart-define=API_URL=https://your-address
```

Repeat with `FLAVOR=staff` and `FLAVOR=driver`.

## Getting found on Google (SEO)

The public website is set up for search:
- Every page has its own title and description, a canonical URL and share images.
- Ten feature pages target real searches, such as "school fee management software" and "school bus GPS tracking".
- There is structured data (organisation, product with prices, FAQs and breadcrumbs), plus a sitemap and robots rules.
- The signed-in app is kept out of search.

When the site is live:

1. Set `PUBLIC_URL` to the final https address before building. Canonical URLs, the sitemap and share cards all use it.
2. In [Google Search Console](https://search.google.com/search-console), add the site using the **HTML tag** method.
   Put the code (the `content="..."` value) in `GOOGLE_SITE_VERIFICATION`, rebuild, and click **Verify**.
   Do the same for [Bing Webmaster Tools](https://www.bing.com/webmasters) with `BING_SITE_VERIFICATION`.
3. In Search Console, submit `PUBLIC_URL/sitemap.xml`. Then use **URL inspection**, and **Request indexing**, for the home page, `/features` and `/pricing`.
4. Check the structured data with Google's [Rich Results Test](https://search.google.com/test/rich-results) on the home page and one feature page.
5. Optional: set `GA_ID` for Google Analytics on the public website.

To add a feature page, add an entry to `web/src/content/features.ts`. Then run `node scripts/og-images.mjs` in `web/` to create its share image.

## Speed and layout stability

Pages are built so they don't jump while loading (Cumulative Layout Shift, CLS) and show their main content fast (Largest Contentful Paint, LCP). To check a running site, from `web/`:

```sh
node scripts/vitals.mjs --public                          # the public website
node scripts/vitals.mjs --roles admin,teacher,parent      # every page in each role's menu
node scripts/vitals.mjs --roles admin --mobile --why      # phone size, and which elements moved
```

It loads each page like a mid-range phone on a slow connection. Pages over Google's limits (CLS 0.1, LCP 2.5 s) are marked ✗. `npx playwright test e2e/stability.spec.ts` fails if a key page jumps.

Rules that keep it that way when changing pages:
- While data loads, show a skeleton the same size as what replaces it. Keep a section's space even if it may end up empty.
- Anything that decides the layout (sidebar width, banners, the school colour) comes from the server, not from local storage after the page loads.
- Don't hide server-rendered content until JavaScript runs. The entrance animations in `components/motion/primitives.tsx` already skip the first paint.
- Charts load lazily through `components/dashboard/lazy-charts.tsx`, with placeholders of the same height.
- Use `@/components/motion/motion` (not `motion/react`) only where an interaction needs it, so the animation library stays out of most pages.
