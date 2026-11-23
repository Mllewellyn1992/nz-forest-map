// forest.js - the NZ forest map (ForestMap project, built 2026-11-23 for Pinetech Pacific). Leaflet on canvas with the
// AquilaLens background (base.js). Data in data/: blocks.json (forest blocks 10 ha+ with outlines; was 50 ha+ until 2026-11-23), managers.json (one row per forest firm: own list + FSC + owner check).
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
  mgr: {named: "#5d9cf0", found: "#4cc3b0", cfl: "#a487f0", none: "#6d7177"}, nf: {recent: "#f0c04a", most: "#4cae6c", part: "#2f6b45", old: "#6d7177"}, sel: "#ffffff"}
  : {kind: ["#2d7a46", "#c8901e"], hg: ["#b23a26", "#e0832a", "#dcc24a", "#7fae4a", "#2d6a40", "#7f6fb8"],
  soon: ["#efe3c8", "#e6b46e", "#d0702e", "#9c2f1a"],
  mgr: {named: "#2f6fde", found: "#178f7d", cfl: "#7a4fd6", none: "#a9aeb5"}, nf: {recent: "#d99a0b", most: "#3f9a5a", part: "#a6cf8f", old: "#c4c8cd"}, sel: "#111418"};
const KIND = ["Plantation", "Mānuka / kānuka"];
// default harvest colour: how much of each block is due by 2033 (a share, so one giant block does not hide its near-term part)
const enough = (v, b, cap) => v >= Math.min(cap, b.ha / 4);   // "has some X": cap ha, or a quarter of a small block
const SOON_STEPS = [0, .1, .25, .5], SOON_TEXT = ["Under 10%", "10-25%", "25-50%", "Half or more"];
const MGR = {named: "In a manager's list", found: "Manager found by research", cfl: "Crown forest licence", none: "Not matched"};
// post-1989 forest land (MfE LUCAS 2020) = land that can earn carbon units in the ETS; plus new planting on farmland 2018-23 (LCDB)
const NF = {recent: "A quarter+ planted on farmland 2018-23", most: "Mostly post-1989 forest land", part: "Partly post-1989", old: "Pre-1990 forest land"};
const NF_FILTER = {post: "Post-1989 forest land", recent: "Planted on farmland 2018-23"};
const SIZES = [["10-50 ha", 10, 50], ["50-200 ha", 50, 200], ["200-1,000 ha", 200, 1000], ["1,000-5,000 ha", 1000, 5000], ["5,000+ ha", 5000, 1e9]];

// ------------------------------------------------------------------ data
const DATA_V = 34;                       // bump with every data rebuild so browsers do not mix an old data file with new code
const get = f => fetch("data/" + f + "?v=" + DATA_V).then(r => { if (!r.ok) throw new Error(f + " " + r.status); return r.json(); });
$("list").innerHTML = `<div class="more">Loading forests…</div>`;
const [B, MG, ST] = await Promise.all([get("blocks.json"), get("managers.json"),
  fetch("stands/index.json?v=" + DATA_V).then(r => r.ok ? r.json() : {}).catch(() => ({}))]);
const R = B.regions, D = B.districts, blocks = B.blocks, HG = B.harvest;
const SHORT = Object.fromEntries(MG.firms.map(F => [F.name, F.short || F.name]));
blocks.forEach(b => {
  b.rm = b.rm || [];                    // [firm, forest, sure, source]: hand research (+ Crown-licence rule) on blocks no list named
  b.mgr = b.mg.length ? "named" : b.rm.length ? "found" : b.cfl ? "cfl" : "none";
  b.firms = [...new Set([...b.mg.map(m => SHORT[m[0]]), ...(b.rm.length ? [b.rm[0] + (b.rm[2] ? "" : " (likely)")] : [])])];
  b.nfc = b.k !== 0 ? "" : b.nf[1] >= b.ha / 4 ? "recent" : b.nf[0] >= b.ha / 2 ? "most" : enough(b.nf[0], b, 50) ? "part" : "old";   // by share, so one new corner does not colour a big old forest
  b.soon = b.hg[0] + b.hg[1];                                  // ha due by 2033: the near-term work
  b.step = b.k === 0 && b.ha ? SOON_STEPS.findLastIndex(t => b.soon / b.ha >= t) : -1;
  b.text = [R[b.r], D[b.d], b.tt, KIND[b.k], ...b.firms, ...b.mg.map(m => m[1]), b.rm[1] || ""].join(" ").toLowerCase();
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
// research names that are the same firm as a manager's own list (the rest stand on their own)
const RM_ALIAS = {"OneFortyOne": "OneFortyOne New Zealand Limited", "Juken NZ (JNL)": "Juken New Zealand Limited", "Pan Pac": "Pan Pac Forest Products Limited",
  "Kaingaroa Tipu (Timberlands)": "Timberlands Limited (Kaingaroa Tipu)", "West Coast Forests LP": "West Coast Forests Limited Partnership",
  "Wenita": "Wenita Forest Products Limited", "Crown Forestry (Te Uru Rākau)": "Crown Forestry (Te Uru Rakau)"};
const MG_BY = {};
MG.firms.forEach(F => { MG_BY[F.name] = F; MG_BY[F.short || F.name] = MG_BY[F.short || F.name] || F; });
const rmFirm = n => RM_ALIAS[n] || (MG_BY[n] ? MG_BY[n].name : n);
const openFirms = new Set();
blocks.forEach(b => { b.fk = new Set([...b.mg.map(m => m[0]), ...(b.rm.length ? [rmFirm(b.rm[0])] : [])]); });   // firms named on each block (for the firm pick)
const UNPLACED = MG.firms.filter(F => !blocks.some(b => b.fk.has(F.name)));   // on a manager's list, no forest placed on the map
// local forestry firms Google Maps lists in each region (managers, silviculture, logging crews, sawmills)
const LOCAL = (MG.local || []).map(([n, t, town, ph, web, r]) => ({n, t, town, ph, web, r, text: [n, t, town, r].join(" ").toLowerCase()}));
const LOCAL_TYPES = ["Forestry services", "Logging / harvesting", "Sawmill"];

// ------------------------------------------------------------------ map
const map = L.map("map", {preferCanvas: true});
olBaseMap(map, "Forests: LCDB v6 Manaaki Whenua (CC BY 4.0) · LINZ (CC BY 4.0)", {full: false});
map.setView([-41.2, 172.8], 5, {animate: false});   // a view first: fitting a box not yet sized leaves the map unset
olFitNZ(map);
const rnd = L.canvas({padding: .5, tolerance: 4});
const forestLayer = L.layerGroup().addTo(map);

// ------------------------------------------------------------------ harvest period of each patch (stand_tiles.py)
// PNG tiles in the light palette, z3-12; recoloured here (dark mode, one-period filter) and stretched past z12.
const STAND_Z = 3, STAND_MAX = 12, LINE_Z = 10;   // zoomed out past LINE_Z, plantation outlines hide so the patch colours show
// tiles z3-12 (z3-8 from stand_tiles_low.py) so patches show at every zoom
const STAND_RGB = ["#b23a26", "#e0832a", "#dcc24a", "#7fae4a", "#2d6a40", "#7f6fb8"].map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)));
const STAND_SET = new Set(Object.entries(ST || {}).flatMap(([z, v]) => v.map(t => z + "/" + t)));
const standImg = {};
map.createPane("stands").style.zIndex = 350;
const Stands = L.GridLayer.extend({
  _clampZoom(z) { return L.GridLayer.prototype._clampZoom.call(this, Math.round(z)); },   // Leaflet 1.9 redraw() skips the rounding: at zoom 5.75 it asked for tiles "5.75/x/y" and drew nothing
  createTile(co, done) {
    const cv = document.createElement("canvas"); cv.width = cv.height = 256;
    const zz = Math.min(co.z, STAND_MAX), f = 2 ** (co.z - zz), x = Math.floor(co.x / f), y = Math.floor(co.y / f), key = `${zz}/${x}/${y}`;
    if (!STAND_SET.has(key)) { setTimeout(() => done(null, cv)); return cv; }
    const im = standImg[key] || (standImg[key] = new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = `stands/${key}.png?v=${DATA_V}`; }));
    im.then(i => {
      const g = cv.getContext("2d"); g.imageSmoothingEnabled = false;
      const s = 256 / f; g.drawImage(i, (co.x % f) * s, (co.y % f) * s, s, s, 0, 0, 256, 256);
      const d = g.getImageData(0, 0, 256, 256), a = d.data, to = C.hg.map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))), only = S.due === "" ? -1 : +S.due;
      for (let p = 0; p < a.length; p += 4) {
        if (!a[p + 3]) continue;
        const k = STAND_RGB.findIndex(c => Math.abs(c[0] - a[p]) + Math.abs(c[1] - a[p + 1]) + Math.abs(c[2] - a[p + 2]) < 12);
        if (k < 0 || (only >= 0 && k !== only)) { a[p + 3] = 0; continue; }
        a[p] = to[k][0]; a[p + 1] = to[k][1]; a[p + 2] = to[k][2]; a[p + 3] = 215;
      }
      g.putImageData(d, 0, 0); done(null, cv);
    }).catch(() => done(null, cv));
    return cv;
  }
});
const stands = new Stands({pane: "stands", minZoom: STAND_Z, maxZoom: 19, updateWhenZooming: false});
const standsOn = () => S.colour === "due" && map.getSize().x > 0 && Number.isFinite(map.getZoom()) && map.getZoom() >= STAND_Z && STAND_SET.size > 0;
let standsWere = null;
function syncStands() {
  const on = standsOn();
  if (on && !map.hasLayer(stands)) stands.addTo(map);
  if (!on && map.hasLayer(stands)) map.removeLayer(stands);
  if (on && standsWere !== S.due) stands.redraw();
  standsWere = on ? S.due : null;
}

// ------------------------------------------------------------------ state (kept in the address bar)
const S = {};
const BLANK = {q: "", kind: "", due: "", region: -1, district: -1, size: "", mgr: "", nf: "", colour: "due", tab: "blocks", pin: null, km: 25, fm: []};
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  Object.assign(S, BLANK);
  for (const k of ["q", "kind", "due", "size", "mgr", "nf", "colour", "tab"]) if (p.has(k)) S[k] = p.get(k);
  for (const k of ["region", "district"]) if (p.has(k)) S[k] = +p.get(k);
  if (p.has("km")) S.km = /^d\d+$/.test(p.get("km")) ? p.get("km") : +p.get("km") || 25;   // "d30" = a 30 min drive
  if (!["blocks", "managers"].includes(S.tab)) S.tab = "blocks";
  S.pin = p.get("pin") ? p.get("pin").split(",").map(Number) : null;
  S.fm = p.get("fm") ? p.get("fm").split("|") : [];          // firms picked in the Managers tab
}
function writeHash() {
  const p = new URLSearchParams();
  for (const k of ["q", "kind", "due", "size", "mgr", "nf", "colour", "tab", "region", "district"]) if (S[k] !== BLANK[k]) p.set(k, S[k]);
  if (S.fm.length) p.set("fm", S.fm.join("|"));
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
$("f-colour").innerHTML = [["due", "Harvest"], ["mgr", "Manager"], ["nf", "Carbon"], ["kind", "Type"]].map(([v, t]) => `<button type="button" data-v="${v}">${t}</button>`).join("");
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
const DUE_MIN = 50;                   // a block counts for a harvest period when 50 ha+ (or a quarter of a small block) falls in it
const isDrive = () => /^d\d+$/.test(String(S.km)), driveMin = () => +String(S.km).slice(1);
const near = ll => S.pin && (isDrive() ? !!(drive && drive.rings) && ll.lat >= drive.bb[1] && ll.lat <= drive.bb[3] && ll.lng >= drive.bb[0]
  && ll.lng <= drive.bb[2] && inPoly(drive.rings, ll.lng, ll.lat) : map.distance(L.latLng(S.pin[0], S.pin[1]), ll) <= S.km * 1000);
function inPoly(rings, x, y) {   // even-odd over every ring, so holes stay out (as AquilaLens)
  let inside = false;
  for (const rg of rings) for (let i = 0, j = rg.length - 1; i < rg.length; j = i++) {
    const [xi, yi] = rg[i], [xj, yj] = rg[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside; }
  return inside;
}
const words = () => S.q.toLowerCase().split(/\s+/).filter(Boolean);
function passes(b, anyFirm) {
  if (!anyFirm && S.fm.length && !S.fm.some(f => b.fk.has(f))) return false;
  if (S.kind !== "" && b.k !== +S.kind) return false;
  if (S.region >= 0 && b.r !== S.region) return false;
  if (S.district >= 0 && b.d !== S.district) return false;
  if (S.size !== "" && !(b.ha >= SIZES[S.size][1] && b.ha < SIZES[S.size][2])) return false;
  if (S.due !== "" && !enough(b.hg[+S.due], b, DUE_MIN)) return false;
  if (S.mgr && b.mgr !== S.mgr) return false;
  if (S.nf === "post" && !enough(b.nf[0], b, 50)) return false;
  if (S.nf === "recent" && !enough(b.nf[1], b, 20)) return false;
  if (S.pin && !near(b.ll)) return false;
  const w = words(); if (w.length && !w.every(x => b.text.includes(x))) return false;
  return true;
}
const dueOn = () => S.colour === "due" && S.due !== "";          // one harvest period picked: colour that period, darker = more of the block
const share = b => b.ha ? Math.min(1, b.hg[+S.due] / b.ha) : 0;
const colourOf = b => S.colour === "due" ? (dueOn() ? C.hg[+S.due] : b.step >= 0 ? C.soon[b.step] : VIZ.none)
  : S.colour === "mgr" ? C.mgr[b.mgr] : S.colour === "nf" ? (b.nfc ? C.nf[b.nfc] : VIZ.none) : C.kind[b.k];

// ------------------------------------------------------------------ drawing
// hover label: what the colour means for this forest (Mike 2026-11-24: Manager view shows the manager, not the district)
function tipOf(b) {
  const what = S.colour === "mgr" ? (b.firms.length ? b.firms.join(", ") : MGR[b.mgr])
    : S.colour === "nf" ? (b.nfc ? NF[b.nfc] : KIND[b.k])
    : S.colour === "kind" ? KIND[b.k]
    : b.k !== 0 ? KIND[b.k] : dueOn() ? `${fmt(b.hg[+S.due])} ha ${HG[+S.due].replace(/^Due /, "due ").replace(/^Felled/, "felled").replace(/^(\d)/, "due $1")}`
    : `${fmt(b.soon)} ha due by 2033`;
  return `<b>${esc(what)}</b><br>${fmt(b.ha)} ha · ${esc(D[b.d] || "")}`;
}
let picked = null, shown = [];
function styleOf(b) {
  const c = colourOf(b), sel = picked === b;
  const fo = standsOn() && b.k === 0 ? 0 : dueOn() ? .15 + .75 * Math.sqrt(share(b)) : .7;
  return {renderer: rnd, color: sel ? C.sel : standsOn() && b.k === 0 ? (dark ? "#cfc6b4" : "#5a5146") : c, weight: sel ? 2.5 : .6, opacity: sel ? 1 : standsOn() && b.k === 0 && map.getZoom() < LINE_Z ? 0 : .9, fillColor: c, fillOpacity: sel ? Math.max(fo, standsOn() && b.k === 0 ? .08 : .6) : fo};
}
function shapeOf(b) {
  if (!b.layer) {
    b.layer = L.polygon(b.g.map(poly => poly.map(unring)), styleOf(b));
    b.layer.bindTooltip(() => tipOf(b), {sticky: true, direction: "top", opacity: .95});
    b.layer.on("click", e => { L.DomEvent.stopPropagation(e); if (pinning) { map.fire("click", {latlng: e.latlng}); return; } pick(b, false); });
  }
  return b.layer;
}
function draw() {
  forestLayer.clearLayers();
  shown = blocks.filter(b => passes(b));         // not filter(passes): the index would land in anyFirm
  shown.forEach(b => { const l = shapeOf(b); l.setStyle(styleOf(b)); forestLayer.addLayer(l); });
}

// ------------------------------------------------------------------ the block card
function blockCard(b) {
  const tot = b.hg.reduce((s, v) => s + v, 0);
  const ageRows = b.k === 0 && tot ? `<div class="s" style="margin-top:6px">Harvest due</div><div class="bar">${b.hg.map((v, i) => v ? `<span style="width:${v / tot * 100}%;background:${C.hg[i]}"></span>` : "").join("")}</div>
    <table>${b.hg.map((v, i) => v ? `<tr><td><i style="background:${C.hg[i]}"></i>${HG[i]}</td><td>${fmt(v)} ha</td></tr>` : "").join("")}</table>
    ${b.src && b.src.length ? `<div class="s">Ages from: satellite fells ${b.src[0]}%, lidar height ${b.src[1]}%, land-cover map ${b.src[2]}%</div>` : ""}` : "";
  const byFirm = {}; b.mg.forEach(([f, n]) => (byFirm[SHORT[f]] = byFirm[SHORT[f]] || []).push(n));
  const mgrRow = b.mg.length ? `<div class="s" style="margin-top:6px">Manager's list names here</div>${Object.entries(byFirm).map(([f, ns]) =>
    `<div><b>${esc(f)}</b> <span class="s">${esc(ns.join(", "))}</span></div>`).join("")}`
    : b.rm.length ? "" : `<div class="s" style="margin-top:6px">Not matched to a manager's list${b.cfl ? " (has a Crown forest licence)" : ""}</div>`;
  const resRow = b.rm.length ? `<div class="s" style="margin-top:6px">${/\(owner/.test(b.rm[0]) ? (b.rm[2] ? "Owner (found by research)" : "Likely owner (found by research, not confirmed)") : b.rm[2] ? "Manager (found by research)" : "Likely manager (found by research, not confirmed)"}</div>
    <div><b>${esc(b.rm[0])}</b>${b.rm[1] ? ` <span class="s">${esc(b.rm[1])}</span>` : ""}${b.rm[3] ? ` <a class="s" href="${esc(b.rm[3])}" target="_blank" rel="noopener">source</a>` : ""}</div>` : "";
  const extra = [b.fr ? `${b.fr} with a forestry right` : "", b.cfl ? `${b.cfl} Crown forest licence` : ""].filter(Boolean).join(", ");
  const rows = [["Land titles", fmt(b.t) + (extra ? ` <span class="s">(${extra})</span>` : "")],
    b.mao ? ["Māori land", fmt(b.mao) + " ha"] : null, b.con ? ["Conservation land", fmt(b.con) + " ha"] : null].filter(Boolean);
  return `<div class="card"><h3>${esc(KIND[b.k])} · ${fmt(b.ha)} ha</h3>
    <div class="s">${esc(D[b.d] || "")}${b.r >= 0 ? ", " + esc(R[b.r]) : ""}</div>
    ${ageRows}${b.k === 0 ? mgrRow + resRow : ""}${b.k === 0 && b.nf[0] ? `<div class="s" style="margin-top:6px">Post-1989 forest land: <b>${fmt(b.nf[0])} ha</b>${b.nf[1] ? ` (${fmt(b.nf[1])} ha planted 2018-23)` : ""}</div>` : ""}
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
let pinMk = null, pinRing = null, pinning = false, drive = null;   // drive = {key, rings, bb, f, err} for a drive-time pin
function setPin(ll) {
  if (pinMk) { map.removeLayer(pinMk); pinMk = null; }
  S.pin = ll ? [ll.lat, ll.lng] : null;
  if (S.pin) {
    pinMk = L.marker(S.pin, {draggable: true, title: "Drag to move"}).addTo(map);
    pinMk.on("dragend", () => { setPin(pinMk.getLatLng()); update(); });
  }
  drawRing();
  $("pinclear").hidden = !S.pin;
}
// the pin's reach: a km circle, or the area reachable by car in N minutes from the free Valhalla server on OpenStreetMap
// roads (valhalla1.openstreetmap.de, as AquilaLens; no key, light use: each area asked once per page; max 60 min)
const ISO = {};
function drawRing(fit) {
  if (pinRing) { map.removeLayer(pinRing); pinRing = null; }
  if (!S.pin) { drive = null; return; }
  const sty = {color: VIZ.tool.ring, weight: 2, fillColor: VIZ.tool.ring, fillOpacity: .04, interactive: false};
  if (!isDrive()) { drive = null; pinRing = L.circle(S.pin, {radius: S.km * 1000, ...sty}).addTo(map); }
  else {
    const k = `${S.pin[0].toFixed(4)},${S.pin[1].toFixed(4)},${driveMin()}`;
    if (!drive || drive.key !== k) {
      const d = drive = {key: k, rings: null, err: ""};
      const ask = {locations: [{lat: S.pin[0], lon: S.pin[1]}], costing: "auto", contours: [{time: driveMin()}], polygons: true};
      (ISO[k] = ISO[k] || fetch("https://valhalla1.openstreetmap.de/isochrone?json=" + encodeURIComponent(JSON.stringify(ask)))
        .then(x => { if (!x.ok) throw new Error(`the drive-time service said ${x.status} - try again in a minute`); return x.json(); }))
        .then(g => { if (drive !== d) return;
          const f = g.features && g.features.find(x => x.geometry && /Polygon/.test(x.geometry.type)); if (!f) throw new Error("no drive-time area came back");
          d.f = f; d.rings = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates.flat() : f.geometry.coordinates;
          const pts = d.rings.flat(); d.bb = [Math.min(...pts.map(q => q[0])), Math.min(...pts.map(q => q[1])), Math.max(...pts.map(q => q[0])), Math.max(...pts.map(q => q[1]))];
          drawRing(true); update(); })
        .catch(e => { delete ISO[k]; if (drive !== d) return; d.err = (e && e.message) || "the drive-time service did not answer"; update(); });
    }
    if (drive.rings) pinRing = L.geoJSON(drive.f, {style: sty, interactive: false}).addTo(map);
  }
  if (fit && pinRing) map.fitBounds(pinRing.getBounds(), {animate: false});
}
const pinLabel = () => !isDrive() ? `${S.km} km of pin` : drive && drive.rings ? `${driveMin()} min drive of pin`
  : drive && drive.err ? `drive time failed: ${esc(drive.err)}` : "working out the drive time…";
const PinCtl = L.Control.extend({onAdd() {
  const d = L.DomUtil.create("div", "pinbox");
  d.innerHTML = `<button id="pinbtn" type="button" title="Click, then click the map: only forests within the distance or drive time are counted">Drop a pin</button>
    <select id="pinkm" aria-label="Distance or drive time"><optgroup label="Distance">${[10, 25, 50, 100, 150].map(k => `<option value="${k}">${k} km</option>`).join("")}</optgroup>
      <optgroup label="Drive time">${[15, 30, 45, 60].map(k => `<option value="d${k}">${k} min drive</option>`).join("")}</optgroup></select>
    <button id="pinclear" type="button" hidden title="Remove the pin">✕</button>`;
  L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
  return d; }});
new PinCtl({position: "topleft"}).addTo(map);
$("pinkm").value = String(S.km);
$("pinbtn").addEventListener("click", () => { pinning = !pinning; $("pinbtn").classList.toggle("on", pinning); map.getContainer().style.cursor = pinning ? "crosshair" : ""; });
$("pinkm").addEventListener("change", () => { const v = $("pinkm").value; S.km = v[0] === "d" ? v : +v; if (S.pin) { drawRing(); update(); } });
$("pinclear").addEventListener("click", () => { setPin(null); update(); });
map.on("click", e => { if (!pinning) return; pinning = false; $("pinbtn").classList.remove("on"); map.getContainer().style.cursor = ""; setPin(e.latlng); update(); });

// ------------------------------------------------------------------ legend
const legend = L.DomUtil.create("div", "legend");
map.getContainer().appendChild(legend);
L.DomEvent.disableClickPropagation(legend);
function drawLegend() {
  const k = (c, t, round) => `<div class="k"><i style="background:${c}${round ? ";border-radius:50%" : ""}"></i>${esc(t)}</div>`;
  legend.innerHTML = standsOn() ? `<div class="lh">Harvest due, each patch</div>` + HG.map((n, i) => S.due === "" || S.due === String(i) ? k(C.hg[i], n) : "").join("") + k(VIZ.none, "Mānuka / kānuka")
    : (dueOn() ? `<div class="lh">${esc(HG[+S.due])}</div>` + [[1, "All of the block"], [.5, "Half"], [.1, "A tenth"]].map(([f, t]) =>
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
  $("sum").innerHTML = `<b>${fmt(shown.length)}</b> forests · <b>${fmt(ha)}</b> ha${S.pin ? ` · ${pinLabel()}` : ""}`;
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
function fitShown() {                               // after a firm pick: frame that firm's forests (all NZ for a big estate)
  if (S.fm.length && shown.length) map.fitBounds(L.latLngBounds(shown.map(b => [b.ll.lat, b.ll.lng < 0 ? b.ll.lng + 360 : b.ll.lng])), {padding: [30, 30], maxZoom: 11, animate: false});   // Chathams sit past 180°
}
// Managers tab: every firm with a forest that passes the filters (manager's list, research or Crown-licence rule),
// biggest by mapped ha (or ha due in the picked period); firms on a list whose forests are not placed follow, named only
function listManagers() {
  const reg = S.region >= 0 ? R[S.region] : null, w = words(), per = S.due !== "" ? +S.due : -1;
  const size = b => per >= 0 ? b.hg[per] : b.ha, agg = new Map();
  for (const b of S.fm.length ? blocks.filter(b => passes(b, true)) : shown) {
    const fs = new Map();
    b.mg.forEach(m => fs.set(m[0], fs.has(m[0]) ? fs.get(m[0]) + " / " + m[1] : m[1]));   // one block can hold several of a firm's named forests
    if (b.rm.length && !fs.has(rmFirm(b.rm[0]))) fs.set(rmFirm(b.rm[0]), (b.rm[2] ? "" : "\u0000") + (b.rm[1] || ""));   // \0 marks "likely"
    for (const [f, forest] of fs) {
      const a = agg.get(f) || agg.set(f, {name: f, F: MG_BY[f] && MG_BY[f].name === f ? MG_BY[f] : null, ha: 0, n: 0, likely: 0, bs: []}).get(f);
      const lk = forest.startsWith("\u0000");
      a.ha += size(b); a.n++; a.likely += lk; a.bs.push([b, lk ? forest.slice(1) : forest, lk]);
    }
  }
  for (const f of S.fm) if (!agg.has(f)) agg.set(f, {name: f, F: MG_BY[f] && MG_BY[f].name === f ? MG_BY[f] : null, ha: 0, n: 0, likely: 0, bs: []});   // picked, none match now: keep it to untick
  const fs = [...agg.values()].filter(a => a.ha > 0 || per < 0 || S.fm.includes(a.name)).sort((x, y) => S.fm.includes(y.name) - S.fm.includes(x.name) || y.ha - x.ha);
  const noBlock = UNPLACED.filter(F => (!reg || F.reg.includes(reg)) && (!w.length || w.every(x => F.text.includes(x))));
  const what = per >= 0 ? "ha due " + HG[per].replace(/^Due /, "").replace(/^Felled /, "felled ") : "ha";
  return (fs.length ? (S.fm.length ? `<div class="tip picks"><span>Map shows ${S.fm.length === 1 ? "only this firm" : "only these " + S.fm.length + " firms"}. Tick more to add.</span><button class="lnk" type="button" data-unpick="1">Show all</button></div>`
      : `<div class="tip">${fmt(fs.length)} firms with forests that match the filters, ${what} on the map. Tick a box to show only that firm's forests (tick more to add); click a name for its forests.</div>`) +
    fs.map(a => {
      const F = a.F, on = S.fm.includes(a.name), open = openFirms.has(a.name);
      const tags = (F && F.fsc ? `<span class="tag fsc">FSC</span>` : "") + (F && F.chg && /^yes/i.test(F.chg) ? `<span class="tag chg">owner changed</span>`
        : F && F.year && +F.year < 2025 ? `<span class="tag old">${F.year}</span>` : "") + (a.n && a.likely === a.n ? `<span class="tag old">likely</span>` : "");
      const sub = !a.n ? "No forests match the other filters" : F ? (F.own || "Owner not stated") + (F.year ? " · as at " + F.year : "")
        : `Found by research · ${a.n} forest${a.n > 1 ? "s" : ""}${a.likely && a.likely < a.n ? `, ${a.likely} likely` : ""}`;
      a.bs.sort((x, y) => size(y[0]) - size(x[0]));
      return `<div class="it${open ? " open" : ""}${on ? " on" : ""}" data-f="${esc(a.name)}"><span class="chev">${open ? "▾" : "▸"}</span><span class="pk" data-pick="${esc(a.name)}" title="Show only ticked firms on the map"><span class="tick" role="checkbox" aria-checked="${on}">${on ? "✓" : ""}</span></span>
        <span class="m"><div class="t">${esc(F ? F.short || F.name : a.name)}${tags}</div><div class="s">${esc(sub)}</div></span>
        <span class="n">${fmt(a.ha)} ha</span></div>` +
        (open ? `<div class="kids">${F && F.chg && F.chg !== "no" ? `<div class="kidsrc"><b>${/^yes/i.test(F.chg) ? "Changed since the list" : "Note"}:</b> ${esc(F.chg.replace(/^(yes|no): /i, ""))}</div>` : ""}` +
          a.bs.slice(0, 60).map(([b, forest, lk]) => `<div class="kid" data-b="${b.id}" style="cursor:pointer"><span>${esc(forest || D[b.d] || R[b.r] || "Forest")}
            <span class="w"> · ${esc(D[b.d] || R[b.r] || "")}${lk ? " · likely" : ""}</span></span><span>${fmt(size(b))}</span></div>`).join("") +
          (a.bs.length > 60 ? `<div class="kidsrc">+ ${fmt(a.bs.length - 60)} more: filter to see them</div>` : "") +
          (F ? `<div class="kidsrc">${F.fsc ? `FSC certified ${fmt(F.fsc)} ha · <a href="${esc(F.fscu)}" target="_blank" rel="noopener">certificate</a>` : ""}
            ${F.src ? ` · <a href="${esc(F.src)}" target="_blank" rel="noopener">owner source</a>` : ""}</div>` : "") + `</div>` : "");
    }).join("") : `<div class="more">No firms match these filters.</div>`) +
    (noBlock.length ? `<div class="tip" style="margin-top:10px">Also on managers' lists, forests not placed on the map: ${noBlock.map(F => esc(F.short || F.name)).join(", ")}</div>` : "") +
    listLocal(reg, w);
}
function listLocal(reg, w) {
  const ls = LOCAL.filter(x => (!reg || x.r === reg) && (!w.length || w.every(y => x.text.includes(y))));
  if (!reg && !w.length) return `<div class="tip" style="margin-top:10px">Pick a region to also see the ${fmt(LOCAL.length)} local forestry firms Google Maps lists.</div>`;
  if (!ls.length) return "";
  return `<div class="tip" style="margin-top:10px"><b>Local forestry firms${reg ? " in " + esc(reg) : ""}</b> · ${ls.length} listed on Google Maps (Nov 2026)</div>` +
    LOCAL_TYPES.map(t => { const g = ls.filter(x => x.t === t); return g.length ? `<div class="kidsrc" style="margin-top:6px"><b>${t}</b> (${g.length})</div>` +
      g.map(x => `<div class="kid"><span>${x.web ? `<a href="${esc(x.web)}" target="_blank" rel="noopener">${esc(x.n)}</a>` : esc(x.n)}
        <span class="w">${x.town ? " · " + esc(x.town) : ""}${!reg && x.r ? " · " + esc(x.r) : ""}</span></span><span style="white-space:nowrap;flex:none">${x.ph ? `<a href="tel:${esc(x.ph.replace(/\s/g, ""))}">${esc(x.ph)}</a>` : ""}</span></div>`).join("") : ""; }).join("");
}
function drawList() {
  document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === S.tab));
  $("list").innerHTML = S.tab === "managers" ? listManagers() : listBlocks();
}
$("list").addEventListener("click", e => {
  if (e.target.closest("a")) return;
  if (e.target.closest("[data-unpick]")) { S.fm = []; update(); return; }
  const it = e.target.closest(".it, .kid[data-b]"); if (!it) return;
  if (it.dataset.b) { const b = blocks.find(x => x.id === +it.dataset.b); if (b) pick(b, true); }
  const pk = e.target.closest("[data-pick]");
  if (pk) { const f = pk.dataset.pick; S.fm = S.fm.includes(f) ? S.fm.filter(x => x !== f) : [...S.fm, f]; update(); fitShown(); return; }   // tick: pick only
  if (it.dataset.f) { const f = it.dataset.f; openFirms.has(f) ? openFirms.delete(f) : openFirms.add(f); drawList(); }               // row: open its forests
});
map.on("moveend", () => { if (S.tab !== "managers") drawList(); });
let standsZ = null;
map.on("zoomend", () => { const on = standsOn() + "" + (map.getZoom() >= LINE_Z); if (on !== standsZ) { standsZ = on; syncStands(); shown.forEach(b => b.layer && b.layer.setStyle(styleOf(b))); drawLegend(); } });

$("pipe").addEventListener("click", e => { const r = e.target.closest("[data-due]"); if (!r) return;
  S.due = S.due === r.dataset.due ? "" : r.dataset.due; update(); });

// ------------------------------------------------------------------ download what is filtered
$("csv").addEventListener("click", () => {
  const head = ["block_id", "type", "region", "district", "forest_ha", ...HG.map(a => "ha_" + a.toLowerCase().replace(/[^a-z0-9]+/g, "_")), "manager_lists_naming_a_forest_here", "manager_found_by_research", "research_confidence", "research_source", "ha_post_1989_forest_land_mfe", "ha_planted_on_farmland_2018_23",
    "titles", "largest_titles", "forestry_right_titles", "crown_forest_licence_titles", "maori_land_ha", "conservation_ha",
    "lat", "lon", "satellite"];
  const q = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v;
  const rows = shown.slice().sort((a, b) => b.ha - a.ha).map(b => [b.id, KIND[b.k], R[b.r] || "", D[b.d] || "", b.ha, ...b.hg, b.mg.map(m => SHORT[m[0]] + ": " + m[1]).join("; "), b.rm.length ? b.rm[0] + (b.rm[1] ? ": " + b.rm[1] : "") : "", b.rm.length ? (b.rm[2] ? "sure" : "likely") : "", b.rm[3] || "", b.nf[0], b.nf[1],
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
  syncControls(); syncStands(); draw(); summary(); drawLegend(); drawList(); writeHash();
  if (zoomTo && shown.length && (S.region >= 0 || S.district >= 0)) {
    map.invalidateSize(false);                     // the box may only just have been sized (first load in a new tab)
    const go = () => map.fitBounds(L.latLngBounds(shown.map(b => b.ll)), {padding: [30, 30], maxZoom: 12, animate: false});
    whenSized(go);
  }
}
function whenSized(go) {                           // a map box not yet sized (hidden or new tab) cannot fit a view: wait
  map.invalidateSize(false);
  {
    if (!map.getSize().x) { const ro = new ResizeObserver(() => { if (map.getSize().x || (map.invalidateSize(false), map.getSize().x)) { ro.disconnect(); go(); } }); ro.observe(map.getContainer()); }
    else go();
  }
}
$("q").value = S.q; fillDistricts();
if (S.pin) setPin(L.latLng(S.pin[0], S.pin[1]));
update(S.region >= 0 || S.district >= 0);
if (S.pin && pinRing) whenSized(() => map.fitBounds(pinRing.getBounds(), {animate: false}));   // a drive area fits itself when it arrives
})().catch(e => { document.getElementById("list").innerHTML = `<div class="more">The map could not load: ${String(e.message || e)}</div>`; console.error(e); });
