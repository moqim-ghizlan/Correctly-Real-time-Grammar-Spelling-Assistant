# Dépendances V3

| Composant              | Version utilisée                                | Source                                                  |
| ---------------------- | ----------------------------------------------- | ------------------------------------------------------- |
| LanguageTool           | 6.9-SNAPSHOT, build 2026-09-23                  | Distribution locale V2 `LanguageTool-20260923-snapshot` |
| Java privé             | Temurin 25.0.4.1+1-LTS Windows x64, JDK complet | Installation Eclipse Adoptium locale V2                 |
| Python de build        | CPython 3.14.8 Windows x64                      | Environnement `.venv` existant                          |
| PyInstaller            | 6.22.3                                          | PyPI, installation explicite à la construction          |
| pystray / Pillow / six | 0.19.5 / 12.3.0 / 1.17.0                        | Paquets de l'environnement de build                     |

Toutes les dépendances Python directes et transitives de build sont épinglées dans `backend/requirements-build.txt`. Tests : pytest 9.1.1. Le lock vendor contient le SHA-256 **de chaque fichier** du moteur et de la JVM, les versions et références des projets. Les scripts refusent tout fichier manquant, supplémentaire ou modifié ; ils ne téléchargent jamais un snapshot mouvant et ne modifient pas le Java système.

La compatibilité est validée par le runtime privé copié et les corrections réelles FR/EN. Le JAR core porte un build Java 17 ; aucune prétention de compatibilité avec toutes les JVM >=17 n'est faite. Le JDK entier est livré pour conserver les modules/chargements dynamiques et notices ; pas de jlink ni de suppression de langues.

La provenance disponible est celle de l'installation V2 locale, pas une authentification cryptographique des archives officielles originales. Avant publication publique, retrouver/vérifier les archives d'origine et revoir la redistribution. La candidate locale conserve les fichiers exacts plutôt que substituer une release arbitraire.

Les licences sont détaillées dans [LICENSES-THIRD-PARTY.md](LICENSES-THIRD-PARTY.md). Les sommes de contrôle du zip sont produites dans `artifacts/*.zip.sha256`. Pour préparer : `scripts/prepare_vendor.ps1 -EngineSource <distribution-LT-exacte> -RuntimeSource <runtime-exact>` ; pour contrôler : `scripts/verify_checksums.ps1 [-Bundle <paquet>]`.
