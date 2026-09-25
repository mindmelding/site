---
module: site-worker
date: 2026-09-25
problem_type: best_practice
component: infrastructure
severity: medium
applies_when:
  - "A Cloudflare Worker fetches a static asset via env.ASSETS.fetch() and returns a new Response built from that asset's body, modified rather than passed through unchanged"
  - "Reusing a fetched Response's `headers` object (or spreading it) on a Response whose body no longer matches what those headers describe"
tags: [cloudflare-workers, response-headers, content-length, etag, static-assets]
---

# Rewriting a fetched asset's body means dropping its headers, not reusing them

## Context

BUO-42 (`worker.js`'s `/<slug>` route) started returning a modified version of the static `project` template: the fetched HTML gets per-project `<title>`/meta tags spliced in before the Worker returns it (`taggedProjectHtml`, `worker.js:40-51`). The first version of that change built the new `Response` as `new Response(html, { status: 200, headers: page.headers })` — reusing the `headers` object from the original `env.ASSETS.fetch(new URL("/project", url))` call (`worker.js:66`) directly on the response carrying the *rewritten* body.

That looks like "preserve the original headers," but it silently keeps three values that describe the asset's original bytes, not the ones actually being sent:

- `content-length` — now wrong, because the spliced-in `<title>`/meta tags change the byte length. A wrong `Content-Length` can truncate or otherwise corrupt what the client receives.
- `etag` / `last-modified` — now describe content the response no longer serves, which can make a CDN or browser treat a genuinely different response as unchanged and skip re-fetching it.

Nothing in this failure mode throws or fails a build: the code reads correctly (same template, same headers, plus insertions), and it was only caught by construction review before shipping, not by any test — this repo has no test runner (`wrangler.jsonc`, no `package.json`/test config). Builds can run `wrangler dev` plus `curl` against localhost (a build-workflow allowlist gap that blocked this was fixed 2026-09-25; see `docs/solutions/workflow-issues/sandboxed-build-cannot-run-wrangler-dev.md`), but a `curl` inspection of the response head would not obviously surface a Content-Length mismatch either, unless you specifically diff it against the original asset's headers.

## Guidance

When a Worker returns a `Response` built from a fetched Response's body that has been modified (bytes added, removed, or re-encoded), never pass that original `Response`'s `headers` straight through. Clone them into a new `Headers` object and delete every header whose value is a function of the exact bytes: `content-length`, `etag`, and `last-modified` at minimum. Let the platform recompute what it can (`content-length`) and drop what it can't reconstruct (`etag`, `last-modified` — there is no cheap equivalent to regenerate for a one-off computed response).

```js
const page = await env.ASSETS.fetch(new URL("/project", url));
const html = taggedProjectHtml(await page.text(), match[1], project);
const headers = new Headers(page.headers);
headers.delete("content-length");
headers.delete("etag");
headers.delete("last-modified");
return new Response(html, { status: 200, headers });
```

This is the fix as committed in `worker.js:69-74` (on branch `claude/linear-buo-42`, as of this writing). Contrast with the **unmodified** pass-through branch two lines above it (`worker.js:68`, the 404-for-unknown-slug case), which correctly reuses `page.headers` untouched — because there the body genuinely is the original, unmodified bytes. The rule is about whether the body changed, not about "did I touch the headers object."

## Why This Matters

A stale `Content-Length` is not a cosmetic bug — it is a wire-protocol correctness issue that can truncate the response body or otherwise confuse the HTTP client, and it will not show up in a quick visual check of the response (the *served* bytes past whatever the stale length claims may simply not arrive, or tooling may choose to trust the header over the actual stream). Stale caching validators (`etag`/`last-modified`) are a quieter failure: they don't corrupt anything directly, but they can make an intermediary decide "this hasn't changed" about a response that has, which is exactly backwards for a page whose entire point (BUO-42) is that its content now differs per slug.

## When to Apply

Any Cloudflare Worker (or similar edge-runtime) code path that does `fetch()`-then-rewrite-then-return, using `env.ASSETS.fetch()` or an equivalent platform static-asset binding — not just this repo's `/<slug>` route. The unmodified pass-through case (same bytes, different status code, etc.) does not need this: `worker.js:68`'s 404 branch reuses `page.headers` correctly because the body is untouched.

## Examples

`worker.js`'s `/<slug>` handler now has both cases side by side:
- **Pass-through (headers reused as-is):** `worker.js:68` — `return new Response(page.body, { status: 404, headers: page.headers });`. Body is exactly what was fetched; headers describing those exact bytes are still correct.
- **Rewritten (headers must be pruned):** `worker.js:69-74` — body is `taggedProjectHtml(await page.text(), ...)`, a different byte sequence than what was fetched; `content-length`/`etag`/`last-modified` are deleted before constructing the response.
