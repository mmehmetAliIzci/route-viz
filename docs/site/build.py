"""Builds the docs page at frontend/public/docs/index.html from docs/site/content.py.

One self-contained file: the screenshots from docs/readme are embedded, so no image files
land in the frontend. Run from the repo root after changing the docs or the screenshots:

    python3 -m docs.site.build
"""

import base64
import html
import mimetypes
import re
from pathlib import Path

from . import content as C
from .diagrams import CSS as DIAGRAM_CSS

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "frontend/public/docs/index.html"
IMAGES = ROOT / "docs/readme"

PAGE_CSS = """
:root{--bg:#fafaf9;--paper:#fff;--ink:#1c1917;--muted:#6b6560;--line:#e7e5e4;--card:#f5f5f4;--accent:#2f6b4f;--warn:#dc2626;--code:#f5f5f4;
--wf-ink:var(--ink);--wf-muted:var(--muted);--wf-line:var(--line);--wf-paper:var(--paper);--wf-card:var(--card);--wf-warn:var(--warn);--wf-accent:var(--accent)}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--paper:#1c1b1a;--ink:#ecebe8;--muted:#a19d97;--line:#34322f;--card:#262523;--accent:#6fbf94;--warn:#f87171;--code:#262523}}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:var(--accent)}
.layout{display:grid;grid-template-columns:minmax(0,1fr) 240px;gap:48px;max-width:1180px;margin:0 auto;padding:48px 24px 96px}
main{min-width:0;max-width:860px}
nav.toc{position:sticky;top:24px;align-self:start;max-height:calc(100vh - 48px);overflow:auto;font-size:14px}
nav.toc p{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 8px}
nav.toc a{display:block;color:var(--muted);text-decoration:none;padding:3px 0}
nav.toc a:hover{color:var(--ink)}
nav.toc a.h3{padding-left:14px;font-size:13px}
header.top{margin-bottom:32px;padding-bottom:24px;border-bottom:1px solid var(--line)}
header.top .kicker{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
h1{font-size:40px;line-height:1.1;margin:8px 0}
h2{font-size:28px;line-height:1.2;margin:56px 0 12px;scroll-margin-top:24px}
h3{font-size:20px;margin:36px 0 8px;scroll-margin-top:24px}
p{margin:0 0 14px}
ul,ol{margin:0 0 14px;padding-left:22px}
li{margin:4px 0}
code{font:0.9em ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--code);padding:1px 5px;border-radius:4px}
pre{background:var(--code);border-radius:10px;padding:14px 16px;overflow:auto;font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;margin:0 0 16px}
pre code{background:none;padding:0}
.block{margin:20px 0}
.frame{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:16px;overflow-x:auto}
figure{margin:20px 0}
figcaption{font-size:14px;color:var(--muted);margin-top:8px}
figure img{display:block;max-width:100%;height:auto;margin:0 auto;border-radius:10px;border:1px solid var(--line)}
.cols{display:grid;gap:20px;grid-template-columns:repeat(var(--n),minmax(0,1fr))}
.cols h4{margin:0 0 8px;font-size:15px}
.cols figure{margin:0}
.cols img{max-height:640px;width:auto}
.tablewrap{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:15px}
th,td{text-align:left;vertical-align:top;padding:10px 12px;border-bottom:1px solid var(--line)}
th{font-size:13px;color:var(--muted);font-weight:600}
.callout{border-left:4px solid var(--accent);background:var(--card);border-radius:8px;padding:14px 16px}
.callout p:last-child{margin:0}
.ann{background:var(--paper);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.ann .fname{font:13px ui-monospace,Menlo,monospace;color:var(--muted);padding:10px 16px;border-bottom:1px solid var(--line)}
.ann pre{margin:0;border-radius:0;background:transparent}
.ann .ln{display:inline-block;width:2.5em;color:var(--muted);user-select:none}
.ann .hl{display:block;background:color-mix(in srgb,var(--accent) 12%,transparent);margin:0 -16px;padding:0 16px}
.ann .notes{border-top:1px solid var(--line);padding:12px 16px;font-size:14px}
.ann .notes p{margin:4px 0}
.badge{display:inline-block;min-width:20px;padding:0 6px;border-radius:10px;background:var(--accent);color:var(--paper);font-size:12px;text-align:center;margin-right:6px}
details.ep{background:var(--paper);border:1px solid var(--line);border-radius:12px;margin:10px 0}
details.ep summary{cursor:pointer;padding:12px 16px;display:flex;gap:12px;align-items:center;list-style:none}
details.ep summary::-webkit-details-marker{display:none}
.method{font:600 12px ui-monospace,Menlo,monospace;padding:3px 8px;border-radius:6px;background:var(--accent);color:var(--paper)}
.method.get{background:var(--muted)}
.ep .path{font:600 14px ui-monospace,Menlo,monospace}
.ep .sum{color:var(--muted);font-size:14px}
.ep .body{padding:0 16px 14px}
.ep h5{font-size:13px;color:var(--muted);margin:14px 0 6px;text-transform:uppercase;letter-spacing:.06em}
.entities{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
.entity{background:var(--paper);border:1px solid var(--line);border-radius:12px;overflow:hidden;font-size:13px}
.entity h4{margin:0;padding:8px 12px;background:var(--card);font-size:14px}
.entity div{display:flex;justify-content:space-between;gap:8px;padding:5px 12px;border-top:1px solid var(--line)}
.entity span:last-child{color:var(--muted);font-family:ui-monospace,Menlo,monospace;text-align:right}
.rels{font-size:14px;color:var(--muted);margin-top:10px}
footer{margin-top:64px;color:var(--muted);font-size:14px}
@media (max-width:900px){.layout{grid-template-columns:1fr;padding:24px 16px 64px}nav.toc{display:none}h1{font-size:32px}h2{font-size:24px}.cols{grid-template-columns:1fr}.cols img{max-height:none;width:100%}}
"""


def esc(s):
    return html.escape(str(s), quote=True)


def inline(text):
    out = esc(text)
    out = re.sub(r"`([^`]+)`", r"<code>\1</code>", out)
    out = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", out)
    out = re.sub(r"(?<![*\w])\*([^*\n]+)\*(?!\w)", r"<em>\1</em>", out)
    out = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', out)
    return out


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


TOC = []


def markdown(text):
    """The small Markdown subset the content uses: headings, paragraphs, lists, fenced code."""
    out, para, items, kind = [], [], [], None
    lines = text.splitlines()
    i = 0

    def flush():
        nonlocal para, items, kind
        if para:
            out.append(f"<p>{inline(' '.join(para))}</p>")
            para = []
        if items:
            out.append(f"<{kind}>" + "".join(f"<li>{inline(x)}</li>" for x in items) + f"</{kind}>")
            items, kind = [], None

    while i < len(lines):
        line = lines[i]
        if line.startswith("```"):
            flush()
            lang = line[3:].strip()
            code = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                code.append(lines[i])
                i += 1
            out.append(f'<pre><code class="{esc(lang)}">{esc(chr(10).join(code))}</code></pre>')
        elif m := re.match(r"^(#{2,4}) (.+)$", line):
            flush()
            level, title = len(m.group(1)), m.group(2)
            hid = slug(title)
            if level <= 3:
                TOC.append((level, title, hid))
            out.append(f'<h{level} id="{hid}">{inline(title)}</h{level}>')
        elif m := re.match(r"^- (.+)$", line):
            if para or kind == "ol":
                flush()
            kind = "ul"
            items.append(m.group(1))
        elif m := re.match(r"^\d+\. (.+)$", line):
            if para or kind == "ul":
                flush()
            kind = "ol"
            items.append(m.group(1))
        elif not line.strip():
            flush()
        else:
            if items:
                flush()
            para.append(line.strip())
        i += 1
    flush()
    return "\n".join(out)


def data_url(name):
    path = IMAGES / name
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def render(b):
    t = b["type"]
    if t == "md":
        return markdown(b["text"])
    if t == "image":
        cap = f"<figcaption>{inline(b['caption'])}</figcaption>" if b.get("caption") else ""
        return f'<figure><img src="{data_url(b["src"])}" alt="{esc(b["alt"])}" loading="lazy">{cap}</figure>'
    if t == "columns":
        cells = "".join(f"<div><h4>{esc(label)}</h4>{render(body)}</div>" for label, body in b["columns"])
        return f'<div class="block cols" style="--n:{len(b["columns"])}">{cells}</div>'
    if t == "diagram":
        return f'<figure class="block"><div class="frame">{b["html"]}</div><figcaption>{inline(b["caption"])}</figcaption></figure>'
    if t == "table":
        head = "".join(f"<th>{esc(c)}</th>" for c in b["columns"])
        rows = "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in b["rows"])
        return f'<div class="block tablewrap"><table><thead><tr>{head}</tr></thead><tbody>{rows}</tbody></table></div>'
    if t == "code":
        marks = {}
        for n, a in enumerate(b["annotations"], 1):
            lo, _, hi = a["lines"].partition("-")
            for k in range(int(lo), int(hi or lo) + 1):
                marks[k] = n
        body = []
        for k, src in enumerate(b["code"].splitlines(), 1):
            row = f'<span class="ln">{k}</span>{esc(src)}'
            body.append(f'<span class="hl">{row}</span>' if k in marks else row + "\n")
        notes = "".join(
            f'<p><span class="badge">{n}</span><strong>{esc(a.get("label", ""))}</strong> (lines {esc(a["lines"])}): {inline(a["note"])}</p>'
            for n, a in enumerate(b["annotations"], 1)
        )
        return f'<div class="block ann"><div class="fname">{esc(b["filename"])}</div><pre><code>{"".join(body)}</code></pre><div class="notes">{notes}</div></div>'
    if t == "endpoint":
        parts = [f"<p>{inline(b['description'])}</p>"] if b["description"] else []
        if b["params"]:
            rows = "".join(
                f"<tr><td><code>{esc(p['name'])}</code>{' *' if p.get('required') else ''}</td><td>{esc(p['in'])}</td><td>{esc(p.get('type', ''))}</td><td>{inline(p.get('description', ''))}</td></tr>"
                for p in b["params"]
            )
            parts.append(f"<h5>Parameters</h5><div class=\"tablewrap\"><table><thead><tr><th>Name</th><th>In</th><th>Type</th><th>Notes</th></tr></thead><tbody>{rows}</tbody></table></div>")
        if b["request"]:
            parts.append(f"<h5>Request body</h5><pre><code>{esc(b['request']['example'])}</code></pre>")
        resp = "".join(
            f"<li><strong>{esc(r['status'])}</strong> {inline(r['description'])}" + (f"<pre><code>{esc(r['example'])}</code></pre>" if r.get("example") else "") + "</li>"
            for r in b["responses"]
        )
        parts.append(f"<h5>Responses</h5><ul>{resp}</ul>")
        return (
            f'<details class="ep"><summary><span class="method {b["method"].lower()}">{b["method"]}</span>'
            f'<span class="path">{esc(b["path"])}</span><span class="sum">{esc(b["summary"])}</span></summary>'
            f'<div class="body">{"".join(parts)}</div></details>'
        )
    if t == "datamodel":
        names = {e["id"]: e["name"] for e in b["entities"]}
        cards = "".join(
            f'<div class="entity"><h4>{esc(e["name"])}</h4>'
            + "".join(f"<div><span>{esc(f['name'])}{'?' if f.get('nullable') else ''}</span><span>{esc(f['type'])}</span></div>" for f in e["fields"])
            + "</div>"
            for e in b["entities"]
        )
        rels = ", ".join(f"{names[r['from']]} → {names[r['to']]} ({r['kind']})" for r in b["relations"])
        return f'<div class="block"><div class="entities">{cards}</div><p class="rels">{esc(rels)}</p></div>'
    if t == "filetree":
        rows = "".join(f"<tr><td><code>{esc(e['path'])}</code></td><td>{inline(e['note'])}</td></tr>" for e in b["entries"])
        return f'<div class="block tablewrap"><table><thead><tr><th>Path</th><th>What it holds</th></tr></thead><tbody>{rows}</tbody></table></div>'
    if t == "callout":
        return f'<div class="block callout">{markdown(b["text"])}</div>'
    raise ValueError(f"unknown block type {t}")


def build():
    TOC.clear()
    body = "\n".join(render(b) for b in C.BLOCKS)
    # Diagram CSS: the shared rules plus anything extra a diagram brings, once each.
    extra = sorted({b["css"].replace(DIAGRAM_CSS, "") for b in C.BLOCKS if b["type"] == "diagram"} - {""})
    toc = "".join(f'<a class="h{lvl}" href="#{hid}">{esc(title)}</a>' for lvl, title, hid in TOC)
    page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(C.TITLE)} · How it works</title>
<meta name="description" content="{esc(C.BRIEF)}">
<style>{PAGE_CSS}{DIAGRAM_CSS}{"".join(extra)}</style>
</head>
<body>
<div class="layout">
<main>
<header class="top"><div class="kicker">How it works</div><h1>{esc(C.TITLE)}</h1><p>{esc(C.BRIEF)}</p><p><a href="/">Open the app →</a></p></header>
{body}
<footer>Generated from <code>docs/site/content.py</code> by <code>python3 -m docs.site.build</code>.</footer>
</main>
<nav class="toc" aria-label="On this page"><p>On this page</p>{toc}</nav>
</div>
</body>
</html>
"""
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(page)
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    build()
