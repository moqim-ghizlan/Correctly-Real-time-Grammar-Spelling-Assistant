# Correctly — règles du projet

Extension personnelle Chrome/Brave, **Manifest V3, TypeScript strict**, qui
deviendra un assistant d'écriture IA à la demande (Gemini et OpenAI, clés
personnelles de l'utilisateur). État actuel : **V5.8** = page de paramètres, service worker,
correction, réécriture (7 styles), traduction (6 langues, arabe standard ou
syrien) à la demande, et raccourcis de texte locaux (`shared/shortcuts.ts`,
expansion dans `smart.js`, protection IA par marqueurs dans
`shared/protection.ts`). Bouton de la barre d'outils,
raccourcis et menu clic droit passent par `correctInTab()` du worker, qui
injecte `content.js` (`activeTab` + `scripting`) puis appelle
`correctlyRun(intent, styles)` ; le bouton intelligent optionnel (`smart.js`,
accès à tous les sites demandé seulement à l'activation) appelle le même
`runInPage()`. Une seule requête IA par action (`generate()` du
contrôleur), aperçu, puis Apply explicite. V5.7 : plusieurs clés
(profils) Gemini/OpenAI et une route clé + modèle par action
(`shared/providers.ts`), résolue et figée par requête, sans jamais de
repli vers une autre clé, un autre modèle ou fournisseur. V5.8 : limites
jour/semaine/mois (total, par action, par fournisseur, par clé), alertes
80/95/100 %, pause, dans IndexedDB `correctly-v5-quota`
(`shared/quota.ts` règles pures, `shared/quota-store.ts` transactions
atomiques) : `admit` puis `dispatch` (marqué envoyé) AVANT tout `fetch`,
jamais de remboursement ni de rejeu après envoi.

## Ce qui n'existe plus

V1–V4 (LanguageTool, serveur `127.0.0.1:8081`, backend Python, Java, tray,
installateur Windows, `createSetup.cmd`) ont été **supprimés** ; leurs sources
sont dans le tag Git `v4.0.0`. Le runtime V5 est **frontend-only** : ne jamais
réintroduire serveur local, Java, Python, LanguageTool, `.exe` ou installateur
(interdit par les specs `v5/*.md` et bloqué par `scripts/audit-dist.mjs`).
Les documents `plans/` et l'historique V4 sont du contexte, pas l'état du code.

## Carte du dépôt

- `frontend/manifest.json` — seul manifeste (copié dans `dist/` par Vite).
- `frontend/src/background/` — service worker, **seul appelant réseau** :
  `index.ts` (expéditeur de confiance + forme exacte du message,
  `storage.local` restreint aux contextes de confiance),
  `connection-controller.ts` (route figée, limites, un appel), `transport.ts`,
  `gemini-client.ts`, `openai-client.ts` (API Responses, `store:false`).
- `frontend/src/content/` — script injecté au clic : capture de la sélection,
  aperçu (shadow root fermé), Apply/Undo sur plage exacte.
- `frontend/src/options/` — page de paramètres (`settings-ui.ts`,
  `providers-ui.ts` pour clés et routes, `limits-ui.ts` pour les limites
  d'usage, `shortcuts-ui.ts`).
- `frontend/src/shared/` — contrats de messages, erreurs, catalogue de
  modèles (`models.ts`), profils/routes/secrets et migration V5.1
  (`providers.ts`), limites d'usage (`quota.ts`, `quota-store.ts`),
  schémas/normalisation des réglages, adaptateur `chrome.storage.local`.
- `frontend/tests/` — Vitest + jsdom (`unit/`, `integration/`,
  `helpers/fake-storage.ts`, `helpers/setup.ts` : IndexedDB `fake-indexeddb`
  neuve à chaque test).
- `scripts/` — audit de `dist/`, packaging ZIP, watch, smoke test navigateur.
- `docs/v5.1/` — architecture, sécurité, rapport de tests, checklist manuelle.
- `v5/` — spécifications des jalons V5 (`*_done.md` = livrés ; les autres
  sont des plans, pas des preuves).

## Commandes (racine, Node 22.13+ ou 24+)

```powershell
npm ci
npm test              # Vitest
npm run lint          # ESLint type-checked
npm run typecheck
npm run build         # typecheck + 2 builds Vite (modules + content.js) → dist/ + audit
npm run format:check
```

## Règles générales

- **Lire le code réel avant d'agir.** Les specs `v5/` proposent des chemins
  illustratifs ; le dépôt et les tests exécutés font foi.
- **Un jalon à la fois.** Ne pas implémenter silencieusement V5.(n+1).
- **Changement minimal**, dans le style existant : pas de nouvelle dépendance,
  permission, abstraction ou framework sans besoin démontré.
- **Ne jamais modifier les clés de stockage V4** ; les clés V5 sont
  namespacées `correctly.v5.*` et chaque lecture passe par `normalize*`.
- **Aucun log** dans le worker ou la page (ni clé, ni requête, ni réponse).
- **Ne jamais prétendre qu'un test est passé** sans l'avoir lancé. Distinguer
  PASS / FAIL / NON TESTÉ / BLOQUÉ (ex. test live qui exige la clé du
  propriétaire).
- **Git** : ne pas committer, taguer, pousser ni lancer de commande
  destructive (`reset --hard`, `clean`, suppression de `release/`) sans
  demande explicite. `dist/` et `release/` sont ignorés par Git.
- Shell : Windows 10 ; PowerShell par défaut, Git Bash disponible.
- Le code, les commentaires et les messages UI sont en **anglais** ; les
  échanges avec l'utilisateur en **français**.

## Skills du projet (`.claude/skills/`)

- `correctly-extension` — développer une fonctionnalité de l'extension.
- `correctly-debugging` — diagnostiquer et corriger un bug.
- `correctly-security` — confidentialité, clé API, permissions, réseau.
- `correctly-release` — tests complets, build, ZIP, versions et tags Git.
