const p2 = (n: number) => String(n).padStart(2, '0');

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

// 2026-11-24 -> 24/11/2026
export const fmtDate = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '');
export const fmtInt = (n: number) => Math.round(n).toLocaleString('fr-FR');
export const fmtDec = (n: number, d = 1) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
// Quantité : entière si possible, sinon jusqu'à 2 décimales (0,5 kg, 2,25 sacs)
export const fmtQte = (n: number) => (Math.round(n * 100) / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
export const fmtPct = (n: number) => `${fmtDec(n)} %`;
export const fmtFcfa = (n: number) => `${fmtInt(n)} FCFA`;
export const OEUFS_PAR_PLATEAU = 30;
export const fmtPlateaux = (oeufs: number) => `${fmtDec(oeufs / OEUFS_PAR_PLATEAU)} plateaux`;

// jours entre deux dates ISO (b - a)
export function joursEntre(a: string, b: string): number {
  const t = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((t(b) - t(a)) / 86_400_000);
}

export function ajouteJours(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}`;
}

export function ageEnMois(naissance: string, aujourdhui: string): number {
  return Math.max(0, Math.floor(joursEntre(naissance, aujourdhui) / 30.4375));
}
