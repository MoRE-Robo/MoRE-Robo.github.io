/* =========================================================
   MoRE project page — interactions
   ========================================================= */
(() => {
"use strict";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const lerp = (a, b, t) => a + (b - a) * t;
const FPS = 30000 / 1001;               // all result clips are 29.97 fps (verified with ffprobe)
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const C = {
  rigid: css("--ex-rigid") || "#1d58a7", defnp: css("--ex-defnp") || "#00a3ad", defp: css("--ex-defp") || "#8c4fbf",
  tool: css("--tool") || "#e8384f", orange: "#e5865a", navy: "#2b3a55",
};

/* visibility helper: run cb(visible) when element enters/leaves viewport */
function watchVisible(el, cb, threshold = 0.05) {
  if (!("IntersectionObserver" in window)) { cb(true); return; }
  new IntersectionObserver(es => es.forEach(e => cb(e.isIntersecting)), { threshold }).observe(el);
}

/* ---------------- KaTeX ---------------- */
function renderTex() {
  $$("[data-tex]").forEach(el => {
    const tex = el.dataset.tex;
    if (window.katex) {
      try { katex.render(tex, el, { displayMode: !el.classList.contains("tex-inline"), throwOnError: false }); }
      catch (e) { el.textContent = tex; }
    } else el.textContent = tex;
  });
}

/* ---------------- top bar / progress / toc ---------------- */
function initChrome() {
  const bar = $("#topbar"), prog = $("#readProgress");
  const onScroll = () => {
    bar.classList.toggle("scrolled", window.scrollY > window.innerHeight * 0.6);
    const h = document.documentElement.scrollHeight - window.innerHeight;
    prog.style.width = (h > 0 ? (window.scrollY / h) * 100 : 0) + "%";
  };
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

  const toc = $("#toc"), tog = $("#tocToggle");
  tog.addEventListener("click", e => { e.stopPropagation(); const o = toc.classList.toggle("open"); tog.setAttribute("aria-expanded", o); });
  document.addEventListener("click", e => { if (!toc.contains(e.target)) { toc.classList.remove("open"); tog.setAttribute("aria-expanded", false); } });
  $$("a", toc).forEach(a => a.addEventListener("click", () => toc.classList.remove("open")));

  // active section tracking
  const links = $$(".toc a");
  const targets = links.map(a => document.getElementById(a.getAttribute("href").slice(1))).filter(Boolean);
  const setActive = () => {
    const y = window.scrollY + window.innerHeight * 0.3;
    let cur = targets[0];
    targets.forEach(t => { if (t.getBoundingClientRect().top + window.scrollY <= y) cur = t; });
    links.forEach(a => {
      const on = a.getAttribute("href") === "#" + cur.id;
      a.classList.toggle("active", on);
    });
    // parent highlight
    links.forEach(a => a.classList.remove("active-parent"));
    const act = links.find(a => a.classList.contains("active"));
    if (act) { const p = act.closest("ol")?.closest("li")?.querySelector(":scope > a"); if (p) p.classList.add("active-parent"); }
  };
  window.addEventListener("scroll", setActive, { passive: true }); setActive();
}

/* ---------------- reveal + counters ---------------- */
function initReveal() {
  const els = $$("[data-reveal]");
  if (!("IntersectionObserver" in window) || reduceMotion) { els.forEach(e => { e.classList.add("in"); e.dispatchEvent(new Event("reveal")); }); return; }
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add("in"); e.target.dispatchEvent(new Event("reveal")); io.unobserve(e.target); }
  }), { threshold: 0.18 });
  els.forEach(e => io.observe(e));
}
function onReveal(el, fn) {
  if (!el) return;
  if (el.classList.contains("in")) fn(); else el.addEventListener("reveal", fn, { once: true });
}
function initCounters() {
  const box = $(".stats");
  onReveal(box, () => {
    $$("[data-count]", box).forEach(el => {
      const end = parseFloat(el.dataset.count), dec = parseInt(el.dataset.dec || "0", 10);
      const t0 = performance.now(), dur = 1400;
      const step = now => {
        const p = clamp((now - t0) / dur); el.textContent = (end * ease(p)).toFixed(dec);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  });
}

/* ---------------- capability table ---------------- */
function initCapTable() {
  const rows = [
    ["PhysTwin", "nnny"], ["PhysGaussian", "nnny"], ["AdaptiGraph", "nnny"], ["ParticleFormer", "yydy"],
    ["Points2Plans", "ynny"], ["RoboDreamer", "ynnn"], ["DINO-WM", "yyyn"], ["PointWorld", "yyyy"], ["MoRE (ours)", "yyyy"],
  ];
  const tb = $("#capTable tbody");
  rows.forEach(([n, f], i) => {
    const tr = document.createElement("tr");
    if (i === rows.length - 1) tr.className = "ours";
    tr.innerHTML = `<td>${n}</td>` + [...f].map((c, j) => {
      const sym = c === "y" ? "✓" : c === "n" ? "✗" : "✓†";
      return `<td><span class="mk ${c}" style="transition-delay:${(i * 4 + j) * 28}ms">${sym}</span></td>`;
    }).join("");
    tb.appendChild(tr);
  });
}

/* =========================================================
   Point-cloud engine (schematic 3D dynamics)
   ========================================================= */
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function makeObject(kind, seed = 7) {
  const r = rng(seed), pts = [];
  if (kind === "rigid") {                       // box surface, 1.0 x 0.62 x 0.72
    const W = 1.0, H = 0.62, D = 0.72;
    for (let i = 0; i < 300; i++) {
      const f = Math.floor(r() * 6), a = r() - .5, b = r() - .5;
      let p;
      if (f === 0) p = [-W / 2, (a + .5) * H, b * D]; else if (f === 1) p = [W / 2, (a + .5) * H, b * D];
      else if (f === 2) p = [a * W, 0, b * D]; else if (f === 3) p = [a * W, H, b * D];
      else if (f === 4) p = [a * W, (b + .5) * H, -D / 2]; else p = [a * W, (b + .5) * H, D / 2];
      pts.push(p);
    }
  } else if (kind === "defnp") {               // soft blob
    for (let i = 0; i < 340; i++) {
      const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const n = 1 + (r() - .5) * .06;
      let y = 0.42 * u * n + 0.38; if (y < 0.02) y = 0.02 + r() * .02;
      pts.push([0.62 * s * Math.cos(th) * n, y, 0.52 * s * Math.sin(th) * n]);
    }
  } else {                                     // plush: body + head + 4 limbs, lying flat
    const add = (cx, cy, cz, rx, ry, rz, n) => { for (let i = 0; i < n; i++) { const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u); pts.push([cx + rx * s * Math.cos(th), Math.max(0.02, cy + ry * u), cz + rz * s * Math.sin(th)]); } };
    add(0, .2, 0, .5, .18, .3, 150); add(-.66, .2, 0, .2, .17, .2, 60);
    [[.2, .42], [.2, -.42], [.62, .32], [.62, -.32]].forEach(([x, z]) => {
      for (let i = 0; i < 26; i++) { const t = r(); pts.push([x + t * .38 + (r() - .5) * .08, .1 + (r() - .5) * .08, z * (1 + t * .55) + (r() - .5) * .08]); }
    });
  }
  return pts;
}

function makeTool(kind) {
  const pts = [];
  if (kind === "defp") {                       // two-finger gripper
    for (let f = -1; f <= 1; f += 2) for (let i = 0; i < 14; i++) pts.push([0, i * .055, f * .18, f]);
    for (let i = 0; i < 12; i++) pts.push([0, .77 + i * .06, 0, 0]);
    for (let i = -4; i <= 4; i++) pts.push([0, .77, i * .045, 0]);
  } else {                                     // paddle / pusher rod
    for (let i = 0; i < 16; i++) pts.push([0, .35 + i * .07, 0, 0]);
    for (let a = -3; a <= 3; a++) for (let b = 0; b < 4; b++) pts.push([0, .12 + b * .08, a * .06, 0]);
  }
  return pts;
}

/* returns {obj:[[x,y,z]], tool:[[x,y,z]]} at progress u (0..1) */
function poseScene(kind, base, tool, u) {
  const out = [], tl = [];
  if (kind === "rigid") {
    const ap = clamp(u / .28), v = ease(clamp((u - .28) / .72));
    const dx = 0.95 * v, th = -0.55 * v, cz = 0.18;
    const c = Math.cos(th), s = Math.sin(th);
    for (const p of base) {
      const x = p[0] - (-0.5), z = p[2] - cz;           // rotate about contact point
      out.push([-0.5 + c * x - s * z + dx, p[1], cz + s * x + c * z]);
    }
    const tipX = lerp(-1.5, -0.56, ease(ap)) + (u > .28 ? dx : 0);
    const tipZ = cz + (u > .28 ? Math.sin(th) * 0 : 0);
    for (const q of tool) tl.push([tipX - q[1] * 0.0 - (q[1] > .34 ? (q[1] - .34) * .55 : 0), q[1] < .34 ? .3 : .3 + (q[1] - .34) * .8, tipZ + q[2]]);
  } else if (kind === "defnp") {
    const ap = clamp(u / .28), v = ease(clamp((u - .28) / .72));
    const d = 0.32 * v, drift = 0.42 * v, cx = -0.62, cy = 0.36;
    for (const p of base) {
      const dd = (p[0] - cx) ** 2 + (p[1] - cy) ** 2 * 1.4 + p[2] ** 2;
      const w = Math.exp(-dd / 0.16);
      out.push([p[0] + drift * (0.55 + 0.45 * w) + d * w, p[1] + 0.05 * d * w, p[2] * (1 + 0.35 * d * w * 3)]);
    }
    const tipX = lerp(-1.6, cx - 0.04, ease(ap)) + (u > .28 ? d + drift : 0);
    for (const q of tool) tl.push([tipX - (q[1] > .34 ? (q[1] - .34) * .5 : 0), q[1] < .34 ? .36 : .36 + (q[1] - .34) * .8, q[2]]);
  } else {
    const desc = ease(clamp(u / .2)), close = ease(clamp((u - .2) / .12)), v = ease(clamp((u - .34) / .66));
    const gx = -0.66, lift = 0.75 * v, drag = 0.55 * v, sq = 0.35 * close;
    for (const p of base) {
      const dist = Math.hypot(p[0] - gx, p[2]);
      const w = Math.exp(-dist / 0.42);
      out.push([p[0] + drag * (0.35 + 0.65 * w), p[1] + lift * Math.pow(w, 1.15), p[2] * (1 - sq * w * w)]);
    }
    const gy = lerp(1.1, 0.04, desc) + lift;
    for (const q of tool) tl.push([gx + drag, gy + q[1], q[3] ? q[2] * (1 - 0.55 * close) : q[2]]);
  }
  return { obj: out, tool: tl };
}

function hueOf(p) { return (((p[0] + 1) * 140 + p[2] * 160 + p[1] * 90) % 360 + 360) % 360; }

class PCRenderer {
  constructor(canvas, opts) {
    this.c = canvas; this.ctx = canvas.getContext("2d"); this.o = Object.assign({ scale: 1, trails: true, alpha: 1, grid: true }, opts);
    this.resize(); new ResizeObserver(() => this.resize()).observe(canvas);
  }
  resize() {
    const r = window.devicePixelRatio || 1, w = this.c.clientWidth, h = this.c.clientHeight;
    this.c.width = Math.max(1, w * r); this.c.height = Math.max(1, h * r); this.ctx.setTransform(r, 0, 0, r, 0, 0); this.w = w; this.h = h;
  }
  setCam(yaw, pitch, dist, cx = 0, cy = 0.35, cz = 0, zoom = 1) {
    this.cam = { cy_: Math.cos(yaw), sy_: Math.sin(yaw), cp: Math.cos(pitch), sp: Math.sin(pitch), dist, cx, cy, cz, zoom };
  }
  proj(p) {
    const k = this.cam; let x = p[0] - k.cx, y = p[1] - k.cy, z = p[2] - k.cz;
    const x1 = k.cy_ * x + k.sy_ * z, z1 = -k.sy_ * x + k.cy_ * z;
    const y2 = k.cp * y - k.sp * z1, z2 = k.sp * y + k.cp * z1;
    const f = Math.min(this.w, this.h * 1.25) * 0.9 * k.zoom * this.o.scale / (k.dist - z2);
    return [this.w / 2 + x1 * f, this.h * 0.56 - y2 * f, z2, f];
  }
}

function drawScene(R, items, time) {
  const g = R.ctx;
  // grid floor
  if (R.o.grid) {
    g.lineWidth = 1;
    for (let i = -6; i <= 6; i++) {
      const a = R.proj([i * .4, 0, -2.4]), b = R.proj([i * .4, 0, 2.4]);
      const c = R.proj([-2.4, 0, i * .4]), d = R.proj([2.4, 0, i * .4]);
      g.strokeStyle = `rgba(150,180,230,${0.08 * R.o.alpha})`;
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.moveTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.stroke();
    }
  }
  for (const it of items) {
    const { kind, base, tool, u, color, offset = [0, 0, 0], sc = 1, fade = 1 } = it;
    const tr = p => [p[0] * sc + offset[0], p[1] * sc + offset[1], p[2] * sc + offset[2]];
    const now = poseScene(kind, base, tool, u);
    // flow trails
    if (R.o.trails && u > .3) {
      const K = 9, past = [];
      for (let k = 1; k <= K; k++) past.push(poseScene(kind, base, tool, Math.max(0, u - k * 0.03)).obj);
      g.lineWidth = 1.15;
      for (let i = 0; i < now.obj.length; i += 2) {
        const h = hueOf(base[i]);
        let prev = R.proj(tr(now.obj[i]));
        for (let k = 0; k < K; k++) {
          const q = R.proj(tr(past[k][i]));
          g.strokeStyle = `hsla(${h},95%,64%,${(1 - k / K) * 0.75 * fade * R.o.alpha})`;
          g.beginPath(); g.moveTo(prev[0], prev[1]); g.lineTo(q[0], q[1]); g.stroke(); prev = q;
        }
      }
    }
    // points sorted by depth
    const P = now.obj.map(p => R.proj(tr(p))).map((q, i) => [q, 0, i]);
    const T = now.tool.map(p => [R.proj(tr(p)), 1]);
    const all = P.concat(T).sort((a, b) => a[0][2] - b[0][2]);
    for (const [q, isTool] of all) {
      const depth = clamp(0.55 + q[2] * 0.25, 0.25, 1);
      const rad = Math.max(0.9, q[3] * (isTool ? 0.022 : 0.016));
      g.globalAlpha = (isTool ? 0.95 : 0.55 + 0.45 * depth) * fade * R.o.alpha;
      g.fillStyle = isTool ? C.tool : color;
      g.beginPath(); g.arc(q[0], q[1], rad, 0, 6.283); g.fill();
    }
    g.globalAlpha = 1;
  }
}

/* loop timing: hold, act, hold, fade */
function phaseU(t) {                      // t in [0,1)
  const u = clamp((t - 0.06) / 0.7);
  const fade = t > 0.9 ? 1 - (t - 0.9) / 0.1 : t < 0.04 ? t / 0.04 : 1;
  return { u, fade };
}

function initHero() {
  const cv = $("#heroCanvas"); if (!cv) return;
  const R = new PCRenderer(cv, { trails: true, alpha: 0.85, grid: true });
  const kinds = ["rigid", "defnp", "defp"], cols = [C.rigid, "#86d2ca", "#c6b3ea"];
  const objs = kinds.map((k, i) => ({ kind: k, base: makeObject(k, 11 + i), tool: makeTool(k), color: cols[i] }));
  let vis = true; watchVisible(cv, v => vis = v);
  const t0 = performance.now();
  const frame = now => {
    requestAnimationFrame(frame);
    if (!vis) return;
    const t = (now - t0) / 1000;
    R.ctx.clearRect(0, 0, R.w, R.h);
    const narrow = R.w < 700;
    R.setCam(0.5 + t * 0.06, 0.42, narrow ? 9.5 : 8.2, 0, narrow ? 1.6 : 1.25, 0, 1);
    const items = objs.map((o, i) => {
      const ang = i * 2.094 + 0.3, rad = 3.1;
      const { u, fade } = phaseU(((t / 6) + i * 0.33) % 1);
      return Object.assign({}, o, { u, fade, offset: [Math.cos(ang) * rad, 0, Math.sin(ang) * rad], sc: 1.15 });
    });
    if (reduceMotion) items.forEach(it => { it.u = .7; it.fade = 1; });
    drawScene(R, items, t);
  };
  requestAnimationFrame(frame);
}

/* ---------------- MoE explorer ---------------- */
const REGIMES = {
  rigid: { name: "Rigid · Non-prehensile", color: C.rigid, idx: 0,
    text: "The object moves as one piece. The router sends the latent <b>z<sub>t</sub></b> to the <b>rigid expert</b>, which outputs a 6D rotation + translation and rigidly warps the cloud, so every point moves coherently and rigidity error stays at <b>0.0</b>." },
  defnp: { name: "Deformable · Non-prehensile", color: C.defnp, idx: 1,
    text: "A soft object dents locally where the tool pushes while drifting globally. The <b>deformable non-prehensile expert</b> predicts free-form per-point displacements <b>Δs</b> for contact-induced deformation from pushing and sliding." },
  defp: { name: "Deformable · Prehensile", color: C.defp, idx: 2,
    text: "Under a grasp, the held region follows the gripper while distant parts lag and droop. The <b>deformable prehensile expert</b> specializes in force-induced shape change: squeezing, lifting and stretching." },
};

function buildMoeSvg(svg) {
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs, parent = svg) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };
  const node = (x, y, w, h, t1, t2, cls = "node") => {
    const g = el("g", { class: cls, transform: `translate(${x},${y})` });
    el("rect", { width: w, height: h, rx: 10 }, g);
    const a = el("text", { x: w / 2, y: t2 ? h / 2 - 2 : h / 2 + 4 }, g); a.textContent = t1;
    if (t2) { const b = el("text", { x: w / 2, y: h / 2 + 13, class: "sub" }, g); b.textContent = t2; }
    return g;
  };
  const path = (d, cls, extra = {}) => el("path", Object.assign({ d, class: cls }, extra));
  const E = [
    "M118 68 L150 68", "M118 278 L150 278", "M118 84 C135 84 130 262 150 262",
    "M268 68 C290 68 280 165 300 165", "M268 278 C290 278 280 185 300 185", "M350 201 L350 268",
  ];
  E.forEach(d => path(d, "edge"));
  E.forEach(d => path(d, "flow"));
  const ex = [{ y: 40, k: "rigid", t: "Rigid NP", s: "SE(3) warp" }, { y: 145, k: "defnp", t: "Deformable NP", s: "per-point Δs" }, { y: 250, k: "defp", t: "Deformable P", s: "per-point Δs" }];
  const fuseEdges = {}, selEdges = {}, outEdges = {};
  ex.forEach(e => {
    fuseEdges[e.k] = path(`M400 173 C418 173 414 ${e.y + 28} 432 ${e.y + 28}`, "edge");
    selEdges[e.k] = path(`M400 312 C420 312 410 ${e.y + 44} 432 ${e.y + 44}`, "sel-edge", { stroke: REGIMES[e.k].color, opacity: 0 });
    outEdges[e.k] = path(`M548 ${e.y + 28} L572 ${e.y + 28}`, "edge");
  });
  const fuseFlow = path("M400 173 L432 68", "flow"), outFlow = path("M548 68 L572 68", "flow");
  node(14, 40, 104, 56, "Object cloud", "s(t−8 … t)");
  node(14, 250, 104, 56, "Tool cloud", "a(t−8 … t+1)");
  node(150, 40, 118, 56, "Static Encoder", "Uni3D · frozen");
  node(150, 250, 118, 56, "Motion Encoder", "Transformer");
  node(300, 145, 100, 56, "Fusion  zₜ", "cross-attention");
  const router = node(300, 268, 100, 92, "Router g(z)", null);
  router.querySelector("text").setAttribute("y", 20);
  const bars = ["R", "D", "P"].map((l, i) => {
    const y = 34 + i * 17;
    const lb = el("text", { x: 12, y: y + 9, class: "gate-lbl" }, router); lb.textContent = l;
    el("rect", { x: 24, y, width: 64, height: 10, rx: 3, fill: "#e6eaf1" }, router);
    return el("rect", { x: 24, y, width: 20, height: 10, rx: 3, class: "gate-bar", fill: REGIMES[["rigid", "defnp", "defp"][i]].color }, router);
  });
  const exNodes = {};
  ex.forEach(e => {
    const g = node(432, e.y, 116, 56, e.t, e.s, "node expert"); exNodes[e.k] = g;
    g.querySelector("rect").setAttribute("stroke", REGIMES[e.k].color);
  });
  const out = el("g", { class: "node", transform: "translate(572,40)" });
  el("rect", { width: 58, height: 266, rx: 10 }, out);
  ["Future", "cloud", "ŝ", "t+1:t+H"].forEach((t, i) => { const tx = el("text", { x: 29, y: 112 + i * 16, class: i > 1 ? "" : "sub" }, out); tx.textContent = t; if (i === 3) tx.setAttribute("class", "sub"); });
  const selfLoop = path("M601 306 C601 360 350 372 120 340 C70 333 66 320 66 306", "edge", { "stroke-dasharray": "3 5" });
  const loopLbl = el("text", { x: 340, y: 372, "text-anchor": "middle", class: "gate-lbl" }); loopLbl.textContent = "autoregressive self-rollout ↺";

  return {
    select(k) {
      const col = REGIMES[k].color, y = ex.find(e => e.k === k).y;
      ex.forEach(e => {
        const on = e.k === k;
        exNodes[e.k].classList.toggle("on", on); exNodes[e.k].classList.toggle("off", !on);
        exNodes[e.k].querySelector("rect").style.fill = on ? col + "1f" : "#f4f6fa";
        selEdges[e.k].setAttribute("opacity", on ? 1 : 0);
        fuseEdges[e.k].style.stroke = on ? col : "#d5dbe6";
        outEdges[e.k].style.stroke = on ? col : "#d5dbe6";
      });
      fuseFlow.setAttribute("d", `M400 173 C418 173 414 ${y + 28} 432 ${y + 28}`); fuseFlow.style.stroke = col;
      outFlow.setAttribute("d", `M548 ${y + 28} L572 ${y + 28}`); outFlow.style.stroke = col;
      // gating: noisy soft scores → one-hot
      const idx = REGIMES[k].idx;
      bars.forEach((b, i) => b.setAttribute("width", 10 + Math.random() * 40));
      setTimeout(() => bars.forEach((b, i) => b.setAttribute("width", i === idx ? 64 : 3)), 450);
    },
  };
}

function initMoe() {
  const cv = $("#moeCanvas"), svg = $("#moeSvg"); if (!cv) return;
  const D = buildMoeSvg(svg);
  const R = new PCRenderer(cv, { trails: true, alpha: 1, grid: true });
  const cache = {}; const get = k => cache[k] || (cache[k] = { kind: k, base: makeObject(k, 5), tool: makeTool(k) });
  let cur = "rigid", t0 = performance.now(), vis = false;
  const ex = $("#moeExplain");
  const setK = k => {
    cur = k; t0 = performance.now(); D.select(k);
    ex.innerHTML = `<div class="badge" style="background:${REGIMES[k].color}">Router → <br/>${REGIMES[k].name}</div><p>${REGIMES[k].text}</p>`;
  };
  $$('[data-tabs="moe"] .tab').forEach(b => b.addEventListener("click", () => {
    $$('[data-tabs="moe"] .tab').forEach(x => x.classList.toggle("active", x === b)); setK(b.dataset.key);
  }));
  setK("rigid");
  watchVisible(cv, v => vis = v);
  const frame = now => {
    requestAnimationFrame(frame); if (!vis) return;
    const t = (now - t0) / 1000;
    R.ctx.clearRect(0, 0, R.w, R.h);
    R.setCam(0.65 + Math.sin(t * 0.25) * 0.35, 0.5, 4.6, 0.25, 0.4, 0, 1.85);
    const { u, fade } = phaseU((t / 5) % 1);
    drawScene(R, [Object.assign({}, get(cur), { u: reduceMotion ? .7 : u, fade, color: "#e9f0ff" })], t);
  };
  requestAnimationFrame(frame);
}

/* ---------------- self-rollout strip ---------------- */
function initRollout() {
  const row = $("#rolloutRow"); if (!row) return;
  const labels = ["s<sub>t−2</sub>", "s<sub>t−1</sub>", "s<sub>t</sub>", "ŝ<sub>t+1</sub>", "ŝ<sub>t+2</sub>", "ŝ<sub>t+3</sub>"];
  const nodes = [], arrows = [];
  labels.forEach((l, i) => {
    if (i) { const a = document.createElement("div"); a.className = "ro-arrow"; row.appendChild(a); arrows.push(a); }
    const n = document.createElement("div"); n.className = "ro-node"; n.innerHTML = l; row.appendChild(n); nodes.push(n);
  });
  let k = 0, vis = false; watchVisible(row, v => vis = v);
  const tick = () => {
    if (vis) {
      nodes.forEach((n, i) => {
        n.className = "ro-node " + (i < 2 ? "hist" : i === 2 ? "cur" : i - 2 <= k ? "pred" : "ghost");
      });
      arrows.forEach((a, i) => a.classList.toggle("on", i >= 2 && i - 1 <= k));
      k = (k + 1) % 4;
    }
    setTimeout(tick, 900);
  };
  tick();
}

/* ---------------- MPC planner canvas ---------------- */
function initPlanner() {
  const cv = $("#mpcCanvas"); if (!cv) return;
  const g = cv.getContext("2d"), hud = $("#mpcHud"), steps = $$("#mpcSteps li");
  let W = 0, H = 0;
  const resize = () => { const r = devicePixelRatio || 1; W = cv.clientWidth; H = cv.clientHeight; cv.width = W * r; cv.height = H * r; g.setTransform(r, 0, 0, r, 0, 0); };
  resize(); new ResizeObserver(resize).observe(cv);
  const BW = 0.17, BH = 0.11;                         // box size (normalized to width)
  const body = []; for (let i = 0; i <= 10; i++) for (let j = 0; j <= 6; j++) body.push([(i / 10 - .5) * BW, (j / 6 - .5) * BH]);
  const goal = { x: 0.7, y: 0.36, th: -0.35 };
  const start = () => ({ x: 0.27, y: 0.6, th: 0.35 });
  let st = start(), phase = 0, pt = 0, iter = 0, cands = [], best = null, from = null, last = performance.now(), vis = false;
  watchVisible(cv, v => vis = v);
  const tf = (s, p) => [s.x + Math.cos(s.th) * p[0] - Math.sin(s.th) * p[1], s.y + Math.sin(s.th) * p[0] + Math.cos(s.th) * p[1]];
  const angD = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  const cost = s => Math.hypot(s.x - goal.x, s.y - goal.y) + 0.09 * Math.abs(angD(s.th, goal.th));
  const sample = () => {
    cands = [];
    const per = [];                                   // 16 contact points along perimeter
    for (let i = 0; i < 16; i++) {
      const t = i / 16 * 2 * (BW + BH); let p, n;
      if (t < BW) { p = [t - BW / 2, -BH / 2]; n = [0, 1]; }
      else if (t < BW + BH) { p = [BW / 2, t - BW - BH / 2]; n = [-1, 0]; }
      else if (t < 2 * BW + BH) { p = [BW / 2 - (t - BW - BH), BH / 2]; n = [0, -1]; }
      else { p = [-BW / 2, BH / 2 - (t - 2 * BW - BH)]; n = [1, 0]; }
      per.push([p, n]);
    }
    per.forEach(([p, n]) => [-0.5, 0, 0.5].forEach(da => {
      const ca = Math.cos(da), sa = Math.sin(da);
      const dl = [n[0] * ca - n[1] * sa, n[0] * sa + n[1] * ca];
      const c = Math.cos(st.th), s = Math.sin(st.th);
      const dw = [c * dl[0] - s * dl[1], s * dl[0] + c * dl[1]];
      const cw = tf(st, p);
      const L = 0.075, r = [cw[0] - st.x, cw[1] - st.y];
      const torque = r[0] * dw[1] - r[1] * dw[0];
      const pred = { x: st.x + dw[0] * L, y: st.y + dw[1] * L, th: st.th + torque * 5.5 };
      cands.push({ cw, dw, pred, c: cost(pred) });
    }));
    const cs = cands.map(c => c.c), lo = Math.min(...cs), hi = Math.max(...cs);
    cands.forEach(c => c.n = (c.c - lo) / (hi - lo + 1e-9));
    best = cands.reduce((a, b) => (a.c < b.c ? a : b));
  };
  const dur = [1300, 1100, 1300, 900, 1200, 1700];   // probe, sample, rollout, score, execute, done
  const drawBox = (s, col, alpha, r = 2.1, outline = false) => {
    g.globalAlpha = alpha; g.fillStyle = col;
    body.forEach(p => { const q = tf(s, p); g.beginPath(); g.arc(q[0] * W, q[1] * W, r, 0, 6.283); g.fill(); });
    if (outline) {
      g.strokeStyle = col; g.lineWidth = 1.2; g.setLineDash([4, 4]); g.beginPath();
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach((k, i) => { const q = tf(s, [k[0] * BW / 2, k[1] * BH / 2]); i ? g.lineTo(q[0] * W, q[1] * W) : g.moveTo(q[0] * W, q[1] * W); });
      g.closePath(); g.stroke(); g.setLineDash([]);
    }
    g.globalAlpha = 1;
  };
  const arrow = (a, d, len, col, alpha, w = 1.2) => {
    const x0 = (a[0] - d[0] * len) * W, y0 = (a[1] - d[1] * len) * W, x1 = a[0] * W, y1 = a[1] * W;
    g.globalAlpha = alpha; g.strokeStyle = col; g.fillStyle = col; g.lineWidth = w;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    const ang = Math.atan2(y1 - y0, x1 - x0); g.beginPath(); g.moveTo(x1, y1);
    g.lineTo(x1 - 6 * Math.cos(ang - .5), y1 - 6 * Math.sin(ang - .5)); g.lineTo(x1 - 6 * Math.cos(ang + .5), y1 - 6 * Math.sin(ang + .5)); g.fill();
    g.globalAlpha = 1;
  };
  const colFor = n => `hsl(${lerp(140, 0, n)},70%,48%)`;
  const frame = now => {
    requestAnimationFrame(frame);
    const dt = now - last; last = now; if (!vis) return;
    pt += dt;
    if (pt > dur[phase]) {
      pt = 0;
      if (phase === 0) { phase = 1; sample(); }
      else if (phase === 1) phase = 2;
      else if (phase === 2) phase = 3;
      else if (phase === 3) { phase = 4; from = Object.assign({}, st); }
      else if (phase === 4) { st = Object.assign({}, best.pred); iter++; if (cost(st) < 0.035 || iter >= 9) phase = 5; else { phase = 1; sample(); } }
      else { st = start(); iter = 0; phase = 0; }
    }
    const p = clamp(pt / dur[phase]);
    g.clearRect(0, 0, W, H);
    // table grid
    g.strokeStyle = "#eef1f6"; g.lineWidth = 1;
    for (let x = 0; x < W; x += W / 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y < H; y += W / 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    // goal
    drawBox(goal, "#4f78b3", 0.25, 2, true);
    g.fillStyle = "#4f78b3"; g.font = "500 11px Roboto Mono, monospace"; g.fillText("goal", (goal.x - BW / 2) * W, (goal.y - BH / 2) * W - 8);
    let cur = st;
    if (phase === 0) { const j = Math.sin(p * Math.PI * 6) * 0.006 * (1 - p); cur = { x: st.x + j, y: st.y, th: st.th + j * 2 }; }
    if (phase === 1) cands.forEach((c, i) => { if (i / cands.length < p * 1.1) arrow(c.cw, c.dw, 0.05, "#7a879c", 0.55, 1); });
    if (phase === 2) cands.forEach((c, i) => { const a = clamp(p * 1.4 - i / cands.length * 0.4); arrow(c.cw, c.dw, 0.05, "#7a879c", 0.25, 1); if (a > 0) drawBox(c.pred, colFor(c.n), 0.12 * a, 1.2); });
    if (phase === 3) {
      cands.forEach(c => { if (c !== best) drawBox(c.pred, colFor(c.n), 0.08 * (1 - p), 1.1); });
      drawBox(best.pred, C.orange, 0.35 + 0.4 * p, 2, true); arrow(best.cw, best.dw, 0.07, C.orange, 1, 2.4);
    }
    if (phase === 4) {
      const e = ease(p); cur = { x: lerp(from.x, best.pred.x, e), y: lerp(from.y, best.pred.y, e), th: lerp(from.th, best.pred.th, e) };
      const c = tf(cur, [0, 0]); const off = [best.cw[0] - from.x, best.cw[1] - from.y];
      const tip = [c[0] + off[0] * Math.cos(cur.th - from.th) - off[1] * Math.sin(cur.th - from.th), c[1] + off[0] * Math.sin(cur.th - from.th) + off[1] * Math.cos(cur.th - from.th)];
      g.fillStyle = C.tool; for (let k = 0; k < 7; k++) { g.beginPath(); g.arc((tip[0] - best.dw[0] * (0.012 + k * 0.009)) * W, (tip[1] - best.dw[1] * (0.012 + k * 0.009)) * W, 3, 0, 6.283); g.fill(); }
    }
    if (phase === 0) { g.fillStyle = C.tool; const q = tf(cur, [-BW / 2 - 0.02, 0]); g.beginPath(); g.arc(q[0] * W, q[1] * W, 4, 0, 6.283); g.fill(); }
    drawBox(cur, phase === 5 ? "#1b8a4a" : C.navy, 0.9, 2.2);
    // hud + list
    const stepIdx = phase === 5 ? 4 : phase;
    steps.forEach((li, i) => li.classList.toggle("on", i === stepIdx));
    const cd = (cost(cur) * 0.1).toFixed(4);
    hud.innerHTML = phase === 5 ? `<b>goal reached ✓</b><br/>${iter} MPC steps` :
      `MPC step <b>${iter + (phase ? 1 : 0)}</b><br/>${phase === 0 ? "router → rigid-NP" : phase >= 1 && phase <= 3 ? "48 candidates" : "executing"}<br/>cost ≈ ${cd}`;
  };
  requestAnimationFrame(frame);
}

/* ---------------- donut ---------------- */
function initDonut() {
  const data = [
    { k: "Sim · rigid", n: 12954, c: "#1d58a7", grp: "Simulation (Isaac Lab)" },
    { k: "Sim · soft", n: 17268, c: "#00a3ad" },
    { k: "Real · toy (PGND)", n: 1474, c: "#8c4fbf", grp: "Real world" },
    { k: "DROID · non-prehensile", n: 2535, c: "#ff5f05" },
    { k: "DROID · prehensile", n: 4501, c: "#c84113" },
  ];
  const tot = data.reduce((a, b) => a + b.n, 0);
  const svg = $("#donut"), lg = $("#donutLegend"), NS = "http://www.w3.org/2000/svg";
  const cx = 110, cy = 110, r = 84, sw = 30, circ = 2 * Math.PI * r;
  let acc = 0; const arcs = [];
  const bg = document.createElementNS(NS, "circle"); Object.entries({ cx, cy, r, fill: "none", stroke: "#eef1f6", "stroke-width": sw }).forEach(([a, b]) => bg.setAttribute(a, b)); svg.appendChild(bg);
  data.forEach((d, i) => {
    const frac = d.n / tot, c = document.createElementNS(NS, "circle");
    Object.entries({ cx, cy, r, fill: "none", stroke: d.c, "stroke-width": sw, "stroke-dasharray": `0 ${circ}`, transform: `rotate(${-90 + acc * 360} ${cx} ${cy})` }).forEach(([a, b]) => c.setAttribute(a, b));
    c.style.transition = `stroke-dasharray 1s ${i * 0.12}s cubic-bezier(.25,1,.35,1), stroke-width .2s`;
    c.dataset.len = Math.max(0, frac * circ - 2);
    svg.appendChild(c); arcs.push(c); acc += frac;
    if (d.grp) { const g = document.createElement("li"); g.className = "grp"; g.textContent = d.grp; lg.appendChild(g); }
    const li = document.createElement("li");
    li.innerHTML = `<i style="background:${d.c}"></i><span>${d.k}</span><b>${d.n.toLocaleString()}</b>`;
    li.addEventListener("mouseenter", () => { c.setAttribute("stroke-width", sw + 8); center(d); });
    li.addEventListener("mouseleave", () => { c.setAttribute("stroke-width", sw); center(); });
    c.addEventListener("mouseenter", () => { c.setAttribute("stroke-width", sw + 8); li.classList.add("hov"); center(d); });
    c.addEventListener("mouseleave", () => { c.setAttribute("stroke-width", sw); li.classList.remove("hov"); center(); });
    lg.appendChild(li);
  });
  const t1 = document.createElementNS(NS, "text"), t2 = document.createElementNS(NS, "text");
  [[t1, 112, 26, 800, "#13294b"], [t2, 132, 11, 600, "#6b7690"]].forEach(([t, y, fs, fw, f]) => { Object.entries({ x: cx, y, "text-anchor": "middle", "font-size": fs, "font-weight": fw, fill: f }).forEach(([a, b]) => t.setAttribute(a, b)); svg.appendChild(t); });
  const center = d => {
    if (d) { t1.textContent = (d.n / tot * 100).toFixed(1) + "%"; t2.textContent = d.k; }
    else { t1.textContent = tot.toLocaleString(); t2.textContent = "episodes"; }
  };
  center();
  onReveal(svg.closest("[data-reveal]"), () => arcs.forEach(a => a.setAttribute("stroke-dasharray", `${a.dataset.len} ${circ}`)));
}

/* ---------------- copy ---------------- */
function initCopy() {
  const toast = $("#toast");
  $$(".copy-btn").forEach(b => b.addEventListener("click", async () => {
    const txt = document.getElementById(b.dataset.copy).innerText;
    try { await navigator.clipboard.writeText(txt); } catch (e) {
      const ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), 1300);
  }));
}

/* =========================================================
   Video players
   ========================================================= */
const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 4h4.5v16H6zM13.5 4H18v16h-4.5z" fill="currentColor"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M6 5h2.5v14H6zM20 5v14L9.5 12z" fill="currentColor"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M15.5 5H18v14h-2.5zM4 5v14l10.5-7z" fill="currentColor"/></svg>',
  stepB: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  stepF: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
function mkVideo() {
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.setAttribute("playsinline", ""); v.setAttribute("muted", ""); v.preload = "auto";
  return v;
}

/* ---------- frame-accurate scrubber ---------- */
class ScrubPlayer {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="stage is-loading"><div class="loading">loading…</div><button class="big-play" aria-label="Play">${ICON.play}</button></div>
      <div class="ctrl">
        <button class="icon-btn main" data-a="play" aria-label="Play / pause">${ICON.play}</button>
        <button class="icon-btn" data-a="back" aria-label="Previous frame">${ICON.stepB}</button>
        <div class="scrub-wrap">
          <div class="scrub-track"><div class="scrub-fill"></div></div>
          <div class="scrub-band" hidden></div>
          <div class="scrub-ticks"></div>
          <input type="range" min="0" max="1" step="1" value="0" aria-label="Frame" />
        </div>
        <button class="icon-btn" data-a="fwd" aria-label="Next frame">${ICON.stepF}</button>
        <div class="readout"></div>
        <select class="speed" aria-label="Playback speed"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option></select>
      </div>
      <p class="scrub-hint">Drag to scrub · ← / → step one frame · 29.97 fps</p>`;
    this.stage = $(".stage", root); this.v = mkVideo(); this.stage.prepend(this.v);
    this.range = $("input", root); this.fill = $(".scrub-fill", root); this.band = $(".scrub-band", root);
    this.ticks = $(".scrub-ticks", root); this.read = $(".readout", root); this.btn = $('[data-a="play"]', root);
    this.v.loop = true; this.userPaused = false; this.visible = false; this.onFrame = null;
    const toggle = () => { if (this.v.paused) { this.userPaused = false; this.v.play().catch(() => {}); } else { this.userPaused = true; this.v.pause(); } };
    this.btn.addEventListener("click", toggle); $(".big-play", root).addEventListener("click", toggle);
    this.v.addEventListener("click", toggle);
    $('[data-a="back"]', root).addEventListener("click", () => this.step(-1));
    $('[data-a="fwd"]', root).addEventListener("click", () => this.step(1));
    $(".speed", root).addEventListener("change", e => this.v.playbackRate = parseFloat(e.target.value));
    this.range.addEventListener("input", () => { this.v.pause(); this.userPaused = true; this.seek(+this.range.value); });
    this.range.addEventListener("keydown", e => { if (e.key === " ") { e.preventDefault(); toggle(); } });
    this.v.addEventListener("play", () => { this.btn.innerHTML = ICON.pause; this.stage.classList.add("playing"); this.loop(); });
    this.v.addEventListener("pause", () => { this.btn.innerHTML = ICON.play; this.stage.classList.remove("playing"); this.sync(); });
    this.v.addEventListener("seeked", () => this.sync());
    this.v.addEventListener("loadeddata", () => { this.stage.classList.remove("is-loading"); this.sync(); });
    this.v.addEventListener("waiting", () => this.stage.classList.add("is-loading"));
    this.v.addEventListener("playing", () => this.stage.classList.remove("is-loading"));
    watchVisible(root, vis => { this.visible = vis; if (vis && !this.userPaused) this.v.play().catch(() => {}); else if (!vis) this.v.pause(); }, 0.35);
  }
  load(clip) {
    this.clip = clip; this.frames = clip.frames;
    this.stage.classList.add("is-loading");
    this.v.poster = clip.poster || ""; this.v.src = clip.src; this.v.load();
    this.range.max = clip.frames - 1; this.range.value = 0;
    this.ticks.innerHTML = "";
    const secs = Math.floor(clip.frames / FPS);
    for (let s = 0; s <= secs; s++) { const t = document.createElement("span"); t.style.left = (s * FPS / (clip.frames - 1) * 100) + "%"; if (s % 5 === 0) t.className = "major"; this.ticks.appendChild(t); }
    this.setBand(null); this.userPaused = false;
    if (this.visible) this.v.play().catch(() => {});
    this.sync();
  }
  frame() { return clamp(Math.floor(this.v.currentTime * FPS + 1e-3), 0, this.frames - 1); }
  seek(f) { f = clamp(Math.round(f), 0, this.frames - 1); this.v.currentTime = (f + 0.5) / FPS; this.paint(f); }
  step(d) { this.v.pause(); this.userPaused = true; this.seek(this.frame() + d); }
  setBand(r) {
    if (!r) { this.band.hidden = true; return; }
    this.band.hidden = false;
    this.band.style.left = (r[0] / (this.frames - 1) * 100) + "%"; this.band.style.width = ((r[1] - r[0]) / (this.frames - 1) * 100) + "%";
  }
  paint(f) {
    this.range.value = f; this.fill.style.width = (f / (this.frames - 1) * 100) + "%";
    this.read.innerHTML = `frame <b>${String(f + 1).padStart(3, "0")}</b> / ${this.frames} · ${(f / FPS).toFixed(2)} s`;
    if (this.onFrame) this.onFrame(f);
  }
  sync() { if (this.frames) this.paint(this.frame()); }
  loop() { if (this.v.paused) return; this.sync(); requestAnimationFrame(() => this.loop()); }
}

/* ---------- MPC step player: prediction → execution pairs ---------- */
class StepPlayer {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="stage is-loading"><div class="loading">loading…</div>
        <div class="phase-hud"><span class="phase-step"></span><span class="phase-pill"></span></div>
        <div class="phase-flash"><div><div class="pf-k"></div><div class="pf-t"></div></div></div>
        <button class="big-play" aria-label="Play">${ICON.play}</button></div>
      <div class="timeline"></div>
      <div class="ctrl">
        <button class="icon-btn" data-a="prev" aria-label="Previous phase">${ICON.prev}</button>
        <button class="icon-btn main" data-a="play" aria-label="Play / pause">${ICON.play}</button>
        <button class="icon-btn" data-a="next" aria-label="Next phase">${ICON.next}</button>
        <div class="step-legend"><span><i style="background:var(--pred)"></i>MoRE prediction (planned 3D flow)</span><span><i style="background:var(--exec)"></i>Execution of the selected action</span></div>
        <div class="readout" style="margin-left:auto"></div>
      </div>`;
    this.stage = $(".stage", root); this.v = mkVideo(); this.stage.prepend(this.v);
    this.tl = $(".timeline", root); this.btn = $('[data-a="play"]', root); this.read = $(".readout", root);
    this.hStep = $(".phase-step", root); this.hPill = $(".phase-pill", root);
    this.flash = $(".phase-flash", root); this.fk = $(".pf-k", root); this.ft = $(".pf-t", root);
    this.i = 0; this.running = false; this.userPaused = false; this.visible = false; this.timer = null; this.token = 0;
    const toggle = () => this.running ? this.pause(true) : this.play();
    this.btn.addEventListener("click", toggle); $(".big-play", root).addEventListener("click", toggle); this.v.addEventListener("click", toggle);
    $('[data-a="prev"]', root).addEventListener("click", () => this.goto(Math.max(0, this.cur() > 0.15 ? this.i : this.i - 1), true));
    $('[data-a="next"]', root).addEventListener("click", () => this.goto(Math.min(this.segs.length - 1, this.i + 1), true));
    this.v.addEventListener("loadeddata", () => this.stage.classList.remove("is-loading"));
    this.v.addEventListener("waiting", () => this.stage.classList.add("is-loading"));
    this.v.addEventListener("playing", () => this.stage.classList.remove("is-loading"));
    watchVisible(root, vis => { this.visible = vis; if (vis && !this.userPaused) this.play(); else if (!vis) this.pause(false); }, 0.35);
  }
  load(clip) {
    this.token++; clearTimeout(this.timer); this.flash.classList.remove("show");
    this.clip = clip; this.stage.classList.add("is-loading");
    this.v.poster = clip.poster || ""; this.v.src = clip.src; this.v.load();
    // build segment list with step numbers
    let step = 0; this.segs = clip.seg.map(([t, a, b]) => { if (t === "P") step++; return { t, a, b, step }; });
    this.nSteps = step;
    this.tl.innerHTML = "";
    this.cells = this.segs.map((s, k) => {
      const len = s.b - s.a + 1, btn = document.createElement("button");
      btn.className = "tl-seg " + s.t + (len < 45 ? " short" : ""); btn.style.flexGrow = Math.max(len, 26); btn.style.minWidth = "30px";
      btn.innerHTML = `<span class="tl-fill"></span><span class="tl-lbl"><span class="lf">${s.t === "P" ? "Predict" : "Exec"} </span><span class="ls">${s.t}</span>${s.step}</span>`;
      btn.title = `${s.t === "P" ? "MoRE prediction" : "Execution"} · step ${s.step} · frames ${s.a}–${s.b}`;
      btn.addEventListener("click", () => this.goto(k, true));
      this.tl.appendChild(btn); return btn;
    });
    this.i = 0; this.userPaused = false; this.hud(); this.paintTl(0);
    this.v.currentTime = (this.segs[0].a + 0.5) / FPS;
    if (this.visible) this.play();
  }
  cur() { const s = this.segs[this.i]; return clamp((this.v.currentTime * FPS - s.a) / (s.b + 1 - s.a)); }
  hud() {
    const s = this.segs[this.i];
    this.hStep.textContent = `STEP ${s.step} / ${this.nSteps}`;
    this.hPill.className = "phase-pill " + s.t;
    this.hPill.textContent = s.t === "P" ? "MoRE predicts 3D flow" : "Executing best action";
    this.read.innerHTML = `frame <b>${String(clamp(Math.floor(this.v.currentTime * FPS), 0, 9999) + 1).padStart(3, "0")}</b> / ${this.clip.frames}`;
  }
  paintTl(p) {
    this.cells.forEach((c, k) => {
      c.classList.toggle("done", k < this.i); c.classList.toggle("cur", k === this.i);
      c.querySelector(".tl-fill").style.width = k === this.i ? (p * 100) + "%" : k < this.i ? "100%" : "0%";
    });
  }
  goto(k, user) {
    this.token++; clearTimeout(this.timer); this.flash.classList.remove("show");
    this.i = k; const s = this.segs[k];
    this.v.currentTime = (s.a + 0.5) / FPS; this.hud(); this.paintTl(0);
    if (user) { this.userPaused = false; }
    this.play();
  }
  play() {
    if (!this.segs) return;
    this.running = true; this.btn.innerHTML = ICON.pause; this.stage.classList.add("playing");
    this.v.play().catch(() => {}); this.tick(this.token);
  }
  pause(user) {
    this.running = false; if (user) this.userPaused = true; this.token++; clearTimeout(this.timer);
    this.flash.classList.remove("show");
    this.v.pause(); this.btn.innerHTML = ICON.play; this.stage.classList.remove("playing");
  }
  tick(tok) {
    if (tok !== this.token || !this.running) return;
    const s = this.segs[this.i], endT = (s.b + 1) / FPS;
    this.hud(); this.paintTl(this.cur());
    if (this.v.currentTime >= endT - 0.5 / FPS || this.v.ended) { this.endSeg(tok); return; }
    requestAnimationFrame(() => this.tick(tok));
  }
  endSeg(tok) {
    const s = this.segs[this.i];
    this.v.pause(); this.v.currentTime = (s.b + 0.5) / FPS; this.paintTl(1);
    const last = this.i === this.segs.length - 1, nx = this.segs[this.i + 1];
    if (last) { this.fk.textContent = `${this.nSteps} planning steps`; this.ft.innerHTML = "Rollout complete ✓"; }
    else if (s.t === "P" && nx.t === "E") { this.fk.textContent = `Step ${s.step} · plan selected`; this.ft.innerHTML = `Prediction<span class="pf-arrow">→</span>Execute`; }
    else { this.fk.textContent = `Observe new point cloud`; this.ft.innerHTML = `Re-plan<span class="pf-arrow">→</span>Step ${nx.step}`; }
    const isPred = s.t === "P" && !last;
    this.timer = setTimeout(() => {                 // let the predicted flow be seen first
      if (tok !== this.token) return;
      this.flash.classList.add("show");
      this.timer = setTimeout(() => {
      if (tok !== this.token) return;
      this.flash.classList.remove("show");
      this.i = last ? 0 : this.i + 1;
      const ns = this.segs[this.i];
      if (last || Math.abs(this.v.currentTime * FPS - ns.a) > 1.5) this.v.currentTime = (ns.a + 0.5) / FPS;
      this.hud(); this.paintTl(0);
      this.v.play().catch(() => {}); this.tick(tok);
      }, last ? 1800 : isPred ? 700 : 900);
    }, isPred ? 1300 : 0);
  }
}

/* ---------- clip data (frame ranges detected from the flow overlays, 0-indexed, inclusive) ---------- */
const V = "assets/web/";
const CLIPS = {
  simdyn: {
    bottle: { src: V + "push_bottle.mp4", poster: V + "push_bottle.jpg", frames: 447,
      cap: "<b>Rigid · non-prehensile.</b> A paddle pushes a plastic bottle that both rolls and slides. MoRE's predicted per-point 3D trajectories (rainbow) capture the rolling motion under end-effector contact." },
    stapler: { src: V + "push_stapler.mp4", poster: V + "push_stapler.jpg", frames: 385,
      cap: "<b>Rigid · non-prehensile.</b> A tool pushes a stapler. The rigid expert keeps the predicted flow globally coherent, so the object translates and rotates as one body." },
  },
  realdyn: { src: V + "unified.mp4", poster: V + "unified.jpg", frames: 353,
    chapters: [[0, 118], [119, 200], [201, 282], [283, 352]] },
  mpcsim: {
    shampoo: { src: V + "mpc_shampoo.mp4", poster: V + "mpc_shampoo.jpg", frames: 497,
      seg: [["P", 0, 6], ["E", 7, 101], ["P", 102, 149], ["E", 150, 269], ["P", 270, 366], ["E", 367, 496]] },
    toothpaste: { src: V + "mpc_toothpaste.mp4", poster: V + "mpc_toothpaste.jpg", frames: 417,
      seg: [["P", 0, 5], ["E", 6, 111], ["P", 112, 143], ["E", 144, 314], ["P", 315, 325], ["E", 326, 416]] },
    cap: { src: V + "mpc_cap.mp4", poster: V + "mpc_cap.jpg", frames: 433,
      seg: [["P", 0, 12], ["E", 13, 156], ["P", 157, 160], ["E", 161, 286], ["P", 287, 305], ["E", 306, 432]] },
    sheep: { src: V + "mpc_sheep.mp4", poster: V + "mpc_sheep.jpg", frames: 385,
      seg: [["P", 0, 5], ["E", 6, 117], ["P", 118, 126], ["E", 127, 268], ["P", 269, 289], ["E", 290, 384]] },
  },
  mpcreal: {
    box: { src: V + "mpc_box.mp4", poster: V + "mpc_box.jpg", frames: 348,
      seg: [["P", 0, 33], ["E", 34, 89], ["P", 90, 122], ["E", 123, 176], ["P", 177, 209], ["E", 210, 254], ["P", 255, 288], ["E", 289, 347]] },
    sloth: { src: V + "mpc_sloth.mp4", poster: V + "mpc_sloth.jpg", frames: 278,
      seg: [["P", 0, 50], ["E", 51, 90], ["P", 91, 140], ["E", 141, 208], ["P", 209, 235], ["E", 236, 277]] },
  },
};

function bindTabs(viewer, onPick) {
  const tabs = $$(".tab", viewer);
  tabs.forEach(t => t.addEventListener("click", () => { tabs.forEach(x => x.classList.toggle("active", x === t)); onPick(t.dataset.key); }));
  return tabs;
}

function initPlayers() {
  if (!$("#simdynPlayer") || !$("#realdynPlayer") || !$("#mpcsimPlayer") || !$("#mpcrealPlayer")) return;
  // sim dynamics
  const sd = new ScrubPlayer($("#simdynPlayer")), sdCap = $("#simdynCap");
  const pickSd = k => { sd.load(CLIPS.simdyn[k]); sdCap.innerHTML = CLIPS.simdyn[k].cap; };
  bindTabs($('[data-viewer="simdyn"]'), pickSd); pickSd("bottle");

  // real-world unified (chapters as tabs)
  const rd = new ScrubPlayer($("#realdynPlayer")), clip = CLIPS.realdyn;
  rd.load(clip);
  const rTabs = $$("#realdynTabs .tab");
  let chap = 0;
  const setChap = (k, seek) => {
    chap = k; rTabs.forEach((t, i) => t.classList.toggle("active", i === k)); rd.setBand(clip.chapters[k]);
    if (seek) { rd.seek(clip.chapters[k][0]); rd.userPaused = false; rd.v.play().catch(() => {}); }
  };
  rTabs.forEach((t, i) => t.addEventListener("click", () => setChap(i, true)));
  rd.onFrame = f => { const k = clip.chapters.findIndex(c => f >= c[0] && f <= c[1]); if (k >= 0 && k !== chap) setChap(k, false); };
  setChap(0, false);

  // MPC players
  const ms = new StepPlayer($("#mpcsimPlayer"));
  bindTabs($('[data-viewer="mpcsim"]'), k => ms.load(CLIPS.mpcsim[k])); ms.load(CLIPS.mpcsim.shampoo);
  const mr = new StepPlayer($("#mpcrealPlayer"));
  bindTabs($('[data-viewer="mpcreal"]'), k => mr.load(CLIPS.mpcreal[k])); mr.load(CLIPS.mpcreal.box);
}

/* =========================================================
   Quantitative results (numbers copied from the paper)
   ========================================================= */
const REG = [
  { name: "Rigid-body Non-Prehensile", short: "Rigid NP", c: C.rigid, m: ["RMSE", "CD", "Rigidity"] },
  { name: "Deformable Non-Prehensile", short: "Deformable NP", c: C.defnp, m: ["RMSE", "CD", "Laplacian"] },
  { name: "Deformable Prehensile", short: "Deformable P", c: C.defp, m: ["RMSE", "CD", "Laplacian"] },
];
// Table 2
const T2 = [
  { n: "AdaptiGraph", k: "base", v: ["0.028", "0.084", "0.0001", "0.031", "0.052", "0.0068", "0.047", "0.143", "0.0092"] },
  { n: "ParticleFormer", k: "base", v: ["0.054", "0.082", "0.0005", "0.061", "0.079", "0.0072", "0.058", "0.075", "0.0058"] },
  { n: "Privileged Expert", k: "priv", v: ["0.021", "0.048", "0.0", "0.018", "0.032", "0.0027", "0.029", "0.038", "0.0068"] },
  { n: "MoRE (ours)", k: "ours", v: ["0.022", "0.048", "0.0", "0.024", "0.027", "0.0020", "0.026", "0.039", "0.0050"] },
];
// Table 3
const T3 = [
  { n: "Single Expert", v: ["0.030", "0.054", "0.0001", "0.028", "0.038", "0.0038", "0.037", "0.047", "0.0061"],
    d: "One decoder for all physics." },
  { n: "Implicit Router", v: ["0.026", "0.051", "0.0", "0.032", "0.033", "0.0032", "0.028", "0.040", "0.0054"],
    d: "Soft blending, no supervised gating." },
  { n: "Implicit MoE", v: ["0.045", "0.070", "0.0002", "0.026", "0.031", "0.0032", "0.032", "0.039", "0.0071"],
    d: "Implicit experts with a shared output head." },
  { n: "w/o Self-Rollout", v: ["0.031", "0.057", "0.0", "0.035", "0.039", "0.0056", "0.047", "0.060", "0.0058"],
    d: "Teacher forcing only." },
  { n: "MoRE (full)", full: true, v: ["0.022", "0.048", "0.0", "0.024", "0.027", "0.0020", "0.026", "0.039", "0.0050"] },
];
// Table 4
const T4 = {
  pw: ["0.031", "0.054", "0.0003", "0.028", "0.031", "0.0041", "0.029", "0.035", "0.0063"],
  us: ["0.023", "0.046", "0.0", "0.014", "0.026", "0.0022", "0.021", "0.031", "0.0051"],
};

function initBench() {
  const box = $("#benchCharts");
  const draw = r => {
    box.innerHTML = "";
    REG[r].m.forEach((m, j) => {
      const col = r * 3 + j, vals = T2.map(row => parseFloat(row.v[col])), mx = Math.max(...vals) || 1, mn = Math.min(...vals);
      const wrap = document.createElement("div");
      wrap.innerHTML = `<div class="bc-title">${m} <span>↓ lower is better</span></div>`;
      T2.forEach((row, i) => {
        const v = vals[i], w = Math.max(2, v / mx * 100);
        const d = document.createElement("div"); d.className = "bc-row" + (row.k === "ours" ? " ours" : "");
        d.innerHTML = `<div class="bc-name">${row.n}</div><div class="bc-bar"><i class="${row.k}"></i><span class="bc-val">${row.v[col]}${v === mn ? '<span class="bc-best">★</span>' : ""}</span></div>`;
        wrap.appendChild(d);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          d.querySelector("i").style.width = w + "%";
          const lab = d.querySelector(".bc-val");
          if (w > 72) { lab.style.left = `calc(${w}% - ${lab.offsetWidth + 6}px)`; lab.style.color = "#fff"; }
          else lab.style.left = `calc(${w}% + 6px)`;
        }));
      });
      box.appendChild(wrap);
    });
  };
  const card = box.closest("[data-reveal]");
  let cur = 0;
  $$('[data-tabs="bench"] .tab').forEach(b => b.addEventListener("click", () => {
    $$('[data-tabs="bench"] .tab').forEach(x => x.classList.toggle("active", x === b)); cur = +b.dataset.key; draw(cur);
  }));
  onReveal(card, () => draw(cur));

  // full table
  const t = $("#benchTable");
  let h = `<thead><tr><th rowspan="2">Method</th>${REG.map(r => `<th colspan="3" class="grp-start">${r.name}</th>`).join("")}</tr><tr>`;
  REG.forEach(r => r.m.forEach((m, j) => h += `<th class="${j === 0 ? "grp-start" : ""}">${m} ↓</th>`));
  h += "</tr></thead><tbody>";
  const mins = [...Array(9)].map((_, c) => Math.min(...T2.map(r => parseFloat(r.v[c]))));
  T2.forEach(r => {
    h += `<tr class="${r.k}"><td>${r.n}</td>` + r.v.map((v, c) => `<td class="${c % 3 === 0 ? "grp-start " : ""}${parseFloat(v) === mins[c] ? "best" : ""}">${v}</td>`).join("") + "</tr>";
  });
  t.innerHTML = h + "</tbody>";
}

function initDroid() {
  const box = $("#droidCards");
  const red = [];
  REG.forEach((r, ri) => {
    const d = document.createElement("div"); d.className = "dc"; d.style.setProperty("--c", r.c);
    let html = `<h4>${r.short}</h4>`;
    r.m.forEach((m, j) => {
      const c = ri * 3 + j, a = parseFloat(T4.pw[c]), b = parseFloat(T4.us[c]);
      const pct = a > 0 ? (b - a) / a * 100 : 0; if (j === 0) red.push(-pct);
      html += `<div class="dc-metric"><div class="dc-mh"><span>${m === "Laplacian" ? "Lap." : m === "Rigidity" ? "Rigid." : m}: ${T4.pw[c]} → <b style="color:var(--navy)">${T4.us[c]}</b></span><b>${pct.toFixed(0)}%</b></div>
        <div class="dc-bars"><div class="dc-bar pw"><i data-w="100"></i></div><div class="dc-bar us"><i data-w="${Math.max(1.5, b / a * 100)}"></i></div></div></div>`;
    });
    html += `<div class="dc-leg"><span><i style="background:#b5c0d2"></i>PointWorld</span><span><i style="background:var(--orange)"></i>MoRE</span></div>`;
    d.innerHTML = html; box.appendChild(d);
  });
  const avg = red.reduce((a, b) => a + b, 0) / red.length;
  onReveal(box.closest("[data-reveal]"), () => {
    $$(".dc-bar i", box).forEach((i, k) => setTimeout(() => i.style.width = i.dataset.w + "%", 80 + k * 40));
    const el = $("#droidAvg"), t0 = performance.now();
    const st = now => { const p = clamp((now - t0) / 1300); el.textContent = (avg * ease(p)).toFixed(1); if (p < 1) requestAnimationFrame(st); };
    requestAnimationFrame(st);
  });
}

function initAblation() {
  const t = $("#heatTable"), full = T3.find(r => r.full).v.map(parseFloat);
  let h = `<thead><tr><th></th>${REG.map(r => `<th colspan="3" class="rg" style="--c:${r.c}">${r.short}</th>`).join("")}</tr><tr><th></th>`;
  REG.forEach(r => r.m.forEach(m => h += `<th>${m}</th>`)); h += "</tr></thead><tbody>";
  const rel = (v, f) => f > 0 ? (v - f) / f : v > 0 ? 1 : 0;
  const color = x => {
    if (x <= 0.0001) return "#e8edf5";
    const k = clamp(x / 0.8), a = [253, 230, 216], b = [232, 89, 12];
    return `rgb(${a.map((c, i) => Math.round(lerp(c, b[i], k))).join(",")})`;
  };
  T3.forEach(r => {
    h += `<tr class="${r.full ? "full" : ""}"><td class="name">${r.n}</td>`;
    r.v.forEach((v, c) => {
      const x = rel(parseFloat(v), full[c]);
      const txt = r.full ? v : x <= 0.0001 ? "=" : (full[c] > 0 ? "+" + Math.round(x * 100) + "%" : v);
      const tip = `${r.n} · ${REG[Math.floor(c / 3)].short} ${REG[Math.floor(c / 3)].m[c % 3]}<br/>${v} (full MoRE: ${T3[4].v[c]})`;
      h += `<td data-tip="${tip}" style="background:${r.full ? "" : color(x)};color:${x > 0.45 && !r.full ? "#fff" : ""}">${txt}</td>`;
    });
    h += "</tr>";
  });
  t.innerHTML = h + "</tbody>";
  const tipEl = document.createElement("div"); tipEl.className = "heat-tip"; document.body.appendChild(tipEl);
  t.addEventListener("mousemove", e => {
    const td = e.target.closest("td[data-tip]");
    if (!td) { tipEl.classList.remove("show"); return; }
    tipEl.innerHTML = td.dataset.tip; tipEl.classList.add("show");
    tipEl.style.left = Math.min(window.innerWidth - 270, e.clientX + 14) + "px"; tipEl.style.top = (e.clientY + 14) + "px";
  });
  t.addEventListener("mouseleave", () => tipEl.classList.remove("show"));

  // variant cards: mean relative increase in RMSE + CD across regimes
  const grid = $("#ablateGrid");
  T3.filter(r => !r.full).forEach(r => {
    const idx = [0, 1, 3, 4, 6, 7];
    const m = idx.reduce((a, c) => a + rel(parseFloat(r.v[c]), full[c]), 0) / idx.length * 100;
    const d = document.createElement("div"); d.className = "ab";
    d.innerHTML = `<div class="ab-k">${r.n}</div><div class="ab-num">+${m.toFixed(0)}%<small>avg. RMSE/CD</small></div><p>${r.d}</p>`;
    grid.appendChild(d);
  });

  // gating rings (Table 5)
  const rings = $("#gateRings"), G = [["Push-X", 95.4, C.rigid], ["Manipulate Toy", 94.9, C.defnp], ["Soft Grasp", 99.8, C.defp], ["Overall", 96.7, C.navy]];
  const rr = 44, circ = 2 * Math.PI * rr;
  G.forEach(([n, v, c]) => {
    const d = document.createElement("div"); d.className = "ring";
    d.innerHTML = `<svg viewBox="0 0 110 110"><circle cx="55" cy="55" r="${rr}" fill="none" stroke="#eef1f6" stroke-width="10"/>
      <circle class="prog" cx="55" cy="55" r="${rr}" fill="none" stroke="${c}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${circ}" transform="rotate(-90 55 55)" data-off="${circ * (1 - v / 100)}"/>
      <text class="rv" x="55" y="61" text-anchor="middle">${v}%</text></svg><div class="rl">${n}</div>`;
    rings.appendChild(d);
  });
  onReveal(rings.closest("[data-reveal]"), () => $$("circle.prog", rings).forEach(c => c.setAttribute("stroke-dashoffset", c.dataset.off)));
}

/* ---------------- boot ---------------- */
function boot() {
  // each block is independent: a section removed from the HTML must not break the others
  [renderTex, initChrome, initCapTable, initReveal, initCounters, initHero, initMoe, initRollout,
   initPlanner, initDonut, initCopy, initPlayers, initBench, initDroid, initAblation].forEach(fn => {
    try { fn(); } catch (e) { /* section not present */ }
  });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
