# Fabrication du setup Correctly V3.1

La définition Inno Setup est `Correctly.iss`. Le bundle complet est copié, sans moteur de remplacement, proxy HTTP, service Windows ni téléchargement à l’installation. L’AppId de production est stable ; installation HKCU sans élévation, raccourci Startup réversible, fermeture limitée à l’EXE de ce dossier avant upgrade/uninstall. Le nom `Correctly.lnk` est partagé avec le contrôle tray V3.1. Un ancien raccourci V3 d’une autre installation bloque l’activation automatique plutôt que créer deux lanceurs.

## Commandes

Pour reconstruire tous les fichiers depuis le code actuel sur ce PC de développement, double-cliquer sur **`createSetup.cmd`** à la racine. Il compile l’extension, construit le serveur dans un nouveau dossier, fabrique le Setup et le ZIP extension, puis ouvre `artifacts/release`. Il s’arrête si une étape échoue et conserve les builds précédents. Prévoir plusieurs minutes et de l’espace disque : chaque reconstruction conserve un nouveau bundle complet. Les dépendances de développement et les distributions vendor doivent déjà être présentes ; ce fichier n’est pas destiné au PC du destinataire.

Pour vérifier seulement les prérequis, sans compiler :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/create-setup.ps1 -CheckOnly
```

Avec le bundle V3.1 déjà construit et `ISCC.exe` disponible :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-installer.ps1
```

La commande produit `artifacts/release/Correctly-V3.1-Setup.exe`, `Correctly-Extension.zip`, `SHA256SUMS.txt`, `release-manifest.json` et l’inventaire des fichiers. Paramètres : `-Version`, `-BundlePath`, `-OutputDir`, `-ISCCPath`. Les builds précédents sont archivés dans le dossier de staging, sans nettoyage récursif d’`artifacts`.

Pour construire le serveur modifié à partir des dépendances Python/vendor épinglées :

```powershell
backend/.venv/Scripts/python.exe scripts/build_windows.py --output-dir artifacts/v3.1 --skip-archive
```

Cette commande refuse de remplacer un bundle existant. Pour une reconstruction complète, fournir un nouveau dossier `--output-dir`, puis passer son bundle à `-BundlePath`. `dist` doit provenir de `npm.cmd run build` avant de fabriquer l’archive extension.

## Outil de développement

Inno Setup **6.7.3 ou plus récent** est nécessaire ; la version réelle du préprocesseur est vérifiée lors de la compilation et celle du moteur consignée dans le log. Le compilateur officiel a été installé dans `artifacts/tools/InnoSetup-6.7.3`, pour l’utilisateur courant, après vérification Authenticode `Valid` et éditeur `Pyrsys B.V.`. Il n’est pas livré au destinataire. Le setup contient la notice originale `InnoSetup-LICENSE.txt`.

Télécharger l’outil uniquement depuis [la page officielle](https://jrsoftware.org/isdl.php) ; appliquer [les vérifications de signature](https://jrsoftware.org/isdl-verify.php) avant exécution. Les conditions commerciales du compilateur sont décrites par l’éditeur ; elles doivent être examinées pour un usage commercial. L’outil installé ici annonce « Non-commercial use only ».

## Recette isolée

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-installer.ps1 -TestMode -OutputDir artifacts/installer-test-release
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-installer.ps1
```

`-TestMode` change l’AppId et les destinations des raccourcis, et utilise la compression ZIP pour accélérer les essais. Le test conserve les mêmes fichiers, options, hooks d’arrêt et contrôles de propriété que le setup de production, compressé en LZMA2. Il installe dans un dossier temporaire avec espaces/accents, utilise son entrée HKCU distincte, et ne touche jamais les vrais raccourcis Startup/Start Menu. Le script refuse un setup de production et un AppId de test déjà présent.

Pour tester un changement de version, fabriquer une seconde candidate avec `-TestMode -Version 3.1.1 -OutputDir artifacts/installer-upgrade-test-release` et fournir son EXE à `test-installer.ps1 -UpgradeInstallerPath`. Ce numéro est réservé à l’essai de mise à jour ; il ne constitue pas une release serveur 3.1.1.

Les logs sont sous `docs/validation/v3.1`. Les dossiers temporaires qui contiennent un fichier utilisateur témoin sont conservés après désinstallation. Les tests de connexion Windows, Windows vierge et vrais sites doivent encore être exécutés ; voir la checklist.
