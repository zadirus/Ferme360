import { CATEGORIES_ROLE, construireAlertes, type AlerteNotif } from './alertes';
import type { Role } from './droits';
import type { Article, Client, Paiement, StockMvt, Vente } from './gestion/types';
import { today } from './format';
import { useItems, useRole } from './hooks';
import { lireProphylaxie } from './poules/programmes';
import type { Bande, Eau, Mortalite, Ramassage, Sante } from './poules/types';
import { ID_PROGRAMMES } from './reglages';
import { useRuminants } from './ruminants/donnees';

// Les alertes de la ferme (mêmes règles que les notifications), limitées à ce que le profil a le droit de voir
export function useAlertes(): AlerteNotif[] {
  const role = useRole() as Role;
  const rum = useRuminants();
  const bandes = useItems<Bande>('bande');
  const ram = useItems<Ramassage>('ramassage');
  const morts = useItems<Mortalite>('mortalite');
  const santes = useItems<Sante>('sante');
  const articles = useItems<Article>('article');
  const stockMvts = useItems<StockMvt>('stock_mvt');
  const ventes = useItems<Vente>('vente');
  const paiements = useItems<Paiement>('paiement');
  const clients = useItems<Client>('client');
  const eaux = useItems<Eau>('eau');
  const programmes = useItems<{ prophylaxie?: string }>('reglage').find((x) => x.id === ID_PROGRAMMES);
  const permises = CATEGORIES_ROLE[role] ?? [];
  return construireAlertes(
    { bandes, ramassages: ram, mortalites: morts, santes, animaux: rum.animaux, mvtsAnimaux: rum.mvts, repro: rum.repro, misesBas: rum.misesBas, soins: rum.soins, articles, stockMvts, ventes, paiements, clients, programme: lireProphylaxie(programmes?.prophylaxie ?? ''), eaux },
    today()
  ).filter((a) => permises.includes(a.categorie));
}
