# Correctly — Real-time Grammar & Spelling Assistant

Extension Chrome/Brave gratuite : orthographe et grammaire en français, en anglais ou en mode Auto, avec un moteur **LanguageTool local**. TypeScript strict, Manifest V3, aucune API cloud, aucun framework UI.

La V1 est implémentée et testée en DOM simulé. Le chargement réel et l’affichage dans Chrome/Brave restent à valider avec [la checklist manuelle](docs/MANUAL_TESTS.md).

## Installation

Prérequis : Node.js **22.13+** ou **24+**, npm, et Java compatible avec la distribution LanguageTool utilisée.

```powershell
npm install
npm run lint
npm test
npm run build
```

Le résultat est dans `dist/`. Dans `chrome://extensions` ou `brave://extensions`, activez le mode développeur, cliquez sur **Charger l’extension non empaquetée**, puis sélectionnez **dist**, pas la racine du dépôt. Rechargez ensuite les pages déjà ouvertes.

## Démarrer LanguageTool local

Téléchargez et décompressez le serveur depuis [la documentation officielle LanguageTool](https://dev.languagetool.org/http-server). Dans son dossier, créez un fichier vide `server.properties`, puis démarrez :

```powershell
java -cp languagetool-server.jar org.languagetool.server.HTTPServer --config server.properties --port 8081
```

Correctly appelle `http://127.0.0.1:8081/v2/check` depuis le service worker. Aucun CORS ouvert ni option `--public` n’est nécessaire pour ce client d’extension. Gardez la fenêtre du serveur ouverte. L’application graphique LanguageTool Windows ne remplace pas ce serveur.

Le mode Auto utilise LanguageTool ; sur Windows et les phrases très courtes, choisissez Français ou Anglais si la détection est mauvaise. La [documentation du serveur](https://dev.languagetool.org/http-server) précise les limites de la détection sans fastText.

## Utilisation

Écrivez dans un textarea, un input texte/recherche ou un contenteditable simple. Après une pause de 400 ms, les erreurs sont soulignées en rouge (orthographe) ou en orange (grammaire). Cliquez sur une erreur pour choisir une suggestion ou l’ignorer. Le clic droit prépare la meilleure suggestion dans le menu natif.

L’icône de l’extension permet de changer la langue, désactiver la correction globalement ou sur le domaine courant, ouvrir les paramètres et vérifier la disponibilité du moteur. Les paramètres ajoutent le délai, les catégories et un dictionnaire personnel sensible à la casse.

Les textes restent en mémoire temporaire. Seuls les paramètres et les mots ajoutés volontairement au dictionnaire sont enregistrés avec `chrome.storage.local`. La connexion au moteur utilise uniquement l’adresse locale ; aucune télémétrie.

## Développement

```powershell
npm run dev
npm run test:watch
npm run format
npm run format:check
npm run fixture
```

`dev` compile d’abord, puis surveille séparément les pages/service worker et le content script. Rechargez l’extension après les modifications. `fixture` sert une page de test à `http://127.0.0.1:8080`.

## Limites de la V1

- Champs de plus de 5 000 caractères ignorés ; pas encore d’analyse de paragraphe ciblé.
- Contenteditable simple : extraction des retours à la ligne et surcouche Range sans réécriture du DOM. Les remplacements qui traversent des séparateurs de paragraphes synthétiques sont refusés.
- Éditeurs riches pilotés par un framework, Shadow DOM de la page, canvas, zoom/transforms CSS complexes : support limité, tests manuels requis.
- Les corrections émettent un événement input synthétique ; elles n’assurent pas l’intégration à l’historique Annuler de tous les éditeurs.
- Le titre et la visibilité du menu natif dépendent du moment où Chrome reçoit la mise à jour asynchrone. Le passage de la souris prépare le menu ; un premier clic droit immédiat peut nécessiter une nouvelle ouverture.
- Aucun fonctionnement sur les pages internes Chrome/Brave, le Chrome Web Store et les pages où les content scripts sont interdits.
- Si le serveur est indisponible, les nouvelles analyses sont suspendues 10 secondes. Nouvelle tentative lors d’une saisie ou d’une nouvelle analyse, sans boucle de retry.

Voir [l’architecture](docs/ARCHITECTURE.md), [les tests manuels](docs/MANUAL_TESTS.md) et [le suivi du plan](docs/IMPLEMENTATION.md).
