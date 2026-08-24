import type { ThreeAssets } from "./threejs-assets";

/**
 * Server-side template for the generateThreeJsReport tool: turns validated
 * chart data into a fully self-contained HTML page (three.js + OrbitControls
 * embedded as base64 importmap entries, so the download works offline).
 *
 * Injection barriers: everything interpolated into markup goes through
 * escapeHtml; the dataset is embedded once as a JSON <script> block with "<"
 * escaped so "</script>" can never break out. The chart script itself is a
 * static string with no interpolation.
 */

export type ThreeJsChartType = "bar3d" | "line3d" | "pie3d" | "scatter3d";

export interface ThreeJsReportInput {
  title: string;
  subtitle?: string;
  chartType: ThreeJsChartType;
  labels?: string[];
  series?: { name: string; values: number[] }[];
  points?: { x: number; y: number; z: number; label?: string }[];
  options?: {
    valueLabel?: string;
    xLabel?: string;
    yLabel?: string;
    zLabel?: string;
  };
  /** Human-readable generation timestamp shown in the footer. */
  generatedAt: string;
}

/**
 * Dark-surface categorical palette (8 slots, CVD-validated adjacent order).
 * The report page is a committed dark design, so only the dark steps ship.
 * Series count is capped at the palette length — hues are never cycled.
 */
export const SERIES_PALETTE = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
  "#9085e9",
  "#e66767",
] as const;

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** JSON safe to embed inside a <script> block: no "<", no line separators. */
function toEmbeddedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
    value,
  );
}

/** Legend chips: series names for bar/line, slice labels for pie. */
function legendEntries(input: ThreeJsReportInput): string[] {
  if (input.chartType === "pie3d") {
    return input.labels ?? [];
  }
  if (input.chartType === "scatter3d") {
    return [];
  }
  return (input.series ?? []).map((s) => s.name);
}

function legendHtml(input: ThreeJsReportInput): string {
  const entries = legendEntries(input);
  if (entries.length < 2) {
    return "";
  }
  const chips = entries
    .map(
      (name, i) =>
        `<span class="chip"><i style="background:${SERIES_PALETTE[i % SERIES_PALETTE.length]}"></i>${escapeHtml(name)}</span>`,
    )
    .join("");
  return `<div class="legend">${chips}</div>`;
}

/** Collapsible data table so the report is readable without WebGL. */
function dataTableHtml(input: ThreeJsReportInput): string {
  let head = "";
  let body = "";
  if (input.chartType === "scatter3d") {
    const o = input.options;
    head =
      `<th>#</th><th>${escapeHtml(o?.xLabel || "x")}</th>` +
      `<th>${escapeHtml(o?.yLabel || "y")}</th><th>${escapeHtml(o?.zLabel || "z")}</th><th>Label</th>`;
    body = (input.points ?? [])
      .map(
        (p, i) =>
          `<tr><td>${i + 1}</td><td>${formatNumber(p.x)}</td><td>${formatNumber(p.y)}</td>` +
          `<td>${formatNumber(p.z)}</td><td>${escapeHtml(p.label ?? "")}</td></tr>`,
      )
      .join("");
  } else {
    const labels = input.labels ?? [];
    const series = input.series ?? [];
    head =
      "<th></th>" +
      series.map((s) => `<th>${escapeHtml(s.name)}</th>`).join("");
    body = labels
      .map(
        (label, row) =>
          `<tr><td>${escapeHtml(label)}</td>` +
          series
            .map((s) => `<td>${formatNumber(s.values[row] ?? 0)}</td>`)
            .join("") +
          "</tr>",
      )
      .join("");
  }
  return (
    '<details class="data-table"><summary>View data</summary>' +
    `<div class="table-scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div></details>`
  );
}

const PAGE_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    background: #0d0d0d;
    color: #ffffff;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  header { padding: 18px 24px 14px; border-bottom: 1px solid rgba(255,255,255,0.10); }
  header h1 { font-size: 19px; font-weight: 650; letter-spacing: -0.01em; }
  header p.subtitle { margin-top: 3px; font-size: 13px; color: #c3c2b7; }
  .legend { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px 14px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #c3c2b7; }
  .chip i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
  #stage { position: relative; flex: 1; min-height: 0; background: #1a1a19; }
  #stage canvas { display: block; }
  #tooltip {
    position: absolute; pointer-events: none; display: none; z-index: 10;
    background: rgba(13,13,13,0.92); border: 1px solid rgba(255,255,255,0.14);
    border-radius: 8px; padding: 8px 10px; font-size: 12px; max-width: 260px;
    box-shadow: 0 4px 18px rgba(0,0,0,0.5);
  }
  #tooltip .t-title { font-weight: 600; }
  #tooltip .t-sub { color: #c3c2b7; margin-top: 1px; }
  #tooltip .t-value { margin-top: 3px; font-variant-numeric: tabular-nums; }
  #hint {
    position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%);
    font-size: 12px; color: #898781; background: rgba(13,13,13,0.75);
    border-radius: 999px; padding: 5px 12px; transition: opacity 0.6s; z-index: 5;
  }
  .data-table {
    position: absolute; left: 14px; bottom: 14px; z-index: 6; font-size: 12px;
    background: rgba(13,13,13,0.92); border: 1px solid rgba(255,255,255,0.14);
    border-radius: 8px; max-width: min(520px, calc(100% - 28px));
  }
  .data-table summary { cursor: pointer; padding: 7px 12px; color: #c3c2b7; user-select: none; }
  .table-scroll { max-height: 240px; overflow: auto; padding: 0 12px 10px; }
  table { border-collapse: collapse; font-variant-numeric: tabular-nums; }
  th, td { text-align: right; padding: 3px 10px; border-bottom: 1px solid rgba(255,255,255,0.08); white-space: nowrap; }
  th:first-child, td:first-child { text-align: left; }
  thead th { color: #898781; font-weight: 600; position: sticky; top: 0; background: #0d0d0d; }
  footer { padding: 9px 24px; font-size: 11.5px; color: #898781; border-top: 1px solid rgba(255,255,255,0.10); }
  noscript { display: block; padding: 24px; color: #c3c2b7; }
`;

/**
 * Static chart renderer. Runs in the report page as a module script; reads the
 * dataset from the JSON block. Deliberately free of template literals so this
 * file's own template literal never needs escaping.
 */
const CHART_SCRIPT = `
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

var DATA = JSON.parse(document.getElementById("chart-data").textContent);
var PALETTE = DATA.palette;
var fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
var unit = (DATA.options && DATA.options.valueLabel) || "";
function fmtValue(v) { return fmt.format(v) + (unit ? " " + unit : ""); }

var container = document.getElementById("stage");
var tooltip = document.getElementById("tooltip");
var hint = document.getElementById("hint");

var renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
container.appendChild(renderer.domElement);

var scene = new THREE.Scene();
scene.background = new THREE.Color("#1a1a19");
scene.fog = new THREE.Fog("#1a1a19", 55, 130); // distances rescaled in frameCamera

var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
var controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.7;
controls.maxPolarAngle = Math.PI * 0.52;
renderer.domElement.addEventListener("pointerdown", function () {
  controls.autoRotate = false;
  if (hint) { hint.style.opacity = "0"; }
}, { once: true });

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
scene.add(new THREE.HemisphereLight(0xdde4ff, 0x22201c, 0.5));
var sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(14, 24, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -30; sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
sun.shadow.bias = -0.0004;
scene.add(sun);

var pickables = [];
var scatterMeta = null;

function makeTextSprite(text, opts) {
  opts = opts || {};
  var px = opts.px || 34;
  var canvas = document.createElement("canvas");
  var ctx = canvas.getContext("2d");
  var font = "600 " + px + 'px system-ui, "Segoe UI", sans-serif';
  ctx.font = font;
  var w = Math.ceil(ctx.measureText(text).width) + 16;
  canvas.width = w;
  canvas.height = px + 14;
  ctx = canvas.getContext("2d");
  ctx.font = font;
  ctx.fillStyle = opts.color || "#c3c2b7";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 8, canvas.height / 2);
  var texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  var material = new THREE.SpriteMaterial({ map: texture, depthWrite: false, transparent: true });
  var sprite = new THREE.Sprite(material);
  var scale = opts.scale || 0.016;
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
  return sprite;
}

function standardMaterial(hex) {
  return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.42, metalness: 0.08 });
}

function addFloor(halfExtent, y) {
  var grid = new THREE.GridHelper(halfExtent * 2, Math.min(halfExtent * 2, 40), 0x383835, 0x2c2c2a);
  grid.position.y = y;
  scene.add(grid);
  var ground = new THREE.Mesh(
    new THREE.PlaneGeometry(halfExtent * 2.4, halfExtent * 2.4),
    new THREE.ShadowMaterial({ opacity: 0.3 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = y - 0.01;
  ground.receiveShadow = true;
  scene.add(ground);
}

function addCategoryLabels(labels, spacing, offsetX, z) {
  var step = Math.max(1, Math.ceil(labels.length / 16));
  for (var i = 0; i < labels.length; i += step) {
    var sprite = makeTextSprite(labels[i], { px: 30 });
    sprite.position.set(i * spacing - offsetX, 0.55, z);
    scene.add(sprite);
  }
}

function addValueAxis(maxValue, x, height) {
  var top = makeTextSprite(fmtValue(maxValue), { px: 30, color: "#898781" });
  top.position.set(x, height + 0.5, 0);
  scene.add(top);
  var zero = makeTextSprite(fmtValue(0), { px: 30, color: "#898781" });
  zero.position.set(x, 0.2, 0);
  scene.add(zero);
}

function frameCamera(extent, lift) {
  var d = extent * 1.55 + 6;
  camera.position.set(d * 0.85, d * 0.62 + (lift || 0), d);
  camera.near = 0.1;
  camera.far = Math.max(500, d * 8);
  controls.target.set(0, lift || 2.5, 0);
  controls.update();
  scene.fog.near = d * 1.6;
  scene.fog.far = d * 4;
  var shadowHalf = extent + 8;
  sun.shadow.camera.left = -shadowHalf; sun.shadow.camera.right = shadowHalf;
  sun.shadow.camera.top = shadowHalf; sun.shadow.camera.bottom = -shadowHalf;
  sun.shadow.camera.updateProjectionMatrix();
}

var CHART_HEIGHT = 9;

function valueScale(series) {
  var maxAbs = 0;
  series.forEach(function (s) {
    s.values.forEach(function (v) { maxAbs = Math.max(maxAbs, Math.abs(v)); });
  });
  return { maxAbs: maxAbs, scale: maxAbs > 0 ? CHART_HEIGHT / maxAbs : 1 };
}

function buildBar() {
  var labels = DATA.labels, series = DATA.series;
  var sx = 1.7, sz = 1.7;
  var offsetX = ((labels.length - 1) * sx) / 2;
  var offsetZ = ((series.length - 1) * sz) / 2;
  var vs = valueScale(series);
  series.forEach(function (s, si) {
    s.values.forEach(function (v, i) {
      var h = v * vs.scale;
      var bar = new THREE.Mesh(
        new THREE.BoxGeometry(1.05, Math.max(Math.abs(h), 0.04), 1.05),
        standardMaterial(PALETTE[si])
      );
      bar.position.set(i * sx - offsetX, h / 2, si * sz - offsetZ);
      bar.castShadow = true;
      bar.receiveShadow = true;
      bar.userData = { title: labels[i], sub: s.name, value: v };
      scene.add(bar);
      pickables.push(bar);
    });
  });
  addFloor(Math.ceil(Math.max(offsetX, offsetZ)) + 3, 0);
  addCategoryLabels(labels, sx, offsetX, offsetZ + 1.8);
  addValueAxis(vs.maxAbs, -offsetX - 2.2, CHART_HEIGHT);
  frameCamera(Math.max(offsetX, offsetZ, CHART_HEIGHT * 0.8), CHART_HEIGHT * 0.35);
}

function buildLine() {
  var labels = DATA.labels, series = DATA.series;
  var sx = 1.7, sz = 2.4;
  var offsetX = ((labels.length - 1) * sx) / 2;
  var offsetZ = ((series.length - 1) * sz) / 2;
  var vs = valueScale(series);
  series.forEach(function (s, si) {
    var pts = s.values.map(function (v, i) {
      return new THREE.Vector3(i * sx - offsetX, v * vs.scale, si * sz - offsetZ);
    });
    if (pts.length > 1) {
      var path = new THREE.CurvePath();
      for (var i = 0; i < pts.length - 1; i++) {
        path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
      }
      var tube = new THREE.Mesh(
        new THREE.TubeGeometry(path, pts.length * 6, 0.1, 10, false),
        standardMaterial(PALETTE[si])
      );
      tube.castShadow = true;
      scene.add(tube);
    }
    pts.forEach(function (p, i) {
      var marker = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 14), standardMaterial(PALETTE[si]));
      marker.position.copy(p);
      marker.castShadow = true;
      marker.userData = { title: labels[i], sub: s.name, value: s.values[i] };
      scene.add(marker);
      pickables.push(marker);
    });
  });
  addFloor(Math.ceil(Math.max(offsetX, offsetZ)) + 3, 0);
  addCategoryLabels(labels, sx, offsetX, offsetZ + 1.8);
  addValueAxis(vs.maxAbs, -offsetX - 2.2, CHART_HEIGHT);
  frameCamera(Math.max(offsetX, offsetZ, CHART_HEIGHT * 0.8), CHART_HEIGHT * 0.35);
}

function buildPie() {
  var labels = DATA.labels;
  var values = DATA.series[0].values;
  var total = values.reduce(function (a, b) { return a + b; }, 0);
  var radius = 5.2, depth = 1.5;
  var start = 0;
  values.forEach(function (v, i) {
    var angle = (v / total) * Math.PI * 2;
    var end = start + angle;
    var shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.absarc(0, 0, radius, start, end, false);
    shape.lineTo(0, 0);
    var geometry = new THREE.ExtrudeGeometry(shape, {
      depth: depth, bevelEnabled: true, bevelThickness: 0.05,
      bevelSize: 0.05, bevelSegments: 2, curveSegments: 48
    });
    geometry.rotateX(-Math.PI / 2);
    var slice = new THREE.Mesh(geometry, standardMaterial(PALETTE[i % PALETTE.length]));
    var mid = (start + end) / 2;
    slice.position.set(Math.cos(mid) * 0.16, 0, -Math.sin(mid) * 0.16);
    slice.castShadow = true;
    slice.receiveShadow = true;
    var pct = ((v / total) * 100).toFixed(1) + "%";
    slice.userData = { title: labels[i], sub: pct + " of total", value: v };
    scene.add(slice);
    pickables.push(slice);
    if (v / total >= 0.04) {
      var sprite = makeTextSprite(labels[i] + " - " + pct, { px: 30 });
      sprite.position.set(Math.cos(mid) * radius * 0.72, depth + 0.7, -Math.sin(mid) * radius * 0.72);
      scene.add(sprite);
    }
    start = end;
  });
  addFloor(Math.ceil(radius) + 3, -0.4);
  frameCamera(radius * 1.15, 1.2);
}

function buildScatter() {
  var points = DATA.points;
  var half = 6;
  function extent(get) {
    var min = Infinity, max = -Infinity;
    points.forEach(function (p) {
      var v = get(p);
      if (v < min) { min = v; }
      if (v > max) { max = v; }
    });
    var span = max - min || 1;
    return { min: min, span: span };
  }
  var ex = extent(function (p) { return p.x; });
  var ey = extent(function (p) { return p.y; });
  var ez = extent(function (p) { return p.z; });
  function norm(v, e) { return ((v - e.min) / e.span) * half * 2 - half; }

  var geometry = new THREE.SphereGeometry(0.24, 16, 12);
  var mesh = new THREE.InstancedMesh(geometry, standardMaterial(PALETTE[0]), points.length);
  mesh.castShadow = true;
  var m = new THREE.Matrix4();
  scatterMeta = points.map(function (p, i) {
    m.setPosition(norm(p.x, ex), norm(p.y, ey) + half + 0.5, norm(p.z, ez));
    mesh.setMatrixAt(i, m);
    return {
      title: p.label || "Point " + (i + 1),
      sub: "x " + fmt.format(p.x) + " / y " + fmt.format(p.y) + " / z " + fmt.format(p.z),
      value: null
    };
  });
  scene.add(mesh);
  pickables.push(mesh);

  addFloor(half + 3, 0);
  var o = DATA.options || {};
  var axisDefs = [
    { text: o.xLabel || "x", pos: [half + 1.8, 0.3, 0] },
    { text: o.yLabel || "y", pos: [-half - 1.4, half * 2 + 1.2, 0] },
    { text: o.zLabel || "z", pos: [0, 0.3, half + 1.8] }
  ];
  axisDefs.forEach(function (def) {
    var sprite = makeTextSprite(def.text, { px: 32, color: "#898781" });
    sprite.position.set(def.pos[0], def.pos[1], def.pos[2]);
    scene.add(sprite);
  });
  frameCamera(half * 1.6, half);
}

if (DATA.chartType === "bar3d") { buildBar(); }
else if (DATA.chartType === "line3d") { buildLine(); }
else if (DATA.chartType === "pie3d") { buildPie(); }
else { buildScatter(); }

var raycaster = new THREE.Raycaster();
var pointer = new THREE.Vector2();
var hovered = null;

function clearHover() {
  if (hovered && hovered.material && hovered.material.emissive) {
    hovered.material.emissive.setHex(0x000000);
  }
  hovered = null;
  tooltip.style.display = "none";
  renderer.domElement.style.cursor = "";
}

renderer.domElement.addEventListener("pointermove", function (event) {
  var rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  var hits = raycaster.intersectObjects(pickables, false);
  if (!hits.length) { clearHover(); return; }
  var hit = hits[0];
  var data = hit.object.userData;
  if (hit.object.isInstancedMesh && scatterMeta && hit.instanceId != null) {
    data = scatterMeta[hit.instanceId];
  }
  if (!data || data.title == null) { clearHover(); return; }
  if (hovered !== hit.object) {
    clearHover();
    hovered = hit.object;
    if (!hit.object.isInstancedMesh && hovered.material.emissive) {
      hovered.material.emissive.setHex(0x2a2a2a);
    }
  }
  var html = '<div class="t-title">' + escapeText(data.title) + "</div>";
  if (data.sub) { html += '<div class="t-sub">' + escapeText(data.sub) + "</div>"; }
  if (data.value != null) { html += '<div class="t-value">' + escapeText(fmtValue(data.value)) + "</div>"; }
  tooltip.innerHTML = html;
  tooltip.style.display = "block";
  var tx = event.clientX - rect.left + 14;
  var ty = event.clientY - rect.top + 14;
  if (tx + tooltip.offsetWidth > rect.width - 8) { tx -= tooltip.offsetWidth + 26; }
  if (ty + tooltip.offsetHeight > rect.height - 8) { ty -= tooltip.offsetHeight + 26; }
  tooltip.style.left = tx + "px";
  tooltip.style.top = ty + "px";
  renderer.domElement.style.cursor = "pointer";
});
renderer.domElement.addEventListener("pointerleave", clearHover);

function escapeText(value) {
  var div = document.createElement("div");
  div.textContent = String(value);
  return div.innerHTML;
}

function resize() {
  var width = container.clientWidth;
  var height = container.clientHeight;
  renderer.setSize(width, height);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(container);
resize();

renderer.setAnimationLoop(function () {
  controls.update();
  renderer.render(scene, camera);
});
`;

export function buildThreeJsReportHtml(
  input: ThreeJsReportInput,
  assets: ThreeAssets,
): string {
  const payload = {
    chartType: input.chartType,
    labels: input.labels,
    series: input.series,
    points: input.points,
    options: input.options,
    palette: SERIES_PALETTE,
  };
  const importMap = {
    imports: {
      three: `data:text/javascript;base64,${assets.threeModuleBase64}`,
      "three-core": `data:text/javascript;base64,${assets.threeCoreBase64}`,
      "three/addons/controls/OrbitControls.js": `data:text/javascript;base64,${assets.orbitControlsBase64}`,
    },
  };
  const title = escapeHtml(input.title);
  const subtitle = input.subtitle
    ? `<p class="subtitle">${escapeHtml(input.subtitle)}</p>`
    : "";
  const valueUnit = input.options?.valueLabel
    ? ` · Values in ${escapeHtml(input.options.valueLabel)}`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${title}</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<header>
<h1>${title}</h1>
${subtitle}
${legendHtml(input)}
</header>
<div id="stage">
<div id="tooltip"></div>
<div id="hint">Drag to rotate · scroll to zoom · hover for values</div>
${dataTableHtml(input)}
</div>
<footer>Generated ${escapeHtml(input.generatedAt)}${valueUnit} · Interactive 3D report</footer>
<noscript>This report needs JavaScript to render the 3D chart. The data table above the footer is still readable in the page source.</noscript>
<script type="application/json" id="chart-data">${toEmbeddedJson(payload)}</script>
<script type="importmap">${toEmbeddedJson(importMap)}</script>
<script type="module">${CHART_SCRIPT}</script>
</body>
</html>
`;
}
