import { fmtDec, fmtFcfa, fmtInt } from '../format';
import type { LigneVente } from './types';

export const resumeLigne = (l: LigneVente) =>
  l.article === 'oeufs'
    ? `${fmtInt(l.quantite)} ${l.unite === 'plateau' ? 'plateau(x) d’œufs' : 'œuf(s)'}`
    : l.article === 'lait'
      ? `${fmtDec(l.quantite, l.quantite % 1 ? 1 : 0)} L de lait`
      : l.article === 'animal'
      ? `${l.libelle}${l.unite === 'kg' ? ` (${fmtDec(l.quantite, 0)} kg à ${fmtFcfa(l.prixUnitaire)}/kg)` : ''}`
      : `${fmtInt(l.quantite)} ${l.libelle || (l.article === 'fumier' ? 'fientes / fumier' : l.article)}`;
