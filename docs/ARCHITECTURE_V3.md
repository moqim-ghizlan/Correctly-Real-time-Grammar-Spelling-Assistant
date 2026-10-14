# Architecture V3

L'extension TypeScript demeure à la racine et expose les mêmes comportements V2. Elle envoie directement des formulaires à LanguageTool sur `127.0.0.1:8081/v2/check`. Python ne reçoit ni ne transforme les corrections.

`CorrectlyServer.exe` est un build PyInstaller onedir : runtime Python sous `_internal`, moteur sous `engine`, JVM complète sous `runtime`, notices sous `licenses`. Les chemins frozen sont résolus depuis le parent de `sys.executable`, indépendamment du dossier courant. Les ressources externes sont copiées après la construction Python et vérifiées par SHA-256. En source, les mêmes chemins pointent sur `backend/vendor`.

Le contrôleur lance exclusivement `runtime/bin/javaw.exe`, sans shell ni console. Le classpath, les options Java injectées par l'environnement et JAVA_HOME sont neutralisés pour le processus enfant uniquement. La configuration/règles LanguageTool V2 est conservée. L'option IPv4 fixe la liaison sur `127.0.0.1` ; `--public`, `--allow-origin` et `--verbose` ne sont pas utilisés.

États : STOPPED, STARTING, RUNNING, STOPPING, ERROR, PORT_CONFLICT. RUNNING exige une correction HTTP valide et la preuve Windows que le listener IPv4 appartient au PID enfant sur 127.0.0.1. Le démarrage et les menus longs utilisent un worker séparé. Arrêter/quit peuvent annuler un démarrage. Un monitoring périodique repère une sortie JVM ou trois sondes infructueuses ; le menu permet une relance manuelle sans boucle automatique.

Un mutex Windows `Local\CorrectlyServer.V3` empêche une seconde tray dans la même session. Le port reste protégé entre sessions par la vérification de conflit. Seul le Popen conservé est arrêté, puis forcé si nécessaire ; aucune recherche/terminaison générale de processus Java. Windows ne propose pas de signal Unix de terminaison douce à cette JVM sans console : `Popen.terminate` correspond à TerminateProcess, suivi de l'attente du handle. Le serveur est sans état utilisateur persistant.

En cas de crash brutal du contrôleur, un Java peut rester orphelin. Au prochain lancement, il est signalé comme conflit et n'est pas adopté/tué sans preuve de propriété. Un job Windows pourra être étudié séparément ; cette version privilégie la propriété stricte des processus.

Le démarrage Windows utilise un raccourci utilisateur opt-in, créé via COM WScript.Shell. Seule une entrée marquée Correctly V3 peut être remplacée ou supprimée. Les chemins de source/build et temporaires ne sont pas admissibles. Les journaux tournants contiennent des états fixes ; stdout/stderr du moteur sont jetés. Les diagnostics structurés excluent chemins, commandes, environnement et texte.

La disposition de `_internal` et le choix de `sys.executable` suivent [la documentation PyInstaller](https://pyinstaller.org/en/stable/runtime-information.html). Les options ont été vérifiées dans l'aide du snapshot, en complément de [la documentation HTTP LanguageTool](https://dev.languagetool.org/http-server.html).
