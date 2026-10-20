# Processus — à suivre après chaque modification

Tout se fait sur la branche **`dev`** : l'extension, le site (`website/`) et
les sources de la vidéo (`video-brag/`). La branche `showcase-website` est
obsolète : on ne change jamais de branche pour mettre à jour le site.

Détails : `website/SETUP.md` (site), `video-brag/SETUP.md` (vidéo),
`.claude/skills/correctly-release/SKILL.md` (release).

## 1. Quel numéro de version ?

Version = `MAJEUR.MINEUR.CORRECTIF` (ex. `5.13.4`).

| Type de modification                                                   | Version           | Vidéo                         | Site                                 |
| ---------------------------------------------------------------------- | ----------------- | ----------------------------- | ------------------------------------ |
| Travail en cours, pas encore livré                                     | inchangée         | non                           | non                                  |
| **Correctif** : bug corrigé, petit ajustement, rien de visible de neuf | `5.13.3 → 5.13.4` | **non**                       | version + zip + « Nouveautés »       |
| **Mineure** : nouvelle fonction ou interface modifiée                  | `5.13.x → 5.14.0` | si l'interface montrée change | version + zip + textes des fonctions |
| **Majeure** : refonte, rupture                                         | `5.x → 6.0.0`     | oui                           | refonte des sections concernées      |

Règle : une version ne change que quand on **livre** (nouveau zip). Plusieurs
petites corrections peuvent partir ensemble dans un seul correctif.

## 2. Vérifier le code (toujours)

Depuis la racine :

```powershell
npm run format:check
npm run lint
npm test
npm run build          # typecheck + Vite + audit de dist/
```

Puis tester à la main dans Chrome/Brave (recharger l'extension dans
`chrome://extensions`, recharger l'onglet). Noter honnêtement PASS / FAIL /
NON TESTÉ / BLOQUÉ.

## 3. Monter la version

Remplacer l'ancienne version partout (chercher l'ancienne avec une recherche
texte, ex. `5.13.3`, pour ne rien oublier) :

- `package.json` + `package-lock.json` :
  `npm version X.Y.Z --no-git-tag-version`
- `frontend/manifest.json` : `version`, `version_name` (pour une mineure ou
  majeure aussi `name`, `description`)
- `scripts/audit-dist.mjs` : contrôle `manifest.version`
- `CLAUDE.md` : « État actuel »
- `docs/v5.<mineure>/RELEASE_NOTES.md` : ajouter une section en haut
  (corrigé, limites, statut des tests)
- Mineure ou majeure seulement : `README.md`, `scripts/package.mjs` (nom du
  zip `Correctly-V<x.y>`), `scripts/verify-browser.mjs`, nouveau dossier
  `docs/v5.<n>/`, textes de version de la page de paramètres
  (`scripts/i18n-options.mjs`, puis `node scripts/i18n-options.mjs` et
  `npm run format`)

Relancer l'étape 2 ensuite.

## 4. Construire le paquet

```powershell
npm run package        # → release/Correctly-V<x.y>-Extension.zip + .sha256
```

Vérifier que le `manifest.json` du zip porte la nouvelle version. Attention :
le nom du zip ne contient que `x.y`, donc un correctif **écrase** le zip
précédent de la même mineure.

## 5. Mettre à jour le site (`website/`, toujours sur `dev`)

1. Copier le zip dans `website/assets/download/Correctly-<X.Y.Z>.zip` et
   supprimer l'ancien.
2. `website/src/data/site.js` : `version` et `download`.
3. `website/src/data/fr.js` **et** `en.js` (mêmes clés) : `dl.lede`
   (version, date), `dl.new1`–`dl.new3`, `dl.button`, `dl.size` (taille
   réelle du zip), `dl.note` (statut de test réel), `footer.version`, et
   toute mention de version dans les autres textes (ex. catalogue de modèles).
4. `website/index.html` : numéro de version affiché (`release-num`).
5. `website/scripts/verify.mjs` : nom du zip attendu.
6. Mineure / majeure : corriger tout texte de fonction devenu faux
   (Fonctions, Démo, Confidentialité, FAQ). Le site ne doit jamais annoncer
   une fonction absente du zip proposé.

Puis, depuis `website/` :

```powershell
npm run build          # régénère website/site/ (ne jamais l'éditer à la main)
npm run verify         # doit finir par « 0 FAIL »
```

Et à la racine : `npx prettier --write website`.

## 6. Vidéo (seulement si l'interface montrée change)

Pas pour un correctif. Si `video-brag/brag.mp4` change, suivre
`video-brag/SETUP.md` en entier **dans la même tâche** (réencodage, poster,
teaser, chapitres, `npm run verify`).

## 7. Livrer (sur demande explicite)

1. Commit sur `dev` : code + docs + `website/` **et** `website/site/`
   régénéré (style `fix:`, `feat:`, `build:`…).
2. Tag annoté `vX.Y.Z` sur ce commit.
3. Push de `dev` et du tag. Le site se redéploie tout seul
   (`.github/workflows/static.yml`, seulement si `website/site/` a changé) ;
   suivre le déploiement dans l'onglet Actions de GitHub.
4. Jamais de fusion vers `main` sans demande.

## Résumé correctif (`x.y.Z`)

1. Coder + tests (étape 2).
2. Monter la version (étape 3, partie correctif).
3. `npm run package` (étape 4).
4. Site : zip, `site.js`, `fr.js`/`en.js`, `index.html`, `verify.mjs`, build,
   verify (étape 5).
5. Pas de vidéo.
6. Commit, tag, push sur `dev` (étape 7, sur demande).
