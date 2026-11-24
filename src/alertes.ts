// Alertes et rappels de la ferme, calculés avec les mêmes règles à l'écran et pour les notifications du matin (serveur).
import type { Role } from './droits';
import { ajouteJours, fmtDate, joursEntre } from './format';
import { alertesArticle, creances } from './gestion/calculs';
import type { Article, Client, Paiement, StockMvt, Vente } from './gestion/types';
import { alerteEau, alertes as alertesPoules } from './poules/calculs';
import { vaccinsAFaire, type LigneProphylaxie } from './poules/programmes';
import type { Bande, Eau, Mortalite, Ramassage, Sante } from './poules/types';
import { etatAnimal, finDelaiAttente, miseBasPrevue } from './ruminants/calculs';
import type { Animal, MiseBas, MvtAnimal, Repro, Soin } from './ruminants/types';
import { REGLAGES } from './reglages';

type Avec<T> = T & { id: string; updatedAt: number };

export type CategorieNotif = 'rappels' | 'misesbas' | 'delais' | 'stock' | 'creances' | 'poules';

export const NOM_CATEGORIE: Record<CategorieNotif, string> = {
  rappels: 'Rappels de santé (vaccins, soins)',
  misesbas: 'Mises bas prévues',
  delais: 'Fins de délai d’attente',
  stock: 'Stocks bas et produits qui périment',
  creances: 'Clients qui doivent depuis longtemps',
  poules: 'Poules : chute de ponte, mortalité'
};

// Ce que chaque profil a le droit de recevoir
export const CATEGORIES_ROLE: Record<Role, CategorieNotif[]> = {
  owner: ['rappels', 'misesbas', 'delais', 'stock', 'creances', 'poules'],
  gerant: ['rappels', 'misesbas', 'delais', 'stock', 'creances', 'poules'],
  ouvrier: ['rappels', 'misesbas', 'delais', 'stock', 'poules'],
  veterinaire: ['rappels', 'misesbas', 'delais']
};

export interface DonneesAlertes {
  bandes: Array<Avec<Bande>>;
  ramassages: Array<Avec<Ramassage>>;
  mortalites: Array<Avec<Mortalite>>;
  santes: Array<Avec<Sante>>;
  animaux: Array<Avec<Animal>>;
  mvtsAnimaux: Array<Avec<MvtAnimal>>;
  repro: Array<Avec<Repro>>;
  misesBas: Array<Avec<MiseBas>>;
  soins: Array<Avec<Soin>>;
  articles: Array<Avec<Article>>;
  stockMvts: Array<Avec<StockMvt>>;
  ventes: Array<Avec<Vente>>;
  paiements: Array<Avec<Paiement>>;
  clients: Array<Avec<Client>>;
  programme?: LigneProphylaxie[];
  eaux?: Array<Avec<Eau>>;
}

export interface AlerteNotif {
  categorie: CategorieNotif;
  texte: string;
}

const etiquette = (a: Animal) => (a.nom ? `${a.boucle} (${a.nom})` : a.boucle);

export function construireAlertes(d: DonneesAlertes, aujourdhui: string): AlerteNotif[] {
  const out: AlerteNotif[] = [];
  const demain = ajouteJours(aujourdhui, 1);
  const quand = (date: string) => (date < aujourdhui ? `en retard (${fmtDate(date)})` : date === aujourdhui ? "aujourd'hui" : date === demain ? 'demain' : `le ${fmtDate(date)}`);

  // rappels de santé : échus ou pour aujourd'hui et demain
  for (const s of d.santes) {
    if (s.rappel && s.rappel <= demain) {
      const b = d.bandes.find((x) => x.id === s.bandeId);
      out.push({ categorie: 'rappels', texte: `${s.produit}${b ? ` (${b.nom})` : ''} : ${quand(s.rappel)}` });
    }
  }
  const presents = new Map(d.animaux.map((a) => [a.id, etatAnimal(a.id, d.mvtsAnimaux.filter((m) => m.animalId === a.id))]));
  for (const s of d.soins) {
    if (s.rappel && s.rappel <= demain) {
      const a = d.animaux.find((x) => x.id === s.animalId);
      out.push({ categorie: 'rappels', texte: `${s.produit}${a ? ` (${etiquette(a)})` : ''} : ${quand(s.rappel)}` });
    }
  }

  // mises bas : dans les 7 jours ou en retard
  for (const a of d.animaux) {
    if (a.sexe !== 'F' || presents.get(a.id)?.statut !== 'present') continue;
    const prevue = miseBasPrevue(a.id, d.repro, d.misesBas);
    if (prevue && joursEntre(aujourdhui, prevue) <= 7) out.push({ categorie: 'misesbas', texte: `Mise bas de ${etiquette(a)} : ${quand(prevue)}` });
  }

  // fin de délai d'attente aujourd'hui ou demain : l'animal redevient vendable
  for (const a of d.animaux) {
    const e = presents.get(a.id);
    if (e?.statut !== 'present') continue;
    for (const jour of [aujourdhui, demain]) {
      const fin = finDelaiAttente(a.id, e.lotId, d.soins, ajouteJours(jour, -1));
      const apres = finDelaiAttente(a.id, e.lotId, d.soins, jour);
      if (fin && !apres) {
        out.push({ categorie: 'delais', texte: `${etiquette(a)} sera vendable ${jour === aujourdhui ? "aujourd'hui" : 'demain'} (fin du délai d'attente)` });
        break;
      }
    }
  }

  // stocks
  for (const a of d.articles) out.push(...alertesArticle(a, d.stockMvts.filter((m) => m.articleId === a.id), aujourdhui).map((texte) => ({ categorie: 'stock' as const, texte })));

  // créances anciennes
  for (const c of creances(d.ventes, d.paiements, aujourdhui)) {
    if (c.jours > REGLAGES.joursCreance) out.push({ categorie: 'creances', texte: `${d.clients.find((x) => x.id === c.clientId)?.nom ?? 'Un client'} doit ${Math.round(c.solde).toLocaleString('fr-FR')} FCFA depuis ${c.jours} jours` });
  }

  // vaccins du programme de la ferme, pour chaque bande (en retard, aujourd'hui ou demain)
  for (const b of d.bandes.filter((x) => !x.cloturee)) {
    for (const v of vaccinsAFaire(b, d.programme ?? [], d.santes.filter((s) => s.bandeId === b.id), aujourdhui, 1)) out.push({ categorie: 'rappels', texte: `Vaccin ${v.produit} (${b.nom}) : ${quand(v.date)}` });
  }

  // poules
  for (const b of d.bandes.filter((x) => !x.cloturee)) {
    const e = alerteEau(b, (d.eaux ?? []).filter((x) => x.bandeId === b.id), d.mortalites.filter((m) => m.bandeId === b.id));
    if (e) out.push({ categorie: 'poules', texte: `${b.nom} : ${e}` });
    for (const texte of alertesPoules(b, d.ramassages.filter((r) => r.bandeId === b.id), d.mortalites.filter((m) => m.bandeId === b.id))) out.push({ categorie: 'poules', texte: `${b.nom} : ${texte}` });
  }
  return out;
}

export function resumeNotification(alertes: AlerteNotif[]): { titre: string; corps: string } {
  const n = alertes.length;
  const lignes = alertes.slice(0, 5).map((a) => `• ${a.texte}`);
  if (n > 5) lignes.push(`… et ${n - 5} autre(s)`);
  return { titre: `Ferme360 : ${n} chose${n > 1 ? 's' : ''} à voir`, corps: lignes.join('\n') };
}
