// Copied from AquilaLens public/map/base.js (OpenLedger docs/map-stack, 2026-11-23) for the ForestMap page.
// base.js - the background every map on the site shares (Mike 2026-10-22: the company pages' maps "as simple as the
// main map", plus topography and satellite). window.olBaseMap(map, credit) adds three backgrounds with a switch in
// the top right corner; Simple shows first. Every map zooms with the mouse wheel, and the smaller ones (company,
// group, owner) get a "Full screen" button that spreads the map over the whole page (Mike 2026-10-22: "like the org
// chart ... just make it easy to use"); Esc or the button again puts it back. olBaseMap(map, credit, {full: false})
// leaves the button off: /map and /industry put the whole page panel full screen instead (olFullPage).
//   Simple       OpenFreeMap's free OpenStreetMap tiles drawn by protomaps-leaflet in our own colours (no shop icons) -
//                a plain canvas, Mike's Chrome has no WebGL (moved here from map.js)
//   Topographic  OpenTopoMap (contours and hill shading, CC-BY-SA; their fair-use policy, no key)
//   Satellite    Esri World Imagery (no key; credit shown)
// Needs Leaflet (window.L) and protomaps-leaflet (window.protomapsL) loaded first.
(function () {
// ---------------------------------------------------------------- the house look and the data colours, once
// House colours are CSS variables in /house.css (the same values as tailwind.config.ts); this file makes sure the page
// has it and reads a value for canvas drawing with olHouse("brass"). The data colours (owner types, industries, CRM
// statuses, ranks...) are OL_VIZ below: map.js and industry.js both read them from here (2026-10-27 design review:
// each file had its own copy). The few that CSS needs are also set as --viz-* variables on the page.
// (ForestMap copy, 2026-11-23: the house colours are set in index.html, not /house.css)
const houseCache = {};
// 2026-10-28 dark mode: house.css writes its colours as rgb(R G B) channels; canvas, Leaflet and the "${c}22" tints
// want hex, so a value comes back as hex as before
const toHex = v => { const m = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  return m ? "#" + m.slice(1, 4).map(n => (+n).toString(16).padStart(2, "0")).join("") : v; };
window.olHouse = name => {
  if (houseCache[name]) return houseCache[name];
  const v = toHex(getComputedStyle(document.documentElement).getPropertyValue("--ol-" + name).trim());
  if (v) houseCache[name] = v;
  return v;
};
// dark: the Account menu's Dark, or the computer's setting under System (data-theme is set before first paint by the
// script in src/app/layout.tsx). The maps and charts are drawn once in the page's theme; choosing a theme reloads.
const dark = window.olDark = () => { const t = document.documentElement.getAttribute("data-theme");
  return t ? t === "dark" : !!(window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches); };
const VIZ = window.OL_VIZ = {
  none: "#b0b4bb",       // not known / no data
  other: "#9aa0a8",      // everyone outside the ranked few
  dim: "#c4c8cf",        // faded behind a picked item
  // owner types: [dot, darker shade for text on its own tint (5:1+)]
  own: {f: ["#2f6fde", "#2557ad"], c: ["#7a4fd6", "#6642b4"], p: ["#d9772b", "#8b4c1c"], o: ["#c9423a", "#9f342e"],
        w: ["#1f8a8a", "#176565"], h: ["#3c6e91", "#2c526c"], i: ["#b8860b", "#785707"], "": ["#b0b4bb", "#5d5f63"]},   // h Widely held (2026-10-29)
  ind: {"Construction & Trades": "#d9772b", "Professional Services": "#2f6fde", "Retail": "#d4537e", "Manufacturing": "#6b7280",
    "Services": "#0f8a9d", "Healthcare": "#c9423a", "Food & Beverage": "#b8860b", "Hospitality & Tourism": "#7a4fd6", "Technology": "#3c6e91",
    "Automotive": "#475569", "Education & Training": "#1f9d6b", "Financial Services": "#14532d", "Property": "#8a5a44", "Agriculture": "#5f7d1e",
    "Transport & Logistics": "#a0522d", "Cleaning": "#20b2aa", "Other": "#9ca3af", "": "#9ca3af"},
  // the CRM status = src/components/StatusPill.tsx's tones on the house scales: grey not started, teal in touch, gold
  // waiting, charcoal our move, green meeting / client, red closed (2026-10-28 audit: Contacted was blue here, teal there)
  status: {"Not contacted": "#a9b0b7", "Contacted": "#0f7a72", "No response": "#a0813f", "Voicemail": "#a0813f",
    "Gatekeeper": "#a0813f", "Call back": "#2b3138", "Send info": "#2b3138", "Meeting booked": "#2d6e43", "Client": "#1f5f35",
    "Not interested": "#a3412f", "Wrong number": "#a3412f", "Do not contact": "#7e2e21"},
  rev: {"4": "#0b4a2c", "3": "#1f8a52", "2": "#6cbf84", "1": "#c4dfb0"},          // revenue band, dark = big
  holds: {"3": "#7a1f1f", "2": "#c9423a", "1": "#efa07e"},                       // owner's companies, dark = many
  // the top 8 players on /industry: one teal ramp, darkest = biggest
  // the top 8 Industry players: hues far apart (Mike 2026-11-04 "more distinct, not just shades of green"), #1 first
  rank: ["#1f6fb8", "#d9581a", "#1a8a52", "#b8307f", "#6f45c9", "#a87a08", "#c62f2f", "#0f7d84"],
  // for sale / sold rings and tags (Listing Match)
  sale: {now: "#e11d48", nowText: "#9f1239", nowTint: "#fde7ec", sold: "#334155", soldText: "#1e293b", soldTint: "#e2e8f0",
         noText: "#5f5e5a", noTint: "#f1efe8", list: "#be123c"},
  // the radius / drive-time tool: violet, so it never reads as a filter or a pick
  tool: {ring: "#7a4fd6", ink: "#5a3aa8", tint: "#f5f1fd", tint2: "#efe9fb", line: "#d9cdf3", line2: "#b9a6ea"},
  heat: {.2: "#3b82f6", .45: "#22c55e", .65: "#facc15", .85: "#f97316", 1: "#dc2626"},
  net: "#4a5a7a",        // franchise / group network note on a card
  player: "#c9423a",     // rings on a player's sites (Industry -> Map)
  saved: "#1f5f35", savedTint: "#eef7f0", savedLine: "#cfe3d3",                  // "Saved search" badge
  // the Simple background map
  base: {wood: "#e6eedd", park: "#e3ecd9", town: "#f1eee8", water: "#cfdfe8", building: "#e7e3dc", buildingLine: "#d8d2c7",
         road: "#ffffff", main: "#fbf3df", motorway: "#f3dcb4", land: "#f6f4ef", label: "#5b6270", city: "#2b313c",
         street: "#6b7280", waterLabel: "#6b8aa3"},
};
// 2026-10-28 dark mode: the same names in dark. The marks keep their hue and are lifted (or dimmed) so each stands out
// from the dark land as much as it did from the light one; text colours are 4.5:1+ on their tints; the ramps (revenue,
// owner's companies, the top 8) still go from quiet to strong, so in dark strong = bright. The Simple map is redrawn in
// deep warm greys with dark-blue water; topographic and satellite stay as they are (photos).
const DARK = {
  none: "#4f5259", other: "#53585f", dim: "#383b40",
  own: {f: ["#3b7cec", "#73a7fe"], c: ["#976ff9", "#b199ff"], p: ["#b25800", "#da9566"], o: ["#dc544a", "#f9867a"],
        w: ["#138384", "#6ab1b0"], i: ["#926a04", "#c4a15d"], "": ["#6d7177", "#a5a7ab"]},
  ind: {"Construction & Trades": "#b25800", "Professional Services": "#3b7cec", "Retail": "#c34470", "Manufacturing": "#7a818f",
    "Services": "#088193", "Healthcare": "#dc544a", "Food & Beverage": "#926a04", "Hospitality & Tourism": "#976ff9", "Technology": "#5d90b4",
    "Automotive": "#96a6bc", "Education & Training": "#048155", "Financial Services": "#84c295", "Property": "#b6836b", "Agriculture": "#6b8a2d",
    "Transport & Logistics": "#c97752", "Cleaning": "#047f79", "Other": "#6b717c", "": "#6b717c"},
  status: {"Not contacted": "#4c5359", "Contacted": "#35948b", "No response": "#886925", "Voicemail": "#886925",
    "Gatekeeper": "#886925", "Call back": "#b5bdc5", "Send info": "#b5bdc5", "Meeting booked": "#60a172", "Client": "#73b384",
    "Not interested": "#df7762", "Wrong number": "#df7762", "Do not contact": "#f99c8b"},
  rev: {"4": "#6dcf92", "3": "#42a56c", "2": "#14844c", "1": "#006939"},
  holds: {"3": "#ff9386", "2": "#e0574d", "1": "#b32c27"},
  rank: ["#5aa6ee", "#f08a4b", "#4cc184", "#e36bb2", "#a487f0", "#d9ac3a", "#ef6a6a", "#3fb8bf"],
  sale: {now: "#ef3053", nowText: "#fe9ea7", nowTint: "#492427", sold: "#acbdd5", soldText: "#deebff", soldTint: "#3c3d3e",
         noText: "#a4a39e", noTint: "#2d2a25", list: "#ff5b6f"},
  tool: {ring: "#976ff9", ink: "#bfb3ff", tint: "#322a37", tint2: "#3b3149", line: "#524075", line2: "#6950a1"},
  net: "#97aacd", player: "#dc544a",
  saved: "#70ab7f", savedTint: "#2c3027", savedLine: "#374637",
  base: {wood: "#1f2620", park: "#212a20", town: "#22211d", water: "#1b2730", building: "#2a2823", buildingLine: "#36332d",
         road: "#34312b", main: "#4a4333", motorway: "#6b5737", land: "#1c1b18", label: "#aaa294", city: "#e6e0d4",
         street: "#958e82", waterLabel: "#7896ad"},
};
if (dark()) Object.assign(VIZ, DARK);
VIZ.dark = dark();   // the few words that name a shade ("darkest = #1") read this
{ const r = document.documentElement.style, v = (k, c) => r.setProperty("--viz-" + k, c);
  v("tool", VIZ.tool.ring); v("tool-ink", VIZ.tool.ink); v("tool-tint", VIZ.tool.tint); v("tool-tint2", VIZ.tool.tint2);
  v("tool-line", VIZ.tool.line); v("tool-line2", VIZ.tool.line2);
  v("sale-now", VIZ.sale.now); v("sale-now-text", VIZ.sale.nowText); v("sale-now-tint", VIZ.sale.nowTint);
  v("sale-sold", VIZ.sale.sold); v("sale-sold-text", VIZ.sale.soldText); v("sale-sold-tint", VIZ.sale.soldTint);
  v("sale-no-text", VIZ.sale.noText); v("sale-no-tint", VIZ.sale.noTint); v("sale-list", VIZ.sale.list);
  v("net", VIZ.net); v("saved", VIZ.saved); v("saved-tint", VIZ.savedTint); v("saved-line", VIZ.savedLine);
  v("heat", `linear-gradient(90deg, ${Object.values(VIZ.heat).join(", ")})`); }

// New Zealand, mainland and Stewart Island (the maps open on it, fitted to the window - a fixed centre and zoom left
// Northland off a phone screen, 2026-10-27 review)
window.OL_NZ = [[-47.4, 166.3], [-34.3, 178.6]];
const calm = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
window.olCalm = calm;
// (a little more room at the foot, where the map credit sits over Stewart Island on a phone). Until the reader or the
// page moves the map, it fits again whenever its box changes size (the page's CSS arriving after the map was made, a
// phone turned on its side).
window.olFitNZ = map => {
  let mine = false;
  const fit = () => { mine = true; map.fitBounds(window.OL_NZ, {paddingTopLeft: [10, 10], paddingBottomRight: [10, 34], animate: false}); mine = false; };
  fit();
  if (!window.ResizeObserver) return;
  const box = map.getContainer(), ro = new ResizeObserver(() => { if (box.clientWidth && box.clientHeight) { map.invalidateSize({pan: false}); fit(); } });
  const stop = () => { ro.disconnect(); ["pointerdown", "wheel", "keydown"].forEach(ev => box.removeEventListener(ev, stop)); map.off("movestart", other); };
  const other = () => { if (!mine) stop(); };   // a focus, a drawn area or a radius from the address bar moved it
  ro.observe(box);
  ["pointerdown", "wheel", "keydown"].forEach(ev => box.addEventListener(ev, stop, {passive: true}));
  map.on("movestart", other);
  map.on("unload", stop);
};
// reduced motion: every pan, zoom and fly on this map jumps instead of gliding (setView covers fitBounds, panTo and
// zoom buttons; panBy covers a card's auto-pan; flyTo becomes a jump); read on each call, so a change in the setting
// takes effect at once
function calmMap(map) {
  const sv = map.setView, pb = map.panBy, fl = map.flyTo, fb = map.flyToBounds;
  map.setView = function (c, z, o) { return sv.call(this, c, z, calm() ? {...o, animate: false} : o); };
  map.panBy = function (off, o) { return pb.call(this, off, calm() ? {...o, animate: false} : o); };
  map.flyTo = function (c, z, o) { return calm() ? this.setView(c, z, {animate: false}) : fl.call(this, c, z, o); };
  map.flyToBounds = function (b, o) { return calm() ? this.fitBounds(b, {...o, animate: false}) : fb.call(this, b, o); };
  if (calm()) { map._zoomAnimated = false; map._fadeAnimated = false; map.options.inertia = false; }
}
const P = protomapsL, cls = (...c) => (z, f) => c.includes(f.props.class), W = b => z => b * Math.pow(1.45, z - 12);
const paintRules = [
  {dataLayer: "landcover", filter: cls("wood", "forest"), symbolizer: new P.PolygonSymbolizer({fill: VIZ.base.wood})},
  {dataLayer: "park", symbolizer: new P.PolygonSymbolizer({fill: VIZ.base.park})},
  {dataLayer: "landuse", minzoom: 12, filter: cls("residential", "suburb", "neighbourhood"), symbolizer: new P.PolygonSymbolizer({fill: VIZ.base.town})},
  {dataLayer: "water", symbolizer: new P.PolygonSymbolizer({fill: VIZ.base.water})},
  {dataLayer: "waterway", minzoom: 9, symbolizer: new P.LineSymbolizer({color: VIZ.base.water, width: z => z < 13 ? 1 : 2})},
  {dataLayer: "building", minzoom: 14, symbolizer: new P.PolygonSymbolizer({fill: VIZ.base.building, stroke: VIZ.base.buildingLine, width: .6})},
  {dataLayer: "transportation", minzoom: 13, filter: cls("minor", "service"), symbolizer: new P.LineSymbolizer({color: VIZ.base.road, width: W(2.2), lineCap: "round"})},
  {dataLayer: "transportation", minzoom: 10, filter: cls("tertiary"), symbolizer: new P.LineSymbolizer({color: VIZ.base.road, width: W(3), lineCap: "round"})},
  {dataLayer: "transportation", minzoom: 7, filter: cls("primary", "secondary"), symbolizer: new P.LineSymbolizer({color: VIZ.base.main, width: W(3.6), lineCap: "round"})},
  {dataLayer: "transportation", filter: cls("motorway", "trunk"), symbolizer: new P.LineSymbolizer({color: VIZ.base.motorway, width: W(4.2), lineCap: "round"})},
];
const halo = {fill: VIZ.base.label, stroke: VIZ.base.land, width: 2.5, fontFamily: '"IBM Plex Sans", system-ui, sans-serif'};
const labelRules = [
  {dataLayer: "place", filter: cls("city"), symbolizer: new P.CenteredTextSymbolizer({...halo, fill: VIZ.base.city, fontWeight: 600, fontSize: z => z < 8 ? 13 : 15})},
  {dataLayer: "place", minzoom: 8, filter: cls("town"), symbolizer: new P.CenteredTextSymbolizer({...halo, fontWeight: 600, fontSize: 12.5})},
  {dataLayer: "place", minzoom: 11, filter: cls("village", "suburb"), symbolizer: new P.CenteredTextSymbolizer({...halo, fontSize: 12})},
  {dataLayer: "place", minzoom: 14, filter: cls("neighbourhood", "hamlet"), symbolizer: new P.CenteredTextSymbolizer({...halo, fontSize: 11})},
  {dataLayer: "transportation_name", minzoom: 14, symbolizer: new P.LineLabelSymbolizer({...halo, fill: VIZ.base.street, fontSize: 11})},
  {dataLayer: "water_name", minzoom: 9, symbolizer: new P.CenteredTextSymbolizer({...halo, fill: VIZ.base.waterLabel, fontStyle: "italic", fontSize: 11.5})},
];

const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
let planet = null;   // the tile URL carries OpenFreeMap's build date: fetch it once per page
let styled = false;
function fsStyle() {
  if (styled) return;
  styled = true;
  const css = document.createElement("style");
  css.textContent = ".ol-full{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;" +
    "z-index:1100!important;margin:0!important;border-radius:0!important;border:0!important;overflow:auto}" +
    ".ol-fs{background:var(--ol-card);border:2px solid rgba(0,0,0,.2);border-radius:var(--ol-r-lg);padding:5px 9px;font:600 12px var(--ol-font);" +
    "color:var(--ol-charcoal);cursor:pointer;background-clip:padding-box;white-space:nowrap}.ol-fs:hover{background:var(--ol-chip)}";
  document.head.appendChild(css);
}
// one Full screen switch: box spreads over the whole window, Esc or the button again puts it back. remember = a key to
// keep the choice in this browser (the /map and /industry pages open full screen again once it was on - Mike 2026-11-04
// "make this be full screen").
function fsToggle(box, btn, resize, remember) {
  fsStyle();
  let on = false;
  // the button also takes the browser itself full screen (Mike 2026-11-05: "remove the browser stuff at the top"); a
  // browser only allows that from a click, so a remembered full screen on load fills the window only. Leaving the
  // browser's full screen (its own Esc) closes ours too.
  const real = v => { try {
    if (v && !document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    if (!v && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  } catch (e) { /* no full screen here */ } };
  const set = (v, click) => {
    if (click) real(v);
    on = v;
    box.classList.toggle("ol-full", on);
    document.body.style.overflow = on ? "hidden" : "";
    btn.textContent = on ? "✕ Close full screen" : "⛶ Full screen";
    btn.setAttribute("aria-pressed", String(on));
    if (remember) try { localStorage.setItem(remember, on ? "1" : ""); } catch (e) { /* private window */ }
    setTimeout(resize, 50);
  };
  const esc = e => { if (e.key === "Escape" && on) set(false, true); };
  const left = () => { if (!document.fullscreenElement && on) set(false); };
  document.addEventListener("keydown", esc);
  document.addEventListener("fullscreenchange", left);
  btn.type = "button";
  btn.textContent = "⛶ Full screen";
  btn.addEventListener("click", () => set(!on, true));
  let was = false;
  if (remember) try { was = localStorage.getItem(remember) === "1"; } catch (e) { /* private window */ }
  if (was) set(true);
  return () => { document.removeEventListener("keydown", esc); document.removeEventListener("fullscreenchange", left);
    if (on) { document.body.style.overflow = ""; real(false); } };
}
function fullScreen(map) {
  const btn = L.DomUtil.create("button", "ol-fs");
  L.DomEvent.disableClickPropagation(btn);
  const off = fsToggle(map.getContainer(), btn, () => map.invalidateSize());
  map.on("unload", off);
  const Ctl = L.Control.extend({onAdd() { return btn; }});
  new Ctl({position: "topleft"}).addTo(map);
}
// the big pages (/map, /industry): the whole panel - filters, map and list - goes full screen, the button sits in its
// header bar (Mike 2026-11-04: "make this be full screen and all of the other maps too")
window.olFullPage = function (map, box, head, key) {
  const btn = document.createElement("button");
  btn.className = "ol-fs";
  head.appendChild(btn);
  map.on("unload", fsToggle(box, btn, () => map.invalidateSize(), key));
};

window.olBaseMap = function (map, credit, opts) {
  // gentler scroll zoom on every map (Mike 2026-10-26: "it moves too far each time"): a wheel notch was a whole zoom
  // level (2x) or two; now ~half a level, in quarter-level steps. Leaflet reads these on each wheel turn.
  map.options.zoomSnap = 0.25;
  map.options.wheelPxPerZoomLevel = 180;
  map.scrollWheelZoom.enable();
  calmMap(map);
  if (!opts || opts.full !== false) fullScreen(map);
  const simple = L.layerGroup();
  (planet = planet || fetch("https://tiles.openfreemap.org/planet").then(r => r.json())).then(tj => {
    simple.addLayer(P.leafletLayer({url: tj.tiles[0], maxDataZoom: 14, paintRules, labelRules, backgroundColor: VIZ.base.land,
      attribution: OSM + " · OpenFreeMap"}));
  });
  const topo = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {subdomains: "abc", maxNativeZoom: 17, maxZoom: 19,
    attribution: OSM + " · SRTM · style &copy; <a href=\"https://opentopomap.org\">OpenTopoMap</a> (CC-BY-SA)"});
  // Streets: main roads stand out in colour, with road names (Mike 2026-11-05: "is there one that shows the main roads")
  const streets = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    {maxNativeZoom: 19, maxZoom: 19, attribution: "Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors"});
  const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {maxNativeZoom: 19, maxZoom: 19, attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics"});
  simple.addTo(map);
  L.control.layers({"Simple": simple, "Streets": streets, "Topographic": topo, "Satellite": sat}, null, {position: "topright"}).addTo(map);
  if (credit) map.attributionControl.addAttribution(credit);
};
})();
