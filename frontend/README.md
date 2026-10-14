# Frontend — extension Chrome/Brave

`src/` contient le service worker, les content scripts et les pages de l’extension. `public/` contient les assets ; `tests/` contient les tests et fixtures. Le manifest et les configurations TypeScript/Vite/Vitest sont dans ce dossier.

Depuis la racine du projet : `npm.cmd run build`, `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run dev` ou `npm.cmd run fixture`.

La compilation écrit dans **`../dist/`**, au même emplacement qu’avant. Chargez ce dossier dans Chrome/Brave ; le dossier `frontend` contient les sources, pas l’extension compilée. Les dépendances Node et `package.json` sont partagés à la racine.
