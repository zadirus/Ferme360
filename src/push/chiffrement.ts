// Notifications push : chiffrement du message (RFC 8291, aes128gcm) et signature VAPID (RFC 8292), avec WebCrypto seulement.
// Fonctionne tel quel dans un Worker Cloudflare et dans Node.
const enc = new TextEncoder();
// Les types WebCrypto diffèrent entre le navigateur, Node et les Workers : on les laisse souples ici (le comportement est identique).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const subtle = crypto.subtle as any;

export const versB64u = (b: Uint8Array): string => {
  let s = '';
  for (const c of b) s += String.fromCharCode(c);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const deB64u = (s: string): Uint8Array => {
  const p = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(p), (c) => c.charCodeAt(0));
};

const concat = (...a: Uint8Array[]): Uint8Array => {
  const r = new Uint8Array(a.reduce((s, x) => s + x.length, 0));
  let p = 0;
  for (const x of a) {
    r.set(x, p);
    p += x.length;
  }
  return r;
};

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, octets: number): Promise<Uint8Array> {
  const cle = await subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource }, cle, octets * 8));
}

export interface ValeursFixes {
  asPrivateJwk: JsonWebKey;
  salt: Uint8Array;
}

// Chiffre `charge` pour un abonnement (clé publique p256dh et secret auth en base64url)
export async function chiffrerPush(charge: Uint8Array, uaPublicB64: string, authB64: string, fixes?: ValeursFixes): Promise<Uint8Array> {
  const uaPublic = deB64u(uaPublicB64);
  const auth = deB64u(authB64);
  let privee: CryptoKey;
  let asPublic: Uint8Array;
  if (fixes) {
    privee = await subtle.importKey('jwk', fixes.asPrivateJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    asPublic = concat(Uint8Array.of(4), deB64u(fixes.asPrivateJwk.x!), deB64u(fixes.asPrivateJwk.y!));
  } else {
    const paire = (await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
    privee = paire.privateKey;
    asPublic = new Uint8Array(await subtle.exportKey('raw', paire.publicKey));
  }
  const salt = fixes?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const uaCle = await subtle.importKey('raw', uaPublic as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: uaCle }, privee, 256));
  const ikm = await hkdf(auth, secret, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const cleAes = await subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['encrypt']);
  const chiffre = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, cleAes, concat(charge, Uint8Array.of(2)) as BufferSource));
  const entete = new Uint8Array(21);
  entete.set(salt, 0);
  new DataView(entete.buffer).setUint32(16, 4096, false);
  entete[20] = asPublic.length;
  return concat(entete, asPublic, chiffre);
}

export async function genererCleVapid(): Promise<{ privee: JsonWebKey; publique: string }> {
  const paire = (await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  return {
    privee: await subtle.exportKey('jwk', paire.privateKey),
    publique: versB64u(new Uint8Array(await subtle.exportKey('raw', paire.publicKey)))
  };
}

export async function jetonVapid(audience: string, sujet: string, priveeJwk: JsonWebKey, expiration: number): Promise<string> {
  const corps = `${versB64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))}.${versB64u(enc.encode(JSON.stringify({ aud: audience, exp: expiration, sub: sujet })))}`;
  const cle = await subtle.importKey('jwk', priveeJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, cle, enc.encode(corps)));
  return `${corps}.${versB64u(signature)}`;
}
