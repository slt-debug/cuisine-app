"""Recale les extraits vidéo d'une recette sur les silences entre les phrases.

Règles :
- une coupure qui tombe dans une phrase est déplacée avant ou après la phrase, du côté où se trouve
  la plus grande partie de la phrase (début : 0,3 s avant la phrase ; fin : 0,3 s après) ;
- une coupure dans un silence ne bouge pas (la vidéo peut montrer un geste sans parole) ;
- deux étapes qui se suivent ne se chevauchent pas : si une étape finit après le début de la suivante,
  elle finit là où la suivante commence.

Usage : py -I tools/snap_cuts.py <recipes.json> <id recette> <subs.json3> [--write]
Sans --write : affiche seulement le résultat, avec la première et la dernière phrase de chaque extrait.
"""
import json
import sys

sys.stdout.reconfigure(encoding="utf-8")
PAD_START, PAD_END = 0.3, 0.3


def cues(path):
    out = []
    for e in json.load(open(path, encoding="utf-8")).get("events", []):
        text = "".join(s.get("utf8", "") for s in e.get("segs") or []).replace("\n", " ").strip()
        if text:
            a = e["tStartMs"] / 1000
            out.append([a, a + e.get("dDurationMs", 0) / 1000, text])
    out.sort()
    # Sous-titres automatiques : une ligne reste affichée pendant la suivante ; on coupe au début de la suivante.
    for i in range(len(out) - 1):
        out[i][1] = min(out[i][1], out[i + 1][0])
    return out


def inside(cs, t):
    return next((c for c in cs if c[0] < t < c[1]), None)


def snap_start(cs, t):
    c = inside(cs, t)
    if c:
        t = c[0] - PAD_START if c[1] - t >= t - c[0] else c[1] + 0.1
    prev = max((c[1] for c in cs if c[1] <= t + 1e-6), default=0)
    return max(t, prev + 0.05)


def snap_end(cs, t):
    c = inside(cs, t)
    if c:
        t = c[1] + PAD_END if t - c[0] >= c[1] - t else c[0] - 0.2
    nxt = min((c[0] for c in cs if c[0] >= t - 1e-6), default=t + 1)
    return min(t, nxt - 0.05)


def said(cs, a, b):
    inn = [c[2] for c in cs if c[0] >= a - 0.05 and c[1] <= b + 0.05]
    return (inn[0], inn[-1]) if inn else ("(pas de parole)", "")


def main():
    path, rid, subs = sys.argv[1], sys.argv[2], sys.argv[3]
    data = json.load(open(path, encoding="utf-8"))
    r = next(x for x in data["recipes"] if x["id"] == rid)
    cs = cues(subs)
    steps = [s for s in r["steps"] if s.get("start") is not None]
    for s in steps:
        s["_a"] = snap_start(cs, s["start"])
        s["_b"] = snap_end(cs, s.get("end", s["start"]))
    for s, n in zip(steps, steps[1:]):
        if s["_b"] > n["_a"]:
            s["_b"] = n["_a"]
    for k, s in enumerate(steps, 1):
        a, b = round(s.pop("_a"), 1), round(s.pop("_b"), 1)
        first, last = said(cs, a, b)
        print(f"{k:2}. {s['start']:>6}-{s.get('end', ''):<6} -> {a:6.1f}-{b:6.1f}  {s['title']}")
        print(f"      début : « {first} »\n      fin   : « {last} »")
        s["start"], s["end"] = a, b
    if "--write" in sys.argv:
        with open(path, "w", encoding="utf-8") as f:
            f.write(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
        print("\nrecipes.json mis à jour.")


if __name__ == "__main__":
    main()
