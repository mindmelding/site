// mindmelding.dev: serves the static site. Runs only when no file matches the path.
//   /<slug>  → the project page template (project.html reads the slug from the URL)
//   www.     → the bare domain
// Slugs come from projects.js, using the same rule as window.projectSlug there.
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === "www.mindmelding.dev") {
      url.hostname = "mindmelding.dev";
      return Response.redirect(url.toString(), 301);
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
