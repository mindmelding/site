// mindmelding.dev: serves the static site. Runs only when no file matches the path.
//   /<slug>       → the project page template (project.html reads the slug from the URL)
//   /sitemap.xml  → generated from projects.js, so it always agrees with /<slug>
//   www.          → the bare domain
// Slugs come from projects.js, using the same rule as window.projectSlug there.
const SITE_ORIGIN = "https://mindmelding.dev";
const slugify = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function knownSlugs(env, url) {
  const res = await env.ASSETS.fetch(new URL("/projects.js", url));
  const src = await res.text();
  const slugs = new Set();
  // Each entry: an optional `slug: "…"`, otherwise its `title: "…"`.
  for (const entry of src.split(/\n\s*\{\s*\n/).slice(1)) {
    const slug = entry.match(/^\s*slug:\s*"([^"]+)"/m)?.[1];
    const title = entry.match(/^\s*title:\s*"([^"]+)"/m)?.[1];
    if (slug) slugs.add(slug);
    else if (title) slugs.add(slugify(title));
  }
  return slugs;
}

function sitemapXml(slugs) {
  const urls = [SITE_ORIGIN + "/", ...[...slugs].map((slug) => `${SITE_ORIGIN}/${slug}`)];
  const entries = urls.map((loc) => `  <url><loc>${loc}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === "www.mindmelding.dev") {
      url.hostname = "mindmelding.dev";
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname === "/sitemap.xml") {
      const slugs = await knownSlugs(env, url);
      return new Response(sitemapXml(slugs), { headers: { "content-type": "application/xml; charset=utf-8" } });
    }
    const match = url.pathname.match(/^\/([a-z0-9-]+)\/?$/);
    if (match) {
      const page = await env.ASSETS.fetch(new URL("/project", url));
      const status = (await knownSlugs(env, url)).has(match[1]) ? 200 : 404;
      return new Response(page.body, { status, headers: page.headers });
    }
    return env.ASSETS.fetch(request);
  },
};
