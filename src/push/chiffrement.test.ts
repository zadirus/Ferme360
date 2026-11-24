import { describe, expect, it } from 'vitest';
import { chiffrerPush, deB64u, genererCleVapid, jetonVapid, versB64u } from './chiffrement';

// Exemple officiel de la RFC 8291 (annexe A) : si ce test passe, le chiffrement est compatible avec les services de push.
describe('RFC 8291', () => {
  it('reproduit le message chiffré de l’exemple de la norme', async () => {
    const asPublic = deB64u('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
    const jwk: JsonWebKey = { kty: 'EC', crv: 'P-256', d: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', x: versB64u(asPublic.slice(1, 33)), y: versB64u(asPublic.slice(33, 65)) };
    const corps = await chiffrerPush(
      new TextEncoder().encode('When I grow up, I want to be a watermelon'),
      'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
      'BTBZMqHH6r4Tts7J_aSIgg',
      { asPrivateJwk: jwk, salt: deB64u('DGv6ra1nlYgDCS1FRnbzlw') }
    );
    expect(versB64u(corps)).toBe(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN'
    );
  });

  it('jeton VAPID signé et vérifiable', async () => {
    const { privee, publique } = await genererCleVapid();
    const jeton = await jetonVapid('https://fcm.googleapis.com', 'https://ferme360.example', privee, 1_900_000_000);
    const [h, c, s] = jeton.split('.');
    expect(JSON.parse(new TextDecoder().decode(deB64u(h)))).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(JSON.parse(new TextDecoder().decode(deB64u(c))).aud).toBe('https://fcm.googleapis.com');
    const cle = await crypto.subtle.importKey('raw', deB64u(publique) as BufferSource, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, cle, deB64u(s) as BufferSource, new TextEncoder().encode(`${h}.${c}`))).toBe(true);
  });
});
