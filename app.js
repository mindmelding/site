(function () {
  const root = document.getElementById("portfolio");
  const list = window.PROJECTS || [];

  for (const p of list) {
    const article = document.createElement("article");
    article.className = "project";

    const canvas = document.createElement("canvas");
    canvas.className = "plate";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Generated cover for " + p.title);
    canvas._project = p;

    const head = document.createElement("div");
    head.className = "project-head";
    const name = document.createElement(p.url ? "a" : "span");
    name.className = "name";
    name.textContent = p.title;
    if (p.url) {
      name.href = p.url;
      name.target = "_blank";
      name.rel = "noopener";
    }
    const date = document.createElement("span");
    date.className = "date";
    date.textContent = p.date;
    head.append(name, date);

    const text = document.createElement("p");
    text.textContent = p.text;

    article.append(canvas, head, text);
    root.append(article);
  }

  document.getElementById("count").textContent = list.length + " projects";

  const drawAll = () => {
    for (const c of root.querySelectorAll("canvas.plate")) window.drawPlate(c, c._project);
  };

  let lastWidth = 0;
  window.addEventListener("resize", () => {
    const w = root.clientWidth;
    if (w !== lastWidth) { lastWidth = w; drawAll(); }
  });

  const start = () => {
    lastWidth = root.clientWidth;
    drawAll();
    requestAnimationFrame(() => document.body.classList.add("ready"));
  };
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(start, start);
})();

(function () {
  const bar = document.getElementById("bar");
  const intro = document.getElementById("introduction");
  if (!bar || !intro) return;
  const links = bar.querySelectorAll("a");
  let shown = false, queued = false;
  const update = () => {
    queued = false;
    const show = intro.getBoundingClientRect().bottom < 0;
    if (show === shown) return;
    shown = show;
    bar.classList.toggle("shown", show);
    bar.setAttribute("aria-hidden", String(!show));
    links.forEach((a) => (a.tabIndex = show ? 0 : -1));
  };
  const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  update();
})();
