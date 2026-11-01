(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const API = ((window.APP_CONFIG || {}).API_ENDPOINT || "").trim().replace(/\/+$/, "");
  const LIVE = /^https?:\/\//i.test(API);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


  const KEY = "dropline_demo_notes";
  let mem = [];
  const dRead = () => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return mem; } };
  const dWrite = (l) => { mem = l; try { localStorage.setItem(KEY, JSON.stringify(l)); } catch (e) {  } };
  const makeCode = () => Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
  const demo = {
    async save(n) { await sleep(600); const l = dRead(); const item = { id: makeCode(), createdAt: Date.now(), ...n }; l.unshift(item); dWrite(l); return { id: item.id }; },
    async get(id) { await sleep(600); const x = dRead().find((i) => i.id === id); if (!x) throw new Error("No note found for that code."); return x; },
    async list() { await sleep(600); return dRead().slice(0, 12); }
  };

  async function live(method, qs, body) {
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(API + (qs || ""), { method, signal: ctrl.signal, ...(body ? { headers: { "Content-Type": "text/plain;charset=UTF-8" }, body: JSON.stringify(body) } : {}) });
      const text = await res.text(); let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
      if (data && typeof data === "object" && !Array.isArray(data) && typeof data.statusCode === "number" && "body" in data) {
        let inner = data.body; if (typeof inner === "string") { try { inner = JSON.parse(inner); } catch (e) {  } }
        if (data.statusCode >= 400) throw new Error((inner && inner.error) || "The Lambda returned status " + data.statusCode + ". Check its CloudWatch logs.");
        data = inner;
      }
      if (!res.ok) throw new Error((data && (data.error || data.message)) || "The server answered with status " + res.status + ".");
      return data;
    } catch (e) {
      if (e.name === "AbortError") throw new Error("The request timed out. Try again.");
      if (e instanceof TypeError) throw new Error("Could not reach the API. Check config.js and CORS on API Gateway.");
      throw e;
    } finally { clearTimeout(t); }
  }
  const api = LIVE
    ? { save: async (n) => { const d = await live("POST", "", n); if (!d || !d.id) throw new Error("The API answered but sent no pickup code, so nothing was saved. Check the Lambda logs in CloudWatch."); return d; },
        get: async (id) => { const d = await live("GET", "?id=" + encodeURIComponent(id)); if (!d || !d.message) throw new Error("No note found for that code."); return d; }, list: async () => { const d = await live("GET"); return Array.isArray(d) ? d : (d && d.items) || []; } }
    : demo;


  const N = {}, nodeEls = document.querySelectorAll(".node"), pk = $("#packet"), logEl = $("#log");
  nodeEls.forEach((g) => {
    const x = +g.dataset.x, y = +g.dataset.y; N[g.dataset.id] = { x, y, el: g };
    g.style.setProperty("--tx", x + "px"); g.style.setProperty("--ty", y + "px");
    const show = () => ($("#info").textContent = g.dataset.info);
    g.addEventListener("pointerenter", show); g.addEventListener("focus", show);
  });
  const edgeFor = (a, b) => document.querySelector(`.edge[data-a="${a}"][data-b="${b}"], .edge[data-a="${b}"][data-b="${a}"]`);
  const SAY = { r53: "Route 53 resolved the domain", cf: "CloudFront edge accepted the request", s3: "S3 served the static files", apigw: "API Gateway routed the call", lambda: "Lambda started and ran the function" };

  function log(msg, cls) {
    const p = document.createElement("p"), t = document.createElement("time");
    t.textContent = new Date().toLocaleTimeString([], { hour12: false });
    p.appendChild(t); p.appendChild(document.createTextNode(msg)); if (cls) p.className = cls;
    logEl.appendChild(p); logEl.scrollTop = logEl.scrollHeight;
  }
  function lit(id) { const g = N[id].el; g.classList.remove("lit"); void g.getBoundingClientRect(); g.classList.add("lit"); setTimeout(() => g.classList.remove("lit"), 1100); }
  function move(a, b, ms) {
    return new Promise((res) => {
      const A = N[a], B = N[b], t0 = performance.now();
      (function step(t) {
        const k = ms ? Math.min(1, (t - t0) / ms) : 1, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        pk.setAttribute("cx", A.x + (B.x - A.x) * e); pk.setAttribute("cy", A.y + (B.y - A.y) * e);
        k < 1 ? requestAnimationFrame(step) : res();
      })(t0);
    });
  }
  async function route(ids, opts = {}) {
    pk.classList.add("on"); pk.setAttribute("cx", N[ids[0]].x); pk.setAttribute("cy", N[ids[0]].y);
    lit(ids[0]); if (opts.say) log(opts.say[ids[0]] || SAY[ids[0]]);
    for (let i = 1; i < ids.length; i++) {
      const ed = edgeFor(ids[i - 1], ids[i]); if (ed) { ed.classList.add("hot"); setTimeout(() => ed.classList.remove("hot"), 1400); }
      await move(ids[i - 1], ids[i], reduce ? 0 : 380); lit(ids[i]);
      if (opts.say) log(opts.say[ids[i]] || SAY[ids[i]]);
    }
  }
  const OUT = ["r53", "cf", "apigw", "lambda", "ddb"];
  let busy = false;
  async function roundTrip(label, call, dbSay) {
    if (busy) throw new Error("Please wait: the previous request is still travelling.");
    busy = true;
    try { return await runTrip(label, call, dbSay); } finally { busy = false; }
  }
  async function runTrip(label, call, dbSay) {
    const t0 = performance.now(); log(label, "ok");
    const req = call().then((v) => ({ v }), (e) => ({ e }));
    await route(OUT, { say: { ...SAY, ddb: dbSay } });
    const r = await req;
    if (r.e) { pk.classList.add("err"); log("Failed: " + r.e.message, "bad"); await sleep(900); pk.classList.remove("err", "on"); throw r.e; }
    await route([...OUT].reverse());
    log("Response reached the browser in " + Math.round(performance.now() - t0) + " ms", "ok");
    setTimeout(() => pk.classList.remove("on"), 600);
    return r.v;
  }


  const setS = (id, text, kind) => { const s = $(id); s.textContent = text || ""; s.className = "status" + (kind ? " " + kind : ""); };
  const when = (ts) => (ts ? new Date(Number(ts)).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "");
  function scramble(node, text) {
    if (reduce) { node.textContent = text; return; }
    let f = 0; const iv = setInterval(() => {
      node.textContent = text.split("").map((c, i) => (i < f / 3 ? c : "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)])).join("");
      if (++f > text.length * 3) { node.textContent = text; clearInterval(iv); }
    }, 40);
  }
  $("#mode").classList.toggle("demo", !LIVE);
  $("#mode span").textContent = LIVE ? "Connected to your API" : "Demo mode: notes stay in this browser";
  $("#dNote").addEventListener("input", (e) => ($("#count").textContent = e.target.value.length + " / 280"));

  $("#dropForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const note = $("#dNote"), name = $("#dName"), btn = $("#dropBtn");
    note.classList.remove("invalid");
    if (!note.value.trim()) { void note.offsetWidth; note.classList.add("invalid"); note.focus(); return setS("#dropStatus", "Write a note before dropping it.", "err"); }
    btn.disabled = true; $("#receipt").hidden = true; setS("#dropStatus", "Sending through the stack…", "busy");
    try {
      const out = await roundTrip("POST /notes", () => api.save({ name: name.value.trim(), message: note.value.trim() }), "DynamoDB stored the note");
      $("#receipt").hidden = false; scramble($("#code"), out.id); setS("#dropStatus", "Dropped. Share the code to let someone pick it up.", "ok");
      burst(N.ddb.el, 28); note.value = ""; $("#count").textContent = "0 / 280"; $("#pCode").value = out.id;
    } catch (e) { setS("#dropStatus", e.message, "err"); }
    btn.disabled = false;
  });
  $("#copyBtn").addEventListener("click", () => {
    const c = $("#code").textContent; (navigator.clipboard ? navigator.clipboard.writeText(c) : Promise.reject()).then(() => ($("#copyBtn").textContent = "Copied"), () => ($("#copyBtn").textContent = "Select and copy the code"));
    setTimeout(() => ($("#copyBtn").textContent = "Copy code"), 1800);
  });

  function showNote(n) {
    $("#rText").textContent = n.message || ""; $("#rName").textContent = n.name || "Anonymous"; $("#rTime").textContent = when(n.createdAt); $("#rId").textContent = n.id || "";
    const r = $("#result"); r.hidden = false; r.style.animation = "none"; void r.offsetWidth; r.style.animation = "";
  }
  async function pickup(code) {
    setS("#pickStatus", "Fetching " + code + "…", "busy");
    try { const n = await roundTrip("GET /notes?id=" + code, () => api.get(code), "DynamoDB returned the note"); showNote(n); setS("#pickStatus", "Found it.", "ok"); burst(N.r53.el, 18); }
    catch (e) { $("#result").hidden = true; setS("#pickStatus", e.message, "err"); }
  }
  $("#pickForm").addEventListener("submit", (ev) => {
    ev.preventDefault(); const c = $("#pCode"); c.classList.remove("invalid"); const code = c.value.trim().toUpperCase();
    if (code.length !== 6) { void c.offsetWidth; c.classList.add("invalid"); c.focus(); return setS("#pickStatus", "Enter the 6-character pickup code.", "err"); }
    pickup(code);
  });
  $("#listBtn").addEventListener("click", async () => {
    setS("#pickStatus", "Loading latest drops…", "busy");
    try {
      const items = await roundTrip("GET /notes", () => api.list(), "DynamoDB returned the latest notes"), ul = $("#feed"); ul.textContent = "";
      if (!items.length) return setS("#pickStatus", "Nothing dropped yet. Drop the first note above.", "");
      items.forEach((n, i) => {
        const li = document.createElement("li"), b = document.createElement("b"), p = document.createElement("p");
        li.style.setProperty("--i", i); li.tabIndex = 0; li.dataset.cursor = "Open"; b.textContent = n.id; p.textContent = n.message;
        li.append(b, p); const go = () => { $("#pCode").value = n.id; pickup(n.id); window.scrollTo({ top: $("#pickForm").offsetTop - 120, behavior: "smooth" }); };
        li.addEventListener("click", go); li.addEventListener("keydown", (e) => e.key === "Enter" && go()); ul.appendChild(li);
      });
      setS("#pickStatus", "Select a note to open it.", "ok");
    } catch (e) { setS("#pickStatus", e.message, "err"); }
  });


  const fx = $("#fx"), ctx = fx.getContext("2d"), parts = [];
  const size = () => { fx.width = innerWidth; fx.height = innerHeight; }; size(); addEventListener("resize", size);
  function burst(elm, n, x, y) {
    if (reduce) return; if (elm) { const r = elm.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; }
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = 1.5 + Math.random() * 5; parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, l: 1, r: 1.5 + Math.random() * 2.5, c: Math.random() > 0.3 ? "212,255,36" : "77,141,255" }); }
  }
  (function loop() {
    ctx.clearRect(0, 0, fx.width, fx.height);
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.x += p.vx; p.y += p.vy; p.vx *= 0.94; p.vy *= 0.94; p.l -= 0.025;
      if (p.l <= 0) { parts.splice(i, 1); continue; } ctx.fillStyle = `rgba(${p.c},${p.l})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.l + 0.4, 0, 6.283); ctx.fill(); }
    requestAnimationFrame(loop);
  })();

  addEventListener("pointermove", (e) => { document.body.style.setProperty("--mx", e.clientX + "px"); document.body.style.setProperty("--my", e.clientY + "px"); }, { passive: true });
  document.querySelectorAll(".mag").forEach((b) => {
    if (reduce) return;
    b.addEventListener("pointermove", (e) => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.22}px,${(e.clientY - r.top - r.height / 2) * 0.3}px)`; });
    b.addEventListener("pointerleave", () => (b.style.transform = ""));
  });

  if (matchMedia("(hover:hover) and (pointer:fine)").matches) {
    const dot = $("#dot"), ring = $("#ring"), lab = ring.firstElementChild; let rx = -100, ry = -100, tx = -100, ty = -100, lastT = 0;
    document.documentElement.classList.add("has-cursor");
    addEventListener("pointermove", (e) => {
      tx = e.clientX; ty = e.clientY; dot.style.transform = `translate(${tx}px,${ty}px)`;
      if (!reduce && e.timeStamp - lastT > 28) { lastT = e.timeStamp; burst(null, 1, tx, ty); parts[parts.length - 1].vx *= 0.1; parts[parts.length - 1].vy *= 0.1; }
    }, { passive: true });
    document.addEventListener("pointerover", (e) => {
      const t = e.target.closest("[data-cursor],a,button,input,textarea,.node"); ring.className = "cur-ring";
      if (!t) return lab.textContent = "";
      if (t.matches("input,textarea")) return ring.classList.add("text");
      const word = t.dataset && t.dataset.cursor; lab.textContent = word || "";
      ring.classList.add(word ? "label" : "hover");
    });
    addEventListener("pointerdown", (e) => { ring.style.transform += " scale(.8)"; burst(null, 14, e.clientX, e.clientY); });
    (function follow() { rx += (tx - rx) * (reduce ? 1 : 0.18); ry += (ty - ry) * (reduce ? 1 : 0.18); ring.style.transform = `translate(${rx}px,${ry}px)`; requestAnimationFrame(follow); })();
  }


  sleep(reduce ? 0 : 2300).then(async () => { if (busy) return; busy = true; try { await route(["r53", "cf", "s3"], { say: { r53: "Route 53 resolved this site's domain", cf: "CloudFront picked the nearest edge", s3: "S3 delivered this page. Drop a note to send your own request." } }); } finally { busy = false; } setTimeout(() => pk.classList.remove("on"), 900); });
})();
