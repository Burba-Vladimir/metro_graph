import json, os

with open('data/metro_graph.json', encoding='utf-8') as f:
    graph_data = json.load(f)

with open('vendor/d3.min.js', encoding='utf-8') as f:
    d3_src = f.read()

with open('src/metro_vis.js', encoding='utf-8') as f:
    vis_src = f.read()

graph_json = json.dumps(graph_data, ensure_ascii=False)

HTML_HEAD = """<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Moscow Metro Graph</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#0f1117; color:#e0e0e0; font-family:'Segoe UI',sans-serif; overflow:hidden; }
#svg-container { width:100vw; height:100vh; }
.link-line     { stroke-opacity:0.75; }
.link-transfer { stroke:#fff; stroke-opacity:0.25; stroke-dasharray:2,3; }
.node circle   { stroke:#0f1117; stroke-width:1.2; cursor:grab; }
.node circle:hover { stroke:#fff; stroke-width:1.8; }
.node text     { font-size:9px; fill:#e0e0e0; pointer-events:none; text-shadow:0 0 3px #0f1117; display:none; }
.ring-guide    { fill:none; stroke:#fff; stroke-opacity:0.08; stroke-dasharray:4,6; pointer-events:none; }
#tooltip {
  position:fixed; background:rgba(15,17,23,0.92); border:1px solid #444;
  border-radius:6px; padding:8px 12px; font-size:12px; line-height:1.6;
  pointer-events:none; display:none; z-index:100; max-width:260px;
}
#tooltip .t-name { font-size:14px; font-weight:600; margin-bottom:2px; }
#tooltip .t-line { opacity:0.7; font-size:11px; }
#tooltip .t-transfers { margin-top:4px; font-size:11px; opacity:0.85; }
#controls { position:fixed; top:14px; left:14px; z-index:50; }
#search-box {
  background:rgba(255,255,255,0.08); border:1px solid #444; border-radius:20px;
  padding:6px 14px; color:#fff; font-size:12px; width:200px; outline:none;
}
#search-box::placeholder { color:#888; }
#search-box:focus { border-color:#aaa; background:rgba(255,255,255,0.13); }
#legend {
  position:fixed; bottom:14px; left:14px; z-index:50;
  background:rgba(15,17,23,0.85); border:1px solid #333;
  border-radius:8px; padding:10px 14px; font-size:11px;
  max-height:calc(100vh - 80px); overflow-y:auto;
}
#legend h3 { font-size:11px; opacity:0.6; margin-bottom:6px; text-transform:uppercase; }
.legend-item { display:flex; align-items:center; gap:7px; margin-bottom:4px; cursor:pointer; }
.legend-dot  { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
#zoom-controls {
  position:fixed; bottom:14px; right:14px; z-index:50;
  display:flex; flex-direction:column; gap:4px;
}
.zoom-btn {
  width:32px; height:32px; background:rgba(255,255,255,0.1); border:1px solid #444;
  border-radius:6px; color:#fff; font-size:18px; cursor:pointer;
  display:flex; align-items:center; justify-content:center;
}
.zoom-btn:hover { background:rgba(255,255,255,0.2); }
#rotate-controls {
  position:fixed; bottom:14px; right:54px; z-index:50;
  display:flex; flex-direction:column; gap:4px;
}
</style>
</head>
<body>
<div id="controls">
  <input id="search-box" placeholder="Поиск станции..." autocomplete="off"/>
</div>
<div id="legend"><h3>Линии</h3><div id="legend-items"></div></div>
<div id="rotate-controls">
  <div class="zoom-btn" id="btn-rot-ccw" title="Повернуть влево 15°">&#8630;</div>
  <div class="zoom-btn" id="btn-rot-cw"  title="Повернуть вправо 15°">&#8631;</div>
  <div class="zoom-btn" id="btn-rot-reset" style="font-size:11px" title="Сбросить поворот">0°</div>
</div>
<div id="zoom-controls">
  <div class="zoom-btn" id="btn-zoom-in">+</div>
  <div class="zoom-btn" id="btn-zoom-out">-</div>
  <div class="zoom-btn" id="btn-zoom-reset" style="font-size:12px">H</div>
</div>
<div id="tooltip"></div>
<svg id="svg-container"></svg>
"""

HTML_TAIL = "</body></html>"

parts = [
    HTML_HEAD,
    '<script>', d3_src, '</script>\n',
    '<script>const GRAPH_DATA=',
    json.dumps(graph_data, ensure_ascii=False, separators=(',',':')),
    ';</script>\n',
    '<script>', vis_src, '</script>\n',
    HTML_TAIL,
]
html = ''.join(parts)
with open('metro_graph.html', 'w', encoding='utf-8') as f:
    f.write(html)
print('Done:', len(html), 'bytes')
