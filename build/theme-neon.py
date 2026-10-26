# Writes themes/neon/theme.json: Kusurifuda after dark. Same game, Tokyo-at-night art and words.
# Usage: python3 build/theme-neon.py   (then run build/build.py for sprites and sw.js)
import json, os
APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EN = json.load(open(f"{APP}/i18n/en.json", encoding="utf-8"))
KU = json.load(open(f"{APP}/themes/kusurifuda/theme.json", encoding="utf-8"))

ELS = {"F": "Hot", "W": "Rain", "E": "Street", "A": "Sky", "V": "Lucky Cat"}
INGREDIENTS = {
    "F": ["Wasabi", "Takoyaki", "Seared Salmon"], "W": ["Ramune", "Tuna Nigiri", "Fugu"],
    "A": ["Hanami Dango", "Transit Card", "Soufflé Pancakes"], "E": ["Onigiri", "Matcha Wafer", "Katsu Sando"],
    "AF": ["Matcha Latte", "Yakitori"], "AW": ["Shaved Ice", "Mochi Ice Cream"], "FE": ["Taiyaki", "Curry Bread"], "EW": ["Miso Soup", "Cup Ramen"], "V": "Lucky Cat",
}
PATIENTS = ["An Old Salaryman", "The Konbini Night Clerk", "The Sushi Master", "The Station Master", "A Night Taxi Driver", "The Enka Diva",
    "A Karaoke Salaryman", "A Yakitori Griller", "A Rockabilly Grandpa", "A Construction Flagman", "A Capsule-Hotel Guest", "The Elevator Lady",
    "A Ramen Stall Owner", "The Tuna King", "A Neon-Sign Repairman", "A Curry-Shop Cook", "A Country Grandma", "A Cheer-Squad Leader",
    "A Food-Sample Lady", "An Umbrella Repairman", "A Lost-Property Clerk", "The Ramen Emperor", "A Morning-Exercise Grandpa", "A Shogi Player",
    "A Train Pusher", "A Shy Office Lady", "A TV Weatherman", "An Unlucky Fortune Drawer", "The Shopping-Street Mayor", "A Lovestruck Octopus",
    "A Shamisen Busker", "A Lovestruck Bus Driver", "A Gamer Grandpa", "A Sweet-Shop Granny", "A Fish-Market Auctioneer", "A Festival Drummer"]
AILMENTS = ["Fever", "Air-con chills", "Sleeplessness", "Heartbreak", "A cough", "Bad luck", "Fox possession", "Smartphone neck",
    "Lovesickness", "A forgotten password", "Toothache", "Nightmares", "Hiccups", "Stage fright", "Homesickness", "Karaoke throat"]
TOOLS = {
    "ladle": ("Train Map", "Once per brew, turn one card to go another way: a quarter turn either way, or a half turn.", "Turn one card any way", "図"),
    "mortar": ("Escalator", "Once per brew, ride one card one square further or one square shorter.", "One card a square longer or shorter", "段"),
    "charm": ("Shopping Bike", "Once per brew, pedal one extra step to any square next to you.", "One free step, any way", "輪"),
    "basket": ("Konbini Bag", "When you gather or draw blind, take 4 cards instead of 2.", "Gather 4 instead of 2", "袋"),
    "kettle": ("Microwave", "Once per brew, heat up one card from your garden and play it a second time.", "One garden card twice", "温"),
    "abacus": ("Point Card", "Every patient you cure with 3 or more ingredients from your hand and garden pays 2 extra {{mon}}.", "+2 for a cure of 3+ ingredients", "点"),
}
CHARS = {"herbalist": ("Grandma Ume", "the Balcony Gardener"), "merchant": ("Auntie Kazuko", "the Bargain Hunter"), "miko": ("Mr. Sato", "the Lottery Winner"), "kunoichi": ("Tetsu", "the Bicycle Courier")}
GUILDS = [("lantern", "F", "Night Market", "Open till the last train"), ("train", "A", "Last Train", "Never miss the last one"),
    ("ramen", "E", "Ramen Alley", "Fills you up, keeps you going"), ("umbrella", "W", "Rainy Season", "Fine in any weather")]
COLORS = {"F": ("#E85C7A", "#C13A5C"), "W": ("#3FB0D6", "#1F7FA6"), "E": ("#6FAE5C", "#3E7F31"), "A": ("#8C74D8", "#6550B8"), "V": ("#F2B33D", "#A8740F")}
# the night-train journey: same ten stops and rules as the Journey to Edo, a different road
STOPS = [
    ("Sapporo", [141.354, 43.062], "Snow and neon.", "Snow falls on the neon crossing, and the ramen alley is full. You open a little stall under the lights; Tokyo is ten stops down the line."),
    ("Hakodate", [140.729, 41.769], "The night market by the harbour.", "Squid stalls glow by the red-brick warehouses. The cases get harder here: longer routes, and symptoms on the way."),
    ("Aomori", [140.747, 40.822], "Giant glowing festival floats.", "Paper warriors and dragons glow above a dancing crowd. The toolmakers come out for the festival and sell to any healer with yen."),
    ("Sendai", [140.870, 38.268], "Streamers in the arcade.", "Huge paper streamers hang in the covered arcade, and the benches are full. The longer they wait, the more they need, and the more they pay."),
    ("Utsunomiya", [139.883, 36.555], "Dumpling alley.", "A steamy alley of tiny dumpling shops, and rival healers who claim the customers they want."),
    ("Ueno", [139.777, 35.714], "Morning exercises in the park.", "At dawn the whole park stretches together. The regulars here are generous: grateful patients bring gifts."),
    ("Akihabara", [139.773, 35.698], "Everybody has caught something.", "The arcades are packed and everyone is sneezing. Every patient is contagious, and if one goes home uncured, both healers pay."),
    ("Ginza", [139.767, 35.671], "A VIP wants a private cure.", "A black car pulls up outside the department store. A VIP asks you, quietly, for a cure in two stages."),
    ("Shinjuku", [139.700, 35.690], "Don't miss the last train.", "Neon alleys, tangled rail lines and the last train at midnight. The bench is short and your rival keeps their cards hidden."),
    ("Shibuya", [139.702, 35.658], "The crossing, the end of the line.", "The great crossing in neon rain. Your VIP is the Ramen Emperor himself, and the best healer in the city is already ahead."),
]
TOWN_IDS = ["aomori", "sannohe", "morioka", "hanamaki", "ichinoseki", "sendai", "fukushima", "shirakawa", "utsunomiya", "edo"]

def short(n): return n.split(" ", 1)[1] if n.split(" ", 1)[0] in ("A", "An", "The") else n
def lucky(s): return s.replace("The Kitsune Tail", "The Lucky Cat").replace("A Kitsune Tail", "A Lucky Cat").replace("Kitsune Tail", "Lucky Cat").replace("kitsune tail", "lucky cat")

assets = {}
# the base theme's drawn icons, listed here so this theme's sprite sheet has them (with the cat for the wild card)
for k, v in KU["assets"].items():
    if v.endswith(".svg") and (k.startswith("icon.") or k in ("boardMotif",)): assets[k] = "../kusurifuda/" + v
assets["icon.el.V"] = "icons/el-V.svg"
for k in ["F", "W", "A", "E"]:
    for n in (1, 2, 3): assets[f"ing.{k}.{n}"] = f"cards/ing-{k}-{n}.webp"
for k in ["AF", "AW", "FE", "EW"]:
    for n in (1, 2): assets[f"ing.{k}.{n}"] = f"cards/ing-{k}-{n}.webp"
assets["ing.V"] = "cards/ing-V.webp"
for c in CHARS: assets[f"char.{c}"] = f"people/char-{c}.webp"
for g, *_ in GUILDS: assets[f"guild.{g}"] = f"people/guild-{g}.webp"
for e in "FAEW": assets[f"oni.{e}"] = f"assets/oni-{e}.webp"
for k, f in {"oni": "oni", "sakura": "sakura", "cure": "cure", "seal": "cured", "symptom": "symptom", "royal": "royal", "emblem": "emblem"}.items(): assets[k] = f"assets/{f}.webp"
for q in ("frail", "nervous", "stubborn", "contagious"): assets[f"quirk.{q}"] = f"assets/quirk-{q}.webp"
for t in TOOLS: assets[f"tool.{t}"] = f"assets/tool-{t}.webp"; assets[f"icon.tl.{t}"] = f"assets/tool-{t}.webp"
for w in range(36):
    p = f"themes/neon/people/patient-{w}.webp"
    assets[f"patient.{w}"] = f"people/patient-{w}.webp" if os.path.exists(f"{APP}/{p}") else ""   # no portrait yet: the plain figure
for t in TOWN_IDS: assets[f"town.{t}"] = f"towns/{t}.webp"

stops = EN["quest"]["stops"]
text = {
    "terms": {"mon": "yen", "Mon": "Yen"},
    "app": {"name": "Kusurifuda Neon", "title": "Kusurifuda Neon"},
    "title": {"tagline": "Cures and curses after dark"},
    "content": {
        "elements": ELS, "ingredients": INGREDIENTS,
        "patients": [{"full": n, "short": short(n)} for n in PATIENTS], "ailments": AILMENTS,
        "tools": {k: {"name": v[0], "text": v[1], "short": v[2]} for k, v in TOOLS.items()},
        "characters": {k: {"name": a, "title": b} for k, (a, b) in CHARS.items()},
        "guilds": {g: {"name": n, "motto": m} for g, e, n, m in GUILDS},
    },
    "quest": {"title": "Night Train to Shibuya", "menu": "Night Train to Shibuya", "menuNew": "Ten stops from Sapporo to Shibuya",
        "done": "You reached Shibuya!", "stops": [{"name": n, "line": l, "story": s} for n, at, l, s in STOPS]},
    "chest": {k: {"name": "Your own " + TOOLS[t][0], "text": "Start each game with the " + TOOLS[t][0] + "."} for k, t in (("ladle", "ladle"), ("mortar", "mortar"), ("kitsune", "charm"), ("basket", "basket"), ("kettle", "kettle"), ("abacus", "abacus"))},
    "status": {"needElWhy": lucky(EN["status"]["needElWhy"])},
    "rules": {"needEl": lucky(EN["rules"]["needEl"]), "brew": {"p": lucky(EN["rules"]["brew"]["p"])}},
    "quirks": {"stubborn": {"how": lucky(EN["quirks"]["stubborn"]["how"])}},
}
theme = {
    "_about": "Kusurifuda after dark: an all-night drugstore under a Tokyo railway arch. Konbini food and sushi as ingredients, quirky city folk as patients, a night train from Sapporo to Shibuya. It extends Kusurifuda and swaps the art and words; made by build/theme-neon.py.",
    "id": "neon", "name": "Neon", "extends": "../kusurifuda/theme.json", "sprites": "sprites.svg",
    "assets": assets,
    "elements": {e: dict({"color": c, "ink": i}, **({"glyph": "猫", "on": "#1E1914"} if e == "V" else {})) for e, (c, i) in COLORS.items()},
    "tools": {k: {"glyph": v[3], "art": f"tool.{k}"} for k, v in TOOLS.items()},
    "guilds": [{"id": g, "art": f"guild.{g}", "color": COLORS[e][0], "element": e} for g, e, n, m in GUILDS],
    "glyphs": {"brand": "薬札"},
    "map": {"sakura": "#F6D3DC", "cure": "#F2B33D"},
    "questAt": [at for n, at, l, s in STOPS],
    "text": {"en": text},
}
os.makedirs(f"{APP}/themes/neon", exist_ok=True)
open(f"{APP}/themes/neon/theme.json", "w", encoding="utf-8").write(json.dumps(theme, ensure_ascii=False, indent=2) + "\n")
print("themes/neon/theme.json:", len(assets), "assets,", sum(1 for k, v in assets.items() if k.startswith("patient.") and v), "portraits")
