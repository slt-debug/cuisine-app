"""Prépare l'analyse d'une vidéo de recette : titre, chaîne, durée, chapitres, description
et transcription phrase par phrase avec début et fin au dixième de seconde.

Usage : py -I tools/yt_extract.py <url YouTube> <dossier de travail vide>
Nécessite yt-dlp (py -m pip install --user yt-dlp). Rien n'est téléchargé à part les textes.
Le fichier de sous-titres retenu (subs.json3) sert ensuite à tools/snap_cuts.py.
"""
import json
import os
import shutil
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8")


def cues(path):
    """Phrases [(début s, fin s, texte)] d'un fichier json3 de YouTube."""
    out = []
    for e in json.load(open(path, encoding="utf-8")).get("events", []):
        text = "".join(s.get("utf8", "") for s in e.get("segs") or []).replace("\n", " ").strip()
        if text:
            a = e["tStartMs"] / 1000
            out.append((a, a + e.get("dDurationMs", 0) / 1000, text))
    return out


def main():
    url, work = sys.argv[1], sys.argv[2]
    os.makedirs(work, exist_ok=True)
    # Pas de « fr.* » ni « en.* » : ils incluent des traductions automatiques que YouTube refuse vite (erreur 429).
    subprocess.run([sys.executable, "-m", "yt_dlp", "--skip-download", "--no-playlist", "--write-info-json",
                    "--ignore-errors", "--js-runtimes", "node",
                    "--write-subs", "--write-auto-subs", "--sub-langs", "fr,fr-FR,fr-orig", "--sub-format", "json3",
                    "-o", os.path.join(work, "video"), url], capture_output=True)
    info = json.load(open(os.path.join(work, "video.info.json"), encoding="utf-8"))
    dur = info.get("duration") or 1
    print("Titre :", info.get("title"))
    print("Chaîne :", info.get("channel"))
    print("Id :", info.get("id"), "| durée :", dur, "s")
    for c in info.get("chapters") or []:
        print(f"Chapitre {c['start_time']:.1f}-{c['end_time']:.1f}s : {c['title']}")
    print("\n--- Description ---\n" + (info.get("description") or ""))
    # Sous-titres manuels (écrits par l'auteur, phrases bien délimitées) s'ils couvrent la vidéo,
    # sinon automatiques (fr-orig) : leurs lignes chevauchent, les coupures seront moins précises.
    files = [f for f in os.listdir(work) if f.endswith(".json3")]
    manual = [f for f in files if f in ("video.fr.json3", "video.fr-FR.json3", "video.fr-fr.json3")]
    auto = [f for f in files if "orig" in f] or [f for f in files if f not in manual]
    pick, kind = None, ""
    if manual:
        c = cues(os.path.join(work, manual[0]))
        if c and c[-1][1] - c[0][0] >= 0.6 * dur:
            pick, kind = manual[0], "manuels"
    if not pick and auto:
        pick, kind = auto[0], "automatiques"
    if not pick:
        print("\nPas de sous-titres : découpage à faire à partir de la vidéo.")
        return
    shutil.copy(os.path.join(work, pick), os.path.join(work, "subs.json3"))
    print(f"\n--- Transcription, sous-titres {kind} ({pick}, copié en subs.json3) ---")
    for a, b, t in cues(os.path.join(work, pick)):
        print(f"{a:7.1f}-{b:6.1f}  {t}")


if __name__ == "__main__":
    main()
