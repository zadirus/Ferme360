// Programme de vaccination (par âge) et courbe de ponte de référence : deux textes modifiables dans les réglages.
import { ajouteJours, joursEntre } from '../format';
import type { Bande, Sante } from './types';

export interface LigneProphylaxie { produit: string; ageJours: number }
export interface PointCourbe { semaine: number; taux: number }

// À adapter avec votre vétérinaire : ce n'est qu'un exemple de départ.
export const EXEMPLE_PROPHYLAXIE = 'Marek : 1\nNewcastle HB1 : 7\nGumboro : 14\nGumboro rappel : 21\nNewcastle La Sota : 28\nBronchite infectieuse : 35';
// Courbe indicative d'une pondeuse brune (taux de ponte en % selon l'âge en semaines) : à remplacer par celle de votre souche.
export const EXEMPLE_COURBE = '18 : 5\n20 : 50\n22 : 80\n26 : 93\n30 : 94\n40 : 91\n50 : 87\n60 : 83\n72 : 78\n80 : 72';

const paires = (texte: string) =>
  texte.split(/\r?\n/).map((l) => /^(.*?)[:;=]\s*([\d.,]+)\s*$/.exec(l.trim())).filter((m): m is RegExpExecArray => !!m && m[1].trim() !== '').map((m) => [m[1].trim(), Number(m[2].replace(',', '.'))] as const).filter(([, n]) => Number.isFinite(n));

export const lireProphylaxie = (t: string): LigneProphylaxie[] => paires(t).map(([produit, ageJours]) => ({ produit, ageJours: Math.round(ageJours) }));
export const lireCourbe = (t: string): PointCourbe[] => paires(t).map(([s, taux]) => ({ semaine: Number(s.replace(',', '.')), taux })).filter((p) => Number.isFinite(p.semaine)).sort((a, b) => a.semaine - b.semaine);

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const naissance = (b: Bande) => ajouteJours(b.dateArrivee, -Math.round(b.ageArriveeSemaines * 7));
export const ageSemaines = (b: Bande, date: string) => Math.max(0, joursEntre(naissance(b), date)) / 7;

export interface VaccinDu { produit: string; date: string; retard: boolean }

// Vaccins du programme non encore enregistrés pour cette bande, en retard ou à faire dans l'horizon
export function vaccinsAFaire(b: Bande, programme: LigneProphylaxie[], santes: Sante[], aujourdhui: string, horizonJours = 7): VaccinDu[] {
  if (b.cloturee) return [];
  const faits = santes.filter((s) => s.type === 'vaccin').map((s) => norm(s.produit));
  const nais = naissance(b);
  const out: VaccinDu[] = [];
  for (const l of programme) {
    const date = ajouteJours(nais, l.ageJours);
    if (date < b.dateArrivee) continue; // avant l'arrivée : fait au couvoir
    if (faits.some((f) => f === norm(l.produit))) continue;
    if (joursEntre(aujourdhui, date) <= horizonJours) out.push({ produit: l.produit, date, retard: date < aujourdhui });
  }
  return out.sort((a, c) => a.date.localeCompare(c.date));
}

// Taux de ponte de référence à un âge donné (interpolation entre les points de la courbe)
export function tauxStandard(courbe: PointCourbe[], semaine: number): number | null {
  if (!courbe.length || semaine < courbe[0].semaine || semaine > courbe[courbe.length - 1].semaine) return null;
  for (let i = 1; i < courbe.length; i++) {
    const a = courbe[i - 1];
    const c = courbe[i];
    if (semaine <= c.semaine) return c.semaine === a.semaine ? c.taux : a.taux + ((c.taux - a.taux) * (semaine - a.semaine)) / (c.semaine - a.semaine);
  }
  return courbe[courbe.length - 1].taux;
}
