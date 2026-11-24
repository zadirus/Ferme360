// Code PIN local : il verrouille l'application sur ce téléphone (curieux, enfants, téléphone prêté).
// Il ne remplace pas le mot de passe du compte, qui reste la vraie protection.
const CLE = 'ferme360.pin';
const enc = new TextEncoder();

async function empreinte(pin: string, sel: Uint8Array): Promise<string> {
  const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sel as BufferSource, iterations: 50_000 }, base, 256));
  return [...bits].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export const pinDefini = () => !!localStorage.getItem(CLE);
export const pinValide = (pin: string) => /^\d{4}$/.test(pin);

export async function definirPin(pin: string): Promise<void> {
  if (!pinValide(pin)) throw new Error('Le code doit avoir exactement 4 chiffres.');
  const sel = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem(CLE, JSON.stringify({ sel: [...sel], hash: await empreinte(pin, sel) }));
}

export async function verifierPin(pin: string): Promise<boolean> {
  try {
    const { sel, hash } = JSON.parse(localStorage.getItem(CLE) ?? 'null') as { sel: number[]; hash: string };
    return (await empreinte(pin, Uint8Array.from(sel))) === hash;
  } catch {
    return false;
  }
}

export const retirerPin = () => localStorage.removeItem(CLE);
