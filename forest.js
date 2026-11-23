// forest.js - the NZ forest map (ForestMap project, built 2026-11-23 for Pinetech Pacific). Leaflet on canvas with the
// AquilaLens background (base.js). Data in data/: blocks.json (forest blocks 50 ha+ with outlines), managers.json (one row per forest firm: own list + FSC + owner check).
// 2026-11-23 Mike: "less words ... make the filters simple" - dropdowns instead of chip rows, four age groups, one line
// per firm; overseas (OIO) buys taken off - past buys, today's owner can't be confirmed for free. Filters live in the address bar, so a link opens the same view.
// 2026-11-23 (later): harvest due per block (planting from land cover, corrected by satellite felling to 2025, + 28 years)
// and which blocks hold a forest named in a manager's own list (LINZ place names) - colour and filter by both.
(async function () {
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
const fmt = n => Math.round(n).toLocaleString("en-NZ");
const VIZ = window.OL_VIZ, dark = VIZ.dark;

// ------------------------------------------------------------------ colours and names
const C = dark ? {kind: ["#4cae6c", "#d9ac3a"], hg: ["#e8664c", "#f0a050", "#e8d77a", "#8cc46a", "#3f9a5a", "#a99bd8"],
  soon: ["#4a4237", "#8a6a3a", "#c97a3a", "#f08a5c"],
  mgr: {named: "#5d9cf0", cfl: "#a487f0", none: "#6d7177"}, nf: {recent: "#f0c04a", most: "#4cae6c", part: "#2f6b45", old: "#6d7177"}, sel: "#ffffff"}
  : {kind: ["#2d7a46", "#c8901e"], hg: ["#b23a26", "#e0832a", "#dcc24a", "#7fae4a", "#2d6a40", "#7f6fb8"],
  soon: ["#efe3c8", "#e6b46e", "#d0702e", "#9c2f1a"],
  mgr: {named: "#2f6fde", cfl: "#7a4fd6", none: "#a9aeb5"}, nf: {recent: "#d99a0b", most: "#3f9a5a", part: "#a6cf8f", old: "#c4c8cd"}, sel: "#111418"};
const KIND = ["Plantation", "Mānuka / kānuka"];
// default harvest colour: how much of each block is due by 2033 (a share, so one giant block does not hide its near-term part)
const SOON_STEPS = [0, .1, .25, .5], SOON_TEXT = ["Under 10%", "10-25%", "25-50%", "Half or more"];
const MGR = {named: "In a manager's list", cfl: "Crown forest licence", none: "Not matched"};
// forest on land that was farmland or scrub on the first land-cover map (1996) = post-1989 forest land (carbon-scheme land)
const NF = {recent: "A quarter+ planted on farmland 2018-23", most: "Mostly ex-farmland (since 1996)", part: "Partly ex-farmland", old: "Forest land before 1996"};
const NF_FILTER = {post: "Ex-farmland, planted since 1996", recent: "Planted on farmland 2018-23"};
const SIZES = [["50-200 ha", 50, 200], ["200-1,000 ha", 200, 1000], ["1,000-5,000 ha", 1000, 5000], ["5,000+ ha", 5000, 1e9]];

// ------------------------------------------------------------------ data
const DATA_V = 16;                       // bump with every data rebuild so browsers do not mix an old data file with new code
const get = f => fetch("data/" + f + "?v=" + DATA_V).then(r => { if (!r.ok) throw new Error(f + " " + r.status); return r.json(); });
$("list").innerHTML = `<div class="more">Loading forests…</div>`;
const [B, MG] = await Promise.all([get("blocks.json"), get("managers.json")]);
const R = B.regions, D = B.districts, blocks = B.blocks, HG = B.harvest;
const SHORT = Object.fromEntries(MG.firms.map(F => [F.name, F.short || F.name]));
blocks.forEach(b => {
  b.mgr = b.mg.length ? "named" : b.cfl ? "cfl" : "none";
  b.firms = [...new Set(b.mg.map(m => SHORT[m[0]]))];
  b.nfc = b.k !== 0 ? "" : b.nf[1] >= b.ha / 4 ? "recent" : b.nf[0] >= b.ha / 2 ? "most" : b.nf[0] >= 50 ? "part" : "old";   // by share, so one new corner does not colour a big old forest
  b.soon = b.hg[0] + b.hg[1];                                  // ha due by 2033: the near-term work
  b.step = b.k === 0 && b.ha ? SOON_STEPS.findLastIndex(t => b.soon / b.ha >= t) : -1;
  b.text = [R[b.r], D[b.d], b.tt, KIND[b.k], ...b.firms, ...b.mg.map(m => m[1])].join(" ").toLowerCase();
  b.ll = L.latLng(b.c[0], b.c[1]);
});
$("a-pl").textContent = fmt(blocks.filter(b => b.k === 0).reduce((s, b) => s + b.ha, 0));
const unring = a => { const out = []; let x = 0, y = 0; for (let i = 0; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; out.push([y / 1e4, x / 1e4]); } return out; };
// firms: biggest first by FSC area, else their stated estate total, else what their list adds up to
const firstNum = t => { const m = String(t).match(/\d[\d,]*(\.\d+)?/); return m ? +m[0].replace(/,/g, "") : 0; };
const isTot = x => /^(estate|company) total/i.test(x.n);
MG.firms.forEach(F => {
  const tot = F.rows.find(isTot);
  F.ha = F.fsc || (tot ? firstNum(tot.hat) : F.rows.reduce((s, x) => s + (x.ha || 0), 0));
  F.rows = F.rows.filter(x => !isTot(x) || !/^(estate|company) total$/i.test(x.n));
  F.text = [F.name, F.own, ...F.rows.map(x => x.n + " " + x.where + " " + x.own)].join(" ").toLowerCase();
  F.year = (String(F.asof || "").match(/\d{4}/) || [""])[0];
});
MG.firms.sort((a, b) => b.ha - a.ha);

// ------------------------------------------------------------------ map
const map = L.map("map", {preferCanvas: true});
olBaseMap(map, "Forests: LCDB v6 Manaaki Whenua (CC BY 4.0) · LINZ (CC BY 4.0)", {full: false});
map.setView([-41.2, 172.8], 5, {animate: false});   // a view first: fitting a box not yet sized leaves the map unset
olFitNZ(map);
const rnd = L.canvas({padding: .5, tolerance: 4});
const forestLayer = L.layerGroup().addTo(map);

// ------------------------------------------------------------------ state (kept in the address bar)
const S = {};
const BLANK = {q: "", kind: "", due: "", region: -1, district: -1, size: "", mgr: "", nf: "", colour: "due", tab: "blocks", pin: null, km: 25};
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  Object.assign(S, BLANK);
  for (const k of ["q", "kind", "due", "size", "mgr", "nf", "colour", "tab"]) if (p.has(k)) S[k] = p.get(k);
  for (const k of ["region", "district", "km"]) if (p.has(k)) S[k] = +p.get(k);
  if (!["blocks", "managers"].includes(S.tab)) S.tab = "blocks";
  S.pin = p.get("pin") ? p.get("pin").split(",").map(Number) : null;
}
function writeHash() {
  const p = new URLSearchParams();
  for (const k of ["q", "kind", "due", "size", "mgr", "nf", "colour", "tab", "region", "district"]) if (S[k] !== BLANK[k]) p.set(k, S[k]);
  if (S.pin) { p.set("pin", S.pin.map(v => v.toFixed(4)).join(",")); p.set("km", S.km); }
  history.replaceState(null, "", p.toString() ? "#" + p : location.pathname);
}
readHash();

// ------------------------------------------------------------------ the dropdowns
const opts = (first, list) => `<option value="">${first}</option>` + list.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join("");
$("f-kind").innerHTML = opts("All", KIND.map((t, i) => [i, t]));
$("f-due").innerHTML = opts("Any time", HG.map((t, i) => [i, t]));
$("f-region").innerHTML = opts("All NZ", R.map((t, i) => [i, t]));
$("f-size").innerHTML = opts("Any size", SIZES.map((s, i) => [i, s[0]]));
$("f-mgr").innerHTML = opts("Any", Object.entries(MGR));
$("f-nf").innerHTML = opts("Any", Object.entries(NF_FILTER));
$("f-colour").innerHTML = [["due", "Harvest"], ["mgr", "Manager"], ["nf", "Ex-farm"], ["kind", "Type"]].map(([v, t]) => `<button type="button" data-v="${v}">${t}</button>`).join("");
function fillDistricts() {
  $("disbox").hidden = S.region < 0;
  const used = new Set(blocks.filter(b => b.r === S.region).map(b => b.d));
  $("f-district").innerHTML = opts("All districts", D.map((t, i) => [i, t]).filter(([i]) => used.has(i)));
  if (!used.has(S.district)) S.district = -1;
}
const bind = (id, key, num) => $(id).addEventListener("change", e => { const v = e.target.value;
  S[key] = num ? (v === "" ? -1 : +v) : v; if (key === "region") { S.district = -1; fillDistricts(); } update(key === "region" || key === "district"); });
bind("f-kind", "kind"); bind("f-due", "due"); bind("f-size", "size"); bind("f-mgr", "mgr"); bind("f-nf", "nf");
bind("f-region", "region", true); bind("f-district", "district", true);
$("f-colour").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { S.colour = b.dataset.v; update(); } });
let qt;
$("q").addEventListener("input", () => { clearTimeout(qt); qt = setTimeout(() => { S.q = $("q").value.trim(); update(); }, 200); });
$("reset").addEventListener("click", () => { const tab = S.tab, colour = S.colour; Object.assign(S, BLANK, {tab, colour}); $("q").value = "";
  fillDistricts(); setPin(null); update(); olFitNZ(map); });
$("aboutbtn").addEventListener("click", () => $("about").classList.add("on"));
$("aboutclose").addEventListener("click", () => $("about").classList.remove("on"));
$("about").addEventListener("click", e => { if (e.target.id === "about") $("about").classList.remove("on"); });
document.addEventListener("keydown", e => { if (e.key === "Escape") $("about").classList.remove("on"); });
document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => { S.tab = b.dataset.tab; update(); }));

// ------------------------------------------------------------------ which blocks pass
const DUE_MIN = 50;                   // a block counts for a harvest period when 50 ha+ of it falls in that period
const near = ll => S.pin && map.distance(L.latLng(S.pin[0], S.pin[1]), ll) <= S.km * 1000;
const words = () => S.q.toLowerCase().split(/\s+/).filter(Boolean);
function passes(b) {
  if (S.kind !== "" && b.k !== +S.kind) return false;
  if (S.region >= 0 && b.r !== S.region) return false;
  if (S.district >= 0 && b.d !== S.district) return false;
  if (S.size !== "" && !(b.ha >= SIZES[S.size][1] && b.ha < SIZES[S.size][2])) return false;
  if (S.due !== "" && !(b.hg[+S.due] >= DUE_MIN)) return false;
  if (S.mgr && b.mgr !== S.mgr) return false;
  if (S.nf === "post" && !(b.nf[0] >= 50)) return false;
  if (S.nf === "recent" && !(b.nf[1] >= 20)) return false;
  if (S.pin && !near(b.ll)) return false;
  const w = words(); if (w.length && !w.every(x => b.text.includes(x))) return false;
  return true;
}
const dueOn = () => S.colour === "due" && S.due !== "";          // one harvest period picked: colour that period, darker = more of the block
const share = b => b.ha ? Math.min(1, b.hg[+S.due] / b.ha) : 0;
const colourOf = b => S.colour === "due" ? (dueOn() ? C.hg[+S.due] : b.step >= 0 ? C.soon[b.step] : VIZ.none)
  : S.colour === "mgr" ? C.mgr[b.mgr] : S.colour === "nf" ? (b.nfc ? C.nf[b.nfc] : VIZ.none) : C.kind[b.k];

// ------------------------------------------------------------------ drawing
let picked = null, shown = [];
function styleOf(b) {
  const c = colourOf(b), sel = picked === b;
  const fo = dueOn() ? .15 + .75 * Math.sqrt(share(b)) : .7;
  return {renderer: rnd, color: sel ? C.sel : c, weight: sel ? 2.5 : .6, opacity: sel ? 1 : .9, fillColor: c, fillOpacity: sel ? Math.max(fo, .6) : fo};
}
function shapeOf(b) {
  if (!b.layer) {
    b.layer = L.polygon(b.g.map(poly => poly.map(unring)), styleOf(b));
    b.layer.bindTooltip(() => `${fmt(b.ha)} ha · ${esc(D[b.d] || "")}`, {sticky: true, direction: "top", opacity: .95});
    b.layer.on("click", e => { L.DomEvent.stopPropagation(e); if (pinning) { map.fire("click", {latlng: e.latlng}); return; } pick(b, false); });
  }
  return b.layer;
}
function draw() {
  forestLayer.clearLayers();
  shown = blocks.filter(passes);
  shown.forEach(b => { const l = shapeOf(b); l.setStyle(styleOf(b)); forestLayer.addLayer(l); });
}

// ------------------------------------------------------------------ the block card
function blockCard(b) {
  const tot = b.hg.reduce((s, v) => s + v, 0);
  const ageRows = b.k === 0 && tot ? `<div class="s" style="margin-top:6px">Harvest due</div><div class="bar">${b.hg.map((v, i) => v ? `<span style="width:${v / tot * 100}%;background:${C.hg[i]}"></span>` : "").join("")}</div>
    <table>${b.hg.map((v, i) => v ? `<tr><td><i style="background:${C.hg[i]}"></i>${HG[i]}</td><td>${fmt(v)} ha</td></tr>` : "").join("")}</table>` : "";
  const byFirm = {}; b.mg.forEach(([f, n]) => (byFirm[SHORT[f]] = byFirm[SHORT[f]] || []).push(n));
  const mgrRow = b.mg.length ? `<div class="s" style="margin-top:6px">Manager's list names here</div>${Object.entries(byFirm).map(([f, ns]) =>
    `<div><b>${esc(f)}</b> <span class="s">${esc(ns.join(", "))}</span></div>`).join("")}`
    : `<div class="s" style="margin-top:6px">Not matched to a manager's list${b.cfl ? " (has a Crown forest licence)" : ""}</div>`;
  const extra = [b.fr ? `${b.fr} with a forestry right` : "", b.cfl ? `${b.cfl} Crown forest licence` : ""].filter(Boolean).join(", ");
  const rows = [["Land titles", fmt(b.t) + (extra ? ` <span class="s">(${extra})</span>` : "")],
    b.mao ? ["Māori land", fmt(b.mao) + " ha"] : null, b.con ? ["Conservation land", fmt(b.con) + " ha"] : null].filter(Boolean);
  return `<div class="card"><h3>${esc(KIND[b.k])} · ${fmt(b.ha)} ha</h3>
    <div class="s">${esc(D[b.d] || "")}${b.r >= 0 ? ", " + esc(R[b.r]) : ""}</div>
    ${ageRows}${b.k === 0 ? mgrRow : ""}${b.k === 0 && b.nf[0] ? `<div class="s" style="margin-top:6px">On farmland or scrub in 1996: <b>${fmt(b.nf[0])} ha</b>${b.nf[1] ? ` (${fmt(b.nf[1])} ha planted 2018-23)` : ""}</div>` : ""}
    <table>${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join("")}</table>
    <div class="links"><a href="https://www.google.com/maps/@${b.c[0]},${b.c[1]},14z/data=!3m1!1e3" target="_blank" rel="noopener">Satellite view</a>
      ${b.r >= 0 ? `<a href="#" data-managers="${b.r}">Managers in ${esc(R[b.r])}</a>` : ""}</div></div>`;
}
function pick(b, fly) {
  const was = picked; picked = b;
  if (was && was.layer) was.layer.setStyle(styleOf(was));
  shapeOf(b).setStyle(styleOf(b)); b.layer.bringToFront();
  if (fly) map.fitBounds(b.layer.getBounds(), {maxZoom: 13, padding: [40, 40], animate: false});
  const pop = L.popup({maxWidth: 340, autoPanPadding: [20, 20]}).setLatLng(b.ll).setContent(blockCard(b));
  pop.on("remove", () => { if (picked === b) { picked = null; if (b.layer) b.layer.setStyle(styleOf(b)); } });
  pop.openOn(map);
}
map.getContainer().addEventListener("click", e => {
  const a = e.target.closest("[data-managers]"); if (!a) return;
  e.preventDefault(); S.region = +a.dataset.managers; S.district = -1; S.tab = "managers"; fillDistricts(); update();
});

// ------------------------------------------------------------------ drop a pin (km ring, as AquilaLens's pin tool)
let pinMk = null, pinRing = null, pinning = false;
function setPin(ll) {
  if (pinMk) { map.removeLayer(pinMk); map.removeLayer(pinRing); pinMk = pinRing = null; }
  S.pin = ll ? [ll.lat, ll.lng] : null;
  if (S.pin) {
    pinMk = L.marker(S.pin, {draggable: true, title: "Drag to move"}).addTo(map);
    pinRing = L.circle(S.pin, {radius: S.km * 1000, color: VIZ.tool.ring, weight: 2, fillColor: VIZ.tool.ring, fillOpacity: .04, interactive: false}).addTo(map);
    pinMk.on("dragend", () => { setPin(pinMk.getLatLng()); update(); });
  }
  $("pinclear").hidden = !S.pin;
}
const PinCtl = L.Control.extend({onAdd() {
  const d = L.DomUtil.create("div", "pinbox");
  d.innerHTML = `<button id="pinbtn" type="button" title="Click, then click the map: only forests within the distance are counted">Drop a pin</button>
    <select id="pinkm" aria-label="Distance">${[10, 25, 50, 100, 150].map(k => `<option value="${k}">${k} km</option>`).join("")}</select>
    <button id="pinclear" type="button" hidden title="Remove the pin">✕</button>`;
  L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
  return d; }});
new PinCtl({position: "topleft"}).addTo(map);
$("pinkm").value = String(S.km);
$("pinbtn").addEventListener("click", () => { pinning = !pinning; $("pinbtn").classList.toggle("on", pinning); map.getContainer().style.cursor = pinning ? "crosshair" : ""; });
$("pinkm").addEventListener("change", () => { S.km = +$("pinkm").value; if (S.pin) { pinRing.setRadius(S.km * 1000); update(); } });
$("pinclear").addEventListener("click", () => { setPin(null); update(); });
map.on("click", e => { if (!pinning) return; pinning = false; $("pinbtn").classList.remove("on"); map.getContainer().style.cursor = ""; setPin(e.latlng); update(); });

// ------------------------------------------------------------------ legend
const legend = L.DomUtil.create("div", "legend");
map.getContainer().appendChild(legend);
L.DomEvent.disableClickPropagation(legend);
function drawLegend() {
  const k = (c, t, round) => `<div class="k"><i style="background:${c}${round ? ";border-radius:50%" : ""}"></i>${esc(t)}</div>`;
  legend.innerHTML = (dueOn() ? `<div class="lh">${esc(HG[+S.due])}</div>` + [[1, "All of the block"], [.5, "Half"], [.1, "A tenth"]].map(([f, t]) =>
      `<div class="k"><i style="background:${C.hg[+S.due]};opacity:${.15 + .75 * Math.sqrt(f)}"></i>${t}</div>`).join("")
    : S.colour === "due" ? `<div class="lh">Share of block due by 2033</div>` + SOON_TEXT.map((n, i) => k(C.soon[i], n)).reverse().join("") + k(VIZ.none, "Mānuka / kānuka")
    : S.colour === "mgr" ? Object.keys(MGR).map(l => k(C.mgr[l], MGR[l])).join("")
    : S.colour === "nf" ? Object.keys(NF).map(l => k(C.nf[l], NF[l])).join("") + k(VIZ.none, "Mānuka / kānuka")
    : KIND.map((n, i) => k(C.kind[i], n)).join(""));
}

// ------------------------------------------------------------------ side panel
const LIST_MAX = 200;
function summary() {
  const ha = shown.reduce((s, b) => s + b.ha, 0);
  $("sum").innerHTML = `<b>${fmt(shown.length)}</b> forests · <b>${fmt(ha)}</b> ha${S.pin ? ` · ${S.km} km of pin` : ""}`;
  const due = HG.map((_, i) => shown.reduce((s, b) => s + (b.k === 0 ? b.hg[i] : 0), 0)), top = Math.max(...due, 1);
  $("pipe").innerHTML = due.some(v => v) ? `<div class="ph">Plantation harvest due, ha (click to filter)</div>` + HG.map((n, i) =>
    `<div class="pr${S.due === String(i) ? " on" : ""}" data-due="${i}"><span class="pl">${n}</span><span class="pb"><span style="width:${due[i] / top * 100}%;background:${C.hg[i]}"></span></span><span class="pn">${fmt(due[i])}</span></div>`).join("") : "";
}
function listBlocks() {
  let bb = null; try { bb = map.getBounds(); } catch (e) { /* map not sized yet (hidden tab): list them all */ }
  const size = b => S.due !== "" ? b.hg[+S.due] : b.ha;        // a harvest period picked: most ha in that period first
  const v = shown.filter(b => !bb || bb.contains(b.ll)).sort((a, b) => size(b) - size(a));
  if (!v.length) return `<div class="more">No forests here with these filters.</div>`;
  return `<div class="tip">${fmt(v.length)} on screen, ${S.due !== "" ? "most due first" : "biggest first"}</div>` +
    v.slice(0, LIST_MAX).map(b => `<div class="it" data-b="${b.id}"><span class="sw" style="background:${colourOf(b)}"></span>
      <span class="m"><div class="t">${esc(D[b.d] || R[b.r] || "")}</div>
      <div class="s">${b.k === 0 && S.due !== "" ? `${fmt(b.hg[+S.due])} ha ${esc(HG[+S.due].replace(/^Due /, "due ").replace(/^Felled/, "felled").replace(/^(\d)/, "due $1"))}${b.firms.length ? " · " + esc(b.firms.join(", ")) : ""}`
        : b.k === 0 ? [b.ha ? `${fmt(b.soon)} ha due by 2033` : "Plantation", b.firms.join(", ")].filter(Boolean).map(esc).join(" · ") : "Mānuka / kānuka"}</div></span>
      <span class="n">${fmt(b.ha)} ha</span></div>`).join("") +
    (v.length > LIST_MAX ? `<div class="more">+ ${fmt(v.length - LIST_MAX)} more: zoom in or filter</div>` : "");
}
const openFirms = new Set();
function listManagers() {
  const reg = S.region >= 0 ? R[S.region] : null, w = words();
  const fs = MG.firms.filter(F => (!reg || F.reg.includes(reg)) && (!w.length || w.every(x => F.text.includes(x))));
  if (!fs.length) return `<div class="more">No firms ${reg ? "listed in " + esc(reg) : "match"}.</div>`;
  return `<div class="tip">${reg ? "Firms with forests in " + esc(reg) : "All firms"}, biggest first. Click one for its forests.</div>` +
    fs.map(F => {
      const open = openFirms.has(F.name);
      const tags = (F.fsc ? `<span class="tag fsc">FSC</span>` : "") + (F.chg && /^yes/i.test(F.chg) ? `<span class="tag chg">owner changed</span>`
        : F.year && +F.year < 2025 ? `<span class="tag old">${F.year}</span>` : "");
      const rows = F.rows.filter(x => !reg || x.reg.includes(reg));
      return `<div class="it${open ? " open" : ""}" data-f="${esc(F.name)}"><span class="chev">${open ? "▾" : "▸"}</span>
        <span class="m"><div class="t">${esc(F.short || F.name)}${tags}</div>
        <div class="s">${esc(F.own || "Owner not stated")}${F.year ? " · as at " + F.year : ""}</div></span>
        <span class="n">${F.ha ? fmt(F.ha) + " ha" : ""}</span></div>` +
        (open ? `<div class="kids">${F.chg && F.chg !== "no" ? `<div class="kidsrc"><b>${/^yes/i.test(F.chg) ? "Changed since the list" : "Note"}:</b> ${esc(F.chg.replace(/^(yes|no): /i, ""))}</div>` : ""}` +
          rows.slice(0, 60).map(x => `<div class="kid"><span>${x.src && x.src.startsWith("http") ? `<a href="${esc(x.src.split(" ")[0])}" target="_blank" rel="noopener">${esc(x.n)}</a>` : esc(x.n)}
            <span class="w"> · ${esc(x.where)}</span></span><span>${x.hat && /^\d+(\.\d+)?$/.test(x.hat) ? fmt(+x.hat) : esc(x.hat || "")}</span></div>`).join("") +
          `<div class="kidsrc">${F.fsc ? `FSC certified ${fmt(F.fsc)} ha · <a href="${esc(F.fscu)}" target="_blank" rel="noopener">certificate</a>` : ""}
            ${F.src ? ` · <a href="${esc(F.src)}" target="_blank" rel="noopener">owner source</a>` : ""}</div></div>` : "");
    }).join("");
}
function drawList() {
  document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === S.tab));
  $("list").innerHTML = S.tab === "managers" ? listManagers() : listBlocks();
}
$("list").addEventListener("click", e => {
  if (e.target.closest("a")) return;
  const it = e.target.closest(".it"); if (!it) return;
  if (it.dataset.b) { const b = blocks.find(x => x.id === +it.dataset.b); if (b) pick(b, true); }
  if (it.dataset.f) { const f = it.dataset.f; openFirms.has(f) ? openFirms.delete(f) : openFirms.add(f); drawList(); }
});
map.on("moveend", () => { if (S.tab !== "managers") drawList(); });

$("pipe").addEventListener("click", e => { const r = e.target.closest("[data-due]"); if (!r) return;
  S.due = S.due === r.dataset.due ? "" : r.dataset.due; update(); });

// ------------------------------------------------------------------ download what is filtered
$("csv").addEventListener("click", () => {
  const head = ["block_id", "type", "region", "district", "forest_ha", ...HG.map(a => "ha_" + a.toLowerCase().replace(/[^a-z0-9]+/g, "_")), "manager_lists_naming_a_forest_here", "ha_farmland_in_1996", "ha_planted_on_farmland_2018_23",
    "titles", "largest_titles", "forestry_right_titles", "crown_forest_licence_titles", "maori_land_ha", "conservation_ha",
    "lat", "lon", "satellite"];
  const q = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v;
  const rows = shown.slice().sort((a, b) => b.ha - a.ha).map(b => [b.id, KIND[b.k], R[b.r] || "", D[b.d] || "", b.ha, ...b.hg, b.mg.map(m => SHORT[m[0]] + ": " + m[1]).join("; "), b.nf[0], b.nf[1],
    b.t, b.tt, b.fr, b.cfl, b.mao, b.con, b.c[0], b.c[1], `https://www.google.com/maps/@${b.c[0]},${b.c[1]},14z/data=!3m1!1e3`].map(q).join(","));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + [head.join(","), ...rows].join("\r\n")], {type: "text/csv"}));
  a.download = "nz_forests.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ------------------------------------------------------------------ one update for every change
function syncControls() {
  $("f-kind").value = S.kind; $("f-due").value = S.due; $("f-size").value = S.size; $("f-mgr").value = S.mgr; $("f-nf").value = S.nf;
  $("f-region").value = S.region < 0 ? "" : S.region; $("f-district").value = S.district < 0 ? "" : S.district;
  for (const id of ["f-kind", "f-due", "f-size", "f-mgr", "f-nf", "f-region", "f-district"]) $(id).classList.toggle("set", $(id).value !== "");
  $("f-colour").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.v === S.colour));
}
function update(zoomTo) {
  syncControls(); draw(); summary(); drawLegend(); drawList(); writeHash();
  if (zoomTo && shown.length && (S.region >= 0 || S.district >= 0))
    map.fitBounds(L.latLngBounds(shown.map(b => b.ll)), {padding: [30, 30], maxZoom: 12, animate: false});
}
$("q").value = S.q; fillDistricts();
if (S.pin) setPin(L.latLng(S.pin[0], S.pin[1]));
update(S.region >= 0 || S.district >= 0);
if (S.pin) map.fitBounds(pinRing.getBounds(), {animate: false});
})().catch(e => { document.getElementById("list").innerHTML = `<div class="more">The map could not load: ${String(e.message || e)}</div>`; console.error(e); });
