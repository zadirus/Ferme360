# Ferme360

PWA Preact + Vite + TypeScript, hors-ligne d'abord, hébergée sur Cloudflare Workers (fichiers statiques, wrangler.jsonc).
Langue de l'interface et des messages : français. Montants en FCFA, dates jj/mm/aaaa.
Cahier des charges : section « Architecture » = Pages (app), Workers (API), D1 (données), R2 (photos, sauvegardes).
Avant de livrer : `npm run build` doit passer.

## Synchronisation (étape 2)
- Téléphone : IndexedDB (`src/db.ts`), tout est écrit en local d'abord, `dirty=1` jusqu'à l'envoi (`src/sync.ts`).
- Serveur : Worker `worker/index.ts` + D1 (liaison `DB`, créée automatiquement au déploiement). Le schéma se crée seul à la première requête.
- Enregistrements génériques `{id, collection, data, updatedAt}` ; la dernière modification gagne, horloge corrigée avec l'heure du serveur.
- Stocks et effectifs : toujours des mouvements ajoutés, jamais modifiés (à respecter dans les étapes suivantes).
- Connexion : nom + mot de passe (PBKDF2), jeton signé 90 jours.
- Installation protégée par le secret `SETUP_CODE` (défini dans le tableau de bord Cloudflare, jamais dans le dépôt ; en local : fichier `.dev.vars`, ignoré par git). Sans ce secret, l'installation reste ouverte jusqu'à la création du compte propriétaire, puis se ferme définitivement (choix explicite du propriétaire, 24/11/2026).
- Droits par profil : à faire à l'étape 6 ; pour l'instant seul le propriétaire existe.

## Poules pondeuses (étape 3)
- Collections : `bande`, `ramassage`, `mortalite`, `aliment`, `sante`, `oeufs_mvt` (types dans `src/poules/types.ts`).
- Tous les calculs sont dans `src/poules/calculs.ts` (testés : `npm test`) : effectif = arrivée − morts/réformes ; taux de ponte = œufs ramassés (bons + fêlés + cassés) ÷ poules présentes ; stock d'œufs = bons ramassés − sorties (vente, consommation, casse) ± ajustement d'inventaire.
- Seuils d'alerte par défaut (constantes dans calculs.ts, à rendre modifiables à l'étape 6) : chute de ponte > 5 points en 3 jours, mortalité > max(2, 1 %) en un jour.
- Navigation par hash (`#/poules`, `#/poules/<id>`, `#/oeufs`, `#/carnet`), barre d'onglets en bas.
- À faire à l'étape 4 : lier l'aliment au stock d'aliment, les ventes d'œufs aux clients, coût de revient du plateau.
