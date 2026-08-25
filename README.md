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

wrangler d1 create pdf-vault-db
# copy the "database_id" it prints into wrangler.toml
```

Edit `wrangler.toml` and paste the database_id from the previous command
into the `database_id` field.

## 3. Apply the schema

```bash
wrangler d1 execute pdf-vault-db --remote --file=schema.sql
```

## 4. (Optional) Protect uploads/deletes with a shared key

Since there's no login system, you can gate write actions with a secret
header instead:

```bash
wrangler secret put UPLOAD_KEY
```

If you set this, add `x-upload-key: <your key>` as a header on upload/delete
requests (e.g. adjust `app.js` to read a key from localStorage/prompt, or
just skip this and rely on Cloudflare Access instead — see below).

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
