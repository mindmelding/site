// Renders one project from projects.js, picked by the URL: /<slug>
(function () {
  const page = document.getElementById("page");
  const slug = decodeURIComponent(location.pathname.replace(/^\/|\/$/g, "")).toLowerCase();
  const p = (window.PROJECTS || []).find((x) => window.projectSlug(x) === slug);

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  };

  if (!p) {
    page.classList.add("missing");
    page.append(el("h1", "", "Nothing here yet"), el("p", "lede", "No project lives at this address. The full list is on the home page."));
    document.title = "Not found · mindmelding";
    requestAnimationFrame(() => document.body.classList.add("ready"));
    return;
  }

  document.title = p.title + " · mindmelding";
  const meta = document.createElement("meta");
  meta.name = "description";
  meta.content = p.text;
  document.head.append(meta);

  const canvas = el("canvas", "plate");
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Generated cover for " + p.title);

  const head = el("div", "project-head");
  head.append(el("h1", "", p.title), el("span", "date", p.date));

  const links = el("ul", "project-links");
  const add = (label, href, primary, external) => {
    const li = el("li");
    const a = el("a", primary ? "primary" : "", label);
    a.href = href;
    if (external) { a.target = "_blank"; a.rel = "noopener"; }
    li.append(a);
    links.append(li);
  };
  if (p.docs) add("Read the docs", p.docs, true, false);
  if (p.url) add("Open " + p.title + " ↗\uFE0E", p.url, !p.docs, true);
  if (p.repo) add("Code on GitHub ↗\uFE0E", "https://github.com/" + p.repo, false, true);

  page.append(canvas, head, el("p", "lede", p.text));
  if (links.children.length) page.append(links);

  const draw = () => window.drawPlate(canvas, p);
  let lastWidth = 0;
  window.addEventListener("resize", () => {
    if (page.clientWidth !== lastWidth) { lastWidth = page.clientWidth; draw(); }
  });
  const start = () => {
    lastWidth = page.clientWidth;
    draw();
    requestAnimationFrame(() => document.body.classList.add("ready"));
  };
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(start, start);
})();
