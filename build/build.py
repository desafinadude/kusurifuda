"""Build step for the Kusurifuda PWA: subset fonts, draw icons, write sw.js."""
import hashlib, os, re, json, sys
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from PIL import Image, ImageDraw

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.environ.get("KF_FONTS", os.path.join(APP, "build", "fonts"))

# Fonts, app icons and launch screens need the source TTFs (OFL fonts, not in the repo).
# Without them the build still makes sprite sheets and sw.js. Point KF_FONTS at the folder, or pass --no-fonts.
HAVE_FONTS = "--no-fonts" not in sys.argv and os.path.exists(f"{SRC}/ShipporiMinchoB1-ExtraBold.ttf")
if not HAVE_FONTS: print("fonts/icons skipped: no source fonts in", SRC)
if HAVE_FONTS:
    # ---------- fonts: subset to every character the app can show ----------
    text = ""
    for root, _, files in os.walk(APP):
        for f in files:
            if f.endswith((".js", ".html", ".css", ".webmanifest", ".json")) and f != "sw.js" and "/build" not in root:
                text += open(os.path.join(root, f), encoding="utf-8").read()
    chars = set(text)
    chars |= set(chr(c) for c in range(0x20, 0x7F))
    chars |= set("’‘“”–—…·×→←↑↓↻↺⇅✓✿◯ōūŌŪāīēÉéè文鬼薬札")
    uni = ",".join("U+%04X" % ord(c) for c in sorted(chars) if ord(c) > 0x1F)
    FONT_DIR = f"{APP}/themes/kusurifuda/fonts"
    os.makedirs(FONT_DIR, exist_ok=True)
    FONTS = {
        "shippori-500": "ShipporiMinchoB1-Medium", "shippori-700": "ShipporiMinchoB1-Bold", "shippori-800": "ShipporiMinchoB1-ExtraBold",
        "zen-400": "ZenKakuGothicNew-Regular", "zen-500": "ZenKakuGothicNew-Medium", "zen-700": "ZenKakuGothicNew-Bold",
    }
    # other themes' fonts: output path (relative to the app) -> source file in build/fonts
    # a theme font with "source": "<file in build/fonts>" is subset into its one face file
    THEME_FONTS = {}
    for d in sorted(os.listdir(f"{APP}/themes")):
        tp = f"{APP}/themes/{d}/theme.json"
        if not os.path.exists(tp): continue
        for f in (json.load(open(tp, encoding="utf-8")).get("fonts") or {}).values():
            if isinstance(f, dict) and f.get("source") and f.get("faces"):
                for face in f["faces"].values(): THEME_FONTS[f"themes/{d}/{face}"] = f["source"]
    for out, src in THEME_FONTS.items():
        if not os.path.exists(f"{SRC}/{src}"): print("font source missing:", src); continue
        opts = subset.Options(); opts.flavor = "woff2"; opts.layout_features = ["*"]; opts.name_IDs = ["*"]; opts.notdef_outline = True
        f = TTFont(f"{SRC}/{src}")
        s = subset.Subsetter(opts); s.populate(unicodes=[ord(c) for c in chars]); s.subset(f)
        os.makedirs(os.path.dirname(f"{APP}/{out}"), exist_ok=True)
        f.flavor = "woff2"; f.save(f"{APP}/{out}")
        print(out, os.path.getsize(f"{APP}/{out}"))
    for out, src in FONTS.items():
        opts = subset.Options(); opts.flavor = "woff2"; opts.layout_features = ["*"]; opts.name_IDs = ["*"]; opts.notdef_outline = True
        f = TTFont(f"{SRC}/{src}.ttf")
        s = subset.Subsetter(opts); s.populate(unicodes=[ord(c) for c in chars]); s.subset(f)
        f.flavor = "woff2"; f.save(f"{FONT_DIR}/{out}.woff2")
        print(out, os.path.getsize(f"{FONT_DIR}/{out}.woff2"))

    # ---------- icons ----------
    os.makedirs(f"{APP}/icons", exist_ok=True)
    font = TTFont(f"{SRC}/ShipporiMinchoB1-ExtraBold.ttf")
    gs = font.getGlyphSet(); cmap = font.getBestCmap(); upm = font["head"].unitsPerEm
    gname = cmap[ord("薬")]

    def glyph_path(cx, cy, size):
        # place the em box (size×size) centred on cx,cy, flip y
        sc = size / upm
        pen = SVGPathPen(gs)
        asc = font["hhea"].ascent; desc = font["hhea"].descent
        mid = (asc + desc) / 2  # visual centre of the em in font units
        adv = gs[gname].width
        t = TransformPen(pen, (sc, 0, 0, -sc, cx - adv * sc / 2, cy + mid * sc))
        gs[gname].draw(t)
        return pen.getCommands()

    def emblem_svg(maskable=False):
        s = 0.8 if maskable else 1.0
        o = 50 * (1 - s)
        tf = f'transform="translate({o} {o}) scale({s})"'
        return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect width="100" height="100" fill="#B23A24"/>
    <g {tf}>
    <circle cx="50" cy="44" r="27" fill="#F1E4C6"/>
    <path d="M0 70 C28 56 72 56 100 70 V100 H0Z" fill="#16120E"/>
    <g stroke="#F1E4C6" stroke-width="1.4" stroke-linecap="round" fill="none"><path d="M18 70 C20 64 24 60 30 58"/><path d="M30 68 C34 60 40 56 46 55"/><path d="M60 66 C64 60 70 57 76 57"/><path d="M76 70 C78 64 82 61 88 60"/></g>
    <path d="{glyph_path(50, 42, 29)}" fill="#1E1914"/>
    </g></svg>'''

    open(f"{APP}/icons/icon.svg", "w").write(emblem_svg())

    def bez(p0, p1, p2, p3, n=40):
        out = []
        for i in range(n + 1):
            t = i / n; u = 1 - t
            out.append((u**3*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0], u**3*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1]))
        return out

    from PIL import ImageFont, ImageChops
    GLYPH_TTF = f"{SRC}/ShipporiMinchoB1-ExtraBold.ttf"
    RED, CREAM, INK, LACQUER, GOLD, PARCH, MUTED = "#B23A24", "#F1E4C6", "#1E1914", "#16120E", "#D6AC4E", "#EADBB8", "#A8977A"

    def draw_icon(px, safe=1.0, radius=0):
        """The emblem (sun, hill, grass, 薬). safe<1 shrinks the content into the
        maskable safe zone while the red and the hill still run to every edge."""
        SS = 4; W = px * SS
        im = Image.new("RGBA", (W, W), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
        d.rounded_rectangle([0, 0, W - 1, W - 1], radius=radius * SS, fill=RED)
        s = safe; o = 50 * (1 - s)
        P = lambda x, y: ((o + x * s) * W / 100, (o + y * s) * W / 100)
        cx, cy = P(50, 44); r = 27 * s * W / 100
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=CREAM)
        # the hill keeps its full width (only its height follows the safe zone), so it meets both edges cleanly
        curve = [(x * W / 100, (o + y * s) * W / 100) for x, y in bez((0, 70), (28, 56), (72, 56), (100, 70))]
        hill = curve + [(W, W), (0, W)]
        d.polygon(hill, fill=LACQUER)
        for seg in [((18, 70), (20, 64), (24, 60), (30, 58)), ((30, 68), (34, 60), (40, 56), (46, 55)), ((60, 66), (64, 60), (70, 57), (76, 57)), ((76, 70), (78, 64), (82, 61), (88, 60))]:
            d.line([P(*q) for q in bez(*seg, n=20)], fill=CREAM, width=max(1, int(1.4 * s * W / 100)), joint="curve")
        f = ImageFont.truetype(GLYPH_TTF, int(29 * s * W / 100))
        d.text((cx, cy - 2 * s * W / 100), "薬", font=f, fill=INK, anchor="mm")
        if radius:  # clip the corners
            m = Image.new("L", (W, W), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, W - 1, W - 1], radius=radius * SS, fill=255)
            im.putalpha(ImageChops.multiply(im.getchannel("A"), m))
        return im.resize((px, px), Image.LANCZOS)

    def draw_small(px):
        """Favicon sizes: the emblem's detail turns to mush below 64px, so just the
        red tile, the sun and 薬."""
        SS = 8; W = px * SS
        im = Image.new("RGBA", (W, W), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
        d.rounded_rectangle([0, 0, W - 1, W - 1], radius=int(W * 0.2), fill=RED)
        r = W * 0.42; d.ellipse([W / 2 - r, W / 2 - r, W / 2 + r, W / 2 + r], fill=CREAM)
        f = ImageFont.truetype(GLYPH_TTF, int(W * 0.6))
        d.text((W / 2, W / 2 - W * 0.02), "薬", font=f, fill=INK, anchor="mm")
        return im.resize((px, px), Image.LANCZOS)

    def draw_mono(px):
        """Android themed icon: one colour on transparent, sun disc with 薬 cut out."""
        SS = 4; W = px * SS
        m = Image.new("L", (W, W), 0); d = ImageDraw.Draw(m)
        r = W * 0.30; d.ellipse([W / 2 - r, W / 2 - r, W / 2 + r, W / 2 + r], fill=255)
        f = ImageFont.truetype(GLYPH_TTF, int(W * 0.40))
        d.text((W / 2, W / 2 - W * 0.012), "薬", font=f, fill=0, anchor="mm")
        im = Image.new("RGBA", (W, W), (255, 255, 255, 0)); im.putalpha(m)
        return im.resize((px, px), Image.LANCZOS)

    def opaque(im, bg=RED):
        b = Image.new("RGBA", im.size, bg); b.alpha_composite(im); return b.convert("RGB")

    for old in os.listdir(f"{APP}/icons"):
        os.remove(f"{APP}/icons/{old}")
    open(f"{APP}/icons/icon.svg", "w").write(emblem_svg())
    # Safari pinned tab: a single black shape (sun disc with 薬 knocked out)
    open(f"{APP}/icons/mask-icon.svg", "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill-rule="evenodd" d="M50 4a46 46 0 1 0 .001 0Z {glyph_path(50, 50, 62)}"/></svg>')
    for n in (48, 72, 96, 128, 144, 152, 192, 256, 384, 512):
        draw_icon(n).save(f"{APP}/icons/icon-{n}.png", optimize=True)
    for n in (192, 512):
        draw_icon(n, safe=0.8).save(f"{APP}/icons/maskable-{n}.png", optimize=True)
    draw_mono(512).save(f"{APP}/icons/monochrome-512.png", optimize=True)
    for n in (152, 167, 180):
        opaque(draw_icon(n)).save(f"{APP}/icons/apple-touch-icon-{n}.png", optimize=True)
    opaque(draw_icon(180)).save(f"{APP}/icons/apple-touch-icon.png", optimize=True)
    for n in (16, 32):
        draw_small(n).save(f"{APP}/icons/favicon-{n}.png", optimize=True)
    draw_small(256).save(f"{APP}/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

    # ---------- iOS launch screens (iOS ignores the manifest for these) ----------
    DEVICES = [  # css width, css height, pixel ratio
        (440, 956, 3), (430, 932, 3), (428, 926, 3), (414, 896, 3), (402, 874, 3), (393, 852, 3), (390, 844, 3), (375, 812, 3),
        (414, 736, 3), (414, 896, 2), (375, 667, 2), (320, 568, 2),
        (1032, 1376, 2), (1024, 1366, 2), (834, 1210, 2), (834, 1194, 2), (820, 1180, 2), (834, 1112, 2), (810, 1080, 2), (768, 1024, 2), (744, 1133, 2),
    ]
    SPLASH = f"{APP}/splash"
    os.makedirs(SPLASH, exist_ok=True)
    for old in os.listdir(SPLASH): os.remove(f"{SPLASH}/{old}")
    def splash(w, h):
        im = Image.new("RGB", (w, h), LACQUER); d = ImageDraw.Draw(im); m = min(w, h)
        ic = int(m * 0.26); icon = draw_icon(ic, radius=int(ic * 0.22) // 4)
        top = int(h * 0.5 - ic * 0.85)
        im.paste(icon, ((w - ic) // 2, top), icon)
        rr = int(ic * 0.22) // 4; lw = max(2, ic // 90)
        d.rounded_rectangle([(w - ic) // 2 - lw, top - lw, (w + ic) // 2 + lw - 1, top + ic + lw - 1], radius=rr + lw, outline="#6B5638", width=lw)
        y = top + ic + int(m * 0.07)
        d.text((w / 2, y), "薬札", font=ImageFont.truetype(GLYPH_TTF, int(m * 0.085)), fill=GOLD, anchor="mm")
        y += int(m * 0.09)
        d.text((w / 2, y), "Kusurifuda", font=ImageFont.truetype(f"{SRC}/ShipporiMinchoB1-Bold.ttf", int(m * 0.055)), fill=PARCH, anchor="mm")
        y += int(m * 0.06)
        d.text((w / 2, y), "MAP EDITION", font=ImageFont.truetype(f"{SRC}/ZenKakuGothicNew-Medium.ttf", int(m * 0.026)), fill=MUTED, anchor="mm")
        return im.quantize(colors=48, method=Image.Quantize.MEDIANCUT)
    links = []
    for (cw, ch, dpr) in DEVICES:
        for orient in ("portrait", "landscape"):
            pw, ph = (cw * dpr, ch * dpr) if orient == "portrait" else (ch * dpr, cw * dpr)
            name = f"splash/launch-{pw}x{ph}.png"
            splash(pw, ph).save(f"{APP}/{name}", optimize=True)
            links.append(f'<link rel="apple-touch-startup-image" media="(device-width: {cw}px) and (device-height: {ch}px) and (-webkit-device-pixel-ratio: {dpr}) and (orientation: {orient})" href="{name}">')
    idx = open(f"{APP}/index.html", encoding="utf-8").read()
    block = "<!-- ios-splash:start -->\n" + "\n".join(links) + "\n<!-- ios-splash:end -->"
    idx = re.sub(r"<!-- ios-splash:start -->.*?<!-- ios-splash:end -->", lambda _: block, idx, flags=re.S)
    open(f"{APP}/index.html", "w", encoding="utf-8").write(idx)
    print("icons +", len(links), "launch screens")

# ---------- glyphs drawn from a font into SVG icon files ----------
# A theme with "iconsFromFont" gets an editable SVG per glyph (elements, tools, decorative
# glyphs) in its icons/ folder, listed under assets as icon.<key>. Replace any file with
# hand-drawn art and drop the key from "keep" in iconsFromFont to stop it being regenerated.
def text_svg(text, ttf):
    f = TTFont(ttf); cmap = f.getBestCmap(); gs = f.getGlyphSet(); upm = f["head"].unitsPerEm
    if not all(ord(ch) in cmap for ch in text): return None
    asc, desc = f["hhea"].ascent, f["hhea"].descent
    x = 0; paths = []
    for ch in text:
        g = gs[cmap[ord(ch)]]; pen = SVGPathPen(gs)
        g.draw(TransformPen(pen, (1, 0, 0, -1, x, asc)))
        paths.append(pen.getCommands()); x += g.width
    # the em box (top 0.88em above the baseline), so a kanji icon sits like the kanji would in text
    top = asc - 0.88 * upm
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 {top:g} {x} {upm}"><path fill="currentColor" d="{" ".join(paths)}"/></svg>\n'
def icons_from_font(theme_dir):
    tp = f"{theme_dir}/theme.json"; tj = json.load(open(tp, encoding="utf-8"))
    spec = tj.get("iconsFromFont")
    if not spec: return
    ttf = f"{SRC}/{spec['font']}"; keep = set(spec.get("skip", []))
    if not os.path.exists(ttf): print("icons from font skipped (no", spec["font"], "in", SRC + ")"); return
    want = {}
    for k, v in (tj.get("glyphs") or {}).items():
        if not k.startswith("_") and v: want[k] = v
    for k, v in (tj.get("elements") or {}).items(): want["el." + k] = v["glyph"]
    for k, v in (tj.get("tools") or {}).items(): want["tl." + k] = v["glyph"]
    os.makedirs(f"{theme_dir}/icons", exist_ok=True); n = 0
    for k, text in want.items():
        if k in keep: continue
        svg = text_svg(text, ttf)
        if not svg: continue
        rel = "icons/" + re.sub(r"[^A-Za-z0-9_-]", "-", k) + ".svg"
        open(f"{theme_dir}/{rel}", "w", encoding="utf-8").write(svg)
        tj["assets"]["icon." + k] = rel; n += 1
    json.dump(tj, open(tp, "w", encoding="utf-8"), ensure_ascii=False, indent=2); open(tp, "a").write("\n")
    print("icons from font:", theme_dir, n)
for d in sorted(os.listdir(f"{APP}/themes")):
    if os.path.exists(f"{APP}/themes/{d}/theme.json"): icons_from_font(f"{APP}/themes/{d}")

# ---------- theme sprite sheets: every SVG asset of a theme in one file ----------
def sprite_for(theme_dir):
    tj = json.load(open(f"{theme_dir}/theme.json", encoding="utf-8"))
    if not tj.get("sprites") or not tj.get("assets"): return
    out = ['<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">']
    n = 0
    for name, rel in tj["assets"].items():
        if name.startswith("_") or not rel.endswith(".svg"): continue
        src = open(os.path.join(theme_dir, rel), encoding="utf-8").read()
        vb = re.search(r'viewBox="([^"]+)"', src).group(1)
        inner = re.sub(r"^.*?<svg[^>]*>", "", src, flags=re.S); inner = re.sub(r"</svg>\s*$", "", inner, flags=re.S)
        sid = "s-" + re.sub(r"[^A-Za-z0-9_-]", "-", name)
        inner = re.sub(r'\bid="([^"]+)"', lambda m: f'id="{sid}-{m.group(1)}"', inner)          # keep ids unique
        inner = re.sub(r'(href|url\()(["#(]*)#([A-Za-z][\w-]*)', lambda m: f"{m.group(1)}{m.group(2)}#{sid}-{m.group(3)}", inner)
        out.append(f'<symbol id="{sid}" viewBox="{vb}">{inner.strip()}</symbol>'); n += 1
    out.append("</svg>")
    open(os.path.join(theme_dir, tj["sprites"]), "w", encoding="utf-8").write("\n".join(out) + "\n")
    print("sprites:", theme_dir, n, "symbols")
for d in sorted(os.listdir(f"{APP}/themes")):
    if os.path.exists(f"{APP}/themes/{d}/theme.json"): sprite_for(f"{APP}/themes/{d}")

# ---------- service worker: precache everything, versioned by content hash ----------
files = []
for root, _, fs in os.walk(APP):
    for f in sorted(fs):
        p = os.path.relpath(os.path.join(root, f), APP)
        if p in ("sw.js",) or p.startswith((".", "build/", "splash/", "screenshots/")) or p.endswith((".md", ".zip")) or p in ("netlify.toml", "_headers"): continue
        files.append(p)
files.sort()
h = hashlib.sha256()
for p in files: h.update(p.encode()); h.update(open(os.path.join(APP, p), "rb").read())
ver = h.hexdigest()[:10]
precache = ["./"] + [p for p in files]
sw = open(os.path.join(APP, "build", "sw.template.js")).read().replace("__VERSION__", ver).replace("__PRECACHE__", json.dumps(precache, indent=1))
open(f"{APP}/sw.js", "w").write(sw)
print("sw version", ver, len(precache), "files")
