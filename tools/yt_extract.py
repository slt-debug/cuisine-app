"""Prépare l'analyse d'une vidéo de recette : titre, chaîne, durée, chapitres, description
et transcription horodatée condensée (sous-titres français, manuels de préférence).

Usage : py -I tools/yt_extract.py <url YouTube> <dossier de travail vide>
Nécessite yt-dlp (py -m pip install --user yt-dlp). Rien n'est téléchargé à part les textes.
"""
import glob
import json
import os
import re
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8")


def condense(vtt_path):
    text = open(vtt_path, encoding="utf-8").read()
    cues = re.findall(r"(\d\d:\d\d:\d\d)\.\d+ --> [^\n]*\n(.*?)(?:\n\n|\Z)", text, re.S)
    out, last = [], ""
    for ts, body in cues:
        line = re.sub(r"<[^>]+>", "", body).strip().split("\n")[-1].strip()
        if line and line != last:
            h, m, s = map(int, ts.split(":"))
            out.append(f"{h * 3600 + m * 60 + s:>5}s {line}")
            last = line
    return out


def main():
    url, work = sys.argv[1], sys.argv[2]
    os.makedirs(work, exist_ok=True)
    subprocess.run([sys.executable, "-m", "yt_dlp", "--skip-download", "--no-playlist", "--write-info-json",
                    "--write-subs", "--write-auto-subs", "--sub-langs", "fr.*,fr,en.*", "--sub-format", "vtt",
                    "-o", os.path.join(work, "video"), url], check=True, capture_output=True)
    info = json.load(open(os.path.join(work, "video.info.json"), encoding="utf-8"))
    print("Titre :", info.get("title"))
    print("Chaîne :", info.get("channel"))
    print("Id :", info.get("id"), "| durée :", info.get("duration"), "s")
    for c in info.get("chapters") or []:
        print(f"Chapitre {int(c['start_time'])}-{int(c['end_time'])}s : {c['title']}")
    print("\n--- Description ---\n" + (info.get("description") or ""))
    subs = sorted(glob.glob(os.path.join(work, "video.*.vtt")))
    # Sous-titres manuels (video.fr.vtt) s'ils couvrent la vidéo, sinon automatiques (fr-orig).
    pick = max(subs, key=lambda p: (".fr." in p or ".fr-" in p, os.path.getsize(p)), default=None)
    if pick:
        print(f"\n--- Transcription ({os.path.basename(pick)}) ---")
        print("\n".join(condense(pick)))
    else:
        print("\nPas de sous-titres : découpage à faire à partir de la vidéo.")


if __name__ == "__main__":
    main()
