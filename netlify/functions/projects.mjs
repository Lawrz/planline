import { getStore } from "@netlify/blobs";

// REST API for Planline projects, stored in Netlify Blobs (one JSON blob per project).
//   GET    /api/projects        -> list of { id, name, updated, rev }
//   POST   /api/projects        -> create { name, tasks }
//   GET    /api/projects/:id    -> full project
//   PUT    /api/projects/:id    -> update { name, tasks, rev }  (409 if rev is stale)
//   DELETE /api/projects/:id    -> delete
// Every request must send the shared secret in the x-planline-key header.

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const safeEq = (a, b) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

const DATE = /^\d{4}-\d\d-\d\d$/;
const num = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));

function validate(b) {
  if (!b || typeof b !== "object") return "Invalid request body";
  if (typeof b.name !== "string" || !b.name.trim() || b.name.length > 200) return "Name must be 1 to 200 characters";
  if (!Array.isArray(b.tasks) || b.tasks.length > 2000) return "Tasks must be a list of at most 2000 items";
  for (const t of b.tasks) {
    if (!t || typeof t.n !== "string" || t.n.length > 500 || typeof t.s !== "string" || !DATE.test(t.s) || !Number.isFinite(t.d))
      return "A task is malformed";
  }
  return null;
}

const clean = (t) => ({
  n: t.n,
  s: t.s,
  d: num(t.d, 0, 999),
  p: Array.isArray(t.p) ? t.p.filter(Number.isInteger).slice(0, 200) : [],
  a: String(t.a ?? "").slice(0, 200),
  l: num(t.l, 0, 20),
  c: num(t.c, 0, 100),
  k: t.k ? 1 : 0,
  b: Array.isArray(t.b) && t.b.length === 2 && t.b.every(Number.isFinite) ? t.b : null,
  m: Array.isArray(t.m)
    ? t.m.slice(0, 500).map((c) => ({ t: Number(c.t) || 0, x: String(c.x ?? "").slice(0, 5000) }))
    : [],
});

async function readBody(req) {
  try {
    const text = await req.text();
    if (text.length > 2_000_000) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export default async (req) => {
  const key = Netlify.env.get("PLANLINE_KEY");
  if (!key)
    return json({ error: "The server has no PLANLINE_KEY set. Add it under Site configuration, Environment variables, then redeploy." }, 503);
  if (!safeEq(req.headers.get("x-planline-key") || "", key)) return json({ error: "Unauthorized" }, 401);

  const store = getStore({ name: "projects", consistency: "strong" });
  const id = new URL(req.url).pathname.replace(/^\/api\/projects\/?/, "");
  if (id && !/^[a-z0-9]{6,32}$/.test(id)) return json({ error: "Bad project id" }, 400);

  try {
    if (!id) {
      if (req.method === "GET") {
        const { blobs } = await store.list();
        const all = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
        return json(all.filter(Boolean).map((p) => ({ id: p.id, name: p.name, updated: p.updated, rev: p.rev })));
      }
      if (req.method === "POST") {
        const b = await readBody(req);
        const err = validate(b);
        if (err) return json({ error: err }, 400);
        const now = Date.now();
        const p = { id: crypto.randomUUID().replace(/-/g, "").slice(0, 16), name: b.name.trim(), tasks: b.tasks.map(clean), rev: 1, created: now, updated: now };
        await store.setJSON(p.id, p);
        return json(p, 201);
      }
    } else {
      const existing = await store.get(id, { type: "json" });
      if (!existing) return json({ error: "Project not found" }, 404);
      if (req.method === "GET") return json(existing);
      if (req.method === "PUT") {
        const b = await readBody(req);
        const err = validate(b);
        if (err) return json({ error: err }, 400);
        if (b.rev !== existing.rev) return json({ error: "This project was changed elsewhere", rev: existing.rev }, 409);
        const p = { ...existing, name: b.name.trim(), tasks: b.tasks.map(clean), rev: existing.rev + 1, updated: Date.now() };
        await store.setJSON(id, p);
        return json(p);
      }
      if (req.method === "DELETE") {
        await store.delete(id);
        return json({ ok: true });
      }
    }
    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    console.error(e);
    return json({ error: "Server error" }, 500);
  }
};

export const config = { path: ["/api/projects", "/api/projects/*"] };
