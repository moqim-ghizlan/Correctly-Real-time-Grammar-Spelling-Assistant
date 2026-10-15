# HOWTODO.md — Installation complète de Correctly sur Windows

Ce guide explique comment installer Correctly de zéro sur un PC Windows, depuis les dépendances jusqu’au lancement automatique au démarrage de Windows.

L’objectif final est d’obtenir :

```text
Windows démarre
    ↓
CorrectlyServer.exe démarre automatiquement
    ↓
LanguageTool démarre en arrière-plan
    ↓
L’extension Correctly dans Chrome/Brave se connecte à LanguageTool
    ↓
Correction en temps réel disponible
```

```text
Pour le V2
```

Aucune fenêtre CMD ou PowerShell ne doit rester ouverte en permanence.

---

## 1. Installer Node.js et préparer le projet

Correctly utilise Node.js/npm pour installer les dépendances et générer l’extension.

Installer une version récente de Node.js, idéalement Node.js 22+.

Vérifier :

```bash
node --version
npm --version
```

Dans le dossier du projet Correctly :

```bash
npm install
npm test
npm run lint
npm run build
```

Le build doit produire :

```text
dist/
```

C’est ce dossier qu’il faudra charger dans Chrome/Brave.

---

## 2. Installer Java

LanguageTool fonctionne en Java.

Nous avons utilisé Eclipse Temurin.

Installer un JDK Temurin compatible, par exemple :

```text
Temurin JDK 25 LTS x64
```

Après installation :

```cmd
java --version
```

Pour trouver Java :

```cmd
where java
where javaw
```

Exemple utilisé :

```text
C:\Program Files\Eclipse Adoptium\jdk-25.0.4.101-hotspot\bin\javaw.exe
```

`javaw.exe` est important car il permet de lancer Java sans afficher une console.

---

## 3. Installer LanguageTool

Télécharger la distribution standalone / serveur de LanguageTool.

Décompresser par exemple dans :

```text
C:\LanguageTool\LanguageTool-20260923-snapshot
```

Vérifier la présence de :

```text
languagetool-server.jar
```

Depuis CMD :

```cmd
cd C:\LanguageTool\LanguageTool-20260923-snapshot
dir *server*.jar
```

Créer ensuite le fichier de configuration vide :

```cmd
type nul > server.properties
```

Le fichier doit s’appeler exactement :

```text
server.properties
```

et non `server.properties.txt`.

---

## 4. Tester LanguageTool manuellement

Dans :

```text
C:\LanguageTool\LanguageTool-20260923-snapshot
```

lancer :

```cmd
java -cp languagetool-server.jar org.languagetool.server.HTTPServer --config server.properties --port 8081
```

Résultat attendu :

```text
Starting LanguageTool ... server on http://localhost:8081...
Server started
```

Tester ensuite dans Chrome :

```text
http://127.0.0.1:8081/v2/languages
```

Une liste JSON de langues doit apparaître.

Tester aussi une correction :

```cmd
curl.exe -X POST --data-urlencode "language=fr" --data-urlencode "text=je sui aller au magasin hier" http://127.0.0.1:8081/v2/check
```

Une réponse JSON avec `matches` doit apparaître.

---

## 5. Installer l’extension Correctly dans Chrome

Ouvrir :

```text
chrome://extensions
```

Puis :

```text
Mode développeur
→ Charger l’extension non empaquetée
→ sélectionner le dossier dist/
```

Important : sélectionner `dist/`, pas la racine du projet.

Après chargement :

- vérifier que Correctly apparaît ;
- vérifier qu’elle est activée ;
- recharger les pages déjà ouvertes.

Pour Brave :

```text
brave://extensions
```

La procédure est identique.

---

## 6. Premier test de Correctly

Avec LanguageTool encore lancé manuellement, ouvrir une page avec un champ texte.

Écrire :

```text
je sui aller au magasin hier
```

Attendre environ 400 ms.

Correctly doit :

- détecter l’erreur ;
- souligner la portion concernée ;
- afficher une popup au clic ;
- proposer une correction.

---

## 7. Créer un VBS pour lancer LanguageTool sans terminal

Créer :

```text
C:\LanguageTool\start-languagetool.vbs
```

Contenu :

```vbscript
Set shell = CreateObject("WScript.Shell")

shell.Run _
"""C:\Program Files\Eclipse Adoptium\jdk-25.0.4.101-hotspot\bin\javaw.exe"" " & _
"-cp ""C:\LanguageTool\LanguageTool-20260923-snapshot\languagetool-server.jar"" " & _
"org.languagetool.server.HTTPServer " & _
"--config ""C:\LanguageTool\LanguageTool-20260923-snapshot\server.properties"" " & _
"--port 8081", _
0, False
```

Adapter le chemin de Java si nécessaire avec :

```cmd
where javaw
```

Double-cliquer sur le fichier VBS.

Aucune fenêtre terminal ne doit rester visible.

Tester :

```text
http://127.0.0.1:8081/v2/languages
```

Si le JSON apparaît, le VBS fonctionne.

---

## 8. Pourquoi créer ensuite un EXE

Le VBS fonctionne, mais il n’offre pas d’interface.

Nous avons donc créé une petite application Windows avec une icône tray qui permet :

```text
Démarrer le serveur
Arrêter le serveur
Redémarrer
Quitter
```

Le programme reste discret dans la zone de notification Windows.

---

## 9. Installer Python 3.11

Vérifier :

```cmd
py -3.11 --version
```

ou :

```cmd
py list
```

Installer les dépendances globalement :

```cmd
py -3.11 -m pip install pystray pillow
py -3.11 -m pip install pyinstaller
```

---

## 10. Créer correctly_tray.py

Créer :

```text
C:\LanguageTool\correctly_tray.py
```

Contenu :

```python
import subprocess
import sys
import urllib.request
from pathlib import Path

import pystray
from PIL import Image


JAVA = r"C:\Program Files\Eclipse Adoptium\jdk-25.0.4.101-hotspot\bin\javaw.exe"

LT_DIR = Path(r"C:\LanguageTool\LanguageTool-20260923-snapshot")
LT_JAR = LT_DIR / "languagetool-server.jar"
LT_CONFIG = LT_DIR / "server.properties"

PORT = 8081
process = None


def resource_path(filename):
    if getattr(sys, "frozen", False):
        base_path = Path(sys._MEIPASS)
    else:
        base_path = Path(__file__).parent

    return base_path / filename


def create_icon():
    return Image.open(resource_path("icon-48.png"))


def server_is_running():
    try:
        with urllib.request.urlopen(
            f"http://127.0.0.1:{PORT}/v2/languages",
            timeout=1
        ) as response:
            return response.status == 200
    except Exception:
        return False


def start_server():
    global process

    if server_is_running():
        return

    process = subprocess.Popen(
        [
            JAVA,
            "-cp",
            str(LT_JAR),
            "org.languagetool.server.HTTPServer",
            "--config",
            str(LT_CONFIG),
            "--port",
            str(PORT),
        ],
        cwd=str(LT_DIR),
        creationflags=subprocess.CREATE_NO_WINDOW,
    )


def stop_server():
    global process

    if process and process.poll() is None:
        process.terminate()
        process = None


def restart_server():
    stop_server()
    start_server()


def on_start(icon, item):
    start_server()


def on_stop(icon, item):
    stop_server()


def on_restart(icon, item):
    restart_server()


def on_quit(icon, item):
    stop_server()
    icon.stop()


start_server()

icon = pystray.Icon(
    "Correctly",
    create_icon(),
    "Correctly LanguageTool",
    menu=pystray.Menu(
        pystray.MenuItem("Démarrer le serveur", on_start),
        pystray.MenuItem("Arrêter le serveur", on_stop),
        pystray.MenuItem("Redémarrer", on_restart),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Quitter", on_quit),
    ),
)

icon.run()
```

---

## 11. Ajouter l’icône Correctly

Placer :

```text
C:\LanguageTool\icon-48.png
```

Cette image sera utilisée pour l’icône tray.

---

## 12. Tester le script Python

Depuis CMD :

```cmd
cd C:\LanguageTool
py -3.11 correctly_tray.py
```

Depuis Git Bash :

```bash
cd /c/LanguageTool
py -3.11 correctly_tray.py
```

Résultat attendu :

- l’icône Correctly apparaît près de l’horloge ;
- LanguageTool démarre ;
- le terminal reste occupé tant que le script tourne.

C’est normal à cette étape.

Tester le clic droit sur l’icône :

```text
Démarrer le serveur
Arrêter le serveur
Redémarrer
Quitter
```

`Arrêter le serveur` doit garder l’icône visible.

`Quitter` doit arrêter complètement l’application et supprimer l’icône.

---

## 13. Convertir le PNG en ICO

Depuis :

```text
C:\LanguageTool
```

lancer :

```bash
py -3.11 -c "from PIL import Image; img=Image.open('icon-48.png').convert('RGBA'); img.save('correctly.ico', sizes=[(16,16),(24,24),(32,32),(48,48)])"
```

Le fichier créé est :

```text
correctly.ico
```

---

## 14. Nettoyer les anciens builds

Avec Git Bash :

```bash
rm -rf build dist
rm -f CorrectlyServer.spec
```

---

## 15. Compiler CorrectlyServer.exe

Toujours dans :

```text
C:\LanguageTool
```

lancer :

```bash
py -3.11 -m PyInstaller \
  --clean \
  --onefile \
  --noconsole \
  --icon correctly.ico \
  --add-data "icon-48.png;." \
  --name CorrectlyServer \
  correctly_tray.py
```

Résultat :

```text
C:\LanguageTool\dist\CorrectlyServer.exe
```

---

## 16. Tester l’EXE

Fermer l’ancien script Python s’il tourne.

Double-cliquer sur :

```text
C:\LanguageTool\dist\CorrectlyServer.exe
```

Résultat attendu :

```text
aucun terminal
+
icône Correctly dans la zone de notification
+
LanguageTool actif sur le port 8081
```

Tester :

```text
http://127.0.0.1:8081/v2/languages
```

---

## 17. Ajouter CorrectlyServer.exe au démarrage de Windows

Appuyer sur :

```text
Win + R
```

Puis saisir :

```text
shell:startup
```

Windows ouvre le dossier de démarrage de l’utilisateur.

Ensuite :

1. aller dans :

```text
C:\LanguageTool\dist
```

2. clic droit sur :

```text
CorrectlyServer.exe
```

3. créer un raccourci ;

4. déplacer uniquement ce raccourci dans le dossier ouvert avec `shell:startup`.

Il ne faut pas déplacer l’EXE lui-même.

---

## 18. Résultat final au démarrage

Après connexion à Windows :

```text
Startup lance le raccourci
    ↓
CorrectlyServer.exe démarre
    ↓
LanguageTool démarre avec javaw.exe
    ↓
aucun terminal visible
    ↓
icône Correctly disponible
    ↓
extension Chrome connectée au serveur local
```

---

## 19. Test complet après redémarrage

Redémarrer Windows.

Puis vérifier :

1. l’icône Correctly est visible ;
2. `http://127.0.0.1:8081/v2/languages` répond ;
3. Chrome contient l’extension Correctly ;
4. l’extension est activée ;
5. une phrase comme `je sui aller au magasin hier` est détectée et corrigée.

---

## 20. Mise à jour de l’extension

Après modification du code :

```bash
npm run build
```

Puis dans :

```text
chrome://extensions
```

cliquer sur :

```text
Recharger
```

sur Correctly.

Recharger aussi les pages de test.

---

## 21. Commandes de développement utiles

```bash
npm run dev
npm run test:watch
npm run format
npm run format:check
```

Avant une validation importante :

```bash
npm run lint
npm test
npm run build
```

---

## 22. Arborescence finale recommandée

```text
C:\LanguageTool\
│
├── correctly_tray.py
├── icon-48.png
├── correctly.ico
├── start-languagetool.vbs
│
├── LanguageTool-20260923-snapshot\
│   ├── languagetool-server.jar
│   ├── server.properties
│   └── ...
│
├── build\
├── dist\
│   └── CorrectlyServer.exe
│
└── CorrectlyServer.spec
```

---

## 23. Vérifications en cas de problème

### Java

```cmd
java --version
where java
where javaw
```

### LanguageTool

```text
http://127.0.0.1:8081/v2/languages
```

### API

```cmd
curl.exe -X POST --data-urlencode "language=fr" --data-urlencode "text=je sui aller au magasin hier" http://127.0.0.1:8081/v2/check
```

### Extension

```text
chrome://extensions
```

Vérifier qu’elle est activée et chargée depuis `dist/`.

### Serveur Windows

Vérifier dans le Gestionnaire des tâches que :

```text
CorrectlyServer.exe
```

est lancé.

---

## 24. Installation complète résumée sur un nouveau PC

```text
1. Installer Node.js
2. npm install
3. npm test
4. npm run lint
5. npm run build
6. Installer Java Temurin
7. Télécharger et extraire LanguageTool
8. Créer server.properties
9. Tester LanguageTool sur le port 8081
10. Charger dist/ dans Chrome ou Brave
11. Installer Python 3.11
12. Installer pystray, Pillow et PyInstaller
13. Copier correctly_tray.py
14. Copier icon-48.png
15. Générer correctly.ico
16. Compiler CorrectlyServer.exe
17. Tester l’EXE
18. Créer un raccourci vers l’EXE
19. Mettre le raccourci dans shell:startup
20. Redémarrer Windows
21. Vérifier LanguageTool
22. Vérifier Correctly dans Chrome
```

---

## 25. État final attendu

Une installation correcte doit donner :

- Java installé ;
- LanguageTool installé ;
- serveur local actif sur `127.0.0.1:8081` ;
- CorrectlyServer.exe lancé automatiquement ;
- aucune console visible ;
- icône Correctly près de l’horloge ;
- extension Correctly installée dans Chrome/Brave ;
- corrections FR/EN disponibles en temps réel.
