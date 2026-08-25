// Knowledge is Free — Cloudflare Worker
// Routes:
//   GET    /api/files          -> list metadata
//   POST   /api/upload         -> upload a PDF + optional cover thumbnail (multipart/form-data)
//   GET    /api/files/:id      -> stream the PDF bytes (inline view)
//   GET    /api/thumbs/:id     -> stream the cover thumbnail (PNG)
//   DELETE /api/files/:id      -> remove file + thumbnail + metadata
// Everything else falls through to the static ASSETS binding (the frontend).

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

      if (pathname === "/api/upload" && request.method === "POST") {
        if (!checkKey(request, env)) return json({ error: "unauthorized" }, 401);

        const form = await request.formData();
        const file = form.get("file");
        const thumb = form.get("thumb");

        if (!file || typeof file === "string") {
          return json({ error: "no file provided" }, 400);
        }
        if (file.type !== "application/pdf") {
          return json({ error: "only PDF files are allowed" }, 400);
        }

        const id = crypto.randomUUID();

        await env.PDF_BUCKET.put(`${id}.pdf`, file.stream(), {
          httpMetadata: { contentType: "application/pdf" },
        });

        if (thumb && typeof thumb !== "string") {
          await env.PDF_BUCKET.put(`${id}-thumb.png`, thumb.stream(), {
            httpMetadata: { contentType: "image/png" },
          });
        }

        await env.DB.prepare(
          "INSERT INTO files (id, name, size, uploaded_at) VALUES (?, ?, ?, ?)"
        )
          .bind(id, file.name, file.size, new Date().toISOString())
          .run();

        return json({ id, name: file.name, size: file.size });
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
