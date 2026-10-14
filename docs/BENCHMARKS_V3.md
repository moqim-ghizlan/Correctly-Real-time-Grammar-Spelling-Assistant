# Mesures V3 — 2026-10-14

Environnement exécuté : Windows 10 x64 build 19045, CPython 3.14.8, Temurin 25.0.4.1+1-LTS privé, LanguageTool 6.9-SNAPSHOT du 2026-09-23, configuration V2 conservée. Aucune limite Xmx nouvelle n'est imposée ; le coût mémoire du moteur demeure celui de LanguageTool.

| Mesure réellement exécutée                                          | Résultat                                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 20 créations de JVM privées jusqu'au check HTTP valide              | Moyenne 11,081 s ; médiane 11,300 s ; p95 11,973 s ; pire 12,212 s        |
| Exécution de l'EXE final jusqu'au check valide                      | 11,220 s ; un seul échantillon, sans annoncer un p95                      |
| 100 requêtes EN consécutives sur le moteur privé après corpus FR/EN | Médiane 28,672 ms ; p95 47,252 ms ; pire 53,913 ms ; zéro erreur          |
| Corpus linguistique avant/après                                     | 11/11 réponses `matches` et `language` strictement équivalentes           |
| Dossier autonome final                                              | 761 812 097 octets, runtime complet et dictionnaires inclus               |
| Archive finale                                                      | 422 051 227 octets ; voir `artifacts/Correctly-V3-Windows-x64.zip.sha256` |

Ces démarrages sont des créations de processus sur la même session Windows, avec caches disque potentiellement chauds. **Ce ne sont pas 20 démarrages à froid après reboot.** Le serveur V2 préexistant est resté actif ; il n'a pas été arrêté pour mesurer son cold start. Les premiers checks FR du moteur neuf coûtent davantage que les réponses du serveur V2 déjà chaud : le corpus n'est pas un benchmark de latence comparable à lui seul.

Le total RAM/CPU au repos et en charge, un cold start Windows réel, le reboot et la veille/reprise restent à mesurer sur la machine de recette. Aucune consommation mémoire totale ni absence de fuite n'est inventée. Les 100 requêtes et cycles attestent du fonctionnement observé, pas d'un profil de fuite mémoire exhaustif.

Nouvelle vérification le 2026-10-14 à 20:53 UTC : un cycle isolé passe en 16,462 s, avec identité des 11 réponses du corpus, 100 checks consécutifs, conflit de port préservé et arrêt brutal de la JVM détecté. Le fichier `server-validation.json` contient désormais cette dernière exécution d’un cycle ; les mesures de 20 cycles du tableau ci-dessus sont celles consignées lors de la validation précédente. Un échantillon unique ne permet pas de conclure sur le p95 des démarrages.

Résultats bruts de la dernière vérification serveur et des validations du paquet : [server-validation.json](validation/server-validation.json), [v3-responses.json](validation/v3-responses.json), [package-validation.json](validation/package-validation.json). Reproduire : `scripts/validate_server.py --cycles 20`, puis `scripts/validate_package.py` sur un paquet nouvellement construit. Les ports 18081/18082 sont réservés à ces tests ; le produit et l'extension utilisent toujours 8081.
