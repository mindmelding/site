// mindmelding.dev: serves the static site. Runs only when no file matches the path.
//   /<slug>       → the project page template (project.html reads the slug from the URL)
//   /sitemap.xml  → generated from projects.js, so it always agrees with /<slug>
//   www.          → the bare domain
// Slugs come from projects.js, using the same rule as window.projectSlug there.
const SITE_ORIGIN = "https://mindmelding.dev";
const slugify = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const escapeHtml = (str) =>
  str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function knownSlugs(env, url) {
  const res = await env.ASSETS.fetch(new URL("/projects.js", url));
  const src = await res.text();
  const projects = new Map();
  // Each entry: an optional `slug: "…"`, otherwise its `title: "…"`. `text` is the one-line description.
  for (const entry of src.split(/\n\s*\{\s*\n/).slice(1)) {
    const slug = entry.match(/^\s*slug:\s*"([^"]+)"/m)?.[1];
    const title = entry.match(/^\s*title:\s*"([^"]+)"/m)?.[1];
    const text = entry.match(/^\s*text:\s*"([^"]+)"/m)?.[1];
    const key = slug || (title && slugify(title));
    if (key) projects.set(key, { title, text });
  }
  return projects;
}

function sitemapXml(projects) {
  // Only slugs the /<slug> route itself would match — keeps every <loc> resolvable
  // and XML-safe without escaping, even if a manual `slug:` in projects.js strays
  // outside [a-z0-9-] (that project just won't 200 for /<slug> either).
  const validSlugs = [...projects.keys()].filter((slug) => /^[a-z0-9-]+$/.test(slug));
  const urls = [SITE_ORIGIN + "/", ...validSlugs.map((slug) => `${SITE_ORIGIN}/${slug}`)];
  const entries = urls.map((loc) => `  <url><loc>${loc}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

// Fills the project template's <title> and adds description/og: meta tags from projects.js,
// so a link preview (iMessage, Slack, LinkedIn) reads the project before any JS runs.
function taggedProjectHtml(html, slug, project) {
  const title = escapeHtml(project.title);
  const description = escapeHtml(project.text);
  const ogUrl = `${SITE_ORIGIN}/${slug}`;
  const metaTags =
    `  <meta name="description" content="${description}">\n` +
    `  <meta property="og:title" content="${title}">\n` +
    `  <meta property="og:description" content="${description}">\n` +
    `  <meta property="og:url" content="${ogUrl}">\n` +
    `</head>`;
  return html.replace("<title>mindmelding</title>", `<title>${title} · mindmelding</title>`).replace("</head>", metaTags);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === "www.mindmelding.dev") {
      url.hostname = "mindmelding.dev";
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname === "/sitemap.xml") {
      const projects = await knownSlugs(env, url);
      return new Response(sitemapXml(projects), { headers: { "content-type": "application/xml; charset=utf-8" } });
    }
    const match = url.pathname.match(/^\/([a-z0-9-]+)\/?$/);
    if (match) {
      const page = await env.ASSETS.fetch(new URL("/project", url));
      const project = (await knownSlugs(env, url)).get(match[1]);
      if (!project) return new Response(page.body, { status: 404, headers: page.headers });
      const html = taggedProjectHtml(await page.text(), match[1], project);
      const headers = new Headers(page.headers);
      headers.delete("content-length");
      headers.delete("etag");
      headers.delete("last-modified");
      return new Response(html, { status: 200, headers });
    }
    return env.ASSETS.fetch(request);
  },
};
