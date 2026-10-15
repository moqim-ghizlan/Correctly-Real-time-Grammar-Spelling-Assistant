---
name: correctly-release
description: >-
  Prépare et vérifie une livraison de Correctly : suite complète de tests,
  lint, format, build et audit de dist/, smoke test Chrome/Brave, paquet ZIP
  + SHA-256 (le livrable V5 ; plus d'installateur Windows), montée de version,
  notes et rapport de tests, commits et tags Git. À utiliser avant une
  release, un changement de version, un tag ou pour vérifier qu'un jalon est
  prêt.
---

# Release de Correctly

## Règle absolue

Préparer et vérifier, oui. **Committer, taguer, pousser, fusionner ou
supprimer des artefacts uniquement sur demande explicite**, et redemander
avant chaque action publique (`git push`, `gh release`).

## Livrable V5

- `release/Correctly-V5.x-Extension.zip` + `.zip.sha256`, produits par
  `npm run package` (build + audit + ZIP reproductible, `manifest.json` à la
  racine). L'utilisateur l'extrait et fait **Load unpacked**.
- **Pas d'installateur Windows en V5** (Setup.exe, `createSetup.cmd`, Java,
  serveur : supprimés, interdits par les specs, refusés par l'audit). Les
  anciens installateurs n'existent que dans le tag `v4.0.0`. Si l'utilisateur
  en demande un, signaler le conflit avec les specs avant toute action.

## 1. État Git

`git status --short`, branche, `git tag`, `git log --oneline -5`. Repérer les
fichiers non suivis ou supprimés et ne rien écraser. Les tags existants suivent
`vX.Y.Z` (`v1.0.0` … `v4.0.0`).

## 2. Qualité (tout depuis la racine)

```powershell
npm ci
npm run format:check
npm run lint
npm test
npm run build          # typecheck + Vite + audit dist/
npm run test:browser   # Brave ; puis: node scripts/verify-browser.mjs --browser=chrome
```

- `test:browser` envoie **une** requête à Google avec une clé factice (attendu :
  `API_KEY_INVALID`) ; `--offline` l'évite. Il écrit ses preuves dans
  `docs/v5.x/evidence/`.
- Le test live avec la vraie clé du propriétaire n'est jamais exécuté par
  Claude : le marquer **BLOQUÉ** et renvoyer à `docs/v5.x/MANUAL_CHECKLIST.md`.

## 3. Montée de version

La version est écrite en dur à plusieurs endroits ; les changer **tous
ensemble** (rechercher l'ancienne avec Grep pour ne rien oublier) :

- `package.json` + `package-lock.json` (`npm version X.Y.Z --no-git-tag-version`)
- `frontend/manifest.json` : `name`, `version`, `version_name`, `description`,
  `action.default_title`
- `frontend/src/options/options.html` : `<title>`, `<h1>`, mentions de version
- `scripts/audit-dist.mjs` : contrôles `manifest.version` et `name`
- `scripts/package.mjs` : nom du ZIP
- `README.md`, et un nouveau dossier `docs/v5.x/` (ARCHITECTURE, SECURITY,
  TEST_REPORT, MANUAL_CHECKLIST, RELEASE_NOTES)

Puis relancer toute l'étape 2 : un ZIP produit avant la montée de version est
invalide.

## 4. Paquet et intégrité

1. `npm run package`.
2. Vérifier : nom du ZIP = version ; contenu = `dist/` audité ; SHA-256 du
   fichier `.sha256` recalculé (`Get-FileHash -Algorithm SHA256`) identique.
3. Tout rebuild impose de refaire le paquet et l'empreinte.

## 5. Documentation de release

- `TEST_REPORT.md` : chaque commande avec son résultat **réellement observé**
  (nombre de tests, versions navigateur, date, commit).
- `RELEASE_NOTES.md` : nouveau, retiré, limites connues.
- Statuts : PASS / FAIL / NON TESTÉ / BLOQUÉ. Un build qui passe ≠ prêt à
  publier.

## 6. Git (sur demande uniquement)

- Commits en style Conventional Commits comme l'historique récent
  (`feat:`, `build:`…), avec l'attribution demandée par l'environnement.
- Tag annoté `vX.Y.Z` sur le commit vérifié, après accord.
- `dist/` et `release/` restent hors de Git ; le ZIP se joint à une release
  GitHub seulement si l'utilisateur le demande.

## Rendu

`Statut : PRÊT / NON PRÊT` · tests réussis / échoués / non exécutés ·
blocages · artefacts et SHA-256 vérifiés · actions restantes pour
l'utilisateur.
