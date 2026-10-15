# Séparation frontend / backend — 2026-10-15

Les sources de l’extension et ses tests/configurations sont regroupés dans `frontend/`. Le dossier serveur `windows-server` devient `backend/`, avec ses sources, tests, assets, vendor et environnement Python. Les scripts communs et l’installateur gardent leurs dossiers.

Les commandes npm restent à la racine ; les configurations utilisent des chemins absolus calculés depuis leurs fichiers. Les imports internes de l’extension restent identiques. Le manifest compilé conserve les mêmes chemins de pages/assets. **`dist/` reste à la racine**, pour préserver l’extension chargée dans le navigateur. `artifacts/release` et `createSetup.cmd` restent au même endroit.

Les scripts Python/PowerShell et le chemin de l’icône Inno Setup sont adaptés à `backend/`. L’environnement Python déplacé a été remis à jour depuis son interpréteur de base et ses lanceurs console régénérés ; `pip.exe` fonctionne depuis le nouvel emplacement. Les versions de dépendances de build sont vérifiées par le constructeur existant.

Les plans et le r?capitulatif sont regroup?s dans `plans/`, avec des noms `Correctly_<description>_<version>.md`. Le rep?re historique `plan_correctly_v3.md` a ?t? retir? de la racine ; le code actuel utilise `createSetup.cmd` pour emp?cher l?autostart d?un build conserv? dans le d?p?t.

Les paquets déjà fabriqués et le serveur portable actif ne sont pas déplacés. Les rapports V3/V3.1 du 14 octobre décrivent les chemins et les checksums de cette date ; les chemins actuels sont ceux indiqués ici et dans les README. Le manifeste et les checksums sous `artifacts/release` font foi pour la dernière reconstruction.

Vérifications exécutées le 15 octobre : **150 tests frontend et 64 tests backend passent**, lint, compilation TypeScript/Vite, validation des assets et parcours réel Brave passent. L’environnement Python, son lanceur pip et les scripts d’activation sont réparés pour leur nouveau chemin. Aucun ancien chemin `windows-server` ne reste dans les scripts opérationnels.

La commande `scripts/create-setup.ps1 -NoOpen` a réellement reconstruit l’extension, le serveur PyInstaller et le Setup, avec code retour 0. Tous les checksums vendor sont conservés. Le nouvel EXE passe son smoke FR/EN sur le port isolé 18086 et arrête son enfant ; le serveur utilisateur existant est laissé actif. Preuve : [reorganization-smoke.json](validation/reorganization-smoke.json).

Le setup courant sous `artifacts/release/Correctly-V3.1-Setup.exe` fait **367 736 072 octets**, SHA-256 `27f7fa8679a7d89a32e54f489b4297f0b707ab829478605eaa92f3abbe246243`. Le ZIP extension, le manifeste et `SHA256SUMS.txt` sont régénérés au même endroit. Les anciens fichiers de release sont archivés par le constructeur.

Cette vérification ne remplace pas la validation restante sur Windows vierge, après reboot et sur les sites réels. Le nouveau Setup n’a pas été installé dans le vrai Startup pendant cette réorganisation.
