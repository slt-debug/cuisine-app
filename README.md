# Cuisine

Appli web pour iPhone (à installer sur l'écran d'accueil) : des recettes guidées pas à pas, chaque étape avec son extrait de la vidéo YouTube d'origine, ses temps de travail et d'attente, des minuteurs qui tournent en même temps et les tâches à faire pendant les attentes.

- Portions ajustables : les quantités se recalculent, y compris dans le texte des étapes.
- Liste de courses : plusieurs recettes, quantités additionnées, rangées par rayon.
- Notes, ajustements et historique des fois où la recette a été faite.
- Bouton « Demander à Claude » : copie la recette, les quantités et l'étape en cours, à coller dans une conversation.

Les vidéos restent sur YouTube (lecteur intégré avec un début et une fin) : rien n'est téléchargé.

## Données

Rien de personnel dans ce dépôt. Les recettes et les données de l'utilisateur vivent dans un dépôt GitHub privé, lu et écrit avec un jeton « fine-grained » limité à ce dépôt (Contents : lecture et écriture) :

- `recipes.json` : les fiches recettes (écrites depuis le PC) ;
- `user.json` : notes, nombre de personnes, liste de courses (écrit par l'appli).

## Format d'une recette

Voir `recipe.js` pour les règles. Points clés : `ingredients[].id` sert à écrire `{id}` dans le texte d'une étape (remplacé par la quantité du nombre de personnes choisi) ; `steps[].start` / `end` en secondes dans la vidéo ; `work` en minutes ; `wait: { min, label }` lance un minuteur (au-delà de 3 h, pas de minuteur : la recette reprend plus tard) ; `during` liste les tâches à faire pendant l'attente ; `day: "veille"` pour ce qui se fait la veille.

## Ajouter une recette

1. `py -I tools/yt_extract.py <url> <dossier vide>` affiche les chapitres, la description et la transcription phrase par phrase (début et fin au dixième de seconde, sous-titres manuels de préférence), qui servent à rédiger la fiche. Il copie les sous-titres retenus dans `<dossier>/subs.json3`.
2. Rédiger les étapes en rattachant chaque phrase à la bonne étape, et poser chaque coupure dans un silence entre deux phrases : la fin d'une étape est le début de la suivante (pas de chevauchement), au dixième de seconde.
3. `py -I tools/snap_cuts.py <recipes.json> <id> <dossier>/subs.json3` vérifie le découpage : il recale toute coupure tombée dans une phrase et affiche la première et la dernière phrase de chaque extrait. `--write` enregistre le résultat.
