# Baseline V2 — 2026-10-14

Audit du commit `82a8e03`, branche existante `feature/correctly-v3`, dans la racine initiale. `RESUME.md` n'est pas présent ; README, rapports V2, code TypeScript, manifeste et lanceur externe ont été examinés directement.

- 150 tests Vitest passent, dans 10 fichiers. Compilation TypeScript/Vite et vérification des assets passent.
- Lint initial : 6 erreurs dans du JavaScript livré par pip, sous `windows-server/.venv`. Le dépôt ne l'excluait pas. La V3 exclut les fichiers Python/vendor/build du lint de l'extension.
- Les premières exécutions sandbox ont échoué sur des restrictions d'accès aux répertoires parents/temporaire. Les résultats de référence ont été obtenus après autorisation d'exécution hors sandbox.
- Le code V2 possède effectivement détection par interaction, éditeur actif unique, adaptateurs, paragraphes sur grands textes, contrôle des requêtes obsolètes, IME, iframes et Shadow DOM ouvert. Les éditeurs contrôlés par les sites restent soumis aux limites du rapport V2.
- L'extension appelle directement `POST http://127.0.0.1:8081/v2/check`, sans nouveau proxy. Debounce réel : 100 ms. Timeout : 8 s. Reprise après indisponibilité : 10 s. Auto : `preferredVariants=en-US`, préférences FR/EN et contrôle de langue existant.
- Lanceur V2 trouvé hors dépôt : `C:\LanguageTool\correctly_tray.py`, pystray/Pillow, `javaw.exe` système, chemins absolus et build onefile. Il vérifie `/v2/languages`, mais ne valide pas une correction réelle ni l'instance unique.
- Moteur original : `LanguageTool-20260923-snapshot`, API `6.9-SNAPSHOT`, build `2026-09-23 18:48:26 +0200`. JAR construit avec Java 17.0.15. Runtime réel V2 : Temurin 25.0.4.1+1-LTS x64. Il est copié intégralement, puis testé comme runtime privé ; aucune nouvelle release LT n'est substituée.
- Configuration conservée byte pour byte : `pipelineCaching=true`, `maxPipelinePoolSize=10`, `pipelineExpireTimeInSeconds=3600`, `cacheSize=5000`. Aucun fichier de règles externe n'est configuré.
- Aide réelle du snapshot examinée : serveur par `-cp languagetool-server.jar org.languagetool.server.HTTPServer`, `--config`, `--port`. L'accès distant requiert `--public`, CORS `--allow-origin`, journalisation de texte `--verbose` ; ces trois options sont absentes de la V3.

Réponses synthétiques avant migration : [baseline/v2-responses.json](baseline/v2-responses.json). Le corpus contient 11 cas FR, en-US, en-GB, Auto et Unicode. Le cas Auto teste les paramètres HTTP V2 FR/EN ; la logique de choix de l'extension reste couverte par ses tests. Les réponses complètes sont enregistrées ; la comparaison conserve tous les champs de `matches` et `language`, en ignorant seulement les métadonnées top-level software/warnings.

Le serveur V2 préexistant sur 8081 est laissé actif pendant les tests isolés sur 18081. Aucun processus extérieur n'est arrêté. Les chiffres historiques des rapports V1/V2 ne sont pas présentés comme des tests V3 nouveaux.
