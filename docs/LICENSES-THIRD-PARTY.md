# Notices de redistribution V3

Le paquet contient les composants effectivement copiés ci-dessous. Les notices originales font foi et sont conservées dans le paquet. Ce document n'est pas une certification juridique ni une preuve d'origine de l'archive initiale.

| Composant                       | Version intégrée                         | Notices conservées                                                                        |
| ------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| LanguageTool                    | 6.9-SNAPSHOT, distribution du 2026-09-23 | `engine/COPYING.txt`, `engine/third-party-licenses/`, copie dans `licenses/languagetool/` |
| Eclipse Temurin OpenJDK complet | 25.0.4.1+1-LTS Windows x64               | `runtime/legal/` complet ; GPLv2 avec exception Classpath et notices propres aux modules  |
| CPython                         | 3.14.8 x64                               | `licenses/Python-LICENSE.txt`                                                             |
| pystray                         | 0.19.5                                   | Licence LGPLv3, notice originale dans `licenses/pystray/`                                 |
| Pillow                          | 12.3.0                                   | Notices originales dans `licenses/Pillow/`                                                |
| six                             | 1.17.0                                   | Licence MIT, notice dans `licenses/six/`                                                  |
| PyInstaller / bootloader        | 6.22.3                                   | GPL avec exception de distribution du bootloader, notices dans `licenses/PyInstaller/`    |

Le moteur et le runtime sont copiés depuis les installations V2 existantes, sans suppression de dictionnaires, bibliothèques ou modules. Leurs arbres de fichiers sont épinglés par SHA-256 dans `backend/vendor-lock.json`. Les sommes de contrôle des archives officielles initiales n'étaient pas disponibles : la vérification des archives d'origine et des obligations de redistribution reste requise avant une publication publique.

Références des projets : [LanguageTool](https://github.com/languagetool-org/languagetool), [Temurin](https://github.com/adoptium/temurin25-binaries), [CPython](https://github.com/python/cpython), [pystray](https://github.com/moses-palmer/pystray), [Pillow](https://github.com/python-pillow/Pillow), [six](https://github.com/benjaminp/six), [PyInstaller](https://github.com/pyinstaller/pyinstaller).
