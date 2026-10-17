# SETUP — la vidéo et le site vitrine

**Règle : chaque fois que `video-brag/brag.mp4` change, le site vitrine
(`website/`) doit être mis à jour dans la même tâche.** Le site n'utilise
jamais `brag.mp4` directement : il en garde des copies encodées pour le web,
une image d'aperçu, un extrait muet et des chapitres minutés. Une vidéo
modifiée sans mettre à jour le site = un site qui montre l'ancienne vidéo,
ou des chapitres qui tombent au mauvais endroit.

Ne pas considérer la tâche finie tant que les étapes 1 à 6 ne sont pas faites
et que `npm run verify` n'est pas à 0 FAIL.

## Ce que le site utilise

| Fichier (`website/assets/video/`) | Rôle                                                         |
| --------------------------------- | ------------------------------------------------------------ |
| `correctly-1080.mp4`              | film complet, écrans > 900 px (lecteur `<dialog>`)           |
| `correctly-720.mp4`               | film complet, écrans ≤ 900 px                                |
| `poster.jpg`                      | image du lecteur avant lecture (plan du logo, vers 4,9 s)    |
| `teaser.mp4`                      | extrait muet de 12 s en boucle dans la section « film »      |
| `teaser-poster.jpg`               | image de l'extrait (mouvement réduit, avant chargement)      |

Le build copie `website/assets/` dans `website/site/assets/` (le site publié).

## 1. Réencoder (ffmpeg)

Depuis `website/`, avec le nouveau master :

```powershell
$src = '..\video-brag\brag.mp4'
ffmpeg -y -i $src -c:v libx264 -preset slow -crf 23 -tune animation -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart assets/video/correctly-1080.mp4
ffmpeg -y -i $src -vf scale=-2:720 -c:v libx264 -preset slow -crf 24 -tune animation -pix_fmt yuv420p -c:a aac -b:a 112k -movflags +faststart assets/video/correctly-720.mp4
ffmpeg -y -ss 4.9 -i $src -frames:v 1 -vf scale=1280:-2 -q:v 4 assets/video/poster.jpg
ffmpeg -y -ss 12.8 -t 12 -i $src -an -vf scale=1280:-2 -c:v libx264 -preset slow -crf 27 -tune animation -pix_fmt yuv420p -movflags +faststart assets/video/teaser.mp4
ffmpeg -y -ss 13 -i $src -frames:v 1 -vf scale=1280:-2 -q:v 4 assets/video/teaser-poster.jpg
```

- `-movflags +faststart` est obligatoire : sans lui, le film ne démarre
  qu'une fois entièrement téléchargé.
- `-ss 4.9` (poster) doit tomber sur un plan propre (logo + titre), sans
  texte à moitié animé. `-ss 12.8 -t 12` (extrait) doit montrer l'interface
  en action. Si le storyboard a bougé, choisir de nouveaux temps et
  **regarder l'image produite** avant de continuer.
- ffmpeg est installé via WinGet ; s'il n'est pas dans le PATH :
  `(Get-ChildItem -Recurse -Filter ffmpeg.exe "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" | Select-Object -First 1).FullName`.
- Viser environ 8 Mo (1080p), 4–5 Mo (720p), < 1 Mo (extrait). Si c'est
  nettement plus, monter le `-crf` d'un ou deux points.

## 2. Durée

Lire la nouvelle durée : `ffprobe -v error -show_entries format=duration -of csv=p=0 ..\video-brag\brag.mp4`.
Si elle change, mettre à jour **tous** ces endroits :

| Fichier                  | À modifier                                                        |
| ------------------------ | ----------------------------------------------------------------- |
| `index.html`             | `0:58` dans `.fp-time` ; `aria-valuemax="58"` sur `.fp-bar`       |
| `src/js/film.js`         | `FALLBACK_DURATION = 57.6`                                        |
| `src/data/fr.js`         | `hero.watch` (« 58 s »), `video.title` (« 58 secondes »), `film.meta` |
| `src/data/en.js`         | mêmes clés, en anglais                                            |
| `fr.js` / `en.js`        | `film.mp4` : la taille du fichier 1080p (« 7,6 Mo » / « 7.6 MB ») |

## 3. Chapitres

Les chapitres suivent le storyboard (`brag-plan.md`). Temps actuels :
0 (Introduction), 12.8 (Correction), 19.2 (Reformulation), 24.8 (Traduction),
30.4 (Résumé), 38.4 (Raccourcis de texte), 43.2 (Clés et réglages),
48 (En bref).

Si une scène bouge, est ajoutée ou supprimée, mettre à jour dans
`index.html` :

- les **pastilles** sous l'extrait (`.film-chip`) et les **chapitres du
  lecteur** (`.fp-chapter`) : `data-chapter="<secondes>"` **et** le texte
  affiché `<span class="chapter-time">0:12</span>` — les deux listes doivent
  rester identiques ;
- les **repères de la barre** (`.fp-tick`, un par chapitre sauf le premier) :
  `left: <temps / durée × 100>%` (ex. 12.8 / 57.6 = 22.22 %) ;
- les noms dans `src/data/fr.js` et `en.js` (`film.ch.*`) ; une nouvelle
  clé doit exister dans les deux langues (le build échoue sinon) ;
- `scripts/verify.mjs` : le test ouvre le chapitre `24.8` et le capture
  `--film` ouvre `30.4` ; adapter s'ils n'existent plus.

Vérifier chaque temps sur une planche d'images :
`ffmpeg -i ..\video-brag\brag.mp4 -vf "select='eq(n\,384)+eq(n\,576)',scale=640:-1,tile=2x1" -frames:v 1 planche.jpg`
(numéro d'image = secondes × 30).

## 4. Exactitude du contenu

Le site s'interdit d'afficher une fonctionnalité fausse. Avant d'intégrer,
comparer ce que la vidéo affirme avec la version présentée (`website/src/data/site.js`,
`version`). Exemple déjà relevé : la vidéo dit « 7 styles », la version
5.13.3 en a 8 (Formalité personnalisée). Signaler tout écart au
propriétaire plutôt que de le publier en silence.

La légende sous la vidéo (`video.caption`) dit que c'est une bande-annonce
animée recréée d'après l'interface réelle, avec des textes d'exemple : la
garder vraie (ne jamais présenter une animation comme une capture réelle).

## 5. Rebuild et contrôles

Depuis `website/` :

```powershell
npm run build      # régénère website/site (copie les nouveaux fichiers)
npm run verify     # doit finir par « 0 FAIL »
node scripts/verify.mjs --film --out=<dossier>      # regarder le lecteur ouvert
node scripts/verify.mjs --sections --out=<dossier>  # regarder la section film
```

Regarder les captures (poster, extrait, lecteur, chapitre actif) avant de
conclure. Puis, depuis la racine : `npx prettier --write website`.

## 6. Publier

- Branche : `showcase-website` uniquement (ne pas fusionner avec `main` ni
  `dev`). Faire `git pull` d'abord : le workflow GitHub Pages
  (`.github/workflows/static.yml`) a été ajouté depuis GitHub.
- Commiter `website/assets/video/` **et** `website/site/` (le site publié
  est versionné ; Git ne stocke qu'une fois les fichiers identiques).
- Ne jamais commiter `video-brag/` (sources de travail, frames, musique).
- Ne commiter, taguer ou pousser que sur demande explicite du propriétaire.
- Après le push, le workflow redéploie le site sur
  https://moqim-ghizlan.github.io/Correctly-Real-time-Grammar-Spelling-Assistant/
  (onglet Actions pour suivre).
