import { joursEntre } from '../format';
import { REGLAGES } from '../reglages';
import type { Aliment, Bande, Mortalite, MvtOeufs, Ramassage } from './types';


export const oeufsPondus = (r: Ramassage) => r.bons + r.feles + r.casses;

// Effectif présent à la fin de la journée `date`
export function effectifAu(b: Bande, morts: Mortalite[], date: string): number {
  const sortis = morts.filter((m) => m.date <= date).reduce((s, m) => s + m.nombre, 0);
  return b.effectifInitial - sortis;
}

export const effectifActuel = (b: Bande, morts: Mortalite[]) =>
  b.effectifInitial - morts.reduce((s, m) => s + m.nombre, 0);

// Taux de ponte d'un jour : œufs pondus ÷ poules présentes × 100 (null si pas de ramassage)
export function tauxPonteJour(b: Bande, ramassages: Ramassage[], morts: Mortalite[], date: string): number | null {
  const jour = ramassages.filter((r) => r.date === date);
  if (!jour.length) return null;
  const pondus = jour.reduce((s, r) => s + oeufsPondus(r), 0);
  const poules = effectifAu(b, morts, date);
  return poules > 0 ? (pondus / poules) * 100 : null;
}

export function datesRamassage(ramassages: Ramassage[]): string[] {
  return [...new Set(ramassages.map((r) => r.date))].sort();
}

// Stock d'œufs : bons œufs ramassés − ventes, consommation, casse (+ ajustements d'inventaire)
export function stockOeufs(ramassages: Ramassage[], mvts: MvtOeufs[]): number {
  const entrees = ramassages.reduce((s, r) => s + r.bons, 0);
  const sorties = mvts.reduce((s, m) => (m.type === 'ajustement' ? s + m.quantite : s - m.quantite), 0);
  return entrees + sorties;
}

export interface Indicateurs {
  effectif: number;
  mortalitePct: number;
  oeufsCumules: number;
  oeufsParPoule: number;
  alimentKg: number;
  indiceConso: number | null;
  derniereDate: string | null;
  dernierTaux: number | null;
}

export function indicateurs(b: Bande, ramassages: Ramassage[], morts: Mortalite[], aliments: Aliment[]): Indicateurs {
  const oeufsCumules = ramassages.reduce((s, r) => s + oeufsPondus(r), 0);
  const alimentKg = aliments.reduce((s, a) => s + a.kg, 0);
  const dates = datesRamassage(ramassages);
  const derniereDate = dates.length ? dates[dates.length - 1] : null;
  const kgOeufs = oeufsCumules * (REGLAGES.poidsOeufG / 1000);
  return {
    effectif: effectifActuel(b, morts),
    mortalitePct: b.effectifInitial > 0 ? (morts.filter((m) => m.type === 'mort').reduce((s, m) => s + m.nombre, 0) / b.effectifInitial) * 100 : 0,
    oeufsCumules,
    oeufsParPoule: b.effectifInitial > 0 ? oeufsCumules / b.effectifInitial : 0,
    alimentKg,
    indiceConso: kgOeufs > 0 && alimentKg > 0 ? alimentKg / kgOeufs : null,
    derniereDate,
    dernierTaux: derniereDate ? tauxPonteJour(b, ramassages, morts, derniereDate) : null
  };
}

export function alertes(b: Bande, ramassages: Ramassage[], morts: Mortalite[]): string[] {
  const out: string[] = [];
  // chute de ponte : dernier jour comparé au dernier jour connu au moins 3 jours avant
  const dates = datesRamassage(ramassages);
  if (dates.length >= 2) {
    const dernier = dates[dates.length - 1];
    const avant = [...dates].reverse().find((d) => joursEntre(d, dernier) >= REGLAGES.chutePonteJours);
    if (avant) {
      const t1 = tauxPonteJour(b, ramassages, morts, dernier);
      const t0 = tauxPonteJour(b, ramassages, morts, avant);
      if (t1 !== null && t0 !== null && t0 - t1 > REGLAGES.chutePonteSeuil) {
        out.push(`Chute de ponte : ${(t0 - t1).toFixed(1).replace('.', ',')} points en ${joursEntre(avant, dernier)} jours`);
      }
    }
  }
  // mortalité anormale sur un jour
  const parJour = new Map<string, number>();
  for (const m of morts.filter((x) => x.type === 'mort')) parJour.set(m.date, (parJour.get(m.date) ?? 0) + m.nombre);
  for (const [date, n] of parJour) {
    const seuil = Math.max(REGLAGES.mortaliteJourMin, (effectifAu(b, morts, date) + n) * (REGLAGES.mortaliteJourPct / 100));
    if (n > seuil) out.push(`Mortalité élevée le ${date.split('-').reverse().join('/')} : ${n} poules`);
  }
  return out;
}
