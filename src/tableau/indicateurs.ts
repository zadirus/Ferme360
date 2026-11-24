// Calculs du tableau de bord : périodes, séries mensuelles, trésorerie à une date, ancienneté des créances, taux de ponte quotidien.
import { ajouteJours } from '../format';
import { soldesComptes, type Creance } from '../gestion/calculs';
import type { Achat, Depense, Paiement, Reglement, TresoMvt } from '../gestion/types';
import { effectifAu, oeufsPondus } from '../poules/calculs';
import type { Bande, Mortalite, Ramassage } from '../poules/types';

const p2 = (n: number) => String(n).padStart(2, '0');

export const moisDe = (date: string) => date.slice(0, 7);

// Les n derniers mois (le plus ancien d'abord), le mois courant compris
export function derniersMois(n: number, aujourdhui: string): string[] {
  let [y, m] = aujourdhui.split('-').map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${p2(m)}`);
    m--;
    if (m === 0) { m = 12; y--; }
  }
  return out;
}

export const NOMS_MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const libelleMoisCourt = (mois: string) => NOMS_MOIS[Number(mois.slice(5, 7)) - 1];

// Somme d'une valeur par mois (mois sans donnée = 0)
export function parMois<T>(items: T[], mois: string[], date: (x: T) => string, valeur: (x: T) => number): number[] {
  const m = new Map<string, number>(mois.map((x) => [x, 0]));
  for (const it of items) {
    const k = moisDe(date(it));
    if (m.has(k)) m.set(k, m.get(k)! + valeur(it));
  }
  return mois.map((x) => m.get(x)!);
}

export const finDeMois = (mois: string): string => {
  const [y, m] = mois.split('-').map(Number);
  return ajouteJours(m === 12 ? `${y + 1}-01-01` : `${y}-${p2(m + 1)}-01`, -1);
};

// Argent total (caisse + Mobile Money + banque) à la fin d'une journée
export function tresorerieAu(date: string, paiements: Paiement[], achats: Achat[], reglements: Reglement[], depenses: Depense[], ajustements: TresoMvt[]): number {
  const s = soldesComptes(
    paiements.filter((x) => x.date <= date), achats.filter((x) => x.date <= date), reglements.filter((x) => x.date <= date),
    depenses.filter((x) => x.date <= date), ajustements.filter((x) => x.date <= date)
  );
  return s.caisse + s.mobile_money + s.banque;
}

export const TRANCHES = ['0 à 30 jours', '31 à 60 jours', '61 à 90 jours', 'Plus de 90 jours'];

// Chaque créance est classée selon l'ancienneté de sa plus vieille vente non soldée
export function vieillissementCreances(creances: Creance[]): Array<{ tranche: string; montant: number; clients: number }> {
  const out = TRANCHES.map((tranche) => ({ tranche, montant: 0, clients: 0 }));
  for (const c of creances) {
    const i = c.jours <= 30 ? 0 : c.jours <= 60 ? 1 : c.jours <= 90 ? 2 : 3;
    out[i].montant += c.solde;
    out[i].clients++;
  }
  return out;
}

// Taux de ponte de toute la ferme chaque jour : œufs ramassés ÷ poules présentes des bandes qui ont ramassé ce jour-là
export function tauxPonteQuotidien(bandes: Array<Bande & { id: string }>, ramassages: Array<Ramassage>, mortalites: Array<Mortalite>, debut: string, fin: string): Array<{ date: string; taux: number }> {
  const jours = [...new Set(ramassages.filter((r) => r.date >= debut && r.date <= fin).map((r) => r.date))].sort();
  const out: Array<{ date: string; taux: number }> = [];
  for (const date of jours) {
    let oeufs = 0;
    let poules = 0;
    for (const b of bandes) {
      const rb = ramassages.filter((r) => r.bandeId === b.id && r.date === date);
      if (!rb.length) continue;
      oeufs += rb.reduce((s, r) => s + oeufsPondus(r), 0);
      poules += effectifAu(b, mortalites.filter((m) => m.bandeId === b.id), date);
    }
    if (poules > 0) out.push({ date, taux: (oeufs / poules) * 100 });
  }
  return out;
}

export const moyenne = (v: number[]): number | null => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);

// Variation en % par rapport à la période précédente (null si pas de base de comparaison)
export function variation(actuel: number | null, precedent: number | null): number | null {
  if (actuel === null || precedent === null || precedent === 0) return null;
  return ((actuel - precedent) / Math.abs(precedent)) * 100;
}

export function fmtCourt(n: number): string {
  const a = Math.abs(n);
  const s = a >= 1e6 ? `${(a / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M` : a >= 1e4 ? `${Math.round(a / 1e3)} k` : a >= 1e3 ? `${(a / 1e3).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k` : String(Math.round(a));
  return n < 0 ? `−${s}` : s;
}
