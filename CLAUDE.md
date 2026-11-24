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

## Profils, réglages, rapports, sauvegarde (étape 6)
- Droits : `src/droits.ts` (partagé serveur + application). Profils : `owner`, `gerant`, `ouvrier`, `veterinaire`. Le serveur filtre la LECTURE (SQL `collection IN …`) et refuse l'ÉCRITURE (`rejected` dans la réponse de `/api/sync`) ; l'application masque en plus ce qui est interdit. Aucune donnée d'argent n'est jamais envoyée à l'ouvrier ni au vétérinaire.
- Le rôle est relu en base à chaque requête (`readSession`) : désactiver un compte ou changer son profil agit tout de suite. Colonne `users.active` ajoutée par migration automatique (`ensureSchema`).
- Comptes : `/api/users` (liste, création), `/api/users/update` (profil, actif, mot de passe), `/api/password` (le sien) ; réservés au propriétaire sauf le dernier. Il n'y a qu'un propriétaire.
- Journal : table `journal` (qui, quand, valeur avant) alimentée par `/api/sync` quand un enregistrement déjà connu du serveur change ou est supprimé ; conservé 24 mois ; `/api/journal` (propriétaire). Des modifications faites entre deux synchronisations comptent pour une seule.
- Réglages : collection `reglage` (id `reglages-ferme`), appliqués par `appliquerReglages` (src/reglages.ts) ; les calculs lisent `REGLAGES` au moment de l'appel.
- Coût de l'aliment : calculé à la lecture avec le coût moyen d'achat (`coutDistribution`), car l'ouvrier ne voit pas les achats.
- Rapports : `src/rapports/` — `pdf.ts` et `xlsx.ts` (+ `zip.ts`) sont écrits à la main, sans bibliothèque ; `rapport.ts` construit les données du mois ; reçu de vente en PDF depuis la fiche client. Partage via `navigator.share` (fichiers), sinon téléchargement.
- Sauvegarde : export/import JSON dans l'application (`Sauvegarde.tsx`) ; côté Cloudflare, D1 Time Travel (7 jours en gratuit, 30 en payant). R2 volontairement NON utilisé (peut exiger une carte bancaire et ferait échouer le déploiement).
- Téléphone partagé : se connecter avec un autre nom vide les données locales (refusé s'il reste des saisies non envoyées).
- Tests : `npm test` ; `e2e/droits-api.cjs` (API), `e2e/etape4.cjs`, `etape5.cjs`, `etape6.cjs` (deux serveurs : `BASE` et `BASE2`).
- Non fait : notifications téléphone application fermée, tâches et présences du personnel, sauvegarde automatique vers R2.

## Notifications et code PIN (étape 7, lot 1)
- Notifications push : `src/push/chiffrement.ts` (RFC 8291 + VAPID, WebCrypto seul, validé avec l'exemple officiel de la RFC), serveur dans `worker/index.ts` (`/api/push/*`, tâche planifiée `scheduled` toutes les heures, qui n'envoie que si l'heure locale = `heureNotif` et une seule fois par jour grâce à `settings.resume_envoye`). Clés VAPID générées et gardées en base (`settings.vapid_*`), rien à configurer dans Cloudflare.
- Contenu : `src/alertes.ts` (partagé) ; catégories par profil (`CATEGORIES_ROLE`) ; l'abonnement garde les catégories choisies sur chaque téléphone (`push_subs.prefs`).
- Service worker : `sw/sw.ts` (injectManifest : précache hors-ligne + `push` + `notificationclick`).
- Code PIN local : `src/pin.ts`, `src/Verrou.tsx`, `src/pages/Pin.tsx` ; redemandé après 2 minutes hors de l'écran ; 5 erreurs = déconnexion.
- Tests : `src/push/*.test.ts`, `src/alertes.test.ts`, `src/pin.test.ts` ; `e2e/push.cjs` (faux service de push qui déchiffre ; `wrangler dev --test-scheduled`, déclencheur `/cdn-cgi/handler/scheduled?cron=…`), `e2e/pin-hors-ligne.cjs`.

## Mise en service : import, aide, premiers pas (étape 7, lot 2)
- Import : `src/import/lecture.ts` (lecture .xlsx compressé et CSV, sans bibliothèque ; dates jj/mm/aaaa, aaaa-mm-jj ou numéro Excel), `src/import/modeles.ts` (contrôle ligne par ligne : animaux, clients avec solde, stock de départ, bandes), page `src/pages/Import.tsx` (modèle Excel à télécharger, aperçu, import des seules lignes valides). `saveMany` (sync.ts) enregistre en bloc.
- La reprise ne crée JAMAIS de mouvement d'argent : prix d'achat gardé pour mémoire, solde client = `vente` avec `reprise: true` (comptée en créance, exclue des ventes et des résultats), stock de départ = entrée sans achat.
- Aide : `src/pages/Aide.tsx` ; liste « Premiers pas » sur l'accueil (propriétaire et gérant) ; indicateurs mémorisés en localStorage (`ferme360.equipe`, `ferme360.sauvegarde`, `ferme360.premiers`).
- Tests : `src/import/*.test.ts` (jsdom pour DOMParser ; fixture Excel réelle `src/import/fixtures/exemple.xlsx`), `e2e/import.cjs` (3 000 animaux : import 3 s, affichage < 1 s sur ordinateur).

## Poules : compléments (étape 7, lot 3)
- Programme de vaccination et courbe de ponte de référence : deux textes dans `reglage` id `programmes-ferme` (`src/poules/programmes.ts`) ; `vaccinsAFaire` calcule, pour chaque bande, les vaccins en retard ou à faire sous 7 jours (rappel automatique, disparaît quand le vaccin est enregistré dans la santé de la bande). Les exemples fournis sont indicatifs, à valider avec un vétérinaire.
- Eau (`eau`) : alerte si l'eau par poule baisse de plus de `eauBaissePct` % par rapport aux 3 jours précédents. Fientes (`fientes`) : stock = sacs sortis − ventes de fumier en sacs de l'activité poules.
- Courbe de ponte (`src/courbe.tsx`, SVG) : taux de la bande selon l'âge en semaines, comparé à la courbe de référence. Bilan de bande : coût du plateau = (prix d'achat + aliment) ÷ plateaux de bons œufs ; marge estimée avec le prix moyen de vente de l'œuf.
- L'accueil utilise `construireAlertes` (src/alertes.ts) : mêmes alertes à l'écran et dans les notifications.
- Test : `e2e/poules2.cjs`.

## Moutons et bœufs : compléments (étape 7, lot 4)
- Réglages ajoutés (src/reglages.ts) : sevrage ovin 90 j, bovin 210 j, castration 60 j (0 = aucun), âge de réforme ovin 7 ans / bovin 10 ans. Ce sont des valeurs de départ, modifiables.
- `tachesAutomatiques` (sevrage, castration des mâles nés à la ferme ; en retard de moins de 60 jours ou sous 7 jours ; disparaît quand un soin du même type est enregistré), `propositionsReforme` (âge, ≥ 2 saillies sans mise bas, ≥ 3 traitements en 12 mois), `mortaliteAvantSevrage` : `src/ruminants/calculs.ts`. Les rappels sont aussi dans `construireAlertes` (notifications).
- Photos : collection `photo`, image JPEG réduite à ≤ 70 000 caractères (`src/photo.ts`) pour tenir dans un enregistrement synchronisé (limite serveur 100 000) ; pas de stockage de fichiers (R2 non utilisé).
- Parcs : `parc` + `pature` (entrée/sortie d'un lot) ; le parc actuel d'un lot est DÉDUIT du dernier mouvement (`src/ruminants/parcs.ts`) ; alerte de surcharge si capacité dépassée.
- Lait : `traite` (litres) + vente article `lait` (unité litre, activité bovins). Traction : `travail` (jours, recette) ; une recette crée une vente + son paiement (supprimés avec le travail).
- Courbes de croissance : `src/courbe.tsx` (animal et moyenne du lot).
- Test : `e2e/ruminants2.cjs`.

## Argent : charges communes et marge par animal (étape 7, lot 5)
- `resultatsRepartis` (src/gestion/calculs.ts) : les charges de l'activité « commun » sont réparties entre poules, moutons et bœufs au prorata de leurs ventes (clé de répartition) ; si aucun élevage n'a de vente, elles restent « non réparties ». La somme des marges nettes + charges non réparties = marge de la ferme. Utilisé par la page Argent et le rapport mensuel.
- `margeAnimal` (src/ruminants/calculs.ts) : prix de vente − (prix d'achat + soins de l'animal + part égale des rations et soins de son lot), affichée sur la fiche d'un animal vendu (propriétaire et gérant).

## Plateforme web, tableau de bord, stock par catégories (étape 7, lot 6)
- Navigation : téléphone = barre du bas à 5 entrées (Accueil, Élevage, Ventes, Stocks, **Plus**) ; « Plus » ouvre tout le reste. Ordinateur (≥ 960 px) = menu latéral complet (`MENU_BUREAU` dans `src/App.tsx`), pages larges, grilles de 4 colonnes. La même application sert les deux (PWA), aucune seconde base de code.
- Tableau de bord : `src/pages/Tableau.tsx` (périodes 30 j / 90 j / 12 mois, comparaison avec la période précédente), calculs dans `src/tableau/indicateurs.ts` (séries mensuelles, trésorerie à une date, ancienneté des créances, taux de ponte quotidien pondéré), graphiques SVG sans bibliothèque dans `src/courbe.tsx` et `src/graphiques.tsx` (barres, barres horizontales, chiffres clés). Les blocs d'argent n'apparaissent que pour le propriétaire et le gérant. `useAlertes` (src/useAlertes.ts) = mêmes alertes que l'accueil et les notifications.
- Stock : page groupée par catégorie (aliments, produits vétérinaires, autres) avec filtre, valeur du stock au coût moyen (profils « argent »), péremption la plus proche. Un soin d'animal (`SoinForm`) ou de bande (`SanteForm`) peut prélever un produit vétérinaire du stock : `stock_mvt.alimentId` = id du soin (supprimer le soin supprime la sortie). Le vétérinaire lit `article` et écrit `stock_mvt`.
- Tests : `src/tableau/indicateurs.test.ts`, `e2e/tableau.cjs` (jeu de données réaliste semé par l'API ; ordinateur et téléphone).

## Consulter les données et remise à zéro (étape 7, lot 7)
- Consulter : listes de l'application, tableau de bord, rapports PDF/Excel du mois, **export Excel de toutes les données** (`src/rapports/exportTout.ts` : une feuille par collection, noms à la place des identifiants, « Saisi par », « Modifié le »), sauvegarde JSON, journal. Base brute : console D1 de Cloudflare (table `records`).
- Remise à zéro : `POST /api/reset` (propriétaire seul, `confirmation: 'REMETTRE A ZERO'`, option `garderReglages`). Efface enregistrements, journal et marqueur du résumé quotidien ; les comptes sont gardés. Une « époque » (`settings.epoch`) change : tout téléphone qui se synchronise avec l'ancienne époque reçoit `resetRequired`, se vide (`reinitialiserDonnees`) et ses saisies non envoyées sont perdues (voulu). Filet : D1 Time Travel.
- Écran : Plus > Sauvegarde > « Remettre la ferme à zéro » (case de confirmation à taper + question finale).
- Test : `e2e/reset.cjs` (deux téléphones, droits, époque).

## Étiquettes libres et achats d'œufs (étape 7, lot 8)
- Étiquettes : champ optionnel `tags: string[]` sur `animal`, `lot`, `bande`, `client`, `article` (aucun changement de serveur : enregistrements génériques). `src/etiquettes.tsx` : `ChampEtiquettes` (saisie + suggestions des étiquettes déjà utilisées), `EtiquettesFiche` (modification directe sur la fiche, si le profil peut écrire), `FiltreEtiquettes` (listes animaux, clients, articles), `Pastilles`. Majuscules ignorées, 30 caractères max. L'export Excel les met en texte « a, b ».
- Œufs achetés à d'autres fournisseurs : bouton « Acheter des œufs » (page Stock d'œufs, profils « achats »). Crée un `achat` (activité poules, `quantite` = œufs, dette si payé partiellement) + un `oeufs_mvt` de type `achat` (`achatId`) qui ENTRE dans le stock (`stockOeufs`). Supprimer le mouvement supprime l'achat. Coût moyen du plateau acheté et marge moyenne par plateau revendu (prix moyen de vente − coût) affichés pour les profils « achats ». Le rapport mensuel ajoute « Œufs achetés à des fournisseurs ». Les œufs achetés ne comptent PAS dans le taux de ponte ni le bilan de bande (seulement les ramassages).
- Test : `e2e/etiquettes-achats.cjs`.
