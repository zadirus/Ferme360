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
- Installation protégée par le secret `SETUP_CODE` (défini dans le tableau de bord Cloudflare, jamais dans le dépôt ; en local : fichier `.dev.vars`, ignoré par git). Sans ce secret, l'installation est refusée.
- Droits par profil : à faire à l'étape 6 ; pour l'instant seul le propriétaire existe.
