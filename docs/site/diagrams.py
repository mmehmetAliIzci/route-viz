"""Inline SVG diagrams for the repo overview. Each function returns (html, css)."""

import math

CSS = """
.dg{margin:0;padding:8px 4px}
.dg svg{display:block;width:100%;height:auto;stroke:none!important}
.dg text{fill:var(--wf-ink)!important;stroke:none!important;font-size:12px}
.dg text.s{fill:var(--wf-muted)!important;font-size:11.5px}
.dg text.b{font-weight:600;font-size:13px}
.dg text.hi{fill:var(--wf-warn)!important;font-weight:600}
.dg .box{fill:none!important;stroke:var(--wf-muted)!important;stroke-width:1.3}
.dg .boxa{fill:none!important;stroke:var(--wf-warn)!important;stroke-width:2.2}
.dg .ln{fill:none!important;stroke:var(--wf-ink)!important;stroke-width:1.4}
.dg .lna{fill:none!important;stroke:var(--wf-warn)!important;stroke-width:2.4}
.dg .dash{stroke-dasharray:5 4}
.dg .dot{fill:var(--wf-ink)!important;stroke:none!important}
.dg .dota{fill:var(--wf-warn)!important;stroke:none!important}
.dg .ring{fill:var(--wf-paper)!important;stroke:var(--wf-ink)!important;stroke-width:2.2}
.dg .soft{fill:var(--wf-warn)!important;fill-opacity:.12;stroke:none!important}
.dg .faint{opacity:.3}
.dg .mk{fill:var(--wf-ink)!important;stroke:none!important}
.dg .mka{fill:var(--wf-warn)!important;stroke:none!important}
"""


def _markers(p):
    return (
        f'<defs><marker id="{p}-a" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" orient="auto-start-reverse">'
        f'<path d="M0,0 L10,5 L0,10 z" class="mk"/></marker>'
        f'<marker id="{p}-b" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" orient="auto-start-reverse">'
        f'<path d="M0,0 L10,5 L0,10 z" class="mka"/></marker></defs>'
    )


def _svg(p, w, h, label, body):
    return (
        f'<figure class="dg"><svg viewBox="0 0 {w} {h}" role="img" aria-label="{label}" xmlns="http://www.w3.org/2000/svg">'
        + _markers(p)
        + body
        + "</svg></figure>"
    )


def t(x, y, s, cls="", anchor="start"):
    c = f' class="{cls}"' if cls else ""
    return f'<text x="{x:.1f}" y="{y:.1f}" text-anchor="{anchor}"{c}>{s}</text>'


def rect(x, y, w, h, cls="box", r=8):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" class="{cls}"/>'


def line(x1, y1, x2, y2, cls="ln", arrow=None):
    m = f' marker-end="url(#{arrow})"' if arrow else ""
    return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" class="{cls}"{m}/>'


# 1. Request path ------------------------------------------------------------
def request_path():
    p = "rq"
    A, B = f"{p}-a", f"{p}-b"
    o = []
    # browser
    o += [rect(20, 50, 130, 200), t(85, 78, "Browser", "b", "middle"), t(85, 96, "React + Zod", "s", "middle")]
    o += [t(85, 150, "sends its", "s", "middle"), t(85, 164, "time zone", "s", "middle")]
    # django
    o += [rect(230, 20, 410, 260, "box", 12), t(246, 42, "Django API", "b")]
    steps = [(60, "Rate limit", "10 / min per IP"), (124, "Validate trip", "US, next 48 h, zone"), (188, "plan.build()", "40 s budget")]
    for y, title, sub in steps:
        o += [rect(250, y, 180, 44), t(340, y + 19, title, "b", "middle"), t(340, y + 35, sub, "s", "middle")]
    o += [line(340, 104, 340, 122, arrow=A), line(340, 168, 340, 186, arrow=A)]
    o += [t(442, 86, "→ 429 rate_limited", "hi"), t(442, 150, "→ 400 invalid_trip", "hi"), t(250, 256, "→ 504 plan_timeout if the budget runs out", "hi")]
    # cache
    o += [rect(500, 172, 120, 64, "boxa"), t(560, 198, "Provider cache", "b", "middle"), t(560, 215, "30 min", "s", "middle")]
    o += [line(430, 204, 498, 204, arrow=A)]
    # providers
    o += [rect(690, 110, 130, 50), t(755, 132, "TomTom", "b", "middle"), t(755, 149, "truck routes", "s", "middle")]
    o += [rect(690, 210, 130, 50), t(755, 232, "Open-Meteo", "b", "middle"), t(755, 249, "hourly forecast", "s", "middle")]
    o += [line(620, 190, 688, 140, arrow=A), t(642, 152, "miss", "s", "middle"), line(620, 222, 688, 234, arrow=A), t(652, 244, "miss", "s", "middle")]
    # request / response
    o += [line(150, 82, 248, 82, "ln", A), t(199, 72, "POST /api/plan", "s", "middle")]
    o += [line(250, 222, 152, 222, "ln", A), t(201, 214, "plan JSON", "s", "middle")]
    return _svg(p, 840, 290, "A plan request passes rate limit, validation and plan.build; provider answers come from a 30 minute cache or from TomTom and Open-Meteo.", "".join(o)), CSS


# 2. Time-aware weather ------------------------------------------------------
def time_aware():
    p = "ta"
    A, B = f"{p}-a", f"{p}-b"
    x0, x1, y0, ytop = 90, 770, 300, 50  # miles 0..600, hours 0..10
    mx = lambda mi: x0 + (x1 - x0) * mi / 600
    hy = lambda h: y0 - (y0 - ytop) * h / 10
    o = []
    # axes
    o += [line(x0, y0, x1 + 10, y0, arrow=A), line(x0, y0, x0, ytop - 10, arrow=A)]
    for mi in (0, 200, 400, 600):
        o += [line(mx(mi), y0, mx(mi), y0 + 5), t(mx(mi), y0 + 20, f"{mi}", "s", "middle")]
    o += [t((x0 + x1) / 2, y0 + 38, "miles along the route", "s", "middle")]
    for h in (0, 4, 8):
        o += [line(x0 - 5, hy(h), x0, hy(h)), t(x0 - 9, hy(h) + 4, "now" if h == 0 else f"+{h} h", "s", "end")]
    o += [t(x0 + 8, ytop - 14, "hours after departure", "s")]
    # storm in space and time
    cx, cy = mx(430), hy(1.2)
    o += [f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="80" ry="40" class="soft"/>',
          f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="80" ry="40" class="lna dash"/>',
          t(cx, cy - 4, "storm", "b", "middle"), t(cx, cy + 12, "forecast for 0 to 3 h", "s", "middle")]
    # naive check along hour 0
    o += [line(mx(380), y0, mx(480), y0, "lna")]
    o += [line(mx(430) - 6, y0 - 6, mx(430) + 6, y0 + 6, "lna"), line(mx(430) - 6, y0 + 6, mx(430) + 6, y0 - 6, "lna")]
    o += [t(mx(340), y0 - 28, "checking “now” flags", "hi", "end"), t(mx(340), y0 - 13, "mile 430 as stormy", "hi", "end")]
    # truck line, ETA from TomTom
    end_h = 8.3
    o += [line(mx(0), hy(0), mx(600), hy(end_h), "ln")]
    for mi in range(0, 601, 100):
        o += [f'<circle cx="{mx(mi):.1f}" cy="{hy(end_h * mi / 600):.1f}" r="4" class="dot"/>']
    hit = end_h * 430 / 600
    o += [f'<circle cx="{mx(430):.1f}" cy="{hy(hit):.1f}" r="7" class="ring"/>']
    o += [line(mx(430), hy(hit) + 8, mx(430), cy - 44, "ln dash", A)]
    o += [t(mx(430) - 14, hy(hit) - 30, "truck reaches mile 430 at +6 h:", "s", "end"), t(mx(430) - 14, hy(hit) - 15, "the storm has passed, level Low", "s", "end")]
    o += [t(mx(600) - 4, hy(end_h) - 12, "truck (TomTom ETAs)", "s", "end")]
    return _svg(p, 800, 350, "The app checks each checkpoint against the forecast at the hour the truck gets there. A storm that is over mile 430 now is gone by the time the truck arrives six hours later.", "".join(o)), CSS


# 3. Checkpoints and owned miles --------------------------------------------
def owned_miles():
    p = "om"
    x0, x1, total = 110, 770, 60
    mx = lambda mi: x0 + (x1 - x0) * mi / total
    marks = [0, 25, 50, 60]
    etas = ["14:00", "14:27", "14:54", "15:05"]
    o = [f'<line x1="{x0}" y1="90" x2="{x1}" y2="90" class="ln" style="stroke-width:5;stroke-linecap:round"/>']
    for i, (m, eta) in enumerate(zip(marks, etas)):
        cls = "dota" if m == 25 else "dot"
        o += [f'<circle cx="{mx(m):.1f}" cy="90" r="{8 if m == 25 else 6}" class="{cls}"/>']
        label = "mile 0" if m == 0 else (f"{m} (destination)" if m == total else f"{m}")
        anchor = "end" if m == total else ("start" if m == 0 else "middle")
        ax = mx(m) + (6 if m == total else (-6 if m == 0 else 0))
        o += [t(ax, 66, label, "b" if m == 25 else "", anchor), t(ax, 46, f"ETA {eta}", "s", anchor)]
    mids = [(a + b) / 2 for a, b in zip(marks, marks[1:])]
    bounds = [0, *mids, total]
    for m in mids:
        o += [line(mx(m), 100, mx(m), 150, "ln dash faint")]
    for a, b in zip(bounds, bounds[1:]):
        acc = a < 25 < b
        cls = "lna" if acc else "ln"
        xa, xb = mx(a) + 3, mx(b) - 3
        o += [f'<path d="M{xa:.1f},134 L{xa:.1f},144 L{xb:.1f},144 L{xb:.1f},134" class="{cls}"/>']
        o += [t((xa + xb) / 2, 164, f"{b - a:g} mi", "b" if acc else "", "middle")]
    o += [t(mx(25), 186, "the checkpoint at mile 25 speaks for miles 12.5 to 37.5", "s", "middle"), t(x1, 186, "12.5 + 25 + 17.5 + 5 = 60 mi", "s", "end")]
    o += [t(x0 - 6, 128, "road each", "s", "end"), t(x0 - 6, 142, "checkpoint", "s", "end"), t(x0 - 6, 156, "speaks for", "s", "end")]
    return _svg(p, 800, 200, "Checkpoints sit every 25 miles plus the destination; each owns half the gap to its neighbours, so owned miles add up to the route length.", "".join(o)), CSS


# 4. Lean weather grid -------------------------------------------------------
def lean_grid():
    p = "lg"
    A = f"{p}-a"
    nx, ny, s, gx, gy = 12, 7, 38, 30, 30
    route = [(0.3, 5.4), (2.5, 4.8), (4.2, 3.4), (6.0, 3.1), (8.0, 1.9), (10.7, 0.8)]
    cells = set()
    for (ax, ay), (bx, by) in zip(route, route[1:]):
        n = 60
        for k in range(n + 1):
            x, y = ax + (bx - ax) * k / n, ay + (by - ay) * k / n
            cells.add((int(x), int(y)))
    nodes = set()
    for i, j in cells:
        for di in (0, 1):
            for dj in (0, 1):
                nodes.add((i + di, j + dj))
    ring = set()
    for i, j in nodes:
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                ring.add((i + di, j + dj))
    o = []
    for i in range(nx):
        for j in range(ny):
            x, y = gx + i * s, gy + j * s
            if (i, j) in nodes:
                o.append(f'<circle cx="{x}" cy="{y}" r="4.5" class="dot"/>')
            elif (i, j) in ring:
                o.append(f'<circle cx="{x}" cy="{y}" r="3" class="dot" style="opacity:.55"/>')
            else:
                o.append(f'<circle cx="{x}" cy="{y}" r="2" class="dot faint"/>')
    pts = " ".join(f"{gx + x * s:.1f},{gy + y * s:.1f}" for x, y in route)
    o.append(f'<polyline points="{pts}" class="lna"/>')
    ly = gy + (ny - 1) * s + 34
    o += [f'<circle cx="{gx}" cy="{ly - 4}" r="4.5" class="dot"/>', t(gx + 10, ly, "corners of cells the route crosses", "s")]
    o += [f'<circle cx="{gx + 230}" cy="{ly - 4}" r="3" class="dot" style="opacity:.55"/>', t(gx + 240, ly, "one ring around them", "s")]
    o += [f'<circle cx="{gx + 380}" cy="{ly - 4}" r="2" class="dot faint"/>', t(gx + 390, ly, "not fetched", "s")]
    # zoomed cell
    zx, zy, zs = 560, 50, 150
    o += [rect(zx, zy, zs, zs, "box", 2)]
    for cx, cy, lab in ((zx, zy, "nw"), (zx + zs, zy, "ne"), (zx, zy + zs, "sw"), (zx + zs, zy + zs, "se")):
        o.append(f'<circle cx="{cx}" cy="{cy}" r="5" class="dot"/>')
    px, py = zx + 95, zy + 60
    o.append(f'<circle cx="{px}" cy="{py}" r="6" class="dota"/>')
    for cx, cy in ((zx, zy), (zx + zs, zy), (zx, zy + zs), (zx + zs, zy + zs)):
        dx, dy = px - cx, py - cy
        d = math.hypot(dx, dy)
        o.append(line(cx + dx / d * 8, cy + dy / d * 8, px - dx / d * 9, py - dy / d * 9, "ln dash", A))
    o += [t(zx + zs / 2, zy - 12, "one grid cell", "s", "middle"), t(px + 12, py + 20, "checkpoint", "b")]
    o += [t(zx + zs / 2, zy + zs + 24, "space: weighted by distance to 4 corners", "s", "middle")]
    # time axis
    ty = zy + zs + 62
    o += [line(zx - 10, ty, zx + zs + 10, ty), t(zx - 10, ty + 18, "15:00", "s", "middle"), t(zx + zs + 10, ty + 18, "16:00", "s", "middle")]
    o += [f'<circle cx="{zx - 10}" cy="{ty}" r="4" class="dot"/>', f'<circle cx="{zx + zs + 10}" cy="{ty}" r="4" class="dot"/>']
    ex = zx - 10 + (zs + 20) / 3
    o += [f'<circle cx="{ex:.1f}" cy="{ty}" r="6" class="dota"/>', t(ex, ty - 12, "ETA 15:20", "s", "middle")]
    o += [t(zx + zs / 2, ty + 38, "time: between the two hourly forecasts", "s", "middle")]
    o += [line(gx + 11 * s + 20, 150, zx - 14, 125, "ln dash faint", A)]
    return _svg(p, 760, 330, "One Open-Meteo request covers only the grid nodes near the routes; each checkpoint is read from its cell's four corners at its ETA, interpolated in space and then in time.", "".join(o)), CSS


# 5. Pipeline ----------------------------------------------------------------
def pipeline():
    p = "pl"
    A, B = f"{p}-a", f"{p}-b"
    steps = [
        ("Routes", "routing.py", "TomTom, truck mode, up to 3"),
        ("Checkpoints", "sampling.py", "every 10, 25 or 50 mi"),
        ("Weather at ETA", "weather.py", "forecast, or a demo storm"),
        ("Risk level", "rules.py", "worst of wind, rain, snow"),
        ("Rank", "ranking.py", "brief's order, No Travel first"),
        ("Explain", "explain.py", "plain-language reason"),
    ]
    data = [
        "geometry + ETA profile per route",
        "mile · position · ETA · owned miles",
        "wind · rain · snow per checkpoint",
        "level + cause per checkpoint",
        "best route, runner-up, deciding criterion",
    ]
    x, w, h, gap, y = 240, 260, 50, 40, 20
    o = []
    for i, (title, file, sub) in enumerate(steps):
        yy = y + i * (h + gap)
        cls = "boxa" if i == 2 else "box"
        o += [rect(x, yy, w, h, cls), t(x + 16, yy + 22, f"{i + 1}. {title}", "b"), t(x + 16, yy + 39, sub, "s")]
        o += [t(x - 14, yy + 30, file, "s", "end")]
        if i < len(data):
            o += [line(x + w / 2, yy + h, x + w / 2, yy + h + gap - 2, arrow=A), t(x + w / 2 + 12, yy + h + gap / 2 + 4, data[i], "s")]
    # heatmap branch from step 3
    yy = y + 2 * (h + gap)
    o += [rect(640, yy, 170, h, "box"), t(725, yy + 22, "Heatmap", "b", "middle"), t(725, yy + 39, "same grid, hours 0 to 48", "s", "middle")]
    o += [line(x + w, yy + h / 2, 638, yy + h / 2, "lna", B), t(570, yy + h / 2 - 8, "all nodes, all hours", "s", "middle")]
    # output
    yl = y + 5 * (h + gap) + h
    o += [line(x + w / 2, yl, x + w / 2, yl + 30, arrow=A), t(x + w / 2 + 12, yl + 22, "headline + reason, times in the viewer's zone", "s")]
    return _svg(p, 820, yl + 44, "plan.build runs six steps; each arrow names the data passed on, and the weather grid also feeds the heatmap.", "".join(o)), CSS


# 6. Risk points -------------------------------------------------------------
WEIGHTS = (("No Travel", 27, "seg-nt"), ("Severe", 9, "seg-sev"), ("High", 3, "seg-high"), ("Moderate", 1, "seg-mod"))


def risk_points(rows):
    """Stacked bars of each route's risk points by level. rows: (name, note, {level: miles})."""
    p = "rp"
    totals = [sum(m.get(lvl, 0) * w for lvl, w, _ in WEIGHTS) for _, _, m in rows]
    x0, width, rh = 260, 430, 56
    scale = width / max(totals)
    best = totals.index(min(totals))
    o = []
    for i, ((name, note, miles), total) in enumerate(zip(rows, totals)):
        y = 34 + i * rh
        o += [t(20, y + 15, name, "b"), t(20, y + 31, note, "s")]
        x = x0
        for lvl, w, cls in WEIGHTS:
            pts = miles.get(lvl, 0) * w
            if pts <= 0:
                continue
            seg = pts * scale
            o.append(f'<rect x="{x:.1f}" y="{y}" width="{seg:.1f}" height="28" class="{cls}"/>')
            if seg > 46:
                light = cls in ("seg-nt", "seg-sev")
                o.append(t(x + seg / 2, y + 18, f"{round(pts):,}", "seg-label" if light else "seg-label-dark", "middle"))
            x += seg
        label = f"{round(total):,} points" + ("  · wins" if i == best else "")
        o.append(t(x + 10, y + 19, label, "b" if i == best else ""))
    ly = 34 + len(rows) * rh + 8
    lx = 20
    for lvl, w, cls in WEIGHTS:
        o += [f'<rect x="{lx}" y="{ly}" width="14" height="14" class="{cls}"/>', t(lx + 20, ly + 12, f"{lvl} ({w} per mile)", "s")]
        lx += 170
    return _svg(p, 900, ly + 30, "Each route's risk points, split by weather level. The lowest total wins.", "".join(o)), CSS + """
.dg .seg-nt{fill:var(--wf-ink)!important;stroke:var(--wf-paper)!important;stroke-width:1}
.dg .seg-sev{fill:var(--wf-warn)!important;stroke:var(--wf-paper)!important;stroke-width:1}
.dg .seg-high{fill:var(--wf-warn)!important;fill-opacity:.45;stroke:var(--wf-paper)!important;stroke-width:1}
.dg .seg-mod{fill:var(--wf-muted)!important;fill-opacity:.35;stroke:var(--wf-paper)!important;stroke-width:1}
.dg text.seg-label{fill:var(--wf-paper)!important;font-size:11px;font-weight:600}
.dg text.seg-label-dark{fill:var(--wf-ink)!important;font-size:11px;font-weight:600}
"""


# 7. Cache bucket ------------------------------------------------------------
def cache_bucket():
    p = "cb"
    A, B = f"{p}-a", f"{p}-b"
    x0, x1, ax = 60, 760, 140
    mx = lambda m: x0 + (x1 - x0) * m / 45
    o = [f'<rect x="{mx(0):.1f}" y="44" width="{mx(15) - mx(0):.1f}" height="{ax - 44}" class="soft"/>']
    o += [t(mx(7.5), 36, "departures in one bucket: 3 requests, 1 TomTom call", "s", "middle")]
    o += [line(x0, ax, x1 + 10, ax, arrow=A)]
    for m, lab in ((0, "14:00"), (15, "14:15"), (30, "14:30"), (45, "14:45")):
        o += [line(mx(m), ax - 6, mx(m), ax + 6), t(mx(m), ax + 22, lab, "s", "middle")]
    reqs = [(2, "miss", True), (9, "hit", False), (14, "hit", False), (21, "miss", True)]
    for m, lab, miss in reqs:
        o += [t(mx(m), 62, f"14:{m:02d}", "s", "middle")]
        o += [f'<circle cx="{mx(m):.1f}" cy="78" r="6" class="{"dota" if miss else "dot"}"/>', t(mx(m) + 10, 82, lab, "hi" if miss else "s")]
        mark = 15 if m <= 15 else 30
        o += [line(mx(m), 86, mx(mark) - 3, ax - 8, "lna" if miss else "ln dash", B if miss else A)]
    o += [t(mx(15), ax + 42, "TomTom departAt 14:15", "b", "middle"), t(mx(30), ax + 42, "TomTom departAt 14:30", "b", "middle")]
    o += [t(x1, ax + 66, "ETAs still count from each request's exact departure", "s", "end")]
    return _svg(p, 800, ax + 78, "Departures are rounded up to the next 15 minutes for TomTom, so requests in the same window share one cached routing call.", "".join(o)), CSS
