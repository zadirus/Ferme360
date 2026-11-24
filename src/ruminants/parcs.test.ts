import { describe, expect, it } from 'vitest';
import { occupation, parcActuel } from './parcs';

const p = (lotId: string, parcId: string, date: string, type: 'entree' | 'sortie', maj = 1) => ({ lotId, parcId, date, type, updatedAt: maj });

describe('parcs de pâturage', () => {
  it('le parc actuel est celui de la dernière entrée, sauf sortie ensuite', () => {
    const m = [p('L1', 'A', '2026-10-01', 'entree'), p('L1', 'A', '2026-10-15', 'sortie'), p('L1', 'B', '2026-10-15', 'entree', 2)];
    expect(parcActuel('L1', m)).toEqual({ parcId: 'B', depuis: '2026-10-15' });
    expect(parcActuel('L1', [...m, p('L1', 'B', '2026-11-01', 'sortie')])).toBeNull();
    expect(parcActuel('L2', m)).toBeNull();
  });
  it('occupation : effectifs des lots présents dans le parc', () => {
    const m = [p('L1', 'B', '2026-10-15', 'entree'), p('L2', 'B', '2026-10-20', 'entree'), p('L3', 'A', '2026-10-20', 'entree')];
    expect(occupation('B', ['L1', 'L2', 'L3'], m, (l) => ({ L1: 12, L2: 8, L3: 30 }[l] ?? 0))).toBe(20);
  });
});
