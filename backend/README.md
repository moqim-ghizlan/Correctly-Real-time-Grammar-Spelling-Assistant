# Backend — serveur Windows

`src/correctly_server/` contient le contrôleur Python de la JVM et de la tray. `tests/` contient ses tests ; `assets/` contient l’icône. `correctly.spec`, `pyproject.toml` et `requirements-build.txt` définissent le packaging et les dépendances.

Les dépendances locales sont dans `.venv/`. Les distributions privées épinglées de LanguageTool/Java sont dans `vendor/`. Ces gros dossiers sont ignorés par Git ; les licences et SHA-256 restent documentés et verrouillés dans `vendor-lock.json`.

Depuis la racine :

```powershell
backend/.venv/Scripts/python.exe -m pytest -c backend/pyproject.toml backend/tests
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/create-setup.ps1 -CheckOnly
```

Double-cliquer sur **`createSetup.cmd`** reconstruit l’extension, le serveur et le Setup. Les sorties sont dans `artifacts/release`. Le script utilise un nouveau dossier de build à chaque fois pour préserver les paquets existants.

Le moteur et son endpoint `http://127.0.0.1:8081/v2/check` sont conservés. Le guide utilisateur est [README_INSTALL.md](README_INSTALL.md).
