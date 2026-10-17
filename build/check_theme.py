"""Check a Kusurifuda theme before shipping it.

    python3 build/check_theme.py themes/<id>/theme.json      # one theme
    python3 build/check_theme.py                             # every theme in config.json

Prints ERROR lines (the game will break or show placeholder text) and WARN lines
(it works, but something is missing, off-size or hard to read). Exit code 1 on any ERROR.
"""
import json, os, re, sys, xml.dom.minidom

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
errors, warns = [], []
def err(m): errors.append(m)
def warn(m): warns.append(m)

def load(p): return json.load(open(p, encoding="utf-8"))
def is_obj(o): return isinstance(o, dict)
def merge(a, b):
    out = dict(a)
    for k, v in (b or {}).items(): out[k] = merge(a[k], v) if is_obj(a.get(k)) and is_obj(v) else v
    return out

def read_theme(path):
    """The theme with everything it extends; every path made relative to the app root."""
    th = load(path); d = os.path.dirname(path)
    fix = lambda p: os.path.normpath(os.path.join(d, p)) if isinstance(p, str) else p
    own = dict(th)
    if "assets" in th: own["assets"] = {k: fix(v) for k, v in th["assets"].items() if not k.startswith("_")}
    for k in ("sprites", "stylesheet"):
        if th.get(k): own[k] = fix(th[k])
    if "fonts" in th:
        own["fonts"] = json.loads(json.dumps(th["fonts"]))
        for f in own["fonts"].values():
            if is_obj(f) and "faces" in f: f["faces"] = {w: fix(p) for w, p in f["faces"].items()}
    for grp in ("textures", "cards"):
        if grp in th:
            own[grp] = json.loads(json.dumps(th[grp]))
            for o in own[grp].values():
                if is_obj(o):
                    for k in list(o):
                        if k == "image" or re.fullmatch(r"[A-Z]", k): o[k] = fix(o[k])
    if not th.get("extends"): return own
    base = read_theme(fix(th["extends"]))
    out = merge(base, own); out.pop("extends", None)
    return out

HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
def rgb(h): return [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
def lum(h):
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in rgb(h)]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
def contrast(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True); return (la + 0.05) / (lb + 0.05)
def dist(a, b): return sum((x - y) ** 2 for x, y in zip(rgb(a), rgb(b))) ** 0.5

# what each asset is drawn at; the viewBox shape should match
SHAPES = {"art.": (160, 100, "element header / card art"), "oni": (1, 1, "map hazard"), "sakura": (1, 1, "map bonus"),
          "emblem": (1, 1, "goal emblem"), "boardMotif": (1, 1, "board motif"), "tool.": (1, 1, "tool picture"),
          "icon.": (1, 1, "icon (may be wider for multi-character glyphs)"), "char.": (1, 1, "round portrait"), "guild.": (1, 1, "crest")}

def check_svg(name, path):
    if not os.path.exists(path): err(f"asset {name}: file missing ({os.path.relpath(path, APP)})"); return
    if not path.endswith(".svg"): return
    src = open(path, encoding="utf-8").read()
    try: xml.dom.minidom.parseString(src)
    except Exception as e: err(f"asset {name}: not valid XML ({e})"); return
    m = re.search(r'viewBox="([^"]+)"', src)
    if not m: err(f"asset {name}: no viewBox"); return
    if re.search(r"<script|on\w+=|https?://(?!www\.w3\.org)", src): err(f"asset {name}: scripts, event handlers or external links are not allowed")
    if "<text" in src: warn(f"asset {name}: uses <text>; it depends on fonts the player may not have. Convert text to paths")
    _, _, w, h = [float(x) for x in re.split(r"[\s,]+", m.group(1).strip())]
    for pre, (sw, sh, what) in SHAPES.items():
        if name == pre or (pre.endswith(".") and name.startswith(pre)):
            want = sw / sh
            if pre == "icon." and w / h >= 0.9: break
            if abs(w / h - want) > 0.08: warn(f"asset {name} ({what}): viewBox is {w:g}x{h:g}, expected aspect {sw}:{sh}")
            break
    if name.startswith("icon.") and "currentColor" not in src:
        warn(f"asset {name}: no currentColor, so it will not take element or text colours")

def check(theme_path, cfg, lang, rules):
    th = read_theme(theme_path); tid = th.get("id") or os.path.basename(os.path.dirname(theme_path))
    print(f"\n== {tid} ({os.path.relpath(theme_path, APP)})")
    base = read_theme(os.path.join(APP, cfg["themes"][cfg["theme"]]))
    for k in ("id", "name", "colorScheme", "fonts", "assets", "elements", "tools", "glyphs", "colors", "map"):
        if k not in th: err(f"missing top-level '{k}'")
    if th.get("id") and th["id"] not in cfg["themes"]: err(f"id '{th['id']}' is not listed in config.json themes")
    if th.get("id") and th["id"] not in lang.get("themeNames", {}): warn(f"no themeNames.{th['id']} in the language file (falls back to theme.json name)")
    if th.get("id") and th["id"] not in lang.get("themeDesc", {}): warn(f"no themeDesc.{th['id']} line for the theme picker")

    # colours
    for k in base["colors"]:
        if k.startswith("_"): continue
        v = th.get("colors", {}).get(k)
        if v is None: err(f"colors.{k} missing")
        elif not HEX.match(v) and not v.startswith(("rgba(", "rgb(")): warn(f"colors.{k} = {v}: use #RRGGBB")
    for k in base["map"]:
        if k not in th.get("map", {}): err(f"map.{k} missing")
    C = th.get("colors", {})
    pairs = [("ink", "parch", 7), ("ink", "parch-hi", 7), ("parch", "lacquer", 7), ("brown", "parch", 4.5), ("muted", "lacquer", 4.5),
             ("parch-hi", "shu", 4.5), ("rival-pale", "lacquer", 4.5), ("gold", "lacquer", 4.5), ("hint-ink", "hint", 3), ("rival-text", "rival-deep", 4.5)]
    for a, b, need in pairs:
        if HEX.match(C.get(a, "")) and HEX.match(C.get(b, "")):
            c = contrast(C[a], C[b])
            if c < need: warn(f"contrast {a} on {b} is {c:.1f}:1 (want {need}:1)")

    # elements, tools, glyphs
    for el in ("W", "F", "E", "A", "V"):
        e = th.get("elements", {}).get(el)
        if not e: err(f"elements.{el} missing"); continue
        for k in ("glyph", "color", "ink", "art"):
            if k not in e: err(f"elements.{el}.{k} missing")
        if e.get("art") and e["art"] not in th.get("assets", {}): err(f"elements.{el}.art '{e['art']}' is not an asset")
        if HEX.match(e.get("color", "")) and HEX.match(C.get("parch-hi", "")) and contrast("#FFFFFF", e["color"]) < 2:
            warn(f"elements.{el}.color {e['color']} is light; white glyphs on it will be hard to read")
    tool_ids = [k for k in rules["tools"]["list"] if not k.startswith("_")]
    for t in tool_ids:
        d = th.get("tools", {}).get(t)
        if not d: err(f"tools.{t} missing")
        elif d.get("art") and d["art"] not in th.get("assets", {}): err(f"tools.{t}.art '{d['art']}' is not an asset")
    for k in base["glyphs"]:
        if k.startswith("_"): continue
        if k not in th.get("glyphs", {}): warn(f"glyphs.{k} missing (shown as nothing; also used for screen readers)")

    # assets
    A = th.get("assets", {})
    need = ["art.W", "art.F", "art.E", "art.A", "art.V", "oni", "sakura", "emblem", "boardMotif"] + [f"tool.{t}" for t in tool_ids]
    for n in need:
        if n not in A: err(f"assets.{n} missing")
    for n, p in A.items(): check_svg(n, p)
    icon_keys = [k for k in base["glyphs"] if not k.startswith("_")] + [f"el.{e}" for e in "WFEAV"] + [f"tl.{t}" for t in tool_ids]
    missing_icons = [k for k in icon_keys if f"icon.{k}" not in A]
    if missing_icons: warn(f"{len(missing_icons)} glyphs have no SVG icon and fall back to font text: {', '.join(missing_icons)}")
    if th.get("sprites"):
        sp = th["sprites"]
        if not os.path.exists(sp): err("sprites file missing: run python3 build/build.py")
        else:
            newest = max([os.path.getmtime(p) for p in A.values() if os.path.exists(p) and p.endswith(".svg")] or [0])
            if os.path.getmtime(sp) < newest: warn("sprites.svg is older than the art: run python3 build/build.py")
            ids = set(re.findall(r'<symbol id="([^"]+)"', open(sp, encoding="utf-8").read()))
            for n, p in A.items():
                if p.endswith(".svg") and "s-" + re.sub(r"[^A-Za-z0-9_-]", "-", n) not in ids: warn(f"asset {n} is not in sprites.svg yet: run python3 build/build.py")

    # fonts
    for role, f in th.get("fonts", {}).items():
        if not is_obj(f): continue
        for w, p in f.get("faces", {}).items():
            if not os.path.exists(p): err(f"fonts.{role} face {w}: file missing ({os.path.relpath(p, APP)}); add the TTF to THEME_FONTS in build/build.py")
    for role in ("display", "body"):
        if role not in th.get("fonts", {}): err(f"fonts.{role} missing")

    # surfaces
    for grp, keys in (("textures", ("page", "paper", "panel", "sheet")), ("cards", ("patient", "board", "ingredient", "back"))):
        for k, o in (th.get(grp) or {}).items():
            if k.startswith("_"): continue
            if k not in keys: warn(f"{grp}.{k} is not used (known: {', '.join(keys)})"); continue
            for kk, p in o.items():
                if (kk == "image" or re.fullmatch(r"[A-Z]", kk)) and not os.path.exists(p): err(f"{grp}.{k}.{kk}: file missing ({os.path.relpath(p, APP)})")
            if grp == "cards" and k == "ingredient" and o.get("layout") == "full":
                for e in "WFEAV":
                    if e not in o and "image" not in o: err(f"cards.ingredient has layout 'full' but no face for {e} and no 'image'")
    if th.get("stylesheet") and not os.path.exists(th["stylesheet"]): err("stylesheet file missing")
    if th.get("sound") not in (None, "kusurifuda", "academy"): warn(f"sound '{th.get('sound')}' is not a kit in js/sound.js (kusurifuda, academy); falls back to kusurifuda")

    # people
    abil = {k for k in rules.get("abilities", {}) if not k.startswith("_")}
    text = merge(lang, (th.get("text") or {}).get(cfg["language"], {}))
    for c in th.get("characters", []):
        if c.get("ability") not in abil: err(f"character {c.get('id')}: ability '{c.get('ability')}' is not in rules.json abilities ({', '.join(sorted(abil))})")
        if c.get("art") and c["art"] not in A: err(f"character {c.get('id')}: art '{c['art']}' is not an asset")
        if not text.get("content", {}).get("characters", {}).get(c.get("id"), {}).get("name"): err(f"character {c.get('id')}: no content.characters.{c.get('id')}.name")
    if len({c.get("ability") for c in th.get("characters", [])}) < len(th.get("characters", [])): warn("two characters share an ability; the rival may get a twin")
    if 0 < len(th.get("characters", [])) < 2: warn("only one character: the rival needs a different one")
    for g in th.get("guilds", []):
        if g.get("art") and g["art"] not in A: err(f"guild {g.get('id')}: art '{g['art']}' is not an asset")
        if not HEX.match(g.get("color", "#000000")): err(f"guild {g.get('id')}: color must be #RRGGBB")
        if not text.get("content", {}).get("guilds", {}).get(g.get("id"), {}).get("name"): err(f"guild {g.get('id')}: no content.guilds.{g.get('id')}.name")
    for pc in th.get("playerColors", []):
        if not HEX.match(pc): err(f"playerColors: {pc} must be #RRGGBB"); continue
        if HEX.match(C.get("rival", "")) and dist(pc, C["rival"]) < 0.25: warn(f"playerColors {pc} is close to the rival colour {C['rival']}")
        if HEX.match(C.get("parch-hi", "")) and contrast(C["parch-hi"], pc) < 3: warn(f"playerColors {pc}: light text on it is hard to read")

    # text overrides
    def walk(over, ref, path):
        for k, v in over.items():
            p = f"{path}.{k}" if path else k
            if k.startswith("_"): continue
            if k not in ref:
                if path.startswith(("content.characters", "content.guilds", "abilities")) or p in ("content.characters", "content.guilds"): continue
                warn(f"text.{p} is not a key in the language file (ignored unless new)"); continue
            r = ref[k]
            if is_obj(v) and is_obj(r): walk(v, r, p)
            elif isinstance(v, list) and isinstance(r, list) and len(v) != len(r): err(f"text.{p}: list has {len(v)} items, the language file has {len(r)}; keep them equal")
            elif isinstance(r, str) and isinstance(v, str):
                ph = re.compile(r"(?<!\{)\{(\w+)\}(?!\})"); need = set(ph.findall(r)); have = set(ph.findall(v))
                if need - have: warn(f"text.{p}: drops placeholder(s) {', '.join(sorted(need - have))}")
                if have - need: err(f"text.{p}: uses unknown placeholder(s) {', '.join(sorted(have - need))}")
    for lg, over in (th.get("text") or {}).items():
        walk(over, lang if lg == cfg["language"] else lang, "")

def main():
    cfg = load(os.path.join(APP, "config.json")); rules = load(os.path.join(APP, cfg.get("rules", "rules.json")))
    lang = load(os.path.join(APP, cfg["languages"][cfg["language"]]["file"]))
    paths = sys.argv[1:] or [os.path.join(APP, p) for p in cfg["themes"].values()]
    total = 0
    for p in paths:
        errors.clear(); warns.clear()
        check(os.path.abspath(p), cfg, lang, rules)
        for m in warns: print("WARN ", m)
        for m in errors: print("ERROR", m)
        print(f"{len(errors)} error(s), {len(warns)} warning(s)"); total += len(errors)
    sys.exit(1 if total else 0)

if __name__ == "__main__": main()
