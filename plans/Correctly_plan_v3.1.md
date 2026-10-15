# Correctly V3.1 — Cahier des charges exécutable pour l'agent

**Date :** 14 octobre 2026  
**Statut :** spécification à implémenter, **pas** une affirmation que le setup existe déjà.  
**Destinataire :** agent de développement travaillant directement dans le dépôt Correctly.  
**Livrable principal :** `Correctly-V3.1-Setup.exe`, installateur Windows x64 pour un utilisateur non technique.

## 0. Mission et règle absolue

Transformer le **bundle portable V3 déjà créé** en produit Windows installable avec démarrage automatique à l'ouverture de session, sans imposer au destinataire l'installation de Java, Python, Node.js ou d'outils de développement. Conserver le moteur **LanguageTool**, les règles et dictionnaires français/anglais et le fonctionnement existant de l'extension Chrome/Brave. Ne pas réécrire la V3 ni modifier la correction pour réaliser le setup.

**Travaille de façon autonome** dans le dépôt : inspecte les fichiers réels, installe les outils de _build_ nécessaires sur la machine de développement lorsque c'est permis, écris les scripts et la documentation, compile et teste, corrige les erreurs, produis des livrables et un rapport. Ne sollicite l'utilisateur que si une action système exige réellement une autorisation qui ne peut être obtenue autrement, ou s'il faut effectuer un essai sur un Windows propre inaccessible depuis ton environnement. Ne jamais contourner une demande UAC, un contrôle antivirus ou une restriction du navigateur.

**Important :** distinguer les tests effectués des tests restant à faire. Un setup qui compile n'est pas automatiquement un setup validé sur Windows propre.

## 1. État initial à vérifier

Le projet Correctly est une extension Manifest V3 TypeScript qui interroge **LanguageTool local** sur `http://127.0.0.1:8081/v2/check`. Le serveur est contrôlé par `CorrectlyServer.exe` (application Python empaquetée), icône dans la zone de notification Windows. La V3 portable rapportée par le propriétaire est présente sous une arborescence semblable à :

```text
artifacts/
  correctly-v3-windows-x86_64/
    CorrectlyServer.exe
    _internal/
    engine/
    runtime/
    vendor/
    LICENSE* (selon build)
```

Ne présume pas que les noms ou chemins sont exacts ; recherche-les. Inspecte également `docs/`, `windows-server/`, `scripts/`, le manifeste Chrome et `docs/recette_checklist.md` (ou équivalent), sans inventer leurs contenus. La discussion fait état de tests unitaires et d'un essai utilisateur de correction FR/EN réussis sur PC possédant déjà Java/Python, mais **pas** d'une validation concluante sur PC propre. Les fichiers `RESUME.md` historiques peuvent décrire V1/V2 et ne prouvent pas les détails du build V3.

### 1.1 Inventaire technique obligatoire

Avant modification, consigne :

- chemin exact du bundle portable, nombre/taille des fichiers, exe principal et dépendances ;
- version et architecture de Windows visées ;
- origine et version du **JRE/JDK embarqué**, commande Java réellement lancée, chemin JAR et dictionnaires ;
- emplacement exact du port `8081` et adresse d'écoute (`127.0.0.1` uniquement) ;
- fonctionnement du tray, menu Quitter, arrêt/redémarrage et gestion du processus fils ;
- mécanisme de _single instance_ et prévention de conflits V1/V2/V3 ;
- chemins de logs/config/cache et politique de conservation ;
- scripts de build existants ;
- état réel des tests et problèmes ouverts ;
- emplacement de `dist/` de l'extension et permissions localhost.

**Stop technique :** si le bundle V3 n'est pas autonome (utilise `C:\LanguageTool`, un Java du PATH, un dossier du dépôt ou un Python installé), corrige d'abord **ce défaut de portabilité**. Le setup ne doit pas simplement masquer des dépendances externes.

## 2. Résultat attendu côté utilisateur

1. L'utilisateur récupère **un seul** fichier `Correctly-V3.1-Setup.exe`.
2. Il double-clique, voit l'identité de Correctly, la destination et l'option de démarrage automatique **activée par défaut et visible**.
3. Il clique sur Installer, sans intervention technique ni téléchargement des runtimes.
4. Le setup copie le bundle entier dans `%LOCALAPPDATA%\Programs\Correctly` (installation par utilisateur, sans élévation par défaut).
5. Il enregistre Correctly dans « Applications installées », ajoute les raccourcis nécessaires et configure l'exécution automatique **à l'ouverture de session**.
6. À la fin de l'installation, il peut lancer Correctly immédiatement ; l'icône tray apparaît, le serveur démarre en arrière-plan, sans fenêtre terminal.
7. Le serveur écoute sur `127.0.0.1:8081`. L'extension Chrome/Brave existante utilise le même endpoint.
8. À la prochaine connexion Windows, Correctly se relance automatiquement sans nouvelle manipulation. Une option doit permettre de désactiver cet autostart (dans le setup et/ou l'app et via Windows).
9. Une désinstallation arrête **uniquement** l'instance Correctly concernée, retire l'autostart et supprime les fichiers du programme sans supprimer aveuglément les préférences utilisateur.

**Limite à communiquer clairement :** le setup du serveur ne peut pas installer silencieusement une extension non publiée dans un Chrome/Brave personnel sans intervention/consentement du navigateur. Fournir un parcours d'installation de l'extension distinct, idéalement une page de fin avec instructions simples, et plus tard un lien Chrome Web Store après publication. Ne jamais modifier abusivement les politiques d'entreprise ou le profil navigateur.

## 3. Architecture cible

```text
Correctly-V3.1-Setup.exe   [distribué]
  └── extrait vers %LOCALAPPDATA%\Programs\Correctly\
       ├── CorrectlyServer.exe
       ├── _internal\...
       ├── runtime\...     (Java embarqué, taille réelle vérifiée)
       ├── engine\...      (LanguageTool + règles/dicos)
       ├── vendor\...      (si nécessaire)
       ├── LICENSES\...    (licences/attributions)
       └── uninstall.exe   (nom généré par Inno Setup)

Connexion à Windows
  → raccourci dans {userstartup} vers {app}\CorrectlyServer.exe
  → application tray Windows
  → runtime Java **embarqué**
  → LanguageTool (127.0.0.1:8081)
  → extension Chrome / Brave → POST /v2/check
```

Inno Setup est l'outil recommandé pour fabriquer l'installeur ; son compilateur `ISCC.exe` peut être automatisé en ligne de commande. Favoriser une installation **per-user** avec `PrivilegesRequired=lowest`, sans modification du PATH et sans installation système de Java/Python.

## 4. Ordre d'implémentation impératif

### Phase A — Audit et baseline

- Créer une branche de travail `feature/v3.1-installer` si pertinent, sans effacer les modifications non commités.
- Localiser bundle V3, outils et scripts. Consigner les commits et versions utilisés.
- Exécuter la suite de tests existante et une correction FR/EN de référence, noter les résultats exacts.
- Lancer le serveur depuis un chemin **hors du dépôt**, en s'assurant que `JAVA_HOME`, `PATH`, chemins absolus historiques ne sont pas indispensables. Si possible isoler du Java/Python systèmes.
- Vérifier intégrité des fichiers runtime/engine (SHA-256 ou manifeste) et licences de redistribution.

**Critère A :** build portable reproductible et indépendant des installations de dev, ou anomalie précisément identifiée et corrigée.

### Phase B — Fiabiliser CorrectlyServer.exe

- Résoudre les chemins des ressources à partir de l'emplacement réel de l'exécutable et du bundle ; ne pas supposer que le _cwd_ est le dossier du programme.
- Utiliser exclusivement le `javaw.exe` embarqué (ou exécutable Java équivalent validé) ; ne pas basculer silencieusement vers une installation système pendant les tests de portabilité.
- Attendre un endpoint de santé pertinent en boucle avec timeout et messages d'erreur (ne pas considérer le simple lancement du processus comme une preuve de disponibilité).
- Bloquer uniquement les doubles instances **Correctly**. Si `8081` est déjà occupé par un processus inconnu, afficher un diagnostic ; ne jamais tuer un processus arbitraire ni une vieille instance sans vérification de propriété.
- Quitter = fermer proprement le processus enfant identifié comme appartenant à **cette** instance, puis l'icône tray.
- Éviter plusieurs icônes tray, plusieurs Java, processus orphelins, démarrage infini ou boucle de redémarrage.
- Bind sur localhost uniquement ; ne pas exposer sur `0.0.0.0` ; traiter proprement les erreurs et ressources indisponibles.
- Logs de diagnostic sans contenu saisi par les utilisateurs, dans un emplacement utilisateur approprié (`%LOCALAPPDATA%\Correctly\logs`), rotation et limite de taille.

**Critère B :** démarrages/arrêts répétés et conflit de port traités sans affecter d'autres applications.

### Phase C — Ajouter un installateur Inno Setup

Créer par exemple :

```text
installer/
  Correctly.iss
  README.md
scripts/
  build-installer.ps1
  test-installer.ps1
artifacts/
  release/
    Correctly-V3.1-Setup.exe
```

Exigences du script `.iss` :

- Nom produit : `Correctly`, version `3.1.0`, éditeur explicite ; `AppId` **stable** entre mises à jour.
- `DefaultDirName={localappdata}\Programs\Correctly`, `PrivilegesRequired=lowest`, `ArchitecturesAllowed=x64compatible` ou directive vérifiée selon version d'Inno Setup.
- Source de fichiers = **toute** l'arborescence portable validée : inclure les sous-dossiers récursivement, jamais `CorrectlyServer.exe` seul.
- Installer les licences redistribuées et attributions nécessaires ; vérifier les licences exactes de LanguageTool, Java et dépendances.
- `OutputBaseFilename=Correctly-V3.1-Setup` ; compression adaptée sans suppression d'assets volumineux ; ignorer caches, builds de développement et données personnelles.
- `UninstallDisplayIcon`, entrée Windows Applications installées, icônes de menu Démarrer.
- Une tâche utilisateur « Démarrer Correctly à l'ouverture de session » **cochée par défaut** qui crée un raccourci `{userstartup}\Correctly.lnk` pointant vers `{app}\CorrectlyServer.exe`. L'autostart doit être réversible à la désinstallation et désactivable pendant l'installation.
- Démarrage optionnel à la fin de l'installation via `[Run]`, contexte utilisateur normal et `postinstall skipifsilent`.
- Ne pas écrire un service Windows : l'application tray dépend de la session utilisateur.
- Pas d'installation globale de Java, Python, Node ni de modification du PATH.
- Avant une mise à jour, éviter les fichiers verrouillés : demander/implémenter arrêt propre de l'instance Correctly ; ne pas tuer `java.exe` globalement.
- En fin de désinstallation, supprimer les fichiers gérés par le setup, pas les profils Chrome, documents utilisateur ou données autres que Correctly.

**Exemple de squelette à adapter à l'arborescence et à la version d'Inno Setup réelles :**

```iss
#define MyAppName "Correctly"
#define MyAppVersion "3.1.0"
#define BundleDir "..\artifacts\correctly-v3-windows-x86_64"

[Setup]
AppId={{B71B62DD-5F7A-4BB9-9411-7A046DC8CE9D}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
DefaultDirName={localappdata}\Programs\Correctly
DefaultGroupName=Correctly
PrivilegesRequired=lowest
OutputDir=..\artifacts\release
OutputBaseFilename=Correctly-V3.1-Setup
Compression=lzma2
SolidCompression=yes
UninstallDisplayIcon={app}\CorrectlyServer.exe

[Tasks]
Name: "autostart"; Description: "Démarrer Correctly à l'ouverture de session"; Flags: checkedonce

[Files]
Source: "{#BundleDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Correctly"; Filename: "{app}\CorrectlyServer.exe"
Name: "{userstartup}\Correctly"; Filename: "{app}\CorrectlyServer.exe"; Tasks: autostart

[Run]
Filename: "{app}\CorrectlyServer.exe"; Description: "Lancer Correctly"; Flags: nowait postinstall skipifsilent
```

> Ce script est un **point de départ** et doit être effectivement compilé/testé ; les directives, GUID, tâches d'upgrade et hook d'arrêt doivent être adaptés. En particulier, tester la cohérence de l'option autostart lors des mises à jour, et retirer l'ancien raccourci quand elle est décochée.

**Critère C :** `ISCC.exe installer\Correctly.iss` produit un `Setup.exe` autonome contenant tous les fichiers requis.

### Phase D — Automatiser le build et les outils de développement

- Détecter `ISCC.exe` (PATH + emplacements usuels d'Inno Setup). Si absent, proposer ou effectuer son installation **sur la machine de développement seulement** via source officielle/gestionnaire autorisé (`winget` si disponible), vérifier signature et version ; si l'environnement interdit cette opération, documenter le blocage exact.
- Écrire `scripts/build-installer.ps1` : paramètres `-Version`, `-BundlePath`, `-OutputDir` ; validation stricte des chemins ; test que l'exe, le JRE, JAR, règles/dicos existent ; nettoyage ciblé du seul dossier de build ; compilation `ISCC`; vérification du code de retour et du résultat ; calcul SHA-256 et taille ; sortie explicite.
- Ne jamais effacer tout `artifacts/`, modifier la configuration système sans nécessité ni prétendre avoir « installé un outil » si la commande a échoué.
- Un build doit être reproductible et ne pas nécessiter d'étapes manuelles autres que fournir l'environnement Windows de développement.

**Critère D :** une seule commande PowerShell depuis la racine reconstruit le setup et génère un manifeste de release (version, dépendances, SHA-256).

### Phase E — Installation, lancement et démarrage automatique

Sur un PC de test :

1. S'assurer que les anciennes instances Correctly sont fermées, puis exécuter le setup.
2. Vérifier les fichiers sous `%LOCALAPPDATA%\Programs\Correctly` et la présence d'un programme de désinstallation.
3. Confirmer la création de l'élément Startup sans le créer manuellement.
4. Lancer depuis l'assistant de fin ; vérifier icône tray et disponibilité réelle du moteur.
5. Tester `http://127.0.0.1:8081/v2/languages` (réponse API possible) **et** un vrai `POST /v2/check` avec FR et EN ; ne pas utiliser uniquement la page racine.
6. Redémarrer la session Windows ou la machine, puis mesurer si l'application est relancée automatiquement, sans écran noir et sans ouverture d'une seconde instance.
7. Désactiver l'autostart, reconnecter, vérifier qu'il ne démarre pas ; réactiver et retester.
8. Vérifier qu'un utilisateur standard peut installer, exécuter et désinstaller sans administrateur, sous réserve des politiques Windows.
9. Vérifier installation d'une mise à jour sur la même installation : le setup doit remplacer les bons fichiers, ne pas doubler les raccourcis ni perdre les réglages.
10. Désinstaller : plus de raccourci Startup, plus de serveur Correctly en cours d'exécution, pas d'effacement d'autres applications et conservation raisonnable des réglages si annoncé.

**Critère E :** parcours vérifié de bout en bout, avec captures/commandes et résultat de chaque scénario.

### Phase F — Test indispensable sur Windows **propre**

Utiliser idéalement une VM Windows 11 x64 propre/snapshot, sans Java, Python, Node, LanguageTool, PATH modifié ni ancien Correctly. Vérifier également absence de `C:\LanguageTool`. Copier **uniquement le fichier Setup**, sans le dépôt ni les ressources de build. Installer puis faire FR + EN, fermeture, reboot, autostart, upgrade et uninstall. Répéter éventuellement sur Windows 10 x64 si compatible et support voulu.

Ne jamais désinstaller le Java/Python personnel du développeur simplement pour « simuler » une machine propre. Utiliser VM ou environnement isolé ; au besoin, rapporter `NON TESTÉ` au lieu de `VALIDÉ`.

**Critère F :** Java/Python/Node restent **non requis** à la machine cible, démontré et consigné sur VM vierge ; corrections FR/EN identiques dans la tolérance des tests de régression.

## 5. Cas particuliers à résoudre

### 5.1 Ancienne V1/V2 déjà présente

- Ne jamais arrêter toutes les JVM du système ou supprimer `C:\LanguageTool` ; elle peut appartenir à une installation différente.
- Identifier précisément le propriétaire du port 8081. S'il est inconnu, afficher un avertissement lisible avec marche à suivre.
- Documenter la migration et éviter l'ambiguïté entre ancien exe et nouvel exe ; ne pas écraser les paramètres/extensions existants sans raison.

### 5.2 Mise à jour V3.1 → V3.2

- Garder le même `AppId` et le même mode d'installation.
- Fermer proprement tray et serveur avant écrasement ; redémarrer après si nécessaire.
- Maintenir/mettre à jour le raccourci Startup au lieu d'en créer plusieurs.
- Conserver préférences, langue sélectionnée, exclusion de sites et dictionnaire personnel (côté extension, en général `chrome.storage.local`).

### 5.3 Sécurité, vie privée, antivirus

- Serveur **local uniquement**, pas de publication réseau, pas de ports firewall entrants globaux.
- Ne journaliser aucun texte saisi, y compris erreurs HTTP non filtrées.
- Examiner les signatures numériques : absence de signature peut provoquer des avertissements Windows SmartScreen ; ne pas proposer de contourner les protections.
- Vérifier les licences de redistribution Java et LanguageTool, ainsi que mentions légales et fichier NOTICE requis.
- Contrôler que le setup créé ne télécharge aucun exécutable additionnel à l'installation.

### 5.4 Extension navigateur

- Garder les fonctionnalités V2/V3, `http://127.0.0.1:8081/v2/check` et compatibilité FR/EN.
- Ne pas promettre installation automatique de l'extension non publiée.
- Écrire `docs/INSTALL_EXTENSION.md` : Chrome `chrome://extensions`, activer le mode développeur, charger le `dist/` fourni **si distribution de développement autorisée**. Prévoir plus tard installation simple via boutique officielle après publication.
- Fournir `dist/` séparément et vérifier qu'il correspond au serveur ; ne jamais modifier le profil Chrome ou installer des extensions en douce.

## 6. Matrice des tests détaillée

| ID  | Scénario                             | Résultat attendu                           |
| --- | ------------------------------------ | ------------------------------------------ |
| T01 | Compilation Inno Setup               | Setup généré, code retour 0                |
| T02 | Fichiers runtime/engine              | Bundlés entièrement                        |
| T03 | Windows vierge, sans Python          | Démarre                                    |
| T04 | Windows vierge, sans Java            | Démarre                                    |
| T05 | Windows vierge, sans Node            | Démarre                                    |
| T06 | Pas de `C:\LanguageTool`             | Démarre                                    |
| T07 | Session utilisateur standard         | Installation per-user possible             |
| T08 | Installation initiale                | Raccourcis et uninstall présents           |
| T09 | Autostart par défaut                 | Raccourci créé automatiquement             |
| T10 | Autostart décoché                    | Pas de raccourci au premier install        |
| T11 | Connexion Windows                    | Serveur démarre automatiquement            |
| T12 | Tray                                 | Une icône, menu utilisable                 |
| T13 | Pas de console                       | Aucun terminal visible                     |
| T14 | Health                               | Serveur prêt, pas seulement process vivant |
| T15 | FR orthographe                       | Correction détectée                        |
| T16 | FR grammaire                         | Suggestion correspond à baseline           |
| T17 | EN orthographe                       | Correction détectée                        |
| T18 | EN grammaire                         | Suggestion correspond à baseline           |
| T19 | Auto FR/EN                           | Régression absente                         |
| T20 | Chrome                               | Correction de bout en bout                 |
| T21 | Brave                                | Correction de bout en bout                 |
| T22 | Redémarrer via tray                  | Aucun processus orphelin                   |
| T23 | Quitter via tray                     | Serveur Correctly arrêté                   |
| T24 | Exécution en double                  | Une seule instance Correctly               |
| T25 | Port occupé par une app inconnue     | Avertissement, aucun kill arbitraire       |
| T26 | Port occupé par ancienne V1          | Gestion/migration documentée               |
| T27 | Installation sur chemin avec espaces | Fonctionne                                 |
| T28 | Installation sur compte non-ascii    | Fonctionne                                 |
| T29 | Réinstallation même version          | Pas de doublons                            |
| T30 | Mise à jour version                  | Données et autostart préservés             |
| T31 | Désinstallation                      | Fichiers gérés retirés                     |
| T32 | Désinstallation                      | Autostart retiré                           |
| T33 | Désinstallation                      | Aucune autre JVM stoppée                   |
| T34 | Antivirus/SmartScreen                | Comportement documenté                     |
| T35 | Zéro texte personnel dans logs       | Vérifié                                    |
| T36 | Licence/NOTICE des composants        | Présents et conformes                      |

Pour chaque test écrire `PASS`, `FAIL`, `BLOCKED` ou `NOT_TESTED` + environnement, commande, preuve et correctif associé. **Ne pas marquer PASS sans exécution réelle.**

## 7. Artefacts à produire obligatoirement

```text
installer/Correctly.iss
scripts/build-installer.ps1
scripts/test-installer.ps1
artifacts/release/Correctly-V3.1-Setup.exe
artifacts/release/SHA256SUMS.txt
docs/V3.1_INSTALLATION.md
docs/INSTALL_EXTENSION.md
docs/V3.1_RECETTE_CHECKLIST.md
docs/V3.1_RAPPORT.md
```

- `V3.1_INSTALLATION.md` : installation pour non-technicien, fonctionnement, tray, autostart, désinstallation, dépannage.
- `V3.1_RECETTE_CHECKLIST.md` : chaque test T01–T36 avec statut, preuves, limites.
- `V3.1_RAPPORT.md` : faits observés, outils installés réellement (avec versions), commande de build, taille, hash, modifications, tests, failles connues, blocages, recommandation de diffusion.
- Si la génération du `.exe` n'est pas techniquement possible depuis l'environnement courant, conserver tous les scripts, noter la cause et l'**unique commande** de génération sur Windows ; ne pas inventer un setup.

## 8. Politique d'autonomie de l'agent

1. Ne demande **pas** à l'utilisateur d'installer manuellement Python, Java, Node ou Inno Setup si tu disposes d'un terminal et des permissions nécessaires pour provisionner un environnement de build.
2. Pour tout outil manquant, identifier la version nécessaire, source officielle, conditions de redistribution et vérification ; installer automatiquement **uniquement dans l'environnement de développement autorisé**.
3. Conserver les éléments existants et n'introduire que les changements nécessaires au packaging.
4. Ne pas faire de `git push`, publication Chrome Web Store, modification serveur distant ni suppression de fichiers utilisateur sans autorisation explicite.
5. Ne pas lancer un installateur de distribution sur un poste utilisateur tiers sans leur accord : ici l'automatisation concerne **la fabrication** du setup, pas une installation furtive.
6. Si les contrôles système demandent une approbation, respecter les flux prévus, demander une seule fois les actions bloquantes et poursuivre le reste.
7. Ne jamais dire « tout fonctionne sur une machine propre » si seule la machine du développeur a été testée.

## 9. Critères d'acceptation et définition de « terminé »

La V3.1 est **terminée** uniquement si :

- L'agent a produit un `Correctly-V3.1-Setup.exe` exploitable et son checksum.
- Le setup installe le bundle **complet** sans Java/Python/Node préinstallés, constaté sur machine vierge.
- La correction FR/EN et les fonctionnalités de l'extension n'ont pas régressé.
- Correctly se lance en fond à la connexion Windows **sans intervention manuelle après le setup** (si option par défaut acceptée).
- L'autostart peut être désactivé ; fermeture tray, upgrade et uninstall sont corrects.
- Aucun autre service Java/processus tiers n'est tué ni modifié.
- La différence entre **installation du serveur** et **installation de l'extension Chrome/Brave** est indiquée honnêtement.
- La checklist T01–T36 et le rapport sont factuels.

**Sinon**, classer la V3.1 « implémentée, recette partielle » ou « bloquée » avec détail exact, au lieu de déclarer « terminée ».

## 10. Instruction finale à l'agent

> Lis d'abord ce document puis examine les **fichiers réels du dépôt**. Effectue l'audit, implémente le setup Inno Setup, installe les outils de build manquants si autorisé, ajoute les scripts PowerShell, conserve l'existant V3, compile et teste autant que ton environnement le permet. Corrige toute régression constatée. Génère l'installateur Windows, les notes d'installation et le rapport de recette sans déclarer validés les tests que tu n'as pas pu réaliser. L'utilisateur ne doit pas avoir à écrire une seule commande pour produire l'installateur si ton environnement dispose des droits requis. À la fin, donne les chemins et statuts exacts des livrables et précise seulement les vérifications impossibles à automatiser, notamment l'essai sur Windows propre et l'installation consentie de l'extension navigateur.

---

### Références techniques utiles

- Inno Setup : https://jrsoftware.org/isinfo.php
- Documentation compilateur `ISCC.exe` : https://documentation.help/Inno-Setup/topic_compilercmdline.htm
- `PrivilegesRequired=lowest` (installation par utilisateur) : https://documentation.help/Inno-Setup/topic_setup_privilegesrequired.htm
