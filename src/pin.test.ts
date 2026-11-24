import { beforeEach, describe, expect, it } from 'vitest';
import { definirPin, pinDefini, pinValide, retirerPin, verifierPin } from './pin';

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k)
} as Storage;

describe('code PIN', () => {
  beforeEach(() => mem.clear());
  it('accepte le bon code, refuse les autres, ne stocke pas le code en clair', async () => {
    await definirPin('4821');
    expect(pinDefini()).toBe(true);
    expect(await verifierPin('4821')).toBe(true);
    expect(await verifierPin('4822')).toBe(false);
    expect(JSON.stringify([...mem.values()])).not.toContain('4821');
    retirerPin();
    expect(pinDefini()).toBe(false);
  });
  it('4 chiffres exactement', async () => {
    expect(pinValide('123')).toBe(false);
    expect(pinValide('12a4')).toBe(false);
    await expect(definirPin('12')).rejects.toThrow();
  });
});
