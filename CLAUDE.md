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

## Ventes, stocks, argent (étape 4)
- Collections : `client`, `vente`, `paiement`, `fournisseur`, `article`, `achat`, `reglement`, `stock_mvt`, `depense`, `treso_mvt` (types dans `src/gestion/types.ts`, calculs testés dans `src/gestion/calculs.ts`).
- Une vente d'œufs crée seule la sortie du stock d'œufs (`oeufs_mvt.venteId`) et son paiement (`paiement.venteId`) ; supprimer la vente supprime les trois.
- Créance = ventes − paiements du client ; les paiements soldent d'abord les ventes les plus anciennes (ancienneté pour l'alerte à 30 jours).
- Stock d'article = mouvements (entrée, sortie, ajustement) ; lots avec péremption consommés du plus proche au plus lointain (FIFO) ; alerte à 30 jours et au seuil.
- Aliment : une distribution peut être prélevée sur un article du stock (kg ÷ `kgParUnite` = unités sorties), coût = unités × coût moyen d'achat.
- Argent : soldes caisse / Mobile Money / banque calculés (paiements − achats payés − règlements − dépenses ± corrections) ; résultat par activité = ventes − achats − dépenses (achats comptés à la date d'achat ; charges « commun » non réparties pour l'instant).
- Écrans : `useItems` (src/hooks.ts) lit un instantané unique rechargé en bloc après chaque saisie ; `saveRecord` rend la main une fois les écrans à jour.
- Test de parcours complet : `npx wrangler dev --port 8790` puis `BASE=http://localhost:8790 node e2e/etape4.cjs` (Playwright).

## Moutons et bœufs (étape 5)
- Collections : `animal`, `mvt_animal`, `lot`, `pesee`, `repro`, `misebas`, `soin`, `ration` (types : `src/ruminants/types.ts` ; calculs testés : `src/ruminants/calculs.ts`). Un seul module pour les deux espèces (`espece: 'ovin' | 'bovin'`).
- Le statut (présent, vendu, mort, abattu, perdu) et le lot d'un animal sont DÉDUITS du dernier mouvement (`mvt_animal`) : jamais stockés. Supprimer un mouvement annule la sortie.
- Mise bas prévue = dernière saillie + gestation (ovin 150 j, bovin 283 j, modifiable par saillie), annulée par une mise bas ou un diagnostic « vide ».
- Délai d'attente : un soin (animal ou lot) avec `delaiAttente` jours bloque la vente et l'abattage jusqu'à `date + délai` (premier jour permis). Contrôle dans la vente (`Ventes.tsx`) et la sortie par abattage.
- Vente d'animal : ligne `article: 'animal'` (`animalId`, au poids = kg × prix/kg, ou sur pied = 1 × prix) ; crée une sortie `mvt_animal` avec `venteId` ; supprimer la vente remet l'animal dans le registre.
- Achat d'un animal : crée un `achat` (activité ovins/bovins) payé comptant. Coût d'un soin : crée une `depense` (`soinId`).
- Embouche : GMQ = (dernier poids − premier poids) ÷ jours × 1000, coût de revient du kg vif = (achat + rations + soins) ÷ somme des derniers poids ; objectif de poids et de date (Tabaski) sur le lot.
- Non fait : pâturage par parc, photos, traction et lait, proposition de réforme, mortalité avant sevrage.
- Test de parcours : `npx wrangler dev --port 8791` puis `BASE=http://localhost:8791 node e2e/etape5.cjs`.
