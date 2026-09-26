---
title: A Cloudflare Worker that rewrites a fetched asset's body must drop its stale headers
date: 2026-09-25
category: best-practices
module: cloudflare-workers
problem_type: best_practice
component: infrastructure
severity: medium
applies_when:
  - "A Cloudflare Worker fetches a static asset via env.ASSETS.fetch() (or an equivalent platform static-asset binding) and returns a new Response built from that asset's body, modified rather than passed through unchanged"
tags: [cloudflare-workers, response-headers, content-length, etag, static-assets]
source: build
repo: site
scope: universal
---

# A Cloudflare Worker that rewrites a fetched asset's body must drop its stale headers

Promoted from [mindmelding/site's learning](../_repos/site/best-practices/rewritten-worker-response-must-drop-original-asset-headers.md) (BUO-42), which has the full context and code example. Every project in this pipeline ends up with at least one Cloudflare Worker (docs-kit's per-project `<slug>-docs` docs Worker, plus the mindmelding-site Worker itself), so this applies wherever a Worker fetches a static asset and returns a modified version of it rather than passing it through unchanged.

## The rule

If a Worker's `fetch` handler does `env.ASSETS.fetch()` and then returns a `Response` built from a **modified** version of that asset's body (bytes spliced in, removed, or re-encoded), never reuse the original `Response`'s `headers` object as-is. Clone into a new `Headers` and delete `content-length`, `etag`, and `last-modified` before constructing the new `Response` — they describe the original bytes, not the ones actually being sent, and a stale `content-length` can truncate or corrupt what the client receives.

Untouched pass-through responses (same bytes, e.g. a 404 branch) are fine to reuse headers on as-is — the rule is about whether the body changed, not whether the headers object was touched.

```js
const page = await env.ASSETS.fetch(new URL("/project", url));
const html = taggedProjectHtml(await page.text(), match[1], project);
const headers = new Headers(page.headers);
headers.delete("content-length");
headers.delete("etag");
headers.delete("last-modified");
return new Response(html, { status: 200, headers });
```
