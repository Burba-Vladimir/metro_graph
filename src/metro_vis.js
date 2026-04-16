// ── Node index ────────────────────────────────────────────────────────────────
const nodeById = {};
GRAPH_DATA.nodes.forEach(n => {
  n.x = (Math.random() - 0.5) * 100;
  n.y = (Math.random() - 0.5) * 100;
  n.isRing   = false;
  n.ringName = null;
  nodeById[n.id] = n;
});

// ── Ring setup ────────────────────────────────────────────────────────────────
// We drive ring SIZE purely from physics: intra-ring links have rest-length
// RING_CHORD, so the equilibrium radius is r = RING_CHORD / (2·sin(π/n)).
// With RING_CHORD = 45 px:
//   L5  (12 stations) → r ≈  86 px
//   L11 (29 stations) → r ≈ 207 px  }  similar → can overlap as in real life
//   MCC (31 stations) → r ≈ 222 px  }
const RING_CHORD = 45;

GRAPH_DATA.rings.forEach(ring => {
  const n     = ring.stations.length;
  const initR = (n * RING_CHORD) / (2 * Math.PI);
  ring._radius = initR;                        // updated dynamically each tick

  ring.stations.forEach((sid, i) => {
    const nd = nodeById[sid];
    if (!nd) return;
    // Initialise going COUNTERCLOCKWISE in SVG coords (= clockwise on a
    // standard north-up map, matching the real Moscow metro direction).
    const angle = -(2 * Math.PI * i / n) - Math.PI / 2;
    nd.x       = initR * Math.cos(angle);
    nd.y       = initR * Math.sin(angle);
    nd.isRing  = true;
    nd.ringName = ring.name;
  });
});

// ── Helper: intra-ring sequential link? ──────────────────────────────────────
function isRingLine(d) {
  const sid = d.source.id !== undefined ? d.source.id : d.source;
  const tid = d.target.id !== undefined ? d.target.id : d.target;
  const sn  = nodeById[sid];
  const tn  = nodeById[tid];
  return d.type === 'line' && sn && tn && sn.isRing && tn.isRing
         && sn.ringName === tn.ringName;
}

// ── Hard circular projection ──────────────────────────────────────────────────
// Runs every tick after physics.  Enforces:
//  1. All ring nodes lie on a circle with centre = centroid.
//  2. Radius is computed from the average adjacent chord length (dynamic).
//  3. Station order goes counterclockwise in SVG (= clockwise on map).
//  4. Global phase (rotation) is the best fit to current positions.
function projectRings() {
  GRAPH_DATA.rings.forEach((ring, ri) => {
    const n  = ring.stations.length;
    const rn = ring.stations.map(id => nodeById[id]).filter(Boolean);
    if (!rn.length) return;

    // All pinned → ring is being dragged; just refresh the guide circle.
    if (rn.every(nd => nd.fx != null)) {
      const cx = rn.reduce((s, nd) => s + nd.fx, 0) / rn.length;
      const cy = rn.reduce((s, nd) => s + nd.fy, 0) / rn.length;
      const r  = rn.reduce((s, nd) => s + Math.hypot(nd.fx - cx, nd.fy - cy), 0) / rn.length;
      ring._radius = r;
      if (guideCircles[ri]) guideCircles[ri].attr('cx', cx).attr('cy', cy).attr('r', r);
      return;
    }

    // ── Centroid ──────────────────────────────────────────────────────────
    let cx = 0, cy = 0;
    rn.forEach(nd => { cx += nd.x || 0; cy += nd.y || 0; });
    cx /= rn.length; cy /= rn.length;

    // ── Dynamic radius from average adjacent chord ────────────────────────
    let sumChord = 0;
    for (let i = 0; i < n; i++) {
      const a = rn[i], b = rn[(i + 1) % n];
      sumChord += Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0));
    }
    const avgChord = sumChord / n;
    const minR     = (n * RING_CHORD * 0.4) / (2 * Math.PI);
    const rawR     = Math.max(avgChord / (2 * Math.sin(Math.PI / n)), minR);
    // EMA smoothing (90 % memory) to damp frame-to-frame jitter
    ring._radius   = 0.90 * ring._radius + 0.10 * rawR;
    const radius   = ring._radius;

    // ── Best-fit global phase (counterclockwise convention: -2π·i/n) ─────
    // For each node i, the "ideal" angle is θ - 2π·i/n.
    // So the offset from the ideal position is: atan2(y-cy, x-cx) + 2π·i/n.
    // We find θ as the circular mean of those offsets.
    let sinS = 0, cosS = 0;
    rn.forEach((nd, i) => {
      const phi = Math.atan2((nd.y || 0) - cy, (nd.x || 0) - cx)
                  + (2 * Math.PI * i / n);   // note: +, because direction is −
      sinS += Math.sin(phi);
      cosS += Math.cos(phi);
    });
    const theta = Math.atan2(sinS, cosS);

    // ── Snap free nodes to the circle ─────────────────────────────────────
    rn.forEach((nd, i) => {
      if (nd.fx != null) return;
      const angle = theta - (2 * Math.PI * i / n);   // counterclockwise
      nd.x = cx + radius * Math.cos(angle);
      nd.y = cy + radius * Math.sin(angle);
    });

    if (guideCircles[ri]) {
      guideCircles[ri].attr('cx', cx).attr('cy', cy).attr('r', radius);
    }
  });
}

// ── SVG & zoom ────────────────────────────────────────────────────────────────
const svg = d3.select('#svg-container');
const W = window.innerWidth, H = window.innerHeight;
svg.attr('width', W).attr('height', H);

// ── Rotation state ────────────────────────────────────────────────────────────
let rotationDeg = 0;
const rotWrapper = svg.append('g').attr('id', 'rot-wrapper');

function applyRotation() {
  rotWrapper.attr('transform',
    'rotate(' + rotationDeg + ',' + (W / 2) + ',' + (H / 2) + ')');
}
applyRotation();

const zoomBehavior = d3.zoom()
  .scaleExtent([0.1, 8])
  .on('zoom', e => g.attr('transform', e.transform));
svg.call(zoomBehavior);

const g = rotWrapper.append('g');
svg.call(zoomBehavior.transform, d3.zoomIdentity.translate(W / 2, H / 2));

// Dashed guide circles — radius is updated every tick
const guideLayer = g.append('g');
const guideCircles = GRAPH_DATA.rings.map(ring =>
  guideLayer.append('circle')
    .attr('class', 'ring-guide')
    .attr('r',  ring._radius || 100)
    .attr('cx', 0).attr('cy', 0)
);

// ── Edges ─────────────────────────────────────────────────────────────────────
const linkLayer = g.append('g');
const linkEl = linkLayer.selectAll('line')
  .data(GRAPH_DATA.links)
  .join('line')
  .attr('class', d => d.type === 'transfer' ? 'link-transfer' : 'link-line')
  .each(function(d) {
    if (d.type === 'line') {
      const src = nodeById[d.source.id || d.source];
      d3.select(this).attr('stroke', src ? src.lineColor : '#888').attr('stroke-width', 2);
    } else {
      d3.select(this).attr('stroke-width', 1.2);
    }
  });

// ── Nodes ─────────────────────────────────────────────────────────────────────
let ringDragData = null;

const nodeLayer = g.append('g');
const nodeEl = nodeLayer.selectAll('.node')
  .data(GRAPH_DATA.nodes)
  .join('g')
  .attr('class', 'node')
  .call(d3.drag()
    .on('start', dragStart)
    .on('drag',  dragged)
    .on('end',   dragEnd))
  .on('mouseover', showTooltip)
  .on('mousemove', moveTooltip)
  .on('mouseout',  hideTooltip);

// Invisible larger circle for easier mouse targeting
nodeEl.append('circle')
  .attr('r', 10)
  .attr('fill', 'transparent')
  .style('pointer-events', 'all');
// Visible dot
nodeEl.append('circle')
  .attr('r',    d => d.isRing ? 5 : 4)
  .attr('fill', d => d.lineColor)
  .style('pointer-events', 'none');
nodeEl.append('text').attr('x', 7).attr('y', 4).text(d => d.name);

// ── Force simulation ──────────────────────────────────────────────────────────
// Ring-internal links use RING_CHORD as rest length — this drives the natural
// ring size.  Transfer links pull ring centroids toward interchange partners.
const simulation = d3.forceSimulation(GRAPH_DATA.nodes)
  .force('link', d3.forceLink(GRAPH_DATA.links)
    .id(d => d.id)
    .distance(d => {
      if (d.type === 'transfer') return 10;
      if (isRingLine(d))         return RING_CHORD;
      return 28;
    })
    .strength(d => {
      if (d.type === 'transfer') return 1.0;
      if (isRingLine(d))         return 0.6;
      return 0.5;
    }))
  .force('charge',    d3.forceManyBody().strength(-55).distanceMax(250))
  .force('center',    d3.forceCenter(0, 0).strength(0.01))
  .force('collision', d3.forceCollide(7).strength(0.5))
  .alphaDecay(0.012)
  .on('tick', ticked);


function ticked() {
  projectRings();    // enforce circle shape + dynamic radius

  linkEl
    .attr('x1', d => d.source.x || 0).attr('y1', d => d.source.y || 0)
    .attr('x2', d => d.target.x || 0).attr('y2', d => d.target.y || 0);
  nodeEl.attr('transform', d => 'translate(' + (d.x || 0) + ',' + (d.y || 0) + ')');
}

// ── Drag: dragging any ring node moves the WHOLE ring rigidly ─────────────────
function dragStart(event, d) {
  if (!event.active) simulation.alphaTarget(0.3).restart();

  if (d.isRing) {
    const ring = GRAPH_DATA.rings.find(r => r.stations.includes(d.id));
    if (!ring) return;
    const rn = ring.stations.map(id => nodeById[id]).filter(Boolean);
    const n  = rn.length;

    let cx = rn.reduce((s, nd) => s + (nd.x || 0), 0) / n;
    let cy = rn.reduce((s, nd) => s + (nd.y || 0), 0) / n;

    // Best-fit phase at drag start (counterclockwise convention)
    let sinS = 0, cosS = 0;
    rn.forEach((nd, i) => {
      const phi = Math.atan2((nd.y || 0) - cy, (nd.x || 0) - cx)
                  + (2 * Math.PI * i / n);
      sinS += Math.sin(phi);
      cosS += Math.cos(phi);
    });
    const theta  = Math.atan2(sinS, cosS);
    const radius = ring._radius;

    const offsets = rn.map((nd, i) => {
      const angle = theta - (2 * Math.PI * i / n);
      const dx = radius * Math.cos(angle);
      const dy = radius * Math.sin(angle);
      nd.fx = cx + dx;
      nd.fy = cy + dy;
      return { nd, dx, dy };
    });

    ringDragData = { ring, offsets, startMx: event.x, startMy: event.y, startCx: cx, startCy: cy };
  } else {
    d.fx = d.x;
    d.fy = d.y;
  }
}

function dragged(event, d) {
  if (ringDragData) {
    const newCx = ringDragData.startCx + (event.x - ringDragData.startMx);
    const newCy = ringDragData.startCy + (event.y - ringDragData.startMy);
    ringDragData.offsets.forEach(({ nd, dx, dy }) => {
      nd.fx = newCx + dx;
      nd.fy = newCy + dy;
    });
  } else {
    d.fx = event.x;
    d.fy = event.y;
  }
}

function dragEnd(event, d) {
  if (!event.active) simulation.alphaTarget(0);
  if (ringDragData) {
    ringDragData.offsets.forEach(({ nd }) => { nd.fx = null; nd.fy = null; });
    ringDragData = null;
  } else {
    d.fx = null;
    d.fy = null;
  }
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
const tooltip = document.getElementById('tooltip');
function showTooltip(event, d) {
  const tlines = (d.transfers || []).map(t => {
    const m = t.match(/«([^»]+)»\s+(.+?)$/);
    return m
      ? '→ ' + m[1] + ' ('
          + m[2].replace(' линии', '').replace('Московского центрального кольца', 'МЦК') + ')'
      : t;
  });
  tooltip.innerHTML =
    '<div class="t-name" style="color:' + d.lineColor + '">' + d.name + '</div>'
    + '<div class="t-line">'                          + d.lineName + '</div>'
    + '<div class="t-line" style="opacity:0.5">'     + d.date     + '</div>'
    + (tlines.length ? '<div class="t-transfers">' + tlines.join('<br>') + '</div>' : '');
  tooltip.style.display = 'block';
  moveTooltip(event);
}
function moveTooltip(event) {
  tooltip.style.left = Math.min(event.clientX + 14, window.innerWidth  - 280) + 'px';
  tooltip.style.top  = Math.max(event.clientY - 10, 8) + 'px';
}
function hideTooltip() { tooltip.style.display = 'none'; }

// ── Legend ────────────────────────────────────────────────────────────────────
const legendItems = document.getElementById('legend-items');
const hiddenLines  = new Set();
GRAPH_DATA.lines.forEach(line => {
  const div = document.createElement('div');
  div.className = 'legend-item';
  div.innerHTML = '<div class="legend-dot" style="background:' + line.color + '"></div>'
                + '<div>' + line.name + '</div>';
  div.addEventListener('click', () => {
    if (hiddenLines.has(line.name)) { hiddenLines.delete(line.name); div.style.opacity = '1'; }
    else                            { hiddenLines.add(line.name);    div.style.opacity = '0.3'; }
    nodeEl.style('display', d => hiddenLines.has(d.lineName) ? 'none' : null);
    linkEl.style('display', d => {
      const s = nodeById[d.source.id || d.source];
      const t = nodeById[d.target.id || d.target];
      return (s && hiddenLines.has(s.lineName)) || (t && hiddenLines.has(t.lineName))
        ? 'none' : null;
    });
  });
  legendItems.appendChild(div);
});

// ── Search ────────────────────────────────────────────────────────────────────
document.getElementById('search-box').addEventListener('input', function() {
  const q = this.value.toLowerCase().trim();
  if (!q) {
    nodeEl.selectAll('circle')
      .attr('r', d => d.isRing ? 5 : 4)
      .attr('stroke', '#0f1117')
      .attr('stroke-width', d => d.isRing ? 1.8 : 1.2);
    nodeEl.selectAll('text').style('display', 'none');
    return;
  }
  nodeEl.selectAll('circle').each(function(d) {
    const match = d.name.toLowerCase().includes(q);
    d3.select(this)
      .attr('r',            match ? 9   : (d.isRing ? 5   : 4))
      .attr('stroke',       match ? '#fff' : '#0f1117')
      .attr('stroke-width', match ? 2.5 : (d.isRing ? 1.8 : 1.2));
  });
  nodeEl.selectAll('text').style('display', d => d.name.toLowerCase().includes(q) ? 'block' : 'none');
  const found = GRAPH_DATA.nodes.find(d => d.name.toLowerCase().includes(q));
  if (found && found.x != null) {
    const sc = 2.5;
    svg.transition().duration(600).call(
      zoomBehavior.transform,
      d3.zoomIdentity.translate(W / 2 - sc * found.x, H / 2 - sc * found.y).scale(sc));
  }
});

// ── Zoom buttons ──────────────────────────────────────────────────────────────
document.getElementById('btn-zoom-in').addEventListener('click',
  () => svg.transition().call(zoomBehavior.scaleBy, 1.5));
document.getElementById('btn-zoom-out').addEventListener('click',
  () => svg.transition().call(zoomBehavior.scaleBy, 0.67));
document.getElementById('btn-zoom-reset').addEventListener('click',
  () => svg.transition().call(zoomBehavior.transform, d3.zoomIdentity));

// \u2500\u2500 Rotation buttons \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
document.getElementById('btn-rot-ccw').addEventListener('click', () => {
  rotationDeg = (rotationDeg - 15 + 360) % 360;
  document.getElementById('rot-label').textContent = rotationDeg + '°';
  applyRotation();
});
document.getElementById('btn-rot-cw').addEventListener('click', () => {
  rotationDeg = (rotationDeg + 15) % 360;
  document.getElementById('rot-label').textContent = rotationDeg + '°';
  applyRotation();
});
document.getElementById('btn-rot-reset').addEventListener('click', () => {
  rotationDeg = 0;
  document.getElementById('rot-label').textContent = '0°';
  applyRotation();
});

// ── Zoom-dependent label visibility ────────────────────────────────────────────────────────────
svg.on('zoom.labels', e => {
  nodeEl.selectAll('text')
    .style('font-size', `${Math.max(6, 11 / e.transform.k)}px`);
});
