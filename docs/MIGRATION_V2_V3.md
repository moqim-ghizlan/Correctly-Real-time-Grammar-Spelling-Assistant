# Migration V2 vers V3

Le moteur et l'extension existants sont conservés. La nouveauté est la distribution autonome et le contrôleur Windows : runtime Java privé complet, chemins relatifs, instance unique, états réels, cycle start/stop/restart, tray réactive, autostart facultatif et diagnostics sans texte.

Quitter le lanceur V1/V2 et son serveur avec leur propre menu avant de démarrer le nouveau `CorrectlyServer.exe`. L'ancien raccourci Windows vise encore le Java système : le retirer manuellement puis activer l'option V3 dans un emplacement permanent. La V3 ne supprime pas les raccourcis anciens ou inconnus.

L'extension reste en version 0.2.0 car son code et son contrat n'ont pas changé. Ses paramètres, dictionnaire, délais et limites restent ceux de la V2. Les scripts de build Windows écrivent dans `artifacts`, laissant `dist` réservé à l'extension.

Le développement reste dans la racine initiale, branche `feature/correctly-v3`. Les fichiers binaires vendor/build/zip sont ignorés par Git ; `vendor-lock.json`, code, scripts et rapports sont versionnables. Pour reconstruire, fournir les distributions locales exactes correspondant au lock, installer les dépendances de build épinglées, puis exécuter les scripts documentés dans le README.

La V3 ne règle pas automatiquement les limites des sites riches ni l'Auto sur phrases ambiguës. Les tests manuels Chrome/Brave sur sites authentifiés et Windows propre restent des conditions de validation finale.
