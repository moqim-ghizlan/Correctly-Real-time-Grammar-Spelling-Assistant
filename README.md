# Correctly — Real-time Grammar & Spelling Assistant

Extension Chrome/Brave gratuite : orthographe et grammaire en français, en anglais ou en mode Auto, avec un moteur **LanguageTool local**. TypeScript strict, Manifest V3, aucune API cloud, aucun framework UI.

## Organisation du projet

**V4 RC1** ajoute les raccourcis personnels locaux, la correction groupée par phrase avec aperçu, une automatisation prudente de l’espacement et un bouton Annuler. Les options permettent de gérer les raccourcis, qui fonctionnent sans moteur et indépendamment du bouton de correction ; les domaines désactivés restent respectés. Les nouvelles mutations s’abstiennent sur les structures riches complexes. Voir [les nouveautés et limites](docs/V4_CHANGELOG.md), [les tests réellement exécutés](docs/V4_TEST_REPORT.md) et [les validations finales restantes](docs/V4_RELEASE_CHECKLIST.md). Le Setup candidat est `artifacts/release/Correctly-V4-RC1-Setup.exe` ; l’extension reste séparée dans `Correctly-Extension.zip`. Ce n’est pas une release finale approuvée.

- **`frontend/`** : extension Chrome/Brave, code TypeScript, interface, assets, manifest, tests et configurations Vite/Vitest/TypeScript.
- **`backend/`** : serveur Windows Python, tray, moteur privé, runtime Java, tests et configuration PyInstaller.
- **`installer/`** : installateur Windows Inno Setup.
- **`scripts/`** : commandes de développement, vérification et fabrication communes.
- **`docs/`** : guides et rapports.
- **`plans/`** : plans de version et récapitulatif, nommés `Correctly_<description>_<version>.md`.
- **`dist/`** : extension compilée à charger dans Chrome, au même emplacement.
- **`artifacts/release/`** : Setup, ZIP extension et checksums à envoyer.

Les commandes `npm` et **`createSetup.cmd`** restent utilisables depuis la racine. Les dépendances Node sont partagées dans `node_modules/` ; l’environnement Python est dans `backend/.venv/`. Voir [les détails de la réorganisation](docs/REORGANIZATION.md).

La V1 est testée en DOM simulé et son parcours de correction a été vérifié dans Brave avec LanguageTool réel ([rapport](docs/BROWSER_VERIFICATION.md)). La compatibilité avec votre navigateur et vos sites reste à valider avec [la checklist manuelle](docs/MANUAL_TESTS.md).

La V2 détecte uniquement l’éditeur utilisé, par événements globaux, sans balayage des champs. Les tests automatisés et les parcours locaux dans Brave avec LanguageTool réel passent ; la validation V2 sur les sites authentifiés reste à effectuer. Voir [le suivi V2](docs/V2.md).

## Installation

La V3 ajoute un serveur Windows x64 autonome : Python et Java sont inclus dans le paquet portable. Voir [le guide utilisateur](backend/README_INSTALL.md), [la migration](docs/MIGRATION_V2_V3.md) et [le rapport de recette](docs/RELEASE_CHECKLIST.md). Le moteur et le code de l'extension V2 sont conservés. La candidate V3 reste soumise aux validations manuelles indiquées dans le rapport.

La V3.1 ajoute un installateur par utilisateur, `artifacts/release/Correctly-V3.1-Setup.exe`, et une option visible de démarrage à la connexion Windows. Voir [l’installation V3.1](docs/V3.1_INSTALLATION.md), [l’extension séparée](docs/INSTALL_EXTENSION.md), [la fabrication du setup](installer/README.md) et [le rapport V3.1](docs/V3.1_RAPPORT.md). La validation finale sur Windows vierge reste requise.

Pour développer/construire l'extension : Node.js **22.13+** ou **24+** et npm. Le lancement manuel du moteur ci-dessous reste une option de développement V2 ; le paquet V3 utilise son Java privé.

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

Le mode Auto est limité au français et à l’anglais : quelques mots courants guident la préférence sur les phrases courtes, puis LanguageTool détecte la langue parmi ces deux choix. Une réponse dans une autre langue est réanalysée avec un choix explicite ou rejetée. Pour un texte ambigu, vous pouvez toujours sélectionner Français ou Anglais. La [documentation du serveur](https://dev.languagetool.org/http-server) précise les limites de la détection sans fastText.

## Utilisation

Écrivez dans un textarea, un input texte/recherche/email/url/téléphone ou un contenteditable. Après une pause de 100 ms par défaut, les erreurs sont soulignées en rouge (orthographe) ou en orange (grammaire). Cliquez sur une erreur pour choisir une suggestion ou l’ignorer. Le clic droit prépare la meilleure suggestion dans le menu natif.

L’icône de l’extension permet de changer la langue, désactiver la correction globalement ou sur le domaine courant, ouvrir les paramètres et vérifier la disponibilité du moteur. Les paramètres ajoutent le délai, les catégories et un dictionnaire personnel sensible à la casse.

Les textes restent en mémoire temporaire. Seuls les paramètres, les mots ajoutés volontairement au dictionnaire et les raccourcis créés par l’utilisateur sont enregistrés avec `chrome.storage.local`, dans ce profil de navigateur. La connexion au moteur utilise uniquement l’adresse locale ; aucune télémétrie.

## Développement

```powershell
npm run dev
npm run test:watch
npm run format
npm run format:check
npm run fixture
```

`dev` compile d’abord, puis surveille séparément les pages/service worker et le content script. Rechargez l’extension après les modifications. `fixture` sert une page de test à `http://127.0.0.1:8080`.

## Limites de la V2

- Au-delà de 5 000 unités UTF-16, seul le paragraphe au curseur est analysé, avec une fenêtre bornée si le paragraphe dépasse cette limite.
- Contenteditable : extraction des retours à la ligne et surcouche Range sans ajout de balises au texte. Les remplacements privilégient l’insertion du navigateur et peuvent traverser plusieurs feuilles de texte ; le repli conserve un nœud existant. Les corrections traversant des séparateurs de paragraphes synthétiques sont refusées.
- Shadow DOM ouvert pris en charge ; Shadow DOM fermé et canvas hors support. Les éditeurs riches pilotés par un framework et les transforms CSS complexes nécessitent des tests manuels.
- Les corrections émettent un événement input synthétique ; elles n’assurent pas l’intégration à l’historique Annuler de tous les éditeurs.
- Le titre et la visibilité du menu natif dépendent du moment où Chrome reçoit la mise à jour asynchrone. Le passage de la souris prépare le menu ; un premier clic droit immédiat peut nécessiter une nouvelle ouverture.
- Aucun fonctionnement sur les pages internes Chrome/Brave, le Chrome Web Store et les pages où les content scripts sont interdits.
- Si le serveur est indisponible, les nouvelles analyses sont suspendues 10 secondes. Nouvelle tentative lors d’une saisie ou d’une nouvelle analyse, sans boucle de retry.

Voir [le récapitulatif du projet et de la V4](plans/Correctly_recap_v4.md), [la spécification V4](plans/Correctly_plan_v4.md), [l’architecture](docs/ARCHITECTURE.md), [les tests manuels](docs/MANUAL_TESTS.md) et [le suivi du plan](docs/IMPLEMENTATION.md).

## Construire le serveur Windows V3

Le développement reste dans cette racine. `dist/` contient l'extension ; `artifacts/` reçoit le paquet Windows et son zip.

```powershell
py -3.14 -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements-build.txt
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/prepare_vendor.ps1 -EngineSource "<dossier LT V2 exact>" -RuntimeSource "<dossier Temurin V2 exact>"
backend/.venv/Scripts/python.exe -m pytest -c backend/pyproject.toml backend/tests
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build_windows.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/smoke_test_windows.ps1
```

Le build exige CPython **3.14.8 x64** et les versions Python épinglées. Les sources LT/Java doivent correspondre à `backend/vendor-lock.json`, qui conserve tous les fichiers de la V2. Aucun téléchargement de moteur ni installation Java système n'est effectué. Le script refuse de remplacer un ancien paquet dans `artifacts` : l'archiver explicitement avant une nouvelle construction.

En source : définir `PYTHONPATH` sur `backend/src`, puis `backend/.venv/Scripts/python.exe -m correctly_server`. Les scripts de comparaison et de validation (`engine_baseline.py`, `validate_server.py`) utilisent seulement des phrases synthétiques. Voir [l'architecture V3](docs/ARCHITECTURE_V3.md), [les dépendances](docs/DEPENDENCIES.md) et [la sécurité](docs/SECURITY.md).
