// Generated cover plates. Each project draws the same plate every time: the seed comes from its title.
(function () {
  const INK = { dark: { bg: "#0d0d0d", fg: "#e9e7e2" }, light: { bg: "#e9e7e2", fg: "#0d0d0d" } };
  const ASPECT = { rings: 1, waves: 1, halftone: 4 / 3, script: 4 / 3, bars: 4 / 3, grid: 16 / 10 };

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  function rng(seed) {
    let a = seed;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Waves: stacked ride traces, each row hides the one behind it.
  function waves(ctx, w, h, r, c) {
    const rows = 38, top = h * .14, bottom = h * .9, step = (bottom - top) / rows;
    const phases = Array.from({ length: 6 }, () => r() * Math.PI * 2);
    ctx.lineWidth = Math.max(1, w / 500);
    for (let i = 0; i < rows; i++) {
      const y0 = top + i * step;
      ctx.beginPath();
      ctx.moveTo(w * .12, y0);
      for (let x = w * .12; x <= w * .88; x += 2) {
        const u = (x - w * .12) / (w * .76);
        const env = Math.pow(Math.sin(u * Math.PI), 4);
        let n = 0;
        for (let k = 0; k < 6; k++) n += Math.sin(u * (7 + k * 5) + phases[k] + i * .31 * (k + 1)) / (k + 1);
        const spike = Math.max(0, n) * env * step * (3 + r() * .4);
        ctx.lineTo(x, y0 - spike);
      }
      ctx.lineTo(w * .88, y0);
      ctx.fillStyle = c.bg;
      ctx.fill();
      ctx.strokeStyle = c.fg;
      ctx.stroke();
    }
  }

  // Rings: a record label, grooves broken into arcs.
  function rings(ctx, w, h, r, c) {
    const cx = w / 2, cy = h / 2, R = w * .46;
    ctx.fillStyle = c.fg;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = c.bg;
    for (let rad = R * .96; rad > R * .36; rad -= R * (.012 + r() * .02)) {
      ctx.lineWidth = Math.max(.6, r() * w / 300);
      let a = r() * Math.PI * 2;
      const end = a + Math.PI * 2;
      while (a < end) {
        const len = .2 + r() * 2.2;
        if (r() > .18) { ctx.beginPath(); ctx.arc(cx, cy, rad, a, Math.min(a + len, end)); ctx.stroke(); }
        a += len + r() * .3;
      }
    }
    ctx.fillStyle = c.bg;
    ctx.beginPath(); ctx.arc(cx, cy, R * .07, 0, Math.PI * 2); ctx.fill();
  }

  // Halftone: dots sized by a few hidden hot spots.
  function halftone(ctx, w, h, r, c) {
    const spots = Array.from({ length: 5 }, () => ({ x: r() * w, y: r() * h, s: (.08 + r() * .22) * w }));
    const cell = w / 46;
    ctx.fillStyle = c.fg;
    for (let y = cell; y < h - cell / 2; y += cell) {
      for (let x = cell; x < w - cell / 2; x += cell) {
        let v = 0;
        for (const p of spots) v += Math.exp(-((x - p.x) ** 2 + (y - p.y) ** 2) / (2 * p.s * p.s));
        const rad = Math.min(1, v) * cell * .48;
        if (rad < .35) continue;
        ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // Script: set type, half of it printed upside down, with rubbed-out bands.
  function script(ctx, w, h, r, c, p) {
    const words = p.words || ["mind", "melding"];
    const size = Math.max(7, w / 58);
    ctx.fillStyle = c.fg;
    ctx.font = `400 ${size}px "JetBrains Mono", monospace`;
    ctx.textBaseline = "top";
    const lines = [];
    for (let y = h * .1; y < h * .9; y += size * 1.5) {
      let s = "";
      while (s.length < 70) s += words[Math.floor(r() * words.length)] + (r() > .8 ? "   " : " ");
      lines.push({ y, s, gap: r() > .7 });
    }
    const half = Math.floor(lines.length / 2);
    lines.forEach((ln, i) => {
      if (ln.gap) return;
      ctx.save();
      if (i >= half) { ctx.translate(w, h * 1.02); ctx.rotate(Math.PI); }
      const y = i >= half ? h - ln.y : ln.y;
      const x0 = w * .1 + (r() > .5 ? w * .4 : 0) * (r() > .6 ? 1 : 0);
      let s = ln.s.slice(0, Math.floor(24 + r() * 40));
      while (s.length > 4 && x0 + ctx.measureText(s).width > w * .9) s = s.slice(0, -1);
      ctx.fillText(s, x0, y);
      ctx.restore();
    });
    ctx.fillStyle = c.bg;
    for (let i = 0; i < 3; i++) ctx.fillRect(0, r() * h, w, size * (2 + r() * 6) * (r() > .5 ? 1 : .3));
    ctx.fillStyle = c.fg;
    ctx.fillRect(w * .1, h * .06, w * (.2 + r() * .3), size * .3);
  }

  // Bars: a ledger drawn as columns, some filled, some only outlined.
  function bars(ctx, w, h, r, c) {
    const n = 26, gap = w * .006, bw = (w * .8 - gap * (n - 1)) / n, base = h * .86;
    ctx.fillStyle = c.fg; ctx.strokeStyle = c.fg;
    ctx.lineWidth = Math.max(1, w / 600);
    let v = .3 + r() * .3;
    for (let i = 0; i < n; i++) {
      v = Math.min(.95, Math.max(.06, v + (r() - .45) * .22));
      const bh = v * h * .7, x = w * .1 + i * (bw + gap);
      if (r() > .72) ctx.strokeRect(x + .5, base - bh + .5, bw - 1, bh - 1);
      else ctx.fillRect(x, base - bh, bw, bh);
    }
    ctx.fillRect(w * .1, base + h * .02, w * .8, Math.max(1, w / 600));
  }

  // Grid: a calendar of small squares, some checked.
  function grid(ctx, w, h, r, c) {
    const cols = 30, s = w * .8 / cols, rows = Math.floor(h * .72 / s);
    ctx.fillStyle = c.fg; ctx.strokeStyle = c.fg;
    ctx.lineWidth = Math.max(.7, w / 800);
    const y0 = (h - rows * s) / 2;
    const bias = r() * Math.PI * 2;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = w * .1 + i * s, y = y0 + j * s;
        const t = (Math.sin(i * .35 + bias) + Math.cos(j * .5 - bias)) * .25 + .5;
        const k = r();
        if (k < t * .55) ctx.fillRect(x + s * .15, y + s * .15, s * .7, s * .7);
        else if (k < t * .55 + .25) ctx.strokeRect(x + s * .15, y + s * .15, s * .7, s * .7);
      }
    }
  }

  function grain(ctx, w, h, r, c) {
    ctx.fillStyle = c.fg;
    ctx.globalAlpha = .06;
    const n = Math.floor(w * h / 90);
    for (let i = 0; i < n; i++) ctx.fillRect(r() * w, r() * h, 1, 1);
    ctx.globalAlpha = 1;
  }

  const MODES = { waves, rings, halftone, script, bars, grid };

  window.drawPlate = function (canvas, p) {
    const mode = MODES[p.plate] ? p.plate : "halftone";
    const cssW = canvas.clientWidth || canvas.parentElement.clientWidth;
    const cssH = Math.round(cssW / ASPECT[mode]);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.height = cssH + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const c = INK[p.ink === "light" ? "light" : "dark"];
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, cssW, cssH);
    const seed = hash(p.title);
    MODES[mode](ctx, cssW, cssH, rng(seed), c, p);
    grain(ctx, cssW, cssH, rng(seed ^ 0x9e3779b9), c);
  };
})();
