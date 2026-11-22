// forest.js - the NZ forest map (ForestMap project, built 2026-11-23 for Pinetech Pacific). Leaflet on canvas with the
// AquilaLens background (base.js). Data in data/: blocks.json (forest blocks 50 ha+ with outlines), oio.json (overseas
// forestry buys placed by address), managers.json (FSC certificates + firms' named forests). Filters live in the
// address bar, so a link opens the same view.
(async function () {
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
const fmt = n => Math.round(n).toLocaleString("en-NZ");
const VIZ = window.OL_VIZ, dark = VIZ.dark;

// ------------------------------------------------------------------ colours
const C = dark ? {
  kind: ["#4cae6c", "#d9ac3a"],
  age: ["#3f9a5a", "#6fae3e", "#a6bd3a", "#d1c64a", "#e8d77a", "#f3e9b3", "#d07a5c"],
  land: {cfl: "#a487f0", fr: "#5d9cf0", mao: "#f08a4b", con: "#3fb8bf", none: "#6d7177"},
  oio: "#ef6a6a", sel: "#ffffff",
} : {
  kind: ["#2d7a46", "#c8901e"],
  age: ["#0b3d24", "#2e6b2f", "#5f8f2a", "#9bab2e", "#cdbf4a", "#ecdf8f", "#b0563c"],
  land: {cfl: "#7a4fd6", fr: "#2f6fde", mao: "#d9772b", con: "#1f8a8a", none: "#a9aeb5"},
  oio: "#c9423a", sel: "#111418",
};
const AGE_NAME = ["Before 1996", "1996-2001", "2001-2008", "2008-2012", "2012-2018", "2018-2023", "Harvested, not replanted"];
const LAND_NAME = {cfl: "Crown forest licence", fr: "Forestry right on a title", mao: "Mostly Māori land", con: "Mostly conservation land",
  none: "None of these"};
const KIND_NAME = ["Plantation", "Mānuka / kānuka"];
const SIZES = [["50-200 ha", 50, 200], ["200-1,000", 200, 1000], ["1,000-5,000", 1000, 5000], ["5,000+", 5000, 1e9]];

// ------------------------------------------------------------------ data
const get = f => fetch("data/" + f).then(r => { if (!r.ok) throw new Error(f + " " + r.status); return r.json(); });
$("list").innerHTML = `<div class="more">Loading forests…</div>`;
const [B, OIO, MG] = await Promise.all([get("blocks.json"), get("oio.json"), get("managers.json")]);
const R = B.regions, D = B.districts;
const blocks = B.blocks;
const landOf = b => b.cfl ? "cfl" : b.fr ? "fr" : b.mao >= b.ha * .25 ? "mao" : b.con >= b.ha * .25 ? "con" : "none";
blocks.forEach(b => {
  b.land = landOf(b);
  b.oio = b.oio.replace(/(^|; )\? \(/g, "$1buyer not named (");
  b.h25 = b.k === 0 ? b.bands[0] + b.bands[1] : 0;     // harvest age: planted before 2001
  b.text = [R[b.r], D[b.d], b.tt, b.oio, KIND_NAME[b.k]].join(" ").toLowerCase();
  b.ll = L.latLng(b.c[0], b.c[1]);
});
$("a-pl").textContent = fmt(blocks.filter(b => b.k === 0).reduce((s, b) => s + b.ha, 0));
// each overseas buy takes the region / district of the nearest block (for the region filter)
OIO.forEach(o => { const ll = L.latLng(o.c[0], o.c[1]); let best = null, bd = 3e4;
  blocks.forEach(b => { const d = ll.distanceTo(b.ll); if (d < bd) { bd = d; best = b; } });
  o.r = best ? best.r : -1; o.d = best ? best.d : -1; o.ll = ll; });
const unring = a => { const out = []; let x = 0, y = 0; for (let i = 0; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; out.push([y / 1e4, x / 1e4]); } return out; };

// ------------------------------------------------------------------ map
const map = L.map("map", {preferCanvas: true, zoomControl: true, attributionControl: true});
olBaseMap(map, "Forests: LCDB v6 Manaaki Whenua (CC BY 4.0) · LINZ (CC BY 4.0)", {full: false});
map.setView([-41.2, 172.8], 5, {animate: false});   // a view first: fitting to a box not yet sized leaves the map unset
olFitNZ(map);
const rnd = L.canvas({padding: .5, tolerance: 4});
const forestLayer = L.layerGroup().addTo(map);
const oioLayer = L.layerGroup().addTo(map);

// ------------------------------------------------------------------ state (kept in the address bar)
const S = {q: "", kind: new Set(), region: -1, district: -1, size: new Set(), age: new Set(), land: new Set(), colour: "kind", tab: "blocks",
  pin: null, km: 25};
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const set = k => new Set((p.get(k) || "").split(",").filter(Boolean));
  S.q = p.get("q") || ""; S.kind = set("kind"); S.size = set("size"); S.age = set("age"); S.land = set("land");
  S.region = p.has("region") ? +p.get("region") : -1; S.district = p.has("district") ? +p.get("district") : -1;
  S.colour = p.get("colour") || "kind"; S.tab = p.get("tab") || "blocks";
  S.km = +(p.get("km") || 25);
  S.pin = p.get("pin") ? p.get("pin").split(",").map(Number) : null;
}
function writeHash() {
  const p = new URLSearchParams();
  if (S.q) p.set("q", S.q);
  for (const k of ["kind", "size", "age", "land"]) if (S[k].size) p.set(k, [...S[k]].join(","));
  if (S.region >= 0) p.set("region", S.region);
  if (S.district >= 0) p.set("district", S.district);
  if (S.colour !== "kind") p.set("colour", S.colour);
  if (S.tab !== "blocks") p.set("tab", S.tab);
  if (S.pin) { p.set("pin", S.pin.map(v => v.toFixed(4)).join(",")); p.set("km", S.km); }
  history.replaceState(null, "", p.toString() ? "#" + p : location.pathname);
}
readHash();

// ------------------------------------------------------------------ filter controls
function chips(boxId, items, key, multi = true) {
  const box = $(boxId);
  items.forEach(([val, label, sw]) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip"; b.dataset.v = val;
    b.innerHTML = (sw ? `<span class="sw" style="background:${sw}"></span>` : "") + esc(label);
    b.addEventListener("click", () => {
      if (multi) { S[key].has(val) ? S[key].delete(val) : S[key].add(val); }
      else S[key] = val;
      update();
    });
    box.appendChild(b);
  });
}
chips("f-kind", [["0", "Plantation", C.kind[0]], ["1", "Mānuka / kānuka", C.kind[1]]], "kind");
chips("f-size", SIZES.map((s, i) => [String(i), s[0]]), "size");
chips("f-age", [...AGE_NAME.map((n, i) => [String(i), n, C.age[i]]), ["h", "Mostly harvest age (25+ yrs)"]], "age");
chips("f-land", [["cfl", "Crown forest licence", C.land.cfl], ["fr", "Forestry right", C.land.fr], ["mao", "Mostly Māori land", C.land.mao],
  ["con", "Mostly conservation", C.land.con], ["oio", "Overseas buy in or near", C.oio]], "land");
chips("f-colour", [["kind", "Type"], ["age", "Planting period"], ["land", "Land"]], "colour", false);
const regSel = $("f-region"), disSel = $("f-district");
regSel.innerHTML = `<option value="-1">All regions</option>` + R.map((r, i) => `<option value="${i}">${esc(r)}</option>`).join("");
function fillDistricts() {
  const used = new Set(blocks.filter(b => S.region < 0 || b.r === S.region).map(b => b.d));
  disSel.innerHTML = `<option value="-1">All districts</option>` +
    D.map((d, i) => used.has(i) ? `<option value="${i}">${esc(d)}</option>` : "").join("");
  disSel.value = String(S.district);
  if (disSel.value !== String(S.district)) { S.district = -1; disSel.value = "-1"; }
}
regSel.addEventListener("change", () => { S.region = +regSel.value; S.district = -1; fillDistricts(); update(true); });
disSel.addEventListener("change", () => { S.district = +disSel.value; update(true); });
let qt;
$("q").addEventListener("input", () => { clearTimeout(qt); qt = setTimeout(() => { S.q = $("q").value.trim(); update(); }, 200); });
$("reset").addEventListener("click", () => {
  Object.assign(S, {q: "", kind: new Set(), region: -1, district: -1, size: new Set(), age: new Set(), land: new Set(), pin: null});
  $("q").value = ""; regSel.value = "-1"; fillDistricts(); setPin(null); update(); olFitNZ(map);
});
$("aboutbtn").addEventListener("click", () => $("about").classList.add("on"));
$("aboutclose").addEventListener("click", () => $("about").classList.remove("on"));
$("about").addEventListener("click", e => { if (e.target.id === "about") $("about").classList.remove("on"); });
document.addEventListener("keydown", e => { if (e.key === "Escape") $("about").classList.remove("on"); });
document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => { S.tab = b.dataset.tab; update(); }));

// ------------------------------------------------------------------ which blocks pass
const near = (ll, km) => S.pin && map.distance(L.latLng(S.pin[0], S.pin[1]), ll) <= km * 1000;
function passes(b) {
  if (S.kind.size && !S.kind.has(String(b.k))) return false;
  if (S.region >= 0 && b.r !== S.region) return false;
  if (S.district >= 0 && b.d !== S.district) return false;
  if (S.size.size && ![...S.size].some(i => b.ha >= SIZES[i][1] && b.ha < SIZES[i][2])) return false;
  if (S.age.size) {
    const want = [...S.age];
    const ok = want.some(a => a === "h" ? b.k === 0 && b.h25 >= b.ha * .5 : b.k === 0 && b.main === +a);
    if (!ok) return false;
  }
  if (S.land.size && ![...S.land].some(l => l === "oio" ? !!b.oio : b.land === l || (l === "fr" && b.fr) || (l === "cfl" && b.cfl)
      || (l === "mao" && b.mao >= b.ha * .25) || (l === "con" && b.con >= b.ha * .25))) return false;
  if (S.pin && !near(b.ll, S.km)) return false;
  if (S.q) { const words = S.q.toLowerCase().split(/\s+/); if (!words.every(w => b.text.includes(w))) return false; }
  return true;
}
const colourOf = b => S.colour === "age" ? (b.k === 0 && b.main >= 0 ? C.age[b.main] : VIZ.none)
  : S.colour === "land" ? C.land[b.land] : C.kind[b.k];

// ------------------------------------------------------------------ drawing
let picked = null;
function styleOf(b) {
  const c = colourOf(b), sel = picked === b;
  return {renderer: rnd, color: sel ? C.sel : c, weight: sel ? 2.5 : .6, opacity: sel ? 1 : .9, fillColor: c, fillOpacity: sel ? .85 : .7};
}
function shapeOf(b) {
  if (!b.layer) {
    b.layer = L.polygon(b.g.map(poly => poly.map(unring)), styleOf(b));
    b.layer.bindTooltip(() => `${esc(KIND_NAME[b.k])} · ${fmt(b.ha)} ha<br>${esc(D[b.d] || "")}`, {sticky: true, direction: "top", opacity: .95});
    b.layer.on("click", e => { L.DomEvent.stopPropagation(e);
      if (pinning) { map.fire("click", {latlng: e.latlng}); return; }
      pick(b, false); });
  }
  return b.layer;
}
let shown = [];
function draw() {
  forestLayer.clearLayers();
  shown = blocks.filter(passes);
  shown.forEach(b => { const l = shapeOf(b); l.setStyle(styleOf(b)); forestLayer.addLayer(l); });
  oioLayer.clearLayers();
  oioShown().forEach(o => oioLayer.addLayer(oioMarker(o)));
}
// overseas buys: shown with the region / district / pin / search filters (not the forest-only ones)
const regionName = () => S.region >= 0 ? R[S.region] : null;
function oioShown() {
  const q = S.q.toLowerCase().split(/\s+/).filter(Boolean);
  return OIO.filter(o => {
    if (S.pin && !near(o.ll, S.km)) return false;
    if (S.region >= 0 && o.r !== S.region) return false;
    if (S.district >= 0 && o.d !== S.district) return false;
    if (q.length) { const t = [o.b, o.s, o.w].join(" ").toLowerCase(); if (!q.every(w => t.includes(w))) return false; }
    return true;
  });
}
function oioMarker(o) {
  if (!o.mk) {
    o.mk = L.circleMarker(o.c, {renderer: rnd, radius: map.getZoom() < 8 ? 3.5 : 5, color: dark ? "#1c1b18" : "#ffffff", weight: 1.5, fillColor: C.oio, fillOpacity: 1});
    o.mk.bindTooltip(`${esc(o.b)}${o.ha ? " · " + fmt(o.ha) + " ha" : ""} · ${esc(o.m)}`, {direction: "top"});
    o.mk.bindPopup(() => oioCard(o), {maxWidth: 330});
  }
  return o.mk;
}
function oioCard(o) {
  return `<div class="card"><h3>${esc(o.b || "Buyer not named")}</h3><div class="s">Overseas Investment Office consent · ${esc(o.m)}</div>
    <table><tr><td>Hectares in decision</td><td>${o.ha ? fmt(o.ha) : "-"}</td></tr>
    ${o.s ? `<tr><td>Seller</td><td>${esc(o.s)}</td></tr>` : ""}</table>
    <div class="s" style="margin-top:6px">${esc(o.w)}${o.w.length >= 300 ? "…" : ""}</div>
    <div class="s">Dot = the address in the decision (${esc(o.how)}), not the whole forest bought.</div>
    <div class="links"><a href="${esc(o.u)}" target="_blank" rel="noopener">Read the decision</a></div></div>`;
}

// ------------------------------------------------------------------ the block card
function blockCard(b) {
  const tot = b.bands.reduce((s, v) => s + v, 0);
  const bar = b.k === 0 && tot ? `<div class="bar">${b.bands.map((v, i) => v ? `<span title="${AGE_NAME[i]}: ${fmt(v)} ha" style="width:${v / tot * 100}%;background:${C.age[i]}"></span>` : "").join("")}</div>
    <div class="bk">${b.bands.map((v, i) => v ? `<span><i style="background:${C.age[i]}"></i>${AGE_NAME[i]} ${fmt(v)}</span>` : "").join("")}</div>` : "";
  const gm = `https://www.google.com/maps/@${b.c[0]},${b.c[1]},14z/data=!3m1!1e3`;
  const rows = [
    ["Forest area", fmt(b.ha) + " ha"],
    b.k === 0 ? ["Harvest age (planted before 2001)", fmt(b.h25) + " ha"] : null,
    ["Land titles", fmt(b.t)],
    b.fr ? ["Titles with a forestry right", fmt(b.fr)] : null,
    b.cfl ? ["Titles under a Crown forest licence", fmt(b.cfl)] : null,
    b.mao ? ["Māori land", fmt(b.mao) + " ha"] : null,
    b.con ? ["Conservation / reserve land", fmt(b.con) + " ha"] : null,
  ].filter(Boolean);
  return `<div class="card"><h3>${esc(KIND_NAME[b.k])} block · ${fmt(b.ha)} ha</h3>
    <div class="s">${esc(D[b.d] || "")}${b.r >= 0 ? ", " + esc(R[b.r]) : ""} · block ${b.id}</div>
    <table>${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join("")}</table>
    ${bar ? `<div style="margin-top:6px;font-weight:600">When planted</div>${bar}` : ""}
    ${b.tt ? `<div class="s" style="margin-top:6px">Largest titles: ${esc(b.tt)}</div>` : ""}
    ${b.oio ? `<div class="s" style="margin-top:4px"><b style="color:${C.oio}">Overseas buy in or near:</b> ${esc(b.oio)}</div>` : ""}
    <div class="s" style="margin-top:4px">Owner: not shown (LINZ releases owner names only under a licence).</div>
    <div class="links"><a href="${gm}" target="_blank" rel="noopener">Satellite in Google Maps</a>
      <a href="#" data-managers="${b.r}">Who manages in ${esc(R[b.r] || "this region")}</a></div></div>`;
}
function pick(b, fly) {
  const was = picked; picked = b;
  if (was && was.layer) was.layer.setStyle(styleOf(was));
  shapeOf(b).setStyle(styleOf(b)); b.layer.bringToFront();
  if (fly) map.fitBounds(b.layer.getBounds(), {maxZoom: 13, padding: [40, 40], animate: false});
  const pop = L.popup({maxWidth: 360, autoPanPadding: [20, 20]}).setLatLng(b.ll).setContent(blockCard(b));
  pop.on("remove", () => { if (picked === b) { picked = null; if (b.layer) b.layer.setStyle(styleOf(b)); } });
  pop.openOn(map);
}
map.getContainer().addEventListener("click", e => {
  const a = e.target.closest("[data-managers]"); if (!a) return;
  e.preventDefault(); S.region = +a.dataset.managers; S.district = -1; S.tab = "managers"; regSel.value = String(S.region); fillDistricts(); update();
});

// ------------------------------------------------------------------ drop a pin (km ring, like AquilaLens's pin tool)
let pinMk = null, pinRing = null, pinning = false;
function setPin(ll) {
  if (pinMk) { map.removeLayer(pinMk); map.removeLayer(pinRing); pinMk = pinRing = null; }
  S.pin = ll ? [ll.lat, ll.lng] : null;
  if (S.pin) {
    pinMk = L.marker(S.pin, {draggable: true, title: "Drag to move"}).addTo(map);
    pinRing = L.circle(S.pin, {radius: S.km * 1000, color: VIZ.tool.ring, weight: 2, fill: true, fillColor: VIZ.tool.ring, fillOpacity: .04,
      interactive: false}).addTo(map);
    pinMk.on("dragend", () => { setPin(pinMk.getLatLng()); update(); });
  }
  $("pinclear").style.display = S.pin ? "" : "none";
}
const PinCtl = L.Control.extend({onAdd() {
  const d = L.DomUtil.create("div", "pinbox");
  d.innerHTML = `<button id="pinbtn" type="button" title="Click, then click the map: shows only forests within the distance">Drop a pin</button>
    <select id="pinkm" aria-label="Distance">${[10, 25, 50, 100, 150].map(k => `<option value="${k}">${k} km</option>`).join("")}</select>
    <button id="pinclear" type="button" style="display:none" title="Remove the pin">✕</button>`;
  L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
  return d; }});
new PinCtl({position: "topleft"}).addTo(map);
$("pinkm").value = String(S.km);
$("pinbtn").addEventListener("click", () => { pinning = !pinning; $("pinbtn").classList.toggle("on", pinning);
  map.getContainer().style.cursor = pinning ? "crosshair" : ""; });
$("pinkm").addEventListener("change", () => { S.km = +$("pinkm").value; if (S.pin) { pinRing.setRadius(S.km * 1000); update(); } });
$("pinclear").addEventListener("click", () => { setPin(null); update(); });
map.on("click", e => { if (!pinning) return; pinning = false; $("pinbtn").classList.remove("on"); map.getContainer().style.cursor = "";
  setPin(e.latlng); update(); });

// ------------------------------------------------------------------ legend
const legend = L.DomUtil.create("div", "legend");
map.getContainer().appendChild(legend);
L.DomEvent.disableClickPropagation(legend);
function drawLegend() {
  const k = (c, t) => `<div class="k"><i style="background:${c}"></i>${esc(t)}</div>`;
  const body = S.colour === "age" ? AGE_NAME.map((n, i) => k(C.age[i], n)).join("") + k(VIZ.none, "Mānuka / no plantation date")
    : S.colour === "land" ? Object.keys(LAND_NAME).map(l => k(C.land[l], LAND_NAME[l])).join("")
    : KIND_NAME.map((n, i) => k(C.kind[i], n)).join("");
  legend.innerHTML = `<div class="t">${S.colour === "age" ? "Main planting period" : S.colour === "land" ? "Land" : "Forest type"}</div>${body}
    <div class="k"><i style="background:${C.oio};border-radius:50%"></i>Overseas buy (OIO)</div>`;
}

// ------------------------------------------------------------------ side panel
const LIST_MAX = 200;
function inView() { const bb = map.getBounds(); return shown.filter(b => bb.contains(b.ll)).sort((a, b) => b.ha - a.ha); }
function summary() {
  const ha = k => shown.filter(b => b.k === k).reduce((s, b) => s + b.ha, 0);
  const n = shown.length, pl = ha(0), mk = ha(1);
  $("sum").innerHTML = `<b>${fmt(n)}</b> blocks · <b>${fmt(pl)}</b> ha plantation` + (mk ? ` · <b>${fmt(mk)}</b> ha mānuka` : "") +
    (S.pin ? ` · within ${S.km} km of the pin` : "");
}
function listBlocks() {
  const v = inView();
  if (!v.length) return `<div class="more">No forest blocks in this view with these filters.</div>`;
  const ha = v.reduce((s, b) => s + b.ha, 0);
  return `<div class="note">${fmt(v.length)} in view, ${fmt(ha)} ha. Biggest first; click one to open it.</div>` +
    v.slice(0, LIST_MAX).map(b => `<div class="it" data-b="${b.id}"><span class="sw" style="background:${colourOf(b)}"></span>
      <span class="m"><div class="t">${esc(D[b.d] || R[b.r] || "")}</div>
      <div class="s">${esc(KIND_NAME[b.k])}${b.k === 0 && b.main >= 0 ? " · " + AGE_NAME[b.main].toLowerCase() : ""}${b.fr ? " · forestry right" : ""}${b.cfl ? " · Crown licence" : ""}${b.oio ? " · overseas buy" : ""}</div></span>
      <span class="n">${fmt(b.ha)} ha</span></div>`).join("") +
    (v.length > LIST_MAX ? `<div class="more">and ${fmt(v.length - LIST_MAX)} more - zoom in or filter to see them.</div>` : "");
}
function listManagers() {
  const reg = regionName(), q = S.q.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = t => !q.length || q.every(w => t.toLowerCase().includes(w));
  const fs = MG.forests.filter(f => (!reg || f.reg.includes(reg)) && hit([f.f, f.n, f.where, f.own].join(" ")));
  const byFirm = new Map();
  fs.forEach(f => { if (!byFirm.has(f.f)) byFirm.set(f.f, []); byFirm.get(f.f).push(f); });
  // a firm that gives its whole-estate figure ("ESTATE TOTAL") is ranked by that, not by adding it to its forests
  const firstNum = t => { const m = String(t).match(/\d[\d,]*(\.\d+)?/); return m ? +m[0].replace(/,/g, "") : 0; };
  const isTot = r => /^(estate|company) total/i.test(r.n);
  const firms = [...byFirm.entries()].map(([firm, rows]) => {
    const tot = rows.find(isTot);
    rows.sort((a, b) => isTot(b) - isTot(a));
    return {firm, rows, tot, ha: tot ? firstNum(tot.hat) : rows.reduce((s, r) => s + (r.ha || 0), 0)};
  }).sort((a, b) => b.ha - a.ha);
  const haText = t => /^\d+(\.\d+)?$/.test(t) ? fmt(+t) : t;
  const certs = MG.fsc.filter(c => hit(c.h));
  let h = `<div class="note">${reg ? `Forests named in <b>${esc(reg)}</b> by the firms that manage them` : "Forests named by the firms that manage them"}
    (their own public lists; ✓ = hectares re-read at source). Not on the map: firms name forests, not boundaries.</div>`;
  h += firms.length ? firms.map(F => `<div class="grp">${esc(F.firm)}<span>${F.tot ? "estate " + esc(haText(F.tot.hat)) + " ha" : F.ha ? fmt(F.ha) + " ha listed" : ""}</span></div>` +
      F.rows.filter(r => r !== F.tot || !/^(estate|company) total$/i.test(r.n)).map(r => `<div class="sub"><span>${r.src && /^https?:/.test(r.src) ? `<a href="${esc(r.src.split(" ")[0])}" target="_blank" rel="noopener">${esc(r.n)}</a>` : esc(r.n)}
        <span class="s" style="color:var(--ol-muted)"> · ${esc(r.where)}${r.own && r.own !== F.firm ? " · owner " + esc(r.own) : ""}</span></span>
        <span style="white-space:nowrap">${esc(haText(r.hat || ""))}${r.ok ? ' <span class="ok">✓</span>' : ""}</span></div>`).join("")).join("")
    : `<div class="more">No named forests ${reg ? "in " + esc(reg) : ""} match.</div>`;
  h += `<div class="grp" style="margin-top:8px">FSC certified forest managers (all NZ)<span>${fmt(certs.reduce((s, c) => s + c.ha, 0))} ha</span></div>` +
    certs.map(c => `<div class="sub"><span><a href="${esc(c.u)}" target="_blank" rel="noopener">${esc(c.h)}</a></span><span>${fmt(c.ha)} ha</span></div>`).join("") +
    `<div class="note">FSC area includes native reserves inside the estates. Expiry dates and NZBNs are in the spreadsheet.</div>`;
  return h;
}
function listOio() {
  const bb = map.getBounds(), v = oioShown().filter(o => bb.contains(o.c)).sort((a, b) => b.m.localeCompare(a.m));
  if (!v.length) return `<div class="more">No overseas forestry buys placed in this view.</div>`;
  return `<div class="note">${v.length} overseas forestry consents placed in view, newest first. 208 of 580 decisions could be placed from their address.</div>` +
    v.map(o => `<div class="it" data-o="${OIO.indexOf(o)}"><span class="sw" style="background:${C.oio};border-radius:50%"></span>
      <span class="m"><div class="t">${esc(o.b || "Buyer not named")}</div><div class="s">${esc(o.m)}${o.s ? " · from " + esc(o.s) : ""}</div></span>
      <span class="n">${o.ha ? fmt(o.ha) + " ha" : ""}</span></div>`).join("");
}
function drawList() {
  document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === S.tab));
  $("list").innerHTML = S.tab === "managers" ? listManagers() : S.tab === "oio" ? listOio() : listBlocks();
}
$("list").addEventListener("click", e => {
  const it = e.target.closest(".it"); if (!it) return;
  if (it.dataset.b) { const b = blocks.find(x => x.id === +it.dataset.b); if (b) pick(b, true); }
  if (it.dataset.o) { const o = OIO[+it.dataset.o]; map.setView(o.c, Math.max(map.getZoom(), 12)); oioMarker(o).openPopup(); }
});
map.on("moveend", () => { if (S.tab !== "managers") drawList(); });
map.on("zoomend", () => { const r = map.getZoom() < 8 ? 3.5 : 5; OIO.forEach(o => o.mk && o.mk.setRadius(r)); });

// ------------------------------------------------------------------ CSV of what is filtered
$("csv").addEventListener("click", () => {
  const head = ["block_id", "type", "region", "district", "forest_ha", "harvest_age_ha", "main_planting_period", "titles", "largest_titles",
    "forestry_right_titles", "crown_forest_licence_titles", "maori_land_ha", "conservation_ha", "overseas_buys_in_or_near", "lat", "lon", "google_maps"];
  const q = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v;
  const rows = shown.slice().sort((a, b) => b.ha - a.ha).map(b => [b.id, KIND_NAME[b.k], R[b.r] || "", D[b.d] || "", b.ha, b.k === 0 ? b.h25 : "",
    b.k === 0 && b.main >= 0 ? AGE_NAME[b.main] : "", b.t, b.tt, b.fr, b.cfl, b.mao, b.con, b.oio, b.c[0], b.c[1],
    `https://www.google.com/maps/@${b.c[0]},${b.c[1]},14z/data=!3m1!1e3`].map(q).join(","));
  const blob = new Blob(["﻿" + [head.join(","), ...rows].join("\r\n")], {type: "text/csv"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "nz_forest_blocks.csv"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ------------------------------------------------------------------ one update for every change
function syncControls() {
  for (const [box, key] of [["f-kind", "kind"], ["f-size", "size"], ["f-age", "age"], ["f-land", "land"]])
    $(box).querySelectorAll(".chip").forEach(c => c.classList.toggle("on", S[key].has(c.dataset.v)));
  $("f-colour").querySelectorAll(".chip").forEach(c => c.classList.toggle("on", c.dataset.v === S.colour));
  regSel.value = String(S.region);
}
function update(zoomTo) {
  syncControls(); draw(); summary(); drawLegend(); drawList(); writeHash();
  if (zoomTo && shown.length && (S.region >= 0 || S.district >= 0)) {
    const bb = L.latLngBounds(shown.map(b => b.ll)); map.fitBounds(bb, {padding: [30, 30], maxZoom: 12});
  }
}
$("q").value = S.q; fillDistricts();
if (S.pin) setPin(L.latLng(S.pin[0], S.pin[1]));
update(S.region >= 0 || S.district >= 0);
if (S.pin) map.fitBounds(pinRing.getBounds());
})().catch(e => { document.getElementById("list").innerHTML = `<div class="more">The map could not load: ${String(e.message || e)}</div>`; console.error(e); });
