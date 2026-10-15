# Installer les 5 skills Correctly dans Claude Code

Ce pack est conçu pour le dépôt Correctly. Il ne contient pas de code applicatif et ne modifie pas le projet tant qu'il n'est pas extrait.

## Installation

1. Téléchargez `Correctly-5-Claude-Skills.zip`.
2. Placez l'archive à la racine du dépôt Correctly.
3. Dans **Git Bash**, depuis la racine du dépôt :

```bash
unzip -o Correctly-5-Claude-Skills.zip
```

Si `unzip` n'est pas disponible, sous Windows utilisez **Extraire tout...** sur le ZIP et copiez le dossier `.claude` obtenu à la racine du dépôt (fusionnez les dossiers, sans supprimer les fichiers existants).

4. Contrôlez la structure avec :

```bash
find .claude/skills -name SKILL.md
```

5. Relancez Claude Code depuis la racine du dépôt et vérifiez les commandes avec `/` ou `/skills` suivant la version.

## Commandes

- `/token-efficiency` : optimisation du contexte et du volume de tokens.
- `/correctly-extension` : développement de l'extension.
- `/correctly-security` : audit sécurité et confidentialité.
- `/correctly-debugging` : reproduction et correction des bugs.
- `/correctly-release` : audit et préparation **manuelle** de release (pas de publication implicite).

Les quatre premiers skills peuvent être chargés automatiquement quand leur description correspond à la tâche. Le skill release a `disable-model-invocation: true`, donc Claude ne l'active pas de lui-même.

Un skill est une procédure, pas un modèle plus économique : l'économie réelle dépend de la façon dont Claude suit ses instructions. Les descriptions coûtent un peu de contexte, alors que le corps entier d'un skill n'est normalement chargé que lorsqu'il est invoqué.

**Important :** la personnalisation s'appuie sur `recap_v4.md` du 15 octobre 2026, pas sur une lecture du dépôt Git local. Vérifiez les chemins, commandes et versions actuelles avant toute modification.
