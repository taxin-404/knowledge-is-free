// Knowledge is Free — Cloudflare Worker
//
// Large PDFs bypass the Worker's own request-body limit entirely: the
// browser gets a presigned URL and uploads straight to R2. Only small
// things (thumbnails) and JSON metadata pass through this Worker.
//
// Routes:
//   GET    /api/files            -> list metadata
//   POST   /api/upload-url       -> get a presigned R2 PUT URL for a new file
//   POST   /api/upload-thumb     -> upload a small cover thumbnail (multipart)
//   POST   /api/finalize         -> record metadata after a direct R2 upload
//   GET    /api/files/:id        -> stream the PDF bytes (inline view, range-aware)
//   GET    /api/thumbs/:id       -> stream the cover thumbnail (PNG)
//   DELETE /api/files/:id        -> remove file + thumbnail + metadata
// Everything else falls through to the static ASSETS binding (the frontend).

import { AwsClient } from "aws4fetch";

const BUCKET_NAME = "books";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function checkKey(request, env) {
  if (!env.UPLOAD_KEY) return true; // no key configured -> open
  const provided = request.headers.get("x-upload-key");
  return provided === env.UPLOAD_KEY;
}

// Accept different ways of configuring R2_ACCOUNT_ID. Some setups store the
// bare account id, others the full S3 endpoint. Normalize to the bare id so
// presigned URLs always build correctly.
function normalizeAccountId(value) {
  if (!value) return "";
  let s = value.trim();
  s = s.replace(/^https?:\/\//i, "");
  s = s.replace(/\.r2\.cloudflarestorage\.com.*$/i, "");
  return s;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    try {
      if (pathname === "/api/files" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT id, name, size, uploaded_at FROM files ORDER BY uploaded_at DESC"
        ).all();
        return json(results);
      }

      if (pathname === "/api/upload-url" && request.method === "POST") {
        if (!checkKey(request, env)) return json({ error: "unauthorized" }, 401);
        if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
          return json({ error: "R2 API credentials are not configured" }, 500);
        }

        const id = crypto.randomUUID();
        const key = `${id}.pdf`;

        const r2 = new AwsClient({
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        });

        const accountId = normalizeAccountId(env.R2_ACCOUNT_ID);
        if (!accountId) {
          return json({ error: "R2 account id is invalid" }, 500);
        }

        const objectUrl = new URL(
          `https://${accountId}.r2.cloudflarestorage.com/${BUCKET_NAME}/${key}`
        );
        objectUrl.searchParams.set("X-Amz-Expires", "3600");

        const signed = await r2.sign(new Request(objectUrl, { method: "PUT" }), {
          aws: { signQuery: true },
        });

        return json({ id, uploadUrl: signed.url });
      }

      if (pathname === "/api/upload-thumb" && request.method === "POST") {
        if (!checkKey(request, env)) return json({ error: "unauthorized" }, 401);

        const form = await request.formData();
        const id = form.get("id");
        const thumb = form.get("thumb");
        if (!id || !thumb || typeof thumb === "string") {
          return json({ error: "missing id or thumb" }, 400);
        }

        await env.PDF_BUCKET.put(`${id}-thumb.png`, thumb.stream(), {
          httpMetadata: { contentType: "image/png" },
        });
        return json({ ok: true });
      }

      if (pathname === "/api/finalize" && request.method === "POST") {
        if (!checkKey(request, env)) return json({ error: "unauthorized" }, 401);

        const { id, name, size } = await request.json();
        if (!id || !name || typeof size !== "number") {
          return json({ error: "missing id, name, or size" }, 400);
        }

        // Confirm the object actually landed in R2 before recording it.
        const head = await env.PDF_BUCKET.head(`${id}.pdf`);
        if (!head) return json({ error: "upload not found in storage" }, 400);

        await env.DB.prepare(
          "INSERT INTO files (id, name, size, uploaded_at) VALUES (?, ?, ?, ?)"
        )
          .bind(id, name, size, new Date().toISOString())
          .run();

        return json({ id, name, size });
      }

      const fileMatch = pathname.match(/^\/api\/files\/([a-f0-9-]+)$/);
      if (fileMatch && request.method === "GET") {
        const id = fileMatch[1];
        const key = `${id}.pdf`;
        const rangeHeader = request.headers.get("range");

        if (rangeHeader) {
          const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
          if (match) {
            const start = parseInt(match[1], 10);
            const endSpecified = match[2] !== "";
            const requestedEnd = endSpecified ? parseInt(match[2], 10) : undefined;

            const object = await env.PDF_BUCKET.get(
              key,
              requestedEnd !== undefined
                ? { range: { offset: start, length: requestedEnd - start + 1 } }
                : { range: { offset: start } }
            );
            if (!object) return json({ error: "not found" }, 404);

            const totalSize = object.size;
            const rangeEnd = requestedEnd !== undefined ? Math.min(requestedEnd, totalSize - 1) : totalSize - 1;

            const headers = new Headers();
            headers.set("content-type", "application/pdf");
            headers.set("accept-ranges", "bytes");
            headers.set("cache-control", "private, max-age=3600");
            headers.set("content-range", `bytes ${start}-${rangeEnd}/${totalSize}`);
            headers.set("content-length", String(rangeEnd - start + 1));
            return new Response(object.body, { status: 206, headers });
          }
        }

        const object = await env.PDF_BUCKET.get(key);
        if (!object) return json({ error: "not found" }, 404);

        const headers = new Headers();
        headers.set("content-type", "application/pdf");
        headers.set("content-disposition", 'inline; filename="document.pdf"');
        headers.set("cache-control", "private, max-age=3600");
        headers.set("accept-ranges", "bytes");
        headers.set("content-length", String(object.size));
        return new Response(object.body, { headers });
      }

      const thumbMatch = pathname.match(/^\/api\/thumbs\/([a-f0-9-]+)$/);
      if (thumbMatch && request.method === "GET") {
        const id = thumbMatch[1];
        const object = await env.PDF_BUCKET.get(`${id}-thumb.png`);
        if (!object) return json({ error: "not found" }, 404);

        const headers = new Headers();
        headers.set("content-type", "image/png");
        headers.set("cache-control", "public, max-age=86400");
        return new Response(object.body, { headers });
      }

      if (fileMatch && request.method === "DELETE") {
        if (!checkKey(request, env)) return json({ error: "unauthorized" }, 401);
        const id = fileMatch[1];
        await env.PDF_BUCKET.delete(`${id}.pdf`);
        await env.PDF_BUCKET.delete(`${id}-thumb.png`);
        await env.DB.prepare("DELETE FROM files WHERE id = ?").bind(id).run();
        return json({ deleted: id });
      }

      // Fall through to static assets (the frontend)
      return env.ASSETS.fetch(request);
    } catch (err) {
      return json({ error: err.message }, 500);
    }
  },
};
