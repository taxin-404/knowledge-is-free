# Knowledge is Free — a self-hosted PDF archive on Cloudflare

Store and view PDFs in the browser, fully hosted on Cloudflare:
Worker (API + static assets) + R2 (file storage) + D1 (metadata).
No user accounts — single-user by design.

## 1. Prerequisites

```bash
npm install -g wrangler
wrangler login
```

## 2. Create the R2 bucket and D1 database

```bash
wrangler r2 bucket create books

wrangler d1 create books-db
# copy the "database_id" it prints into wrangler.toml
```

Edit `wrangler.toml` and paste the database_id from the previous command
into the `database_id` field.

## 3. Apply the schema

```bash
wrangler d1 execute books-db --remote --file=schema.sql
```

## 4. Set an upload password (optional but recommended if the site is public)

Since anyone with the link can currently upload/delete, you can lock those two
actions behind a password without building a login system:

1. In the Cloudflare dashboard, open your Worker → **Settings → Variables and Secrets**
   (the top-level one, not the one under the Build tab — those are different).
2. Add a new **secret** named `UPLOAD_KEY`, value = your chosen password.
3. Save. No redeploy needed for runtime variables — but if you're on Workers
   Builds (Git-connected), check the Versions list on the Overview tab to
   make sure the version with the secret is actually the one serving live
   traffic (promote it if not).

Once set, visitors can still browse and read every PDF freely. The first time
someone tries to **upload or delete**, the site will prompt them for the
password and remember it for that browser session.

Leave `UPLOAD_KEY` unset if you want uploads to stay fully open to anyone.

## 5. Enable large-file uploads (R2 direct upload)

Big PDFs (over Cloudflare's ~100MB Worker request limit) upload straight from
the browser to R2 using a presigned URL, bypassing the Worker entirely. This
needs two things set up once:

**A. Create an R2 API token**

1. Cloudflare dashboard → **R2 Object Storage** → **Manage API Tokens** →
   **Create API Token**.
2. Permissions: **Object Read & Write**, scoped to the `books` bucket.
3. Create it, and copy the **Access Key ID**, **Secret Access Key**, and
   your **Account ID** (shown on the token page, or on the R2 overview page).

**B. Add them as Worker secrets**

In your Worker's **Settings → Variables and Secrets** (the top-level Runtime
one), add three secrets:
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

**C. Allow the browser to talk directly to R2 (CORS)**

Go to your `books` R2 bucket → **Settings** → **CORS Policy** → add a rule:

```json
[
  {
    "AllowedOrigins": ["https://<your-worker-subdomain>.workers.dev"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

Replace the origin with your actual site URL (and add your custom domain too,
if you set one up later). Without this step, large uploads will fail with a
CORS error even though the credentials are correct.

## 5. (Optional) Lock the whole site down with Cloudflare Access

The simplest way to make this genuinely private without writing any auth
code: put the Worker's route behind **Cloudflare Zero Trust → Access**,
restricted to your email. This gates the entire site (viewing included),
not just uploads.

## 6. Deploy

**Option A — Cloudflare Git integration (recommended, no local deploy needed)**

1. Push this repo to GitHub.
2. In the Cloudflare dashboard: Workers & Pages → Create → **Connect to Git**.
3. Pick your `knowledge-is-free` repo.
4. Set:
   - **Build command:** `npm install`
   - **Deploy command:** `npx wrangler deploy`
   - **Root directory:** `/`
5. Under the project's Settings → Bindings, Cloudflare reads the R2 and D1
   bindings straight from `wrangler.toml` — no need to re-add them manually,
   as long as the bucket/database already exist (steps 2–3 above) and the
   `database_id` in `wrangler.toml` is filled in and committed.
6. Save. Every push to your main branch now triggers a build + deploy
   automatically — check progress under Workers & Pages → your project →
   Deployments.

**Option B — Deploy from your own machine**

```bash
wrangler deploy
```

Wrangler will print your `*.workers.dev` URL — that's your live site.
To use a custom domain, add a route in `wrangler.toml` or attach one in
the Cloudflare dashboard under Workers → your worker → Triggers.

## Local development

```bash
wrangler dev
```

This runs the Worker + R2 + D1 locally (D1 uses a local SQLite file,
R2 uses local emulation) at http://localhost:8787.

## How it works

- `worker/index.js` — the API: upload, list, stream, delete
- `public/` — the frontend (plain HTML/CSS/JS), served as static assets
  by the same Worker via the `[assets]` binding in `wrangler.toml`
- `schema.sql` — one table (`files`) tracking id, name, size, upload date
- PDFs themselves live in R2, keyed by `<uuid>.pdf`; the DB only holds
  metadata, so listing the catalog never has to touch R2

## Costs

R2 has no egress fees, and Workers/D1 free tiers are generous — for
personal use this should comfortably fit inside Cloudflare's free tier.
