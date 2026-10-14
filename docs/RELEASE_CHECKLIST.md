# Recette V3 — candidate 3.0.0-rc.1

Exécution : 2026-10-14, Windows 10 x64 build 19045, dépôt dans sa racine initiale. La candidate Windows portable est construite. **La release finale v3.0.0 n'est pas déclarée validée et aucun tag final n'est créé.**

Les tests isolés utilisent 18081/18082/18083 pour laisser intact le serveur V2 préexistant sur 8081. Les comparaisons prouvent l'identité des corrections, mais ne remplacent pas les tests manuels des sites et d'un Windows propre.

Nouvelle vérification le 2026-10-14 à 20:53 UTC : 150 tests extension, 57 tests serveur, lint et build extension passent. L’audit Brave avec le moteur local réel passe de nouveau. Un cycle serveur isolé confirme les 11 cas du corpus, 100 requêtes, la protection du port tiers et la détection d’un crash JVM ; le rapport serveur brut reflète cette exécution récente. Le smoke test du lanceur refuse correctement une seconde instance (`already_running`) ; l’instance active est conservée. Le SHA-256 du zip existant correspond à celui annoncé ci-dessous. Les résultats manuels non exécutés restent inchangés.

| ID  | Statut  | Exécution / limite                                                                                                       |
| --- | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| T01 | SKIPPED | Windows sans Java installé indisponible ; paquet PASS avec Java absent du PATH et JAVA_HOME invalide                     |
| T02 | SKIPPED | Windows sans Python installé indisponible ; EXE PASS sans Python sur PATH                                                |
| T03 | PASS    | Copie du vrai paquet et lancement depuis un autre emplacement/cwd                                                        |
| T04 | PASS    | Paquet lancé dans un chemin avec espaces et accents                                                                      |
| T05 | PASS    | Deux EXE réels : seconde instance quitte avec `already_running`, une seule JVM                                           |
| T06 | PASS    | Port occupé par un socket tiers : PORT_CONFLICT, aucun arrêt du service tiers                                            |
| T07 | PASS    | Vrai paquet : JAR manquant et corrompu donnent ERROR, jamais RUNNING                                                     |
| T08 | PASS    | Vrai paquet : javaw manquant donne ERROR                                                                                 |
| T09 | SKIPPED | Binaire réellement incompatible non disponible ; sortie précoce JVM simulée testée                                       |
| T10 | PASS    | JVM privée tuée par le test propriétaire, monitor passe en ERROR                                                         |
| T11 | PASS    | Action d'arrêt de la vraie tray Windows, disparition du processus possédé                                                |
| T12 | PASS    | Actions démarrer/redémarrer de la vraie tray : RUNNING après santé HTTP                                                  |
| T13 | PASS    | Quitter la vraie tray ferme l'icône et le serveur possédé                                                                |
| T14 | PASS    | Corpus FR réel strictement identique à V2, source et paquet                                                              |
| T15 | PASS    | Corpus EN réel strictement identique à V2, source et paquet                                                              |
| T16 | PASS    | Cas Auto HTTP avec paramètres FR/EN V2 ; logique client couverte par Vitest                                              |
| T17 | PASS    | Corpus orthographe/grammaire et règles/replacements complets comparés                                                    |
| T18 | PASS    | Corpus emoji/Unicode et tests d'offsets client ; parcours manuel Unicode restant facultatif à compléter                  |
| T19 | FAIL    | Audit headless Chrome : service worker Correctly introuvable ; résultat manuel Chrome non validé                         |
| T20 | PASS    | Audit headless Brave avec moteur V2 réel identique : contenteditable/corrections ; pas une recette manuelle V3 sur sites |
| T21 | SKIPPED | ChatGPT : parcours manuel authentifié non exécuté                                                                        |
| T22 | SKIPPED | Gmail : parcours manuel authentifié non exécuté                                                                          |
| T23 | SKIPPED | WhatsApp Web : parcours manuel authentifié non exécuté                                                                   |
| T24 | SKIPPED | LinkedIn : parcours manuel authentifié non exécuté                                                                       |
| T25 | SKIPPED | Reddit : parcours manuel non exécuté                                                                                     |
| T26 | PASS    | Tests V2 d'éditeur actif/réponses obsolètes et parcours Brave de changement/nettoyage                                    |
| T27 | PASS    | Tests client d'indisponibilité/retry et tests contrôleur ; interruption réelle pendant saisie à compléter manuellement   |
| T28 | SKIPPED | Aucun reboot Windows effectué                                                                                            |
| T29 | PASS    | COM réel sur raccourci isolé : créer/supprimer, refus d'une entrée inconnue ; vrai Startup utilisateur non modifié       |
| T30 | SKIPPED | Veille/réveil non exécuté                                                                                                |
| T31 | SKIPPED | Réseau physique non coupé ; chemins HTTP loopback sans proxy/redirect vérifiés                                           |
| T32 | SKIPPED | Machine LAN secondaire indisponible ; listener IPv4 127.0.0.1 et propriété PID vérifiés réellement                       |
| T33 | PASS    | Logs/diagnostics vérifiés : états fixes, pas de chemins/texte/exception brute ; sorties JVM non persistées               |
| T34 | PASS    | 100 requêtes réelles sans erreur, 20 cycles sans processus restant ; profil RAM/fuites exhaustif non mesuré              |
| T35 | SKIPPED | Scan Defender / recette antivirus spécifique non effectué                                                                |
| T36 | SKIPPED | Installeur optionnel non implémenté ; distribution portable fournie                                                      |

Audit Brave exécuté avec `node scripts/verify-browser.mjs` : chargement, absence de balayage de champs intacts, textarea, popup/clic/remplacement, rich cross-leaf, Shadow DOM ouvert, email, exclusion password, iframe, IME, grand texte/paragraphe et retrait d'éditeur passent, sans exception JavaScript. Le serveur V2 sur 8081 est laissé actif. La qualité du moteur privé a été comparée séparément par checksum et corpus.

Audit Chrome exécuté avec le navigateur installé et profil isolé : `Extension service worker not found`. Une tentative de chargement CDP n'a pas résolu ce résultat ; aucun changement de l'extension n'est déduit de cet échec. Charger manuellement `dist` dans Chrome et vérifier les parcours avant release.

Contrôles exécutés : **150 tests extension et 57 tests serveur passent**, lint, compilation TypeScript/Vite, build Windows onedir, format et `git diff --check` passent. Les tests du serveur couvrent chemins source/frozen, HTTP/proxy/redirects, états/processus, timeouts/cancel, propriété de port, mutex, raccourcis COM, confidentialité, checksums et actions tray. Les rapports bruts sont dans [validation](validation/). L'EXE final a aussi initialisé réellement la tray Windows et quitté avec nettoyage, via un message envoyé uniquement à ses fenêtres. Le script PowerShell de smoke test documenté passe également sur le paquet final.

Paquet final : `artifacts/Correctly-V3-Windows-x64.zip`, 422 051 227 octets ; SHA-256 `8b44f8d48f56c906c44de04df5c05ef58707ab9652df3a287e0c3b8013216fa4`. Dossier décompressé : 761 812 097 octets. Les 1 824 fichiers du moteur et 431 fichiers du runtime correspondent au lock local. L'extension conserve son comportement V2 ; seul un import TypeScript préexistant a reçu un ajustement de formatage.

Autres conditions avant publication : vérifier provenance des archives originales, redistribution/licences, mesures RAM/CPU et cold start sur machine propre. Les SHA-256 épinglent les fichiers V2 locaux ; ils ne certifient pas leur archive officielle d'origine. Voir [DEPENDENCIES.md](DEPENDENCIES.md), [BENCHMARKS_V3.md](BENCHMARKS_V3.md) et [LICENSES-THIRD-PARTY.md](LICENSES-THIRD-PARTY.md).
