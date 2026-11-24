import { ageEnMois, ajouteJours, joursEntre } from '../format';
import { REGLAGES } from '../reglages';
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

// ---------- rappels automatiques, réforme, mortalité des petits ----------

export interface TacheAuto { animalId: string; type: 'sevrage' | 'castration'; date: string; retard: boolean }

// Sevrage et castration à prévoir pour les animaux nés à la ferme (en retard de moins de 60 jours, ou dans l'horizon)
export function tachesAutomatiques(animaux: Array<Animal & { id: string }>, statut: (id: string) => Statut, soins: Soin[], aujourdhui: string, horizon = 7): TacheAuto[] {
  const out: TacheAuto[] = [];
  for (const a of animaux) {
    if (statut(a.id) !== 'present' || !a.naissance || a.naissanceEstimee) continue;
    const fait = (type: string) => soins.some((s) => s.animalId === a.id && s.type === type);
    const prevoir = (type: TacheAuto['type'], jours: number) => {
      if (jours <= 0 || fait(type)) return;
      const date = ajouteJours(a.naissance, jours);
      const ecart = joursEntre(aujourdhui, date);
      if (ecart <= horizon && ecart >= -60) out.push({ animalId: a.id, type, date, retard: date < aujourdhui });
    };
    prevoir('sevrage', a.espece === 'ovin' ? REGLAGES.sevrageOvinJours : REGLAGES.sevrageBovinJours);
    if (a.sexe === 'M') prevoir('castration', REGLAGES.castrationJours);
  }
  return out.sort((x, y) => x.date.localeCompare(y.date));
}

export interface PropositionReforme { animalId: string; raisons: string[] }

// Animaux à examiner pour une réforme : âge, saillies sans mise bas, soins répétés
export function propositionsReforme(animaux: Array<Animal & { id: string }>, statut: (id: string) => Statut, repro: Repro[], misesBas: MiseBas[], soins: Soin[], aujourdhui: string): PropositionReforme[] {
  const out: PropositionReforme[] = [];
  for (const a of animaux) {
    if (statut(a.id) !== 'present') continue;
    const raisons: string[] = [];
    const limite = a.espece === 'ovin' ? REGLAGES.reformeOvinAns : REGLAGES.reformeBovinAns;
    if (limite > 0 && a.naissance && ageEnMois(a.naissance, aujourdhui) >= limite * 12) raisons.push(`âge : ${Math.floor(ageEnMois(a.naissance, aujourdhui) / 12)} ans`);
    if (a.sexe === 'F') {
      const rates = repro.filter((r) => r.femelleId === a.id && r.type === 'saillie' && joursEntre(r.date, aujourdhui) > r.gestationJours + 45 && !misesBas.some((m) => m.mereId === a.id && m.date >= r.date && joursEntre(r.date, m.date) <= r.gestationJours + 45)).length;
      if (rates >= 2) raisons.push(`${rates} saillies sans mise bas`);
    }
    const traitements = soins.filter((s) => s.animalId === a.id && s.type === 'traitement' && joursEntre(s.date, aujourdhui) <= 365).length;
    if (traitements >= 3) raisons.push(`${traitements} traitements en un an`);
    if (raisons.length) out.push({ animalId: a.id, raisons });
  }
  return out;
}

// Mortalité avant sevrage : (mort-nés + petits nés à la ferme morts avant l'âge du sevrage) ÷ petits nés × 100
export function mortaliteAvantSevrage(espece: 'ovin' | 'bovin', animaux: Array<Animal & { id: string }>, mvts: Array<MvtAnimal & { updatedAt: number }>, misesBas: MiseBas[]): number | null {
  const meres = new Set(animaux.filter((a) => a.espece === espece).map((a) => a.id));
  const mb = misesBas.filter((m) => meres.has(m.mereId));
  const nes = mb.reduce((s, m) => s + m.vivants + m.mortNes, 0);
  if (!nes) return null;
  const jours = espece === 'ovin' ? REGLAGES.sevrageOvinJours : REGLAGES.sevrageBovinJours;
  const petits = animaux.filter((a) => a.espece === espece && a.miseBasId && a.naissance);
  const morts = petits.filter((a) => mvts.some((m) => m.animalId === a.id && m.type === 'sortie' && m.motif === 'mort' && joursEntre(a.naissance, m.date) <= jours)).length;
  return ((mb.reduce((s, m) => s + m.mortNes, 0) + morts) / nes) * 100;
}
