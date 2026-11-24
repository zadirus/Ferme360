// Archive ZIP minimale (sans compression), suffisante pour un fichier .xlsx
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zip(fichiers: Array<{ nom: string; donnees: Uint8Array }>): Uint8Array {
  const enc = new TextEncoder();
  const morceaux: Uint8Array[] = [];
  const centrale: Uint8Array[] = [];
  let decalage = 0;
  // 1er janvier 2026, 00:00 (date DOS)
  const heure = 0;
  const date = ((2026 - 1980) << 9) | (1 << 5) | 1;

  for (const f of fichiers) {
    const nom = enc.encode(f.nom);
    const crc = crc32(f.donnees);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // noms en UTF-8
    local.setUint16(8, 0, true); // sans compression
    local.setUint16(10, heure, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, f.donnees.length, true);
    local.setUint32(22, f.donnees.length, true);
    local.setUint16(26, nom.length, true);
    local.setUint16(28, 0, true);
    morceaux.push(new Uint8Array(local.buffer), nom, f.donnees);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, heure, true);
    c.setUint16(14, date, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, f.donnees.length, true);
    c.setUint32(24, f.donnees.length, true);
    c.setUint16(28, nom.length, true);
    c.setUint32(42, decalage, true);
    centrale.push(new Uint8Array(c.buffer), nom);
    decalage += 30 + nom.length + f.donnees.length;
  }

  const tailleCentrale = centrale.reduce((s, m) => s + m.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, fichiers.length, true);
  fin.setUint16(10, fichiers.length, true);
  fin.setUint32(12, tailleCentrale, true);
  fin.setUint32(16, decalage, true);

  const tout = [...morceaux, ...centrale, new Uint8Array(fin.buffer)];
  const sortie = new Uint8Array(tout.reduce((s, m) => s + m.length, 0));
  let pos = 0;
  for (const m of tout) {
    sortie.set(m, pos);
    pos += m.length;
  }
  return sortie;
}
