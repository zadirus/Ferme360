import { ajouteJours, joursEntre } from '../format';
import type { Animal, MiseBas, MvtAnimal, Pesee, Ration, Repro, Soin } from './types';

export type Statut = 'present' | 'vendu' | 'mort' | 'abattu' | 'perdu';
type AvecMaj<T> = T & { updatedAt: number };

const ordre = (a: AvecMaj<{ date: string }>, b: AvecMaj<{ date: string }>) => a.date.localeCompare(b.date) || a.updatedAt - b.updatedAt;

const STATUT_DU_MOTIF: Record<string, Statut> = { vente: 'vendu', mort: 'mort', abattage: 'abattu', perte: 'perdu' };

// Statut et lot d'un animal : déduits du dernier mouvement concerné
export function etatAnimal(animalId: string, mvts: Array<AvecMaj<MvtAnimal>>): { statut: Statut; lotId: string; dateSortie: string } {
  const siens = mvts.filter((m) => m.animalId === animalId).sort(ordre);
  const entreesSorties = siens.filter((m) => m.type !== 'lot');
  const dernier = entreesSorties[entreesSorties.length - 1];
  const statut: Statut = dernier && dernier.type === 'sortie' ? (STATUT_DU_MOTIF[dernier.motif] ?? 'perdu') : 'present';
  const lots = siens.filter((m) => m.type === 'entree' || m.type === 'lot');
  return { statut, lotId: lots.length ? lots[lots.length - 1].lotId : '', dateSortie: statut === 'present' ? '' : dernier.date };
}

export const poidsAnimal = (animalId: string, pesees: Pesee[]) =>
  pesees.filter((p) => p.animalId === animalId).sort((a, b) => a.date.localeCompare(b.date));

export const dernierPoids = (animalId: string, pesees: Pesee[]): number | null => {
  const l = poidsAnimal(animalId, pesees);
  return l.length ? l[l.length - 1].poids : null;
};

// Gain moyen quotidien en g/jour entre deux pesées
export const gmq = (p1: Pesee, p2: Pesee): number | null => {
  const j = joursEntre(p1.date, p2.date);
  return j > 0 ? ((p2.poids - p1.poids) / j) * 1000 : null;
};

// GMQ d'un animal : de sa première à sa dernière pesée
export function gmqAnimal(animalId: string, pesees: Pesee[]): number | null {
  const l = poidsAnimal(animalId, pesees);
  return l.length >= 2 ? gmq(l[0], l[l.length - 1]) : null;
}

export function gmqMoyen(ids: string[], pesees: Pesee[]): number | null {
  const v = ids.map((id) => gmqAnimal(id, pesees)).filter((x): x is number => x !== null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

// Mise bas prévue : dernière saillie sans mise bas ni diagnostic « vide » depuis
export function miseBasPrevue(femelleId: string, repro: Repro[], misesBas: MiseBas[]): string | null {
  const saillies = repro.filter((r) => r.femelleId === femelleId && r.type === 'saillie').sort((a, b) => a.date.localeCompare(b.date));
  const s = saillies[saillies.length - 1];
  if (!s) return null;
  if (misesBas.some((m) => m.mereId === femelleId && m.date >= s.date)) return null;
  if (repro.some((r) => r.femelleId === femelleId && r.type === 'diagnostic' && r.resultat === 'vide' && r.date >= s.date)) return null;
  return ajouteJours(s.date, s.gestationJours);
}

// Premier jour où la vente (ou l'abattage) est de nouveau permis, ou null
export function finDelaiAttente(animalId: string, lotId: string, soins: Soin[], dateVente: string): string | null {
  let fin: string | null = null;
  for (const s of soins) {
    if (s.delaiAttente <= 0) continue;
    if (s.animalId !== animalId && !(s.lotId && s.lotId === lotId)) continue;
    const f = ajouteJours(s.date, s.delaiAttente);
    if (dateVente < f && (fin === null || f > fin)) fin = f;
  }
  return fin;
}

// Fertilité : femelles ayant mis bas ÷ femelles mises à la reproduction × 100
export function fertilite(repro: Repro[], misesBas: MiseBas[]): number | null {
  const luttees = new Set(repro.filter((r) => r.type === 'saillie').map((r) => r.femelleId));
  if (!luttees.size) return null;
  const ontMisBas = [...luttees].filter((id) => misesBas.some((m) => m.mereId === id)).length;
  return (ontMisBas / luttees.size) * 100;
}

// Prolificité : petits nés ÷ mises bas
export function prolificite(misesBas: MiseBas[]): number | null {
  if (!misesBas.length) return null;
  return misesBas.reduce((s, m) => s + m.vivants + m.mortNes, 0) / misesBas.length;
}

export interface CoutsLot {
  achat: number;
  aliment: number;
  soins: number;
  total: number;
}

export interface IndicateursLot {
  presents: number;
  poidsMoyen: number | null;
  gmq: number | null;
  gain: number;
  couts: CoutsLot;
  kgVif: number;
  coutKgVif: number | null;
  coutKgGagne: number | null;
}

// `animaux` : tous les animaux passés par le lot (présents, vendus…) ; `presentsIds` : ceux encore présents
export function indicateursLot(
  lotId: string,
  animaux: Array<Animal & { id: string }>,
  presentsIds: Set<string>,
  pesees: Pesee[],
  rations: Ration[],
  soins: Soin[]
): IndicateursLot {
  const ids = animaux.map((a) => a.id);
  const poids = ids.map((id) => dernierPoids(id, pesees)).filter((p): p is number => p !== null);
  const poidsPresents = [...presentsIds].map((id) => dernierPoids(id, pesees)).filter((p): p is number => p !== null);
  const gain = ids.reduce((s, id) => {
    const l = poidsAnimal(id, pesees);
    return l.length >= 2 ? s + (l[l.length - 1].poids - l[0].poids) : s;
  }, 0);
  const achat = animaux.reduce((s, a) => s + a.prixAchat, 0);
  const aliment = rations.filter((r) => r.lotId === lotId).reduce((s, r) => s + r.cout, 0);
  const coutSoins = soins.filter((x) => x.lotId === lotId || ids.includes(x.animalId)).reduce((s, x) => s + x.cout, 0);
  const couts = { achat, aliment, soins: coutSoins, total: achat + aliment + coutSoins };
  const kgVif = poids.reduce((s, p) => s + p, 0);
  return {
    presents: presentsIds.size,
    poidsMoyen: poidsPresents.length ? poidsPresents.reduce((s, p) => s + p, 0) / poidsPresents.length : null,
    gmq: gmqMoyen(ids, pesees),
    gain,
    couts,
    kgVif,
    coutKgVif: kgVif > 0 && couts.total > 0 ? couts.total / kgVif : null,
    coutKgGagne: gain > 0 && aliment + coutSoins > 0 ? (aliment + coutSoins) / gain : null
  };
}
