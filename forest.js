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
  mgr: {named: "#5d9cf0", found: "#4cc3b0", cfl: "#a487f0", none: "#6d7177"}, nf: {recent: "#f0c04a", most: "#4cae6c", part: "#2f6b45", old: "#6d7177"}, sel: "#ffffff",
  ht: ["#5a5340", "#7d7a3e", "#8fae4a", "#4cbf6c", "#a6f0b4"]}
  : {kind: ["#2d7a46", "#c8901e"], hg: ["#b23a26", "#e0832a", "#dcc24a", "#7fae4a", "#2d6a40", "#7f6fb8"],
  soon: ["#efe3c8", "#e6b46e", "#d0702e", "#9c2f1a"],
  mgr: {named: "#2f6fde", found: "#178f7d", cfl: "#7a4fd6", none: "#a9aeb5"}, nf: {recent: "#d99a0b", most: "#3f9a5a", part: "#a6cf8f", old: "#c4c8cd"}, sel: "#111418",
  ht: ["#efe6c4", "#cfd99a", "#8fbf68", "#3f8f4c", "#164f2c"]};
// tree height (LINZ lidar, median of the block's 80 m cells, at the flight year) - Chris 2026-11-24: "regional heights"
const HT_STEPS = [0, 5, 10, 20, 30], HT_TEXT = ["Under 5 m", "5-10 m", "10-20 m", "20-30 m", "30 m+"];
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
const DATA_V = 47;                       // bump with every data rebuild so browsers do not mix an old data file with new code
const get = f => fetch("data/" + f + "?v=" + DATA_V).then(r => { if (!r.ok) throw new Error(f + " " + r.status); return r.json(); });
$("list").innerHTML = `<div class="more">Loading forests…</div>`;
const tileIndex = d => fetch(d + "/index.json?v=" + DATA_V).then(r => r.ok ? r.json() : {}).catch(() => ({}));
const [B, MG, E, ST, HT] = await Promise.all([get("blocks.json"), get("managers.json"), get("extra.json").catch(() => ({h: {}, v: {}, vb: {}})),
  tileIndex("stands"), tileIndex("heights")]);
const R = B.regions, D = B.districts, blocks = B.blocks.filter(b => b.k === 0), HG = B.harvest;   // mānuka / kānuka taken off (Mike 2026-11-26: photo test ~50% wrong)
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
  b.ht = E.h[b.id] && E.h[b.id][0] != null ? E.h[b.id] : null;      // [avg canopy median m, tallest tenth m, flight year, % flown, % under 2 m, top height median m, top tallest tenth m]
  b.top = b.ht ? (b.ht[7] != null ? b.ht[7] : b.ht[5] != null ? b.ht[5] : b.ht[0]) : null;   // height today, else top height when flown, else average canopy
  b.hts = b.ht ? HT_STEPS.findLastIndex(t => b.top >= t) : -1;
  b.vk = E.vb[b.id] || "";                                           // MPI yield table region
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
const tileSet = T => new Set(Object.entries(T || {}).flatMap(([z, v]) => v.map(t => z + "/" + t)));
const STAND_SET = tileSet(ST), HT_SET = tileSet(HT);
const HT_RGB = ["#efe6c4", "#cfd99a", "#8fbf68", "#3f8f4c", "#164f2c"].map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)));   // height_tiles.py palette
const standImg = {};
let standMask = "", standBlocks = null;              // filtered: patches of forests not on the list are cut away (drive tool too)
const blockRings = b => b.rings || (b.rings = b.g.map(poly => poly.map(unring)));
const blockBB = b => b.bb || (b.bb = (() => { let a = 90, c = -90, e = 180, f = -180;
  blockRings(b).forEach(p => p[0].forEach(([y, x]) => { a = Math.min(a, y); c = Math.max(c, y); e = Math.min(e, x); f = Math.max(f, x); })); return [a, e, c, f]; })());
map.createPane("stands").style.zIndex = 350;
const Stands = L.GridLayer.extend({
  _clampZoom(z) { return L.GridLayer.prototype._clampZoom.call(this, Math.round(z)); },   // Leaflet 1.9 redraw() skips the rounding: at zoom 5.75 it asked for tiles "5.75/x/y" and drew nothing
  createTile(co, done) {
    const cv = document.createElement("canvas"); cv.width = cv.height = 256;
    const zz = Math.min(co.z, STAND_MAX), f = 2 ** (co.z - zz), x = Math.floor(co.x / f), y = Math.floor(co.y / f), key = `${zz}/${x}/${y}`;
    const o = this.options;
    if (!o.set.has(key)) { setTimeout(() => done(null, cv)); return cv; }
    const ik = o.dir + key;
    const im = standImg[ik] || (standImg[ik] = new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = `${o.dir}/${key}.png?v=${DATA_V}`; }));
    im.then(i => {
      const g = cv.getContext("2d"); g.imageSmoothingEnabled = false;
      const s = 256 / f; g.drawImage(i, (co.x % f) * s, (co.y % f) * s, s, s, 0, 0, 256, 256);
      const d = g.getImageData(0, 0, 256, 256), a = d.data, to = o.to().map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))), only = o.only();
      for (let p = 0; p < a.length; p += 4) {
        if (!a[p + 3]) continue;
        const k = o.rgb.findIndex(c => Math.abs(c[0] - a[p]) + Math.abs(c[1] - a[p + 1]) + Math.abs(c[2] - a[p + 2]) < 12);
        if (k < 0 || (only && !only.has(k))) { a[p + 3] = 0; continue; }
        a[p] = to[k][0]; a[p + 1] = to[k][1]; a[p + 2] = to[k][2]; a[p + 3] = 215;
      }
      g.putImageData(d, 0, 0);
      if (standBlocks) {                             // keep only the forests on the list
        const o = L.point(co.x * 256, co.y * 256), nw = map.unproject(o, co.z), se = map.unproject(o.add([256, 256]), co.z);
        const hit = standBlocks.filter(b => { const A = blockBB(b); return A[0] <= nw.lat && A[2] >= se.lat && A[1] <= se.lng && A[3] >= nw.lng; });
        if (!hit.length) g.clearRect(0, 0, 256, 256);   // an empty path would cut nothing
        g.globalCompositeOperation = "destination-in"; g.beginPath();
        hit.forEach(b => blockRings(b).forEach(poly => poly.forEach(r => r.forEach(([la, ln], i) => {
          const q = map.project([la, ln], co.z).subtract(o); i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y); }))));
        g.fillStyle = "#000"; g.fill("evenodd"); g.globalCompositeOperation = "source-over";
      }
      done(null, cv);
    }).catch(() => done(null, cv));
    return cv;
  }
});
const stands = new Stands({pane: "stands", minZoom: STAND_Z, maxZoom: 19, updateWhenZooming: false, dir: "stands", set: STAND_SET, rgb: STAND_RGB,
  to: () => C.hg, only: () => S.due.length ? new Set(S.due.map(Number)) : null});
// Height view: every 80 m lidar cell coloured by tree height (height_tiles.py), the same way as the harvest patches
const heights = new Stands({pane: "stands", minZoom: STAND_Z, maxZoom: 19, updateWhenZooming: false, dir: "heights", set: HT_SET, rgb: HT_RGB,
  to: () => C.ht, only: () => null});
const mapReady = () => map.getSize().x > 0 && Number.isFinite(map.getZoom()) && map.getZoom() >= STAND_Z;
const standsOn = () => S.colour === "due" && mapReady() && STAND_SET.size > 0;
const heightsOn = () => S.colour === "ht" && mapReady() && HT_SET.size > 0;
const patchOn = b => (standsOn() && b.k === 0) || (heightsOn() && !!b.ht);     // the tiles draw this forest, so its fill steps aside
let standsWere = null;
function syncStands() {
  const on = standsOn();
  if (on && !map.hasLayer(stands)) stands.addTo(map);
  if (!on && map.hasLayer(stands)) map.removeLayer(stands);
  if (on && standsWere !== S.due.join() + standMask) stands.redraw();
  standsWere = on ? S.due.join() + standMask : null;
  const hon = heightsOn();
  if (hon && !map.hasLayer(heights)) heights.addTo(map);
  if (!hon && map.hasLayer(heights)) map.removeLayer(heights);
  if (hon && heightsWere !== standMask) heights.redraw();
  heightsWere = hon ? standMask : null;
}
let heightsWere = null;
function syncMask() {                 // patches follow the list whenever a filter is on
  standBlocks = shown.length < blocks.length ? shown : null;
  standMask = standBlocks ? shown.length + ":" + shown.reduce((h, b) => (h * 31 + b.id) % 1e9, 7) : "";
}

// ------------------------------------------------------------------ state (kept in the address bar)
// Mike 2026-11-25: filters "like AquilaLens" - a list of filter tabs on the left, each opens to every option with a tick box
// and a live count; ticks inside a tab widen ("this OR that"), tabs narrow each other. Results grouped on the right.
const FK = ["due", "region", "district", "size", "fm", "nf", "ht", "npl", "fell", "svcl"];   // fell = Hawke's Bay felled-since-2025 layer (Mike 2026-11-26)
//   // svcl = forestry services layer tab (Mike 2026-11-26: a filter at the bottom, off at start)
//   // npl = map layer tab (aerial pilot), not a forest filter   // "How the manager is known" dropped (Mike 2026-11-25); old mgr= links ignored; Certification dropped too (Mike: Manager already shows FSC)       // the tick filters (lists)
const S = {};
const BLANK = {q: "", colour: "due", grp: "blocks", pin: null, km: 25, inf: "", dp: [], dfrom: "", dt: "", dm: "60", np: "", npa: "", ...Object.fromEntries(FK.map(k => [k, []]))};
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  Object.assign(S, BLANK, Object.fromEntries(FK.map(k => [k, []])));
  for (const k of ["q", "colour", "inf", "dfrom", "dt", "dm", "grp"]) if (p.has(k)) S[k] = p.get(k);
  S.inf = S.inf === "1" || S.inf === "pm" ? "pso" : S.inf === "m" ? "so" : S.inf.replace(/[^pso]/g, "");   // older links: one tick, then ports / mills
  for (const k of ["np", "npa"]) if (p.get(k) && !S.npl.includes(k)) S.npl.push(k);   // links from before the layer moved to a filter tab
  if (p.has("tab")) S.grp = p.get("tab");                    // links from before 2026-11-25
  if (!["blocks", "district", "region", "managers", "charts"].includes(S.grp)) S.grp = "blocks";
  for (const k of FK) if (p.has(k)) S[k] = p.get(k).split(k === "fm" ? "|" : ",").filter(v => v !== "" && v !== "-1");   // old links held one value
  if (p.has("km")) S.km = /^d\d+$/.test(p.get("km")) ? p.get("km") : +p.get("km") || 25;   // "d30" = a 30 min drive
  S.pin = p.get("pin") ? p.get("pin").split(",").map(Number) : null;
  if (p.get("dp")) { const dp = p.get("dp").split("|");        // links from before 2026-11-25 held the ticked places: drive on, from those kinds
    S.dt = "1"; S.inf = [...new Set([...S.inf, ...dp.map(k => k[0] === "p" ? "p" : "s")])].join(""); if (dp.length === 1) S.dfrom = dp[0]; }
}
function writeHash() {
  const p = new URLSearchParams();
  for (const k of ["q", "grp", "inf", "dfrom", "dt", "dm"]) if (S[k] !== BLANK[k]) p.set(k, S[k]);
  for (const k of FK) if (S[k].length) p.set(k, S[k].join(k === "fm" ? "|" : ","));
  if (S.pin) { p.set("pin", S.pin.map(v => v.toFixed(4)).join(",")); p.set("km", S.km); }
  history.replaceState(null, "", p.toString() ? "#" + p : location.pathname);
}
readHash();
const due1 = () => S.due.length === 1 ? +S.due[0] : -1;          // one harvest period picked
const dueHa = b => S.due.length ? S.due.reduce((s, i) => s + b.hg[+i], 0) : b.ha;
const dueWord = i => HG[i].replace(/^Due /, "due ").replace(/^Felled/, "felled").replace(/^(\d)/, "due $1");

// ------------------------------------------------------------------ the filter tabs (left panel)
const DUE_MIN = 50;                   // a block counts for a harvest period when 50 ha+ (or a quarter of a small block) falls in it
const firmLabel = f => MG_BY[f] ? MG_BY[f].short || MG_BY[f].name : f;
const fscFirm = f => !!(MG_BY[f] && MG_BY[f].fsc);
blocks.forEach(b => { b.fsc = [...b.fk].some(fscFirm); });
const FIRMS = (() => { const n = new Map(); blocks.forEach(b => b.fk.forEach(f => n.set(f, (n.get(f) || 0) + b.ha))); return [...n].sort((a, b) => b[1] - a[1]).map(x => x[0]); })();
const FACETS = [
  {id: "due", title: "Harvest due", note: "A forest counts when 50 ha or more (or a quarter of a small forest) falls in the period. Ages are estimates.",
    opts: () => HG.map((t, i) => [String(i), t]), test: (b, k) => enough(b.hg[+k], b, DUE_MIN)},
  {id: "region", title: "Region", opts: () => R.map((t, i) => [String(i), t]).filter(([i]) => blocks.some(b => b.r === +i)).sort((a, b) => a[1].localeCompare(b[1])), test: (b, k) => b.r === +k},
  {id: "district", title: "District", search: "Find a district…", opts: () => {
      const rs = S.region.length ? S.region.map(Number) : R.map((_, i) => i), out = [];
      rs.slice().sort((a, b) => R[a].localeCompare(R[b])).forEach(r => {
        const ds = [...new Set(blocks.filter(b => b.r === r).map(b => b.d))].sort((a, b) => D[a].localeCompare(D[b]));
        ds.forEach((d, j) => out.push([String(d), D[d], j ? null : R[r]]));
      });
      return out; }, test: (b, k) => b.d === +k},
  {id: "size", title: "Size", opts: () => SIZES.map((x, i) => [String(i), x[0]]), test: (b, k) => b.ha >= SIZES[k][1] && b.ha < SIZES[k][2]},
  {id: "fm", title: "Manager", search: "Find a firm…", note: "Firms named on a forest: from the firm's own published list, or found by research. About a third of plantation area is matched.",
    opts: () => FIRMS.map(f => [f, firmLabel(f)]), test: (b, k) => b.fk.has(k)},
  {id: "nf", title: "Carbon land", note: "Post-1989 forest land (MfE LUCAS 2020): land that can earn carbon units in the ETS.",
    opts: () => Object.entries(NF_FILTER), test: (b, k) => k === "post" ? enough(b.nf[0], b, 50) : enough(b.nf[1], b, 20)},
  {id: "ht", title: "Height today", note: "Estimated from LINZ lidar grown on to today, middle of the forest.",
    opts: () => [...HT_TEXT.map((t, i) => [String(i), t]).reverse(), ["none", "No lidar yet"]], test: (b, k) => k === "none" ? b.hts < 0 : b.hts === +k},
  {id: "npl", title: "New planting (pilot)", layer: true, note: "Map layer only. Central Hawke's Bay test: forest on 2025-26 aerial photos not on the land-cover map.",
    opts: () => [["np", "New planting"], ["npa", "Areas checked"]], test: () => true},
  {id: "fell", title: "Felled since 2025 (Hawke's Bay)", layer: true, note: "Map layer only. Pine cleared between the summer 2024-25 and spring 2026 satellite photos, Hawke's Bay only.",
    opts: () => [["0", FELL_T[0]], ["1", FELL_T[1]]], test: () => true},
  {id: "svcl", title: "Forestry services", layer: true, note: "Map layer only: firms that do work for forests, sorted by hand from their own descriptions. Paler dots are placed at the town, not the yard.",
    opts: () => SVC_T.map((t, i) => [String(i), SVC.d ? `${t} (${SVC.d.f.filter(f => f[1] === i).length})` : t]), test: () => true},
];
// how each filter is worked out and how sure it is (Mike 2026-11-26: "an information icon ... how it was calculated and what the
// accuracy levels are"). Only checks actually run are quoted; "not tested" where none was.
const FINFO = {
  kind: ["Land-cover map (LCDB v6, Manaaki Whenua, 2023/24): exotic forest and harvested land = plantation; mānuka / kānuka kept apart. Touching pieces joined; 10 ha+ only.",
    "Plantation total 1.82 million ha vs MPI's 1.82 million ha (within 0.3%). Mānuka not tested."],
  due: ["Each 30 m square: planting year from the last satellite clear-fell (53% of area), else lidar tree height (41%), else the land-cover map (5%); harvest = planting + 28 years, matched to MPI's regional age mix. Bits under 3 ha join their forest.",
    "Fell year near exact (27 of 30 recent fells checked real). Lidar ages right to the 5-year period ~99% for trees 5-15 years old, ~75% older. The 28-year rotation is assumed (real 25-32), so a forest can be one period out."],
  region: ["The region the forest's middle point falls in (Stats NZ boundaries).", "Exact; a forest across a boundary goes with its middle."],
  district: ["The district the forest's middle point falls in (Stats NZ boundaries).", "Exact; a forest across a boundary goes with its middle."],
  size: ["Area of the forest's land-cover outline.", "As exact as the map's outline; the map skips patches under 1 ha."],
  fm: ["Firms' own published forest lists, placed by forest name on LINZ place names; others found by web research (shown as not confirmed). About a third of plantation area has a manager.",
    "Not fully tested. Owner changes checked on the web Nov 2026."],
  nf: ["MfE carbon map (LUCAS 2020): land in forest since 1989, which can earn ETS units. Planted 2018-23 from the land-cover map.",
    "Government map, not re-checked. Planted 2018-23: 8 of 8 satellite checks right."],
  ht: ["LINZ lidar top height when flown (year varies by area), grown on to today with the NZ pine growth curve. Middle of the forest.",
    "Lidar height is measured (about ±1 m). The grow-on to today is not tested."],
  npl: ["AI read of 2025-26 LINZ aerial photos in 1 ha squares, central Hawke's Bay only: forest the land-cover map misses.",
    "Pilot: not checked on the ground."],
  fell: ["Satellite (Sentinel-2, 10 m) greenness drop inside pine, then every patch checked by AI on before and after photos; already bare before 2025, roads only and unclear patches left off. Hawke's Bay only, patches 2 ha+.",
    "All 164,000 ha of Hawke's Bay pine scanned. Biggest patches re-checked by eye: right. Not checked on the ground."],
  svcl: ["Forestry-related firms from AquilaLens, each sorted by hand from its own description. Pin = its sites; paler dots placed at its town. Mills already on the Ports and mills layer not repeated.",
    "Hand check: 18 of 20 sorted right. Firms with no address (111) left off; not every firm in NZ is listed."],
};
const FBY = Object.fromEntries(FACETS.map(f => [f.id, f]));
const infoOpen = new Set();
let openF = null; const finds = {};
const SHOW = 300;
function drawFilters() {
  const f = openF && FBY[openF];
  if (!f) {
    $("filters").innerHTML = FACETS.map(f => { const s = S[f.id], o = s.length ? new Map(f.opts().map(x => [x[0], x[1]])) : null;
      const fi = FINFO[f.id], io = infoOpen.has(f.id);
      return `<div class="frow"><button type="button" class="ft${s.length ? " set" : ""}" data-open="${f.id}"><span class="ftm"><span class="ftt">${esc(f.title)}${s.length ? ` <em>${s.length}</em>` : ""}</span>
        <span class="fts">${s.length ? esc(s.map(k => o.get(k) || k).join(", ")) : "Any"}</span></span><span class="chev">›</span></button>${fi ? `<button type="button" class="info finfo" data-info="${f.id}" aria-expanded="${io}" aria-label="How ${esc(f.title)} is worked out">i</button>` : ""}</div>
        ${fi && io ? `<div class="fwhy"><p><b>How:</b> ${esc(fi[0])}</p><p><b>How sure:</b> ${esc(fi[1])}</p></div>` : ""}`; }).join("")
      + (FK.some(k => S[k].length) || S.q || S.pin || S.dt ? `<button type="button" class="lnk clearall" id="clearall">Clear all filters</button>` : "");
    return;
  }
  const s = S[f.id], q = (finds[f.id] || "").toLowerCase();
  const base = blocks.filter(b => passes(b, f.id));             // other tabs applied: the count = forests ticking it would give
  let list = f.opts().map(([k, label, head]) => ({k, label, head, n: f.layer ? null : base.reduce((c, b) => c + (f.test(b, k) ? 1 : 0), 0)}));
  if (f.id === "fm") list = list.filter(o => o.n || s.includes(o.k));
  if (q) list = list.filter(o => s.includes(o.k) || o.label.toLowerCase().includes(q));
  const more = list.length - SHOW; if (more > 0) list = list.slice(0, SHOW);
  $("filters").innerHTML = `<div class="fh"><button type="button" class="lnk back" data-back="1">‹ All filters</button>${s.length ? `<button type="button" class="lnk" data-clear="${f.id}">Clear</button>` : ""}</div>
    <h3 class="fti">${esc(f.title)}${s.length ? ` <em>${s.length}</em>` : ""}</h3>${f.note ? `<p class="fnote">${esc(f.note)}</p>` : ""}
    ${f.search ? `<input type="search" id="ffind" placeholder="${esc(f.search)}" value="${esc(finds[f.id] || "")}">` : ""}
    <div class="fopts">${list.map(o => { const on = s.includes(o.k);
      return `${o.head && !q ? `<p class="fhd">${esc(o.head)}</p>` : ""}<div class="fo${on ? " on" : ""}${o.n || on || o.n === null ? "" : " zero"}" role="checkbox" aria-checked="${on}" tabindex="0" data-k="${esc(o.k)}">
        <i></i><span class="fl">${esc(o.label)}</span><span class="fn">${o.n === null ? "" : fmt(o.n)}</span></div>`; }).join("") || `<p class="fnote">Nothing matches.</p>`}
    ${more > 0 ? `<p class="fnote">${fmt(more)} more - type in the box to find one.</p>` : ""}</div>`;
}
function tick(id, k) { S[id] = S[id].includes(k) ? S[id].filter(x => x !== k) : [...S[id], k];
  if (COL_OF[id]) { const j = colOrder.indexOf(id); if (j >= 0) colOrder.splice(j, 1); if (S[id].length) colOrder.push(id); }   // newest tick sets the colours
  if (id === "region") { const ok = new Set(FBY.district.opts().map(o => o[0])); S.district = S.district.filter(d => ok.has(d)); }
  update(id === "region" || id === "district"); if (id === "fm") fitShown();
  if (id === "npl" && k === "np" && S.npl.includes("np")) syncNp(true);
  if (id === "fell" && S.fell.length === 1 && S.fell.includes(k)) syncFell(true); }   // first turn-on: fly to Hawke's Bay       // first turn-on: fly to the pilot area
$("filters").addEventListener("click", e => {
  const t = e.target;
  if (t.closest("[data-info]")) { const k = t.closest("[data-info]").dataset.info; infoOpen.has(k) ? infoOpen.delete(k) : infoOpen.add(k); drawFilters(); return; }
  if (t.closest("[data-open]")) { openF = t.closest("[data-open]").dataset.open; drawFilters(); const ff = $("ffind"); if (ff) ff.focus(); $("side").scrollTop = 0; return; }
  if (t.closest("[data-back]")) { openF = null; drawFilters(); return; }
  if (t.closest("[data-clear]")) { S[t.closest("[data-clear]").dataset.clear] = []; update(); return; }
  if (t.closest("#clearall")) { $("reset").click(); return; }
  const o = t.closest(".fo"); if (o) tick(openF, o.dataset.k);
});
$("filters").addEventListener("keydown", e => { const o = e.target.closest(".fo"); if (o && (e.key === " " || e.key === "Enter")) { e.preventDefault(); tick(openF, o.dataset.k); } });
$("filters").addEventListener("input", e => { if (e.target.id !== "ffind") return; finds[openF] = e.target.value; const pos = e.target.selectionStart;
  drawFilters(); const ff = $("ffind"); ff.focus(); ff.setSelectionRange(pos, pos); });
let qt;
$("q").addEventListener("input", () => { clearTimeout(qt); qt = setTimeout(() => { S.q = $("q").value.trim(); update();
  if (S.q && shown.length) map.fitBounds(L.latLngBounds(shown.map(b => [b.ll.lat, b.ll.lng < 0 ? b.ll.lng + 360 : b.ll.lng])), {padding: [30, 30], maxZoom: 11, animate: false}); }, 600); });   // a search frames what it found
$("reset").addEventListener("click", () => { const grp = S.grp, colour = S.colour, inf = S.inf, npl = S.npl, fell = S.fell; Object.assign(S, BLANK, Object.fromEntries(FK.map(k => [k, []])), {grp, colour, inf, npl, fell, svcl: S.svcl}); $("q").value = "";   // drive time is a filter: Clear turns it off
  setPin(null); update(); olFitNZ(map); });
$("aboutbtn").addEventListener("click", () => $("about").classList.add("on"));
$("aboutclose").addEventListener("click", () => $("about").classList.remove("on"));
$("about").addEventListener("click", e => { if (e.target.id === "about") $("about").classList.remove("on"); });
document.addEventListener("keydown", e => { if (e.key === "Escape") $("about").classList.remove("on"); });
document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => { S.grp = b.dataset.tab; update(); }));

// ------------------------------------------------------------------ which blocks pass
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
function passes(b, skip) {            // skip = one filter tab left out (its own counts)
  for (const f of FACETS) if (!f.layer && f.id !== skip && S[f.id].length && !S[f.id].some(k => f.test(b, k))) return false;
  if (S.pin && !near(b.ll)) return false;
  if (S.dp.length && !inDrive(b)) return false;
  const w = words(); if (w.length && !w.every(x => b.text.includes(x))) return false;
  return true;
}
const dueOn = () => S.colour === "due" && due1() >= 0;          // one harvest period picked: colour that period, darker = more of the block
const share = b => b.ha ? Math.min(1, b.hg[due1()] / b.ha) : 0;
// colours follow the filter last ticked (Mike 2026-11-25: "Colour by" was confusing): Harvest due -> harvest, Manager -> one colour
// per ticked firm, Carbon land -> carbon, Height today -> height; nothing (or Type, Region, Size ...) -> harvest
const COL_OF = {due: "due", fm: "mgr", nf: "nf", ht: "ht"}, colOrder = [];
const FIRM_PAL = dark ? ["#5d9cf0", "#f0a050", "#4cc3b0", "#e8664c", "#a487f0", "#e8d77a", "#f06fb0", "#8cc46a"]
  : ["#2f6fde", "#e0832a", "#178f7d", "#b23a26", "#7a4fd6", "#b8a020", "#c2187a", "#4f8a2a"];
const firmCol = b => { const i = S.fm.findIndex(f => b.fk.has(f)); return i < 0 ? VIZ.none : FIRM_PAL[i % FIRM_PAL.length]; };
function pickColour() {
  for (const id of FK) if (S[id].length && COL_OF[id] && !colOrder.includes(id)) colOrder.push(id);   // links: ticked tabs in tab order
  for (let i = colOrder.length - 1; i >= 0; i--) if (S[colOrder[i]].length) return COL_OF[colOrder[i]];
  return "due";
}
const colourOf = b => S.colour === "due" ? (dueOn() ? C.hg[due1()] : b.step >= 0 ? C.soon[b.step] : VIZ.none)
  : S.colour === "mgr" ? firmCol(b) : S.colour === "nf" ? (b.nfc ? C.nf[b.nfc] : VIZ.none) : S.colour === "ht" ? (b.hts >= 0 ? C.ht[b.hts] : VIZ.none) : C.kind[b.k];

// ------------------------------------------------------------------ drawing
// hover label: what the colour means for this forest (Mike 2026-11-24: Manager view shows the manager, not the district)
function tipOf(b) {
  const what = S.colour === "mgr" ? (S.fm.filter(f => b.fk.has(f)).map(firmLabel).join(", ") || (b.firms.length ? b.firms.join(", ") : MGR[b.mgr]))
    : S.colour === "nf" ? (b.nfc ? NF[b.nfc] : KIND[b.k])
    : S.colour === "kind" ? KIND[b.k]
    : S.colour === "ht" ? (b.ht ? `Height today ~${b.top} m (lidar ${b.ht[2]})` : "No lidar here yet")
    : b.k !== 0 ? KIND[b.k] : dueOn() ? `${fmt(b.hg[due1()])} ha ${dueWord(due1())}`
    : `${fmt(b.soon)} ha due by 2033`;
  return `<b>${esc(what)}</b><br>${fmt(b.ha)} ha · ${esc(D[b.d] || "")}`;
}
let picked = null, shown = [];
function styleOf(b) {
  const c = colourOf(b), sel = picked === b;
  const fo = patchOn(b) ? 0 : dueOn() ? .15 + .75 * Math.sqrt(share(b)) : .7;
  return {renderer: rnd, color: sel ? C.sel : patchOn(b) ? (dark ? "#cfc6b4" : "#5a5146") : c, weight: sel ? 2.5 : .6, opacity: sel ? 1 : patchOn(b) && map.getZoom() < LINE_Z ? 0 : .9, fillColor: c, fillOpacity: sel ? Math.max(fo, patchOn(b) ? .08 : .6) : fo};
}
function shapeOf(b) {
  if (!b.layer) {
    b.layer = L.polygon(b.g.map(poly => poly.map(unring)), styleOf(b));
    b.layer.bindTooltip(() => tipOf(b), {sticky: true, direction: "top", opacity: .95});
    b.layer.on("click", e => { L.DomEvent.stopPropagation(e); if (pinning) { map.fire("click", {latlng: e.latlng}); return; } if (standsOn() && b.k === 0) pickPatch(b, e.latlng).then(ok => ok || pick(b, false)).catch(() => pick(b, false)); else pick(b, false); });
  }
  return b.layer;
}
function draw() {
  forestLayer.clearLayers();
  shown = blocks.filter(b => passes(b));         // not filter(passes): the index would land in anyFirm
  shown.forEach(b => { const l = shapeOf(b); l.setStyle(styleOf(b)); forestLayer.addLayer(l); });
}

// ------------------------------------------------------------------ the block card
function driveRow(b) {
  if (!DRIVE.d || !INF.mills) return "";
  const r = DRIVE.d.b[b.id] || [[0, []], [0, []], [0, []]];
  const line = (t, [m, ix], names) => { const ns = ix.map(i => names[i]); return m ? `<div>${t}: <b>under ${m} min</b> <span class="s">${esc(ns.slice(0, 2).join(", "))}${ns.length > 2 ? ` +${ns.length - 2}` : ""}</span></div>` : `<div>${t}: <b>over 60 min</b></div>`; };
  return `<div class="s" style="margin-top:6px">Drive by car to the nearest edge of the forest</div>
    ${line("Port", r[0], DRIVE.d.pn)}${line("Sawmill", r[1], DRIVE.d.mn)}`;
}
// card in three plain groups (Mike 2026-11-26 "i dont understand what is related to the forest and what to the region ... slop"):
// Facts (measured or on a public record for this forest), Estimates (worked out, may be off), Not confirmed (web research).
// Region-average wood volumes dropped; methods sit behind "How we know".
function blockCard(b) {
  const tr = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`, sec = t => `<div class="sec">${t}</div>`;
  const facts = [], est = [], unc = [];
  if (b.ht) {
    if (b.ht[5] != null) facts.push(tr(`Tree height, lidar ${b.ht[2]}`, `<b>${b.ht[5]} m</b> <span class="s">middle · ${b.ht[6]} m tallest</span>`));
    if (b.ht[4] >= 5) facts.push(tr(`Bare or under 2 m, ${b.ht[2]}`, `${b.ht[4]}%`));
  }
  const FEL = HG.length - 1;                                     // last period = felled 2024-25, seen on satellite
  if (b.k === 0 && b.hg[FEL]) facts.push(tr("Clear-felled 2024-25 (satellite)", `${fmt(b.hg[FEL])} ha`));
  if (b.k === 0 && b.nf[0]) facts.push(tr("Post-1989 forest land (MfE)", `${fmt(b.nf[0])} ha`));
  const extra = [b.fr ? `${b.fr} with a forestry right` : "", b.cfl ? `${b.cfl} Crown forest licence` : ""].filter(Boolean).join(", ");
  facts.push(tr("Land titles (LINZ)", fmt(b.t) + (extra ? ` <span class="s">(${extra})</span>` : "")));
  if (b.mao) facts.push(tr("Māori land", fmt(b.mao) + " ha"));
  if (b.con) facts.push(tr("Conservation land", fmt(b.con) + " ha"));
  if (DRIVE.d && INF.mills) {
    const r = DRIVE.d.b[b.id] || [[0, []], [0, []], [0, []]];
    const dv = ([m, ix], names) => m ? `<b>under ${m} min</b> <span class="s">${esc(ix.map(i => names[i]).slice(0, 1).join(""))}</span>` : "over 60 min";
    facts.push(tr("Drive to a port", dv(r[0], DRIVE.d.pn)), tr("Drive to a sawmill", dv(r[1], DRIVE.d.mn)));
  }
  if (b.k === 0 && b.mg.length) { const byFirm = {}; b.mg.forEach(([f, n]) => (byFirm[SHORT[f]] = byFirm[SHORT[f]] || []).push(n));
    facts.push(tr("On a manager's own forest list", Object.entries(byFirm).map(([f, ns]) => `<b>${esc(f)}</b> <span class="s">${esc(ns.join(", "))}</span>`).join("<br>"))); }
  const due = b.hg.map((v, i) => [v, i]).filter(([v, i]) => v && i < FEL), tot = due.reduce((t, [v]) => t + v, 0);
  if (b.k === 0 && tot) est.push(`<tr><td colspan="2"><div class="bar">${due.map(([v, i]) => `<span style="width:${v / tot * 100}%;background:${C.hg[i]}"></span>`).join("")}</div></td></tr>`,
    ...due.map(([v, i]) => tr(`<i style="background:${C.hg[i]}"></i>Harvest ${HG[i].replace(/^Due /, "")}`, `${fmt(v)} ha`)));
  if (b.ht && b.ht[7] != null) est.push(tr("Tree height today", `${b.ht[7]} m`));
  if (b.k === 0 && b.rm.length) { const own = /\(owner/.test(b.rm[0]);
    (b.rm[2] ? facts : unc).push(tr(own ? "Owner" : "Manager", `<b>${esc(b.rm[0])}</b>${b.rm[1] ? ` <span class="s">${esc(b.rm[1])}</span>` : ""}${b.rm[3] ? ` <a class="s" href="${esc(b.rm[3])}" target="_blank" rel="noopener">source</a>` : ""}`)); }
  else if (b.k === 0 && !b.mg.length) unc.push(tr("Manager", `<span class="s">not known</span>`));
  const how = [b.k === 0 && tot ? `Harvest: planting year from the last satellite clear-fell${b.src && b.src.length ? ` (${b.src[0]}% of this forest)` : ""}, else lidar height or the land-cover map, plus a 28-year rotation, matched to MPI's regional age mix.` : "",
    b.ht && b.ht[7] != null ? `Height today: the ${b.ht[2]} lidar grown on with the NZ pine growth curve.` : "",
    "Drive times: by road from the nearest edge of the forest.", b.rm.length && !b.rm[2] ? "Manager: found on the web, not confirmed by the firm." : ""].filter(Boolean);
  return `<div class="card"><h3>${esc(KIND[b.k])} · ${fmt(b.ha)} ha</h3>
    <div class="s">${esc(D[b.d] || "")}${b.r >= 0 ? ", " + esc(R[b.r]) : ""}</div>
    ${sec("Facts")}<table>${facts.join("")}</table>
    ${est.length ? sec("Estimates") + `<table>${est.join("")}</table>` : ""}
    ${unc.length ? sec("Not confirmed") + `<table>${unc.join("")}</table>` : ""}
    ${(nb => nb.length ? sec(`Forestry services within ${SVC_KM} km`) + `<table>${nb.map(([t, v]) => tr(`<i style="background:${SVC_C[t]};border-radius:50%"></i>${SVC_T[t]}`,
      `<b>${v.length}</b> <span class="s" style="font-weight:400">${esc(v.slice(0, 2).map(([, f]) => f[0]).join(", "))}${v.length > 2 ? "…" : ""}</span>`)).join("")}</table>` : "")(svcNear(b))}
    <details class="how"><summary>How we know</summary>${how.map(t => `<div class="s">${t}</div>`).join("")}</details>
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
// click a patch: just that patch (Mike 2026-11-26 "i want to click a patch and see just that patch"). Reads the z12 patch
// tiles around the click, joins touching pixels of the same harvest period inside this forest, outlines them and sizes them.
const PN = 7, PX_M = 40075016.686 / (256 * 2 ** STAND_MAX);      // 7 x 7 tiles (~50 km) read around the click
const patchTile = key => standImg["stands" + key] || (standImg["stands" + key] = new Promise((ok, no) => {
  const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = `stands/${key}.png?v=${DATA_V}`; }));
let patchHi = null;
const plantedOf = k => { const t = HG[k], m = t.match(/(\d{4})\D+(\d{4})/);
  return /^Felled/.test(t) ? "" : m ? `planted about ${m[1] - 28}-${String(m[2] - 28).slice(2)}` : /by (\d{4})/.test(t) ? `planted ${RegExp.$1 - 28} or before` : /(\d{4}) or later/.test(t) ? `planted ${RegExp.$1 - 28} or later` : ""; };
async function pickPatch(b, ll) {
  const Z = STAND_MAX, p = map.project(ll, Z), tx = Math.floor(p.x / 256), ty = Math.floor(p.y / 256), h = PN >> 1, N = PN * 256;
  const x0 = (tx - h) * 256, y0 = (ty - h) * 256;
  const cv = document.createElement("canvas"); cv.width = cv.height = N; const g = cv.getContext("2d", {willReadFrequently: true});
  const jobs = [];
  for (let i = 0; i < PN; i++) for (let j = 0; j < PN; j++) { const key = `${Z}/${tx - h + i}/${ty - h + j}`;
    if (STAND_SET.has(key)) jobs.push(patchTile(key).then(im => g.drawImage(im, i * 256, j * 256)).catch(() => {})); }
  await Promise.all(jobs);
  const a = g.getImageData(0, 0, N, N).data;
  g.clearRect(0, 0, N, N); g.beginPath();                          // this forest's outline as a mask on the same pixels
  blockRings(b).forEach(poly => poly.forEach(r => r.forEach(([la, ln], i) => { const q = map.project([la, ln], Z); i ? g.lineTo(q.x - x0, q.y - y0) : g.moveTo(q.x - x0, q.y - y0); })));
  g.fillStyle = "#000"; g.fill("evenodd");
  const m = g.getImageData(0, 0, N, N).data;
  const cls = new Int8Array(N * N).fill(-2);
  const clsAt = q => { if (cls[q] === -2) cls[q] = !a[q * 4 + 3] || !m[q * 4 + 3] ? -1
    : STAND_RGB.findIndex(c => Math.abs(c[0] - a[q * 4]) + Math.abs(c[1] - a[q * 4 + 1]) + Math.abs(c[2] - a[q * 4 + 2]) < 12); return cls[q]; };
  const s0 = Math.floor(p.y - y0) * N + Math.floor(p.x - x0), k = clsAt(s0);
  if (k < 0 || (S.due.length && !S.due.includes(String(k)))) return false;   // clicked a gap or a hidden period: whole forest
  const inP = new Uint8Array(N * N), st = [s0]; inP[s0] = 1;
  let n = 0, edge = false, minx = N, miny = N, maxx = 0, maxy = 0;
  while (st.length) { const q = st.pop(), x = q % N, y = (q - x) / N; n++;
    minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y);
    if (x === 0 || y === 0 || x === N - 1 || y === N - 1) { edge = true; continue; }
    for (const r of [q - 1, q + 1, q - N, q + N]) if (!inP[r] && clsAt(r) === k) { inP[r] = 1; st.push(r); } }
  const w = maxx - minx + 1, hh = maxy - miny + 1, oc = document.createElement("canvas"); oc.width = w; oc.height = hh;
  const og = oc.getContext("2d"), od = og.createImageData(w, hh), hi = dark ? [255, 255, 255] : [20, 20, 20];
  for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) { const q = y * N + x; if (!inP[q]) continue;
    const rim = x === minx || x === maxx || y === miny || y === maxy || !inP[q - 1] || !inP[q + 1] || !inP[q - N] || !inP[q + N];
    const o = ((y - miny) * w + (x - minx)) * 4; od.data.set(rim ? [...hi, 255] : [...hi, 60], o); }
  og.putImageData(od, 0, 0);
  if (patchHi) map.removeLayer(patchHi);
  patchHi = L.imageOverlay(oc.toDataURL(), [map.unproject([x0 + minx, y0 + miny], Z), map.unproject([x0 + maxx + 1, y0 + maxy + 1], Z)],
    {interactive: false, className: "patchhi", zIndex: 500}).addTo(map);
  const ha = n * (PX_M * Math.cos(ll.lat * Math.PI / 180)) ** 2 / 1e4, pl = plantedOf(k);
  const pop = L.popup({maxWidth: 300, autoPanPadding: [20, 20]}).setLatLng(ll).setContent(`<div class="card">
    <h3><span class="sw" style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${C.hg[k]}"></span> This patch · ${edge ? "over " : "about "}${fmt(Math.max(1, ha))} ha</h3>
    <div class="s"><b>${esc(HG[k])}</b>${pl ? " · " + pl : ""}</div>
    <div class="s">Part of a ${fmt(b.ha)} ha plantation, ${esc(D[b.d] || "")}${b.firms.length ? " · " + esc(b.firms.join(", ")) : ""}</div>
    <div class="links"><a href="#" data-whole="${b.id}">Whole forest</a>
      <a href="https://www.google.com/maps/@${ll.lat},${ll.lng},15z/data=!3m1!1e3" target="_blank" rel="noopener">Satellite view</a></div></div>`);
  pop.on("remove", () => { if (patchHi) { map.removeLayer(patchHi); patchHi = null; } });
  pop.openOn(map);
  return true;
}
map.getContainer().addEventListener("click", e => {
  const a = e.target.closest("[data-whole]"); if (!a) return;
  e.preventDefault(); const b = blocks.find(x => x.id === +a.dataset.whole); if (b) pick(b, false);
});
map.getContainer().addEventListener("click", e => {
  const a = e.target.closest("[data-managers]"); if (!a) return;
  e.preventDefault(); S.region = [a.dataset.managers]; S.district = []; S.grp = "managers"; update();
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
// one "Map tools" card on the left (Mike 2026-11-25: colour, layers, pin and drive time on the same side, tidier); each part fills its section
const ToolsCtl = L.Control.extend({onAdd() {
  const d = L.DomUtil.create("div", "tools");
  d.innerHTML = `<button type="button" class="ttog" aria-expanded="true"><span>Map tools</span><b>▾</b></button>
    <div class="tbody"><section id="sec-dt"></section><section id="sec-pin"></section></div>`;
  L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
  const tg = d.querySelector(".ttog"), set = shut => { d.classList.toggle("shut", shut); tg.setAttribute("aria-expanded", String(!shut)); try { localStorage.setItem("fm-tools", shut ? "1" : "0"); } catch (e) { /* off */ } };
  let shut = matchMedia("(max-width:760px)").matches; try { const v = localStorage.getItem("fm-tools"); if (v) shut = v === "1"; } catch (e) { /* off */ }
  set(shut); tg.addEventListener("click", () => set(!d.classList.contains("shut")));
  return d; }});
new ToolsCtl({position: "topleft"}).addTo(map);
$("sec-pin").innerHTML = `<h4>Drop a pin</h4><div class="trow"><button id="pinbtn" class="tbtn" type="button" title="Click, then click the map: only forests within the distance or drive time are counted">Drop a pin</button>
    <select id="pinkm" aria-label="Distance or drive time"><optgroup label="Distance">${[10, 25, 50, 100, 150].map(k => `<option value="${k}">${k} km</option>`).join("")}</optgroup>
      <optgroup label="Drive time">${[15, 30, 45, 60].map(k => `<option value="d${k}">${k} min drive</option>`).join("")}</optgroup></select>
    <button id="pinclear" class="tx" type="button" hidden title="Remove the pin">✕</button></div>`;
$("pinkm").value = String(S.km);
$("pinbtn").addEventListener("click", () => { pinning = !pinning; $("pinbtn").classList.toggle("on", pinning); map.getContainer().style.cursor = pinning ? "crosshair" : ""; });
$("pinkm").addEventListener("change", () => { const v = $("pinkm").value; S.km = v[0] === "d" ? v : +v; if (S.pin) { drawRing(); update(); } });
$("pinclear").addEventListener("click", () => { setPin(null); update(); });
map.on("click", e => { if (!pinning) return; pinning = false; $("pinbtn").classList.remove("on"); map.getContainer().style.cursor = ""; setPin(e.latlng); update(); });


// ------------------------------------------------------------------ ports and mills (Mike 2026-11-24: "add in Ports, sawmills ... what they produce/export")
const INF = {ports: null, mills: null, layer: L.layerGroup()};
const m3 = v => v >= 1e6 ? (v / 1e6).toFixed(2).replace(/0$/, "") + " million" : fmt(Math.round(v / 1e3) * 1e3);
const PORT_ROWS = [["logs", "Logs", "m³"], ["sawn", "Sawn timber", "m³"], ["panels", "Panels (ply, MDF, LVL)", "m³"], ["pulp", "Pulp", "tonnes"], ["chips", "Wood chips", "bone-dry units"]];
function portCard(P, period) {
  return `<div class="card"><h3>${esc(P.n)}</h3><div class="s">Forestry exports, ${esc(period.replace(" to ", " – "))} (MPI trade statistics)</div>
    <table>${PORT_ROWS.filter(r => P[r[0]]).map(([k, t, u]) => `<tr><td>${t}</td><td>${m3(P[k])} ${u}</td></tr>`).join("")}</table>
    ${P.to && P.to.length ? `<div class="s" style="margin-top:6px">Logs went to: ${P.to.map(([c, v]) => `${esc(c)} ${v}%`).join(", ")}</div>` : ""}</div>`;
}
function millCard(M) {
  return `<div class="card"><h3>${esc(M.n)}</h3><div class="s">${esc(M.own || "")}${M.own && M.town ? " · " : ""}${esc(M.town || "")}</div>
    <table>${[["Makes", M.prod], ["Size", M.size], ["Sells to", M.exp], ["Status", M.st + (M.sd ? ` (${M.sd})` : "")], ["Phone", M.ph]].filter(r => r[1] && !/^(unknown|n\/a|none)$/i.test(r[1])).map(r => `<tr><td>${r[0]}</td><td>${esc(r[1])}</td></tr>`).join("")}</table>
    ${/^town/.test(M.at || "") ? `<div class="s">Pin at the town centre, not the mill gate</div>` : ""}
    ${M.src ? `<div class="links"><a href="${esc(M.src)}" target="_blank" rel="noopener">${/google\.com\/maps/.test(M.src) ? "Google Maps listing" : "Status source"}</a></div>` : ""}</div>`;
}
// ports and mills + drive time in one box (Mike 2026-11-25: "very simple" - tick ports / mills to show them, pick one place or all
// of them, a time, press Drive time). S.inf letters: p ports, s sawmills, o pulp and panel mills; S.dfrom = picked place keys joined by "|" ("" = all ticked; Mike: tick or click the ones wanted)
const PLACE_G = [["p", "Ports"], ["s", "Sawmills"], ["o", "Pulp and panel mills"]];
const PLACE_C = {p: dark ? "#4a90e2" : "#1f5fa8", s: dark ? "#c07be0" : "#8e3fb0", o: dark ? "#9d7bd8" : "#5b2a86"};
const PLACE_SVG = {p: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.2"/><path d="M12 7.5V21M7.5 11h9M4.5 14a7.5 7.5 0 0 0 15 0"/></svg>`,
  s: `<svg viewBox="0 0 24 24" fill="#fff"><path d="M12 2.5 18 11h-3.4l4.4 6.5H13.5V22h-3v-4.5H5L9.4 11H6z"/></svg>`,
  o: `<svg viewBox="0 0 24 24" fill="#fff"><path d="M3 21V11l5 3v-3l5 3V5h2.2v4H18V5h2.2v16z"/></svg>`};
const millG = M => M.kind === "Sawmill" ? "s" : "o";
const placeKey = (g, n) => (g === "ports" ? "p:" : "m:") + n;
function places() {                                   // the ticked kinds' places, [{k, n, g}]
  if (!INF.ports) return [];
  return [...(S.inf.includes("p") ? INF.ports.ports.map(P => ({k: placeKey("ports", P.n), n: P.n, g: "p"})) : []),
    ...(INF.mills || []).filter(M => S.inf.includes(millG(M))).map(M => ({k: placeKey("mills", M.n), n: M.n, g: millG(M)}))];
}
const dsel = () => S.dfrom ? S.dfrom.split("|") : [];
const pickedPl = () => { const ps = places(), w = new Set(dsel()); return ps.filter(p => w.has(p.k)); };   // picked places still shown
const dpList = () => { if (!S.dt) return []; const pk = pickedPl(); return (pk.length ? pk : places()).map(p => p.k); };
const togglePick = k => { const w = dsel(); S.dfrom = (w.includes(k) ? w.filter(x => x !== k) : [...w, k]).join("|"); update(); };
const infOn = () => !!S.inf;
let infKey = null;
const placeIcon = (g, size, on) => L.divIcon({className: "pm", iconSize: [size, size],
  html: `<span class="${on ? "on" : ""}" style="--c:${PLACE_C[g]};width:${size}px;height:${size}px">${PLACE_SVG[g]}</span>`});
function buildInf() {
  infKey = S.inf + S.dp.join("|") + S.dfrom;
  INF.layer.clearLayers();
  const used = new Set(pickedPl().map(p => p.k));
  const mk = (ll, g, k, size, card, tip) => {
    if (!S.inf.includes(g)) return;
    L.marker(ll, {icon: placeIcon(g, size, used.has(k)), riseOnHover: true})                // click = pick for drive time; hover = its details
      .bindTooltip(`${card()}<div class="s" style="margin-top:4px"><i>${used.has(k) ? "Picked - click to drop" : "Click to pick for drive time"}</i></div>`, {direction: "top", offset: [0, -size / 2], className: "ptip"})
      .on("click", () => togglePick(k)).addTo(INF.layer);
  };
  (INF.mills || []).forEach(M => mk(M.ll, millG(M), placeKey("mills", M.n), 22, () => millCard(M), `<b>${esc(M.n)}</b><br>${esc(M.kind)}`));
  const top = Math.max(...INF.ports.ports.map(P => P.logs || 0));
  INF.ports.ports.forEach(P => mk(P.ll, "p", placeKey("ports", P.n), Math.round(22 + 12 * Math.sqrt((P.logs || 0) / top)),
    () => portCard(P, INF.ports.period), `<b>${esc(P.n)}</b><br>${P.logs ? m3(P.logs) + " m³ logs a year" : "Export port"}`));
}
let infLoad = null;
const loadInf = () => infLoad = infLoad || Promise.all([get("ports.json"), get("mills.json").then(d => d.mills).catch(() => [])])
  .then(([p, m]) => { INF.ports = p; INF.mills = m; if (S.dt) update(); else { buildInf(); syncDtCtl(); } });
async function syncInf() {
  if (!infOn()) { map.removeLayer(INF.layer); return; }
  await loadInf();
  if (infKey !== S.inf + S.dp.join("|") + S.dfrom) buildInf();
  if (infOn()) { INF.layer.addTo(map); drawLegend(); }
}

// ------------------------------------------------------------------ forestry services (Mike 2026-11-26: "who can help with the forest" for
// managers; firms from AquilaLens sorted by hand into a service, firm's own website only, no AquilaLens links). data/services.json from
// ForestMap/_scratch/services/build.py: f = [name, type, service, website, [[lat, lon], ...], town only, towns]
const SVC = {d: null, layer: L.layerGroup()}, svcRnd = L.canvas({padding: .5, tolerance: 3});
const SVC_T = ["Harvest crews", "Roading and earthworks", "Log cartage", "Mills and log buyers", "Nurseries", "Planting and silviculture",
  "Spraying and pest control", "Consultants and inventory", "Forest managers", "Machinery and repairs"];
const SVC_C = dark ? ["#e8664c", "#d9ac3a", "#5d9cf0", "#c07be0", "#8cc46a", "#4cc3b0", "#f06fb0", "#f0a050", "#e8d77a", "#a9b2bd"]
  : ["#b23a26", "#9a6a10", "#1f5fa8", "#8e3fb0", "#4f8a2a", "#178f7d", "#c2187a", "#e0832a", "#6b5d10", "#5d6670"];
const SVC_KM = 50;
const svcLoad = get("services.json").then(d => { SVC.d = d; if (S.svcl.length) syncSvc(); if (openF === "svcl") drawFilters(); }).catch(() => {});
const kmTo = (a, b) => { const r = Math.PI / 180, x = (b[1] - a[1]) * r * Math.cos((a[0] + b[0]) / 2 * r), y = (b[0] - a[0]) * r; return Math.hypot(x, y) * 6371; };
function svcCard(f) {
  return `<div class="card"><h3>${esc(f[0])}</h3><div class="s"><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${SVC_C[f[1]]}"></i> ${SVC_T[f[1]]}${f[6] ? " · " + esc(f[6]) : ""}</div>
    ${f[2] ? `<div style="margin-top:4px">${esc(f[2])}</div>` : ""}${f[5] ? `<div class="s">Pin at the town centre, not the yard</div>` : ""}
    ${f[3] ? `<div class="links"><a href="${esc(/^https?:/.test(f[3]) ? f[3] : "https://" + f[3])}" target="_blank" rel="noopener">Website</a></div>` : ""}</div>`;
}
let svcKey = null;
function syncSvc() {
  if (!S.svcl.length || !SVC.d) { map.removeLayer(SVC.layer); svcKey = null; return; }
  if (svcKey !== S.svcl.join()) {
    svcKey = S.svcl.join(); SVC.layer.clearLayers();
    SVC.d.f.filter(f => S.svcl.includes(String(f[1]))).forEach(f => f[4].forEach(ll =>
      L.circleMarker(ll, {renderer: svcRnd, radius: f[5] ? 4 : 5.5, color: dark ? "#111" : "#fff", weight: 1.2, fillColor: SVC_C[f[1]], fillOpacity: f[5] ? .55 : .95})
        .bindTooltip(`<b>${esc(f[0])}</b><br>${SVC_T[f[1]]}`, {direction: "top"}).bindPopup(() => svcCard(f), {maxWidth: 280}).addTo(SVC.layer)));
  }
  SVC.layer.addTo(map); drawLegend();
}
// forest card: firms of each service with a pin within SVC_KM of the forest centre, nearest first
function svcNear(b) {
  if (!SVC.d) return [];
  const by = SVC_T.map(() => []);
  SVC.d.f.forEach(f => { const k = Math.min(...f[4].map(ll => kmTo(b.c, ll))); if (k <= SVC_KM) by[f[1]].push([k, f]); });
  return by.map((v, t) => [t, v.sort((a, c) => a[0] - c[0])]).filter(([, v]) => v.length);
}
// ------------------------------------------------------------------ drive time from ports / mills (Mike 2026-11-24)
// areas built once by drive_areas.py (Valhalla, car, 15-60 min); a forest counts when its centre is inside
const DRIVE = {d: null, layer: L.layerGroup(), set: [], key: "", idx: {}};
map.createPane("drive").style.zIndex = 350;                              // under the forests
const driveRnd = L.canvas({pane: "drive", padding: .5});
const DRIVE_C = dark ? "#6fa8dc" : "#1f4e79";
const AREA_C = {p: PLACE_C.p, m: PLACE_C.s};          // drive areas: ports blue, mills purple (Mike: apart)
let driveLoad = null;
const loadDrive = () => driveLoad = driveLoad || get("drive.json").then(d => {
  const bb = rings => { let a = 90, b = 180, c = -90, e = -180; rings.forEach(r => r.forEach(([y, x]) => { a = Math.min(a, y); c = Math.max(c, y); b = Math.min(b, x); e = Math.max(e, x); })); return [a, b, c, e]; };
  for (const g of ["ports", "mills"]) for (const n in d[g]) for (const m in d[g][n]) d[g][n][m] = {rings: d[g][n][m], bb: bb(d[g][n][m])};
  d.pn.forEach((n, k) => DRIVE.idx[placeKey("ports", n)] = k); d.mn.forEach((n, k) => DRIVE.idx[placeKey("mills", n)] = d.pn.length + k);
  DRIVE.d = d; return d; }).catch(() => null);
const inArea = (A, ll) => ll.lat >= A.bb[0] && ll.lat <= A.bb[2] && ll.lng >= A.bb[1] && ll.lng <= A.bb[3] && inPoly(A.rings, ll.lat, ll.lng);
// a forest counts when the drive area of any ticked place reaches any part of it (nearest edge, worked out in drive_areas.py)
const inDrive = b => { if (!DRIVE.d) return true; const r = DRIVE.d.bp[b.id]; if (!r) return false;
  const ks = new Set(S.dp.map(k => DRIVE.idx[k])); return r.some(([k, m]) => ks.has(k) && m <= +S.dm); };
const dpName = k => k.slice(2);
const dpLabel = () => { if (pickedPl().length === 1 && S.dp.length === 1) return dpName(S.dp[0]);
  const t = PLACE_G.filter(([c]) => S.inf.includes(c)).map(([, t]) => t.toLowerCase()); return t.length > 1 ? t.slice(0, -1).join(", ") + " and " + t[t.length - 1] : t[0] || "nothing"; };
function syncDtCtl() {
  for (const [c] of PLACE_G) { const x = $("t-" + c), on = S.inf.includes(c); x.classList.toggle("on", on); x.setAttribute("aria-checked", String(on)); }
  { const all = S.inf.length === PLACE_G.length; $("t-all").classList.toggle("on", all); $("t-all").setAttribute("aria-checked", String(all)); }
  const ps = places(), pk = pickedPl(), w = new Set(pk.map(p => p.k)), sel = $("f-from");
  sel.innerHTML = `<span>${!ps.length ? "Tick ports or mills first" : pk.length === 1 ? esc(pk[0].n) : pk.length ? pk.length + " picked" : "All ticked (" + ps.length + ")"}</span><b>▾</b>`;
  sel.disabled = !ps.length; if (!ps.length) $("fromlist").hidden = true;
  const row = (k, n, on) => `<div class="fo${on ? " on" : ""}" role="checkbox" aria-checked="${on}" tabindex="0" data-k="${esc(k)}"><i></i><span class="fl">${esc(n)}</span></div>`;
  $("fromlist").innerHTML = `<div class="fo${pk.length ? "" : " on"}" role="checkbox" aria-checked="${!pk.length}" tabindex="0" data-k=""><i></i><span class="fl"><b>All ticked</b></span></div>`
    + PLACE_G.filter(([c]) => S.inf.includes(c)).map(([c, t]) => `<p class="fhd">${t}</p>` + ps.filter(p => p.g === c).sort((a, b) => a.n.localeCompare(b.n)).map(p => row(p.k, p.n, w.has(p.k))).join("")).join("");
  $("f-dm").value = S.dm; $("dtbtn").classList.toggle("on", !!S.dt); $("dtbtn").disabled = !ps.length && !S.dt;
  $("dtbtn").textContent = S.dt ? "Drive time on · turn off" : "Drive time";
}
function syncDrive() {
  syncDtCtl();
  const key = S.dp.length ? S.dp.join("|") + S.dm : "";
  if (key === DRIVE.key) return;
  DRIVE.key = key; DRIVE.layer.clearLayers(); DRIVE.set = [];
  if (!S.dp.length) { map.removeLayer(DRIVE.layer); return; }
  loadDrive().then(d => {
    if (!d || DRIVE.key !== key) return;
    DRIVE.set = S.dp.map(k => ({k, n: dpName(k), a: ((d[k[0] === "p" ? "ports" : "mills"][dpName(k)]) || {})[S.dm]})).filter(x => x.a);
    DRIVE.set.forEach(x => { const c = AREA_C[x.k[0]];
      L.polygon(x.a.rings, {renderer: driveRnd, color: c, weight: 1.5, opacity: .85, fillColor: c, fillOpacity: dark ? .2 : .14, interactive: false}).addTo(DRIVE.layer); });
    DRIVE.layer.addTo(map);
    update();                       // the forest filter needs the areas
  });
}
$("sec-dt").innerHTML = `<h4>Ports and mills <button type="button" class="info" id="dtinfo" aria-expanded="false" aria-label="About drive time">i</button></h4>
    <div id="dtinfotxt" class="dth" hidden>Tick to show them. Drive time keeps the forests within that drive of the ticked places, or of the one picked. By car on OpenStreetMap roads, to the nearest edge of each forest; a loaded log truck is slower.</div>
    <div class="trow"><button type="button" class="tchip" id="t-all" role="checkbox" aria-checked="false" style="--c:var(--ol-charcoal)">All</button>${PLACE_G.map(([c, t]) => `<button type="button" class="tchip" id="t-${c}" role="checkbox" aria-checked="false" style="--c:${PLACE_C[c]}"><span class="pdot" style="background:${PLACE_C[c]}">${PLACE_SVG[c]}</span>${c === "o" ? "Pulp" : t}</button>`).join("")}</div>
    <div class="trow"><button type="button" id="f-from" class="tsel" aria-haspopup="true" title="Pick the ports and mills to drive from (or click them on the map)"></button><select id="f-dm" aria-label="Drive time">${[15, 30, 45, 60].map(k => `<option value="${k}">${k} min</option>`).join("")}</select></div>
    <div id="fromlist" class="flist" hidden></div>
    <button id="dtbtn" class="tgo" type="button">Drive time</button>`;
$("t-all").addEventListener("click", () => { S.inf = S.inf.length === PLACE_G.length ? "" : PLACE_G.map(x => x[0]).join(""); update(); });   // Mike: one tick for every port and mill
for (const [c] of PLACE_G) $("t-" + c).addEventListener("click", () => { S.inf = PLACE_G.map(x => x[0]).filter(x => x === c ? !S.inf.includes(x) : S.inf.includes(x)).join(""); update(); });
$("f-from").addEventListener("click", () => { const l = $("fromlist"); l.hidden = !l.hidden; });
$("fromlist").addEventListener("click", e => { const o = e.target.closest(".fo"); if (!o) return; if (!o.dataset.k) { S.dfrom = ""; update(); } else togglePick(o.dataset.k); });
$("f-dm").addEventListener("change", () => { S.dm = $("f-dm").value; update(); });
$("dtbtn").addEventListener("click", () => { S.dt = S.dt ? "" : "1"; update(); });
$("dtinfo").addEventListener("click", () => { const t = $("dtinfotxt"); t.hidden = !t.hidden; $("dtinfo").setAttribute("aria-expanded", String(!t.hidden)); });
// nearest port / mill by drive time, for the forest card
function driveTo(b, g, filt) {
  if (!DRIVE.d) return null;
  for (const m of DRIVE.d.mins) {
    const hit = Object.entries(DRIVE.d[g]).filter(([n, A]) => filt(n) && A[m] && inArea(A[m], b.ll)).map(([n]) => n);
    if (hit.length) return [m, hit];
  }
  return [0, []];
}
loadDrive(); loadInf();          // both small: the forest card uses them for its drive lines

// ------------------------------------------------------------------ new planting, aerial pilot (Mike 2026-11-25 "add the layer to the map")
// 1 ha squares marked by Claude on 2025-26 LINZ aerial photos, Central Hawke's Bay only; built by code/newplant_layer.py
const NP = {d: null, layer: L.layerGroup(), read: L.layerGroup()};   // read = outline of the photos checked, off unless ticked (Mike 2026-11-25)
map.createPane("np").style.zIndex = 450;                                  // over the forests
const npRnd = L.canvas({pane: "np", padding: .5});
const NP_C = {young: dark ? "#ff6fd8" : "#c2187a", older: dark ? "#4fd8e8" : "#0a7f94"};
const NP_T = {young: "Young planting", older: "Older pine stand, not mapped"};
let npLoad = null;
const loadNp = () => npLoad = npLoad || get("newplant.json").then(d => { NP.d = d;
  d.area.forEach(r => L.polygon(r, {renderer: npRnd, color: NP_C.young, weight: 1.5, dashArray: "5 5", fill: false, interactive: false}).addTo(NP.read));
  for (const k of ["young", "older"]) d[k].forEach(([ha, r]) => L.polygon(r, {renderer: npRnd, color: NP_C[k], weight: 1.5, fillColor: NP_C[k], fillOpacity: .35})
    .bindTooltip(`${NP_T[k]} ~${fmt(ha)} ha`, {direction: "top"})
    .bindPopup(`<div class="card"><h3>${NP_T[k]}, about ${fmt(ha)} ha</h3><div class="s">${k === "young" ? "Rows of small trees or fresh planting spots" : "A planted stand"} on the ${esc(d.read.photos)} photos, not on the 2023/24 land-cover map. Read by AI in 1 ha squares; a pilot, not checked on the ground.</div></div>`, {maxWidth: 300})
    .addTo(NP.layer));
  return d; }).catch(() => null);
async function syncNp(fly) {
  if (!S.np || !S.npa) map.removeLayer(NP.read);
  if (!S.np) { map.removeLayer(NP.layer); return; }
  await loadNp();
  if (!S.np || !NP.d) return;
  NP.layer.addTo(map); if (S.npa) NP.read.addTo(map); drawLegend();
  if (fly) map.flyToBounds(L.polygon(NP.d.area.map(r => r[0])).getBounds(), {padding: [20, 20]});
}

// ------------------------------------------------------------------ felled since 2025, Hawke's Bay (Mike 2026-11-26 "Yes, add locally")
// built by code/felled_hb_layer.py: NDVI drop + AI photo check of each patch
const FELL = {d: null, layer: L.layerGroup()};
const fellRnd = L.svg({pane: "np"});                                   // own renderer (sharing the pilot canvas gave NaN redraws)
const FELL_C = dark ? ["#5aa9ff", "#a8d2ff"] : ["#1546c2", "#5b8fe8"];   // blue: not used by any harvest colour
const FELL_T = ["Clear-felled", "Partly felled"];
let fellLoad = null, fellKey = null;
const loadFell = () => fellLoad = fellLoad || get("felled_hb.json").then(d => FELL.d = d).catch(() => null);
async function syncFell(fly) {
  if (!S.fell.length) { map.removeLayer(FELL.layer); return; }
  await loadFell();
  if (!S.fell.length || !FELL.d) return;
  if (fellKey !== S.fell.join()) {
    fellKey = S.fell.join(); FELL.layer.clearLayers();
    FELL.d.f.filter(f => S.fell.includes(String(f[2]))).forEach(([ha, mo, k, sh, r]) => L.polygon(r, {renderer: fellRnd, color: FELL_C[k], weight: 1.5, fillColor: FELL_C[k], fillOpacity: .55})
      .bindTooltip(`${FELL_T[k]} ~${fmt(ha)} ha`, {direction: "top"})
      .bindPopup(`<div class="card"><h3>${FELL_T[k]}, about ${fmt(k ? ha * sh / 100 : ha)} ha</h3><div class="s">${k ? `About ${sh}% of this ${fmt(ha)} ha patch was cleared` : "Pine standing on the summer 2024-25 photo, cleared"} by the ${esc(FELL.d.asof.split(" to ")[1])} photo${mo ? `; first seen bare about ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+mo.slice(5) - 1]} ${mo.slice(0, 4)}` : ""}. Found from satellite greenness and checked by AI on the photos; not checked on the ground.</div></div>`, {maxWidth: 300})
      .addTo(FELL.layer));
  }
  FELL.layer.addTo(map); drawLegend();
  if (fly) map.flyToBounds(L.featureGroup(FELL.layer.getLayers()).getBounds(), {padding: [20, 20]});
}

// ------------------------------------------------------------------ map view box: colour by + extra layers (moved off the side panel 2026-11-25)

// ------------------------------------------------------------------ legend
const legend = L.DomUtil.create("div", "legend");
map.getContainer().appendChild(legend);
L.DomEvent.disableClickPropagation(legend);
function drawLegend() {
  const k = (c, t, round) => `<div class="k"><i style="background:${c}${round ? ";border-radius:50%" : ""}"></i>${esc(t)}</div>`;
  legend.innerHTML = (standsOn() ? `<div class="lh">Harvest due, each patch</div>` + HG.map((n, i) => !S.due.length || S.due.includes(String(i)) ? k(C.hg[i], n) : "").join("")
    : (dueOn() ? `<div class="lh">${esc(HG[due1()])}</div>` + [[1, "All of the block"], [.5, "Half"], [.1, "A tenth"]].map(([f, t]) =>
      `<div class="k"><i style="background:${C.hg[due1()]};opacity:${.15 + .75 * Math.sqrt(f)}"></i>${t}</div>`).join("")
    : S.colour === "due" ? `<div class="lh">Share of block due by 2033</div>` + SOON_TEXT.map((n, i) => k(C.soon[i], n)).reverse().join("")
    : S.colour === "mgr" ? `<div class="lh">Manager</div>` + S.fm.map((f, i) => k(FIRM_PAL[i % FIRM_PAL.length], firmLabel(f))).join("")
    : S.colour === "nf" ? Object.keys(NF).map(l => k(C.nf[l], NF[l])).join("")
    : S.colour === "ht" ? `<div class="lh">${heightsOn() ? "Height today (estimated), each 80 m patch" : "Height today (estimated), middle of block"}</div>` + HT_TEXT.map((n, i) => k(C.ht[i], n)).reverse().join("") + k(VIZ.none, "No lidar yet")
    : KIND.map((n, i) => k(C.kind[i], n)).join("")))
    + (infOn() ? `<div class="lh" style="margin-top:4px">Also on the map</div>` + PLACE_G.filter(([c]) => S.inf.includes(c)).map(([c, t]) =>
      `<div class="k"><span class="pdot" style="background:${PLACE_C[c]}">${PLACE_SVG[c]}</span>${c === "p" ? "Export port (size = logs)" : t}</div>`).join("") : "")
    + (S.dp.some(k => k[0] === "p") ? k(AREA_C.p + "55", `Within ${S.dm} min drive of ${S.dp.length === 1 ? esc(dpName(S.dp[0])) : "a port"}`) : "")
    + (S.dp.some(k => k[0] === "m") ? k(AREA_C.m + "55", `Within ${S.dm} min drive of ${S.dp.length === 1 ? esc(dpName(S.dp[0])) : "a mill"}`) : "")
    + (S.svcl.length && SVC.d ? `<div class="lh" style="margin-top:4px">Forestry services (dots)</div>` + SVC_T.map((t, i) => S.svcl.includes(String(i)) ? k(SVC_C[i], t, true) : "").join("") : "")
    + (S.fell.length && FELL.d ? `<div class="lh" style="margin-top:4px">Felled since 2025 (Hawke's Bay)</div>` + S.fell.map(i => k(FELL_C[i], FELL_T[i])).join("") : "")
    + (S.np && NP.d ? `<div class="lh" style="margin-top:4px">Aerial photos 2025-26 (pilot)</div>` + k(NP_C.young, NP_T.young) + k(NP_C.older, NP_T.older) + (S.npa ? `<div class="k"><i style="background:transparent;border:1.5px dashed ${NP_C.young}"></i>Area checked on the photos</div>` : "") : "");
}

// ------------------------------------------------------------------ side panel
const LIST_MAX = 200;
function summary() {
  const ha = shown.reduce((s, b) => s + b.ha, 0);
  $("sum").innerHTML = `<b>${fmt(shown.length)}</b> forests · <b>${fmt(ha)}</b> ha`;   // pin / drive shown on the map, not repeated here (Mike 2026-11-25)
}
function listBlocks() {
  let bb = null; try { bb = map.getBounds(); } catch (e) { /* map not sized yet (hidden tab): list them all */ }
  const size = dueHa;                                          // harvest periods picked: most ha in them first
  const v = shown.filter(b => { if (!bb) return true; const A = blockBB(b); return bb.intersects([[A[0], A[1]], [A[2], A[3]]]); })   // any part on screen, not just the centre (Mike 2026-11-26: zoomed into a big forest the list said none)
    .sort((a, b) => size(b) - size(a));
  if (!v.length) return `<div class="more">No forests here with these filters.</div>`;
  return `<div class="tip">${fmt(v.length)} on screen</div>` +
    v.slice(0, LIST_MAX).map(b => `<div class="it" data-b="${b.id}"><span class="sw" style="background:${colourOf(b)}"></span>
      <span class="m"><div class="t">${esc(D[b.d] || R[b.r] || "")}</div>
      <div class="s">${b.k === 0 && S.due.length ? `${fmt(dueHa(b))} ha ${esc(S.due.length === 1 ? dueWord(due1()) : "due in the picked periods")}${b.firms.length ? " · " + esc(b.firms.join(", ")) : ""}`
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
  const reg = S.region.length === 1 ? R[+S.region[0]] : null, w = words(), per = S.due.length ? 0 : -1;
  const size = dueHa, agg = new Map();
  for (const b of S.fm.length ? blocks.filter(b => passes(b, "fm")) : shown) {
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
  const what = per >= 0 ? (S.due.length === 1 ? "ha " + dueWord(due1()) : "ha due in the picked periods") : "ha";
  return (fs.length ? (S.fm.length ? `<div class="tip picks"><span>${S.fm.length} ticked</span><button class="lnk" type="button" data-unpick="1">Show all</button></div>`
      : `<div class="tip">${fmt(fs.length)} firms</div>`) +
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
    // (firms with no placed forest no longer listed here - Mike 2026-11-25: too many words)
    listLocal(reg, w);
}
function listLocal(reg, w) {
  const ls = LOCAL.filter(x => (!reg || x.r === reg) && (!w.length || w.every(y => x.text.includes(y))));
  if (!reg && !w.length) return "";
  if (!ls.length) return "";
  return `<div class="tip" style="margin-top:10px"><b>Local forestry firms${reg ? " in " + esc(reg) : ""}</b> · ${ls.length} listed on Google Maps (Nov 2026)</div>` +
    LOCAL_TYPES.map(t => { const g = ls.filter(x => x.t === t); return g.length ? `<div class="kidsrc" style="margin-top:6px"><b>${t}</b> (${g.length})</div>` +
      g.map(x => `<div class="kid"><span>${x.web ? `<a href="${esc(x.web)}" target="_blank" rel="noopener">${esc(x.n)}</a>` : esc(x.n)}
        <span class="w">${x.town ? " · " + esc(x.town) : ""}${!reg && x.r ? " · " + esc(x.r) : ""}</span></span><span style="white-space:nowrap;flex:none">${x.ph ? `<a href="tel:${esc(x.ph.replace(/\s/g, ""))}">${esc(x.ph)}</a>` : ""}</span></div>`).join("") : ""; }).join("");
}
// District / Region view: each place with forests that pass, biggest first; a tick adds it to that filter tab
function listPlaces(id) {
  const key = id === "district" ? b => b.d : b => b.r, name = id === "district" ? D : R, agg = new Map();
  for (const b of S[id].length ? blocks.filter(b => passes(b, id)) : shown) { const k = key(b); if (k == null || k < 0) continue;
    const a = agg.get(k) || agg.set(k, {k, n: 0, ha: 0, due: 0}).get(k); a.n++; a.ha += b.ha; a.due += b.k === 0 ? b.soon : 0; }
  const rows = [...agg.values()].sort((x, y) => S[id].includes(String(y.k)) - S[id].includes(String(x.k)) || y.ha - x.ha);
  if (!rows.length) return `<div class="more">No forests match these filters.</div>`;
  return `<div class="tip">${fmt(rows.length)} ${id === "district" ? "districts" : "regions"}</div>` +
    rows.map(a => { const on = S[id].includes(String(a.k));
      return `<div class="it${on ? " on" : ""}" data-place="${id}:${a.k}"><span class="pk"><span class="tick" role="checkbox" aria-checked="${on}">${on ? "✓" : ""}</span></span>
        <span class="m"><div class="t">${esc(name[a.k] || "")}${id === "district" && R[blocks.find(b => b.d === a.k).r] ? ` <span class="w">${esc(R[blocks.find(b => b.d === a.k).r])}</span>` : ""}</div>
        <div class="s">${fmt(a.n)} forest${a.n > 1 ? "s" : ""}${a.due ? ` · ${fmt(a.due)} ha due by 2033` : ""}</div></span><span class="n">${fmt(a.ha)} ha</span></div>`; }).join("");
}
// Charts view (Mike 2026-11-25: the harvest bars moved here, "make it look cool"): Chart.js 4 (MIT), loaded only when opened.
// Each chart sums the forests that pass the filters; a click on a bar ticks that filter.
let chartLib = null; const charts = [];
const loadCharts = () => chartLib = chartLib || new Promise((ok, no) => { const t = document.createElement("script");
  t.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"; t.onload = ok; t.onerror = no; document.head.appendChild(t); });
function listCharts() {
  const pl = shown.filter(b => b.k === 0);
  const due = HG.map((_, i) => pl.reduce((s, b) => s + b.hg[i], 0));
  const pid = S.region.length === 1 ? "district" : "region", pk = pid === "district" ? b => b.d : b => b.r, pn = pid === "district" ? D : R;   // one region picked: its districts
  const byR = new Map(); shown.forEach(b => byR.set(pk(b), (byR.get(pk(b)) || 0) + b.ha));
  const regs = [...byR].filter(x => x[0] >= 0).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const byF = new Map(); shown.forEach(b => b.fk.forEach(f => byF.set(f, (byF.get(f) || 0) + b.ha)));
  const firms = [...byF].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const ht = HT_TEXT.map((_, i) => shown.reduce((s, b) => s + (b.hts === i ? b.ha : 0), 0));
  const kind = KIND.map((_, i) => shown.reduce((s, b) => s + (b.k === i ? b.ha : 0), 0));
  const tot = kind.reduce((a, b) => a + b, 0), known = shown.reduce((s, b) => s + (b.fk.size ? b.ha : 0), 0);
  const card = (id, h, title, sub) => `<div class="chc"><div class="cht">${title}</div>${sub ? `<div class="chs">${sub}</div>` : ""}<div style="height:${h}px"><canvas id="${id}"></canvas></div></div>`;
  const html = `<div class="chk2">
      <div class="kpi"><b>${fmt(shown.length)}</b><span>forests</span></div><div class="kpi"><b>${fmt(tot)}</b><span>ha</span></div>
      <div class="kpi"><b>${fmt(due[0] + due[1])}</b><span>ha due by 2033</span></div><div class="kpi"><b>${tot ? Math.round(known / tot * 100) : 0}%</b><span>with a known manager</span></div></div>`
    + card("ch-due", 190, "Plantation harvest due, ha", "Click a bar to filter")
    + card("ch-reg", 26 * regs.length + 30, `Forest area by ${pid}, ha`, regs.length > 1 ? "Top " + regs.length + ", click to filter" : "")
    + card("ch-firm", 26 * firms.length + 30, "Biggest managers, ha", firms.length ? "Forests named to the firm, click to filter" : "No managers matched")
    + card("ch-ht", 170, "Height today, ha", "Estimated from lidar, click to filter");
  setTimeout(() => loadCharts().then(() => {
    charts.splice(0).forEach(c => c.destroy());
    if (S.grp !== "charts" || !$("ch-due")) return;
    const cs = getComputedStyle(document.body), ink = cs.getPropertyValue("--ol-text2").trim() || "#555", grid = cs.getPropertyValue("--ol-line").trim() || "#ddd";
    Chart.defaults.color = ink; Chart.defaults.font.family = cs.fontFamily; Chart.defaults.font.size = 11;
    const opt = (horiz, onPick) => ({indexAxis: horiz ? "y" : "x", maintainAspectRatio: false, animation: {duration: 500},
      plugins: {legend: {display: false}, tooltip: {callbacks: {label: c => " " + fmt(c.raw) + " ha"}}},
      scales: {[horiz ? "x" : "y"]: {grid: {color: grid}, ticks: {callback: v => v >= 1000 ? fmt(v / 1000) + "k" : v}}, [horiz ? "y" : "x"]: {grid: {display: false}}},
      onClick: (e, el) => el.length && onPick(el[0].index), onHover: (e, el) => e.native.target.style.cursor = el.length ? "pointer" : ""});
    const bar = (id, labels, data, colours, horiz, onPick) => charts.push(new Chart($(id), {type: "bar",
      data: {labels, datasets: [{data, backgroundColor: colours, borderRadius: 4, maxBarThickness: 34}]}, options: opt(horiz, onPick)}));
    const cut = t => t.length > 24 ? t.slice(0, 23).trim() + "…" : t;
    const fade = (on, c) => on ? c : c + "55";
    bar("ch-due", HG, due, C.hg.map((c, i) => fade(!S.due.length || S.due.includes(String(i)), c)), false, i => tick("due", String(i)));
    bar("ch-reg", regs.map(x => cut(pn[x[0]])), regs.map(x => x[1]), regs.map(x => fade(!S[pid].length || S[pid].includes(String(x[0])), C.kind[0])), true, i => tick(pid, String(regs[i][0])));
    if (firms.length) bar("ch-firm", firms.map(x => cut(firmLabel(x[0]))), firms.map(x => x[1]), firms.map(x => fade(!S.fm.length || S.fm.includes(x[0]), DRIVE_C)), true, i => { tick("fm", firms[i][0]); });
    bar("ch-ht", HT_TEXT, ht, C.ht.map((c, i) => fade(!S.ht.length || S.ht.includes(String(i)), c)), false, i => tick("ht", String(i)));
  }).catch(() => { const x = $("ch-due"); if (x) x.parentNode.innerHTML = `<div class="more">Charts could not load.</div>`; }), 0);
  return html;
}
function drawList() {
  document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === S.grp));
  if (S.grp !== "charts") charts.splice(0).forEach(c => c.destroy());
  $("list").innerHTML = S.grp === "managers" ? listManagers() : S.grp === "district" || S.grp === "region" ? listPlaces(S.grp) : S.grp === "charts" ? listCharts() : listBlocks();
}
$("list").addEventListener("click", e => {
  if (e.target.closest("a")) return;
  if (e.target.closest("[data-unpick]")) { S.fm = []; update(); return; }
  const it = e.target.closest(".it, .kid[data-b]"); if (!it) return;
  if (it.dataset.place) { const [id, k] = it.dataset.place.split(":"); tick(id, k); return; }
  if (it.dataset.b) { const b = blocks.find(x => x.id === +it.dataset.b); if (b) pick(b, true); }
  const pk = e.target.closest("[data-pick]");
  if (pk) { tick("fm", pk.dataset.pick); return; }   // tick: pick only
  if (it.dataset.f) { const f = it.dataset.f; openFirms.has(f) ? openFirms.delete(f) : openFirms.add(f); drawList(); }               // row: open its forests
});
map.on("moveend", () => { if (S.grp === "blocks") drawList(); });
let standsZ = null;
map.on("zoomend", () => { const on = standsOn() + "" + heightsOn() + (map.getZoom() >= LINE_Z); if (on !== standsZ) { standsZ = on; syncStands(); shown.forEach(b => b.layer && b.layer.setStyle(styleOf(b))); drawLegend(); } });


// ------------------------------------------------------------------ download what is filtered
$("csv").addEventListener("click", () => {
  const head = ["block_id", "type", "region", "district", "forest_ha", ...HG.map(a => "ha_" + a.toLowerCase().replace(/[^a-z0-9]+/g, "_")), "manager_lists_naming_a_forest_here", "manager_found_by_research", "research_confidence", "research_source", "ha_post_1989_forest_land_mfe", "ha_planted_on_farmland_2018_23",
    "titles", "largest_titles", "forestry_right_titles", "crown_forest_licence_titles", "maori_land_ha", "conservation_ha",
    "avg_canopy_height_median_m_lidar", "avg_canopy_height_tallest_tenth_m", "lidar_year", "lidar_share_flown_pct", "top_height_median_m", "top_height_tallest_tenth_m", "height_today_est_m", "felled_since_lidar_pct", "mpi_yield_region", "lat", "lon", "satellite"];
  const q = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v;
  const rows = shown.slice().sort((a, b) => b.ha - a.ha).map(b => [b.id, KIND[b.k], R[b.r] || "", D[b.d] || "", b.ha, ...b.hg, b.mg.map(m => SHORT[m[0]] + ": " + m[1]).join("; "), b.rm.length ? b.rm[0] + (b.rm[1] ? ": " + b.rm[1] : "") : "", b.rm.length ? (b.rm[2] ? "sure" : "likely") : "", b.rm[3] || "", b.nf[0], b.nf[1],
    b.t, b.tt, b.fr, b.cfl, b.mao, b.con, ...(b.ht ? [...b.ht.slice(0, 4), b.ht[5] ?? "", b.ht[6] ?? "", b.ht[7] ?? "", b.ht[8] ?? ""] : ["", "", "", "", "", "", "", ""]), b.vk, b.c[0], b.c[1], `https://www.google.com/maps/@${b.c[0]},${b.c[1]},14z/data=!3m1!1e3`].map(q).join(","));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + [head.join(","), ...rows].join("\r\n")], {type: "text/csv"}));
  a.download = "nz_forests.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ------------------------------------------------------------------ one update for every change
function syncControls() {
  drawFilters();
}
function update(zoomTo) {
  S.dp = dpList();                                  // the places drive time applies to (empty when off)
  S.colour = pickColour();
  S.np = S.npl.includes("np") ? "1" : ""; S.npa = S.npl.includes("npa") ? "1" : "";   // layer tab -> layers
  syncControls(); syncInf(); syncSvc(); syncDrive(); syncNp(); syncFell(); draw(); syncMask(); syncStands(); summary(); drawLegend(); drawList(); writeHash();
  if (zoomTo && shown.length && (S.region.length || S.district.length)) {
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
// fold the side panels away, like AquilaLens (Mike 2026-11-25); remembered in this browser only
for (const [c, cls, open, shut] of [["l", "noside", "‹", "›"], ["r", "nores", "›", "‹"]]) {
  const bt = L.DomUtil.create("button", "pcol " + c, map.getContainer()); bt.type = "button";
  const set = on => { $("app").classList.toggle(cls, on); bt.textContent = on ? shut : open; bt.title = (on ? "Show" : "Hide") + (c === "l" ? " the filters" : " the list");
    try { localStorage.setItem("fm-" + cls, on ? "1" : ""); } catch (e) { /* storage off */ } setTimeout(() => map.invalidateSize(false), 0); };
  let was = false; try { was = localStorage.getItem("fm-" + cls) === "1"; } catch (e) { /* storage off */ }
  set(was);
  L.DomEvent.disableClickPropagation(bt);
  bt.addEventListener("click", () => set(!$("app").classList.contains(cls)));
}
$("q").value = S.q;
if (S.pin) setPin(L.latLng(S.pin[0], S.pin[1]));
update(S.region.length > 0 || S.district.length > 0);
if (S.pin && pinRing) whenSized(() => map.fitBounds(pinRing.getBounds(), {animate: false}));   // a drive area fits itself when it arrives
})().catch(e => { document.getElementById("list").innerHTML = `<div class="more">The map could not load: ${String(e.message || e)}</div>`; console.error(e); });
