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
