// Lecture de fichiers Excel (.xlsx) et CSV, sur le téléphone, sans bibliothèque.

async function inflate(octets: Uint8Array): Promise<Uint8Array> {
  const source = new ReadableStream({ start(c) { c.enqueue(octets); c.close(); } });
  return new Uint8Array(await new Response(source.pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
}

interface EntreeZip { nom: string; methode: number; taille: number; decalage: number }

function entreesZip(d: Uint8Array): EntreeZip[] {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  let fin = d.length - 22;
  while (fin >= 0 && v.getUint32(fin, true) !== 0x06054b50) fin--;
  if (fin < 0) throw new Error("Ce fichier n'est pas un fichier Excel (.xlsx).");
  const n = v.getUint16(fin + 10, true);
  let p = v.getUint32(fin + 16, true);
  const out: EntreeZip[] = [];
  for (let i = 0; i < n; i++) {
    const lNom = v.getUint16(p + 28, true);
    const lExtra = v.getUint16(p + 30, true);
    const lCom = v.getUint16(p + 32, true);
    out.push({ nom: new TextDecoder().decode(d.subarray(p + 46, p + 46 + lNom)), methode: v.getUint16(p + 10, true), taille: v.getUint32(p + 20, true), decalage: v.getUint32(p + 42, true) });
    p += 46 + lNom + lExtra + lCom;
  }
  return out;
}

async function lireEntree(d: Uint8Array, e: EntreeZip): Promise<string> {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const debut = e.decalage + 30 + v.getUint16(e.decalage + 26, true) + v.getUint16(e.decalage + 28, true);
  const brut = d.subarray(debut, debut + e.taille);
  return new TextDecoder().decode(e.methode === 0 ? brut : await inflate(brut));
}

const colIndex = (ref: string) => [...ref.replace(/\d+/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

export async function lireXlsx(octets: Uint8Array): Promise<string[][]> {
  const entrees = entreesZip(octets);
  const trouve = (nom: string) => entrees.find((e) => e.nom === nom);
  const classeur = trouve('xl/workbook.xml');
  const rels = trouve('xl/_rels/workbook.xml.rels');
  let chemin = 'xl/worksheets/sheet1.xml';
  if (classeur && rels) {
    // première feuille du classeur
    const x = new DOMParser().parseFromString(await lireEntree(octets, classeur), 'application/xml');
    const id = x.getElementsByTagName('sheet')[0]?.getAttribute('r:id');
    const r = new DOMParser().parseFromString(await lireEntree(octets, rels), 'application/xml');
    const cible = [...r.getElementsByTagName('Relationship')].find((el) => el.getAttribute('Id') === id)?.getAttribute('Target');
    if (cible) chemin = cible.startsWith('/') ? cible.slice(1) : `xl/${cible}`;
  }
  const feuille = trouve(chemin);
  if (!feuille) throw new Error('Feuille Excel introuvable.');
  const partages: string[] = [];
  const ss = trouve('xl/sharedStrings.xml');
  if (ss) {
    const x = new DOMParser().parseFromString(await lireEntree(octets, ss), 'application/xml');
    for (const si of [...x.getElementsByTagName('si')]) partages.push([...si.getElementsByTagName('t')].map((t) => t.textContent ?? '').join(''));
  }
  const x = new DOMParser().parseFromString(await lireEntree(octets, feuille), 'application/xml');
  const lignes: string[][] = [];
  for (const row of [...x.getElementsByTagName('row')]) {
    const ligne: string[] = [];
    for (const c of [...row.getElementsByTagName('c')]) {
      const i = colIndex(c.getAttribute('r') ?? 'A1');
      const t = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      const texte = t === 's' ? (partages[Number(v)] ?? '') : t === 'inlineStr' ? [...c.getElementsByTagName('t')].map((e) => e.textContent ?? '').join('') : v;
      while (ligne.length < i) ligne.push('');
      ligne[i] = texte;
    }
    lignes.push(ligne);
  }
  return lignes;
}

export function lireCsv(octets: Uint8Array): string[][] {
  let t: string;
  try {
    t = new TextDecoder('utf-8', { fatal: true }).decode(octets);
  } catch {
    t = new TextDecoder('windows-1252').decode(octets);
  }
  t = t.replace(/^﻿/, '');
  const premiere = t.split(/\r?\n/)[0] ?? '';
  const sep = [';', '\t', ','].map((s) => [s, premiere.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const lignes: string[][] = [];
  let champ = '';
  let ligne: string[] = [];
  let guill = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (guill) {
      if (c === '"' && t[i + 1] === '"') { champ += '"'; i++; } else if (c === '"') guill = false; else champ += c;
    } else if (c === '"') guill = true;
    else if (c === sep) { ligne.push(champ); champ = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      ligne.push(champ); champ = '';
      lignes.push(ligne); ligne = [];
    } else champ += c;
  }
  if (champ !== '' || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  return lignes;
}

export async function lireFichier(f: File): Promise<string[][]> {
  const octets = new Uint8Array(await f.arrayBuffer());
  const xlsx = octets[0] === 0x50 && octets[1] === 0x4b;
  return (xlsx ? await lireXlsx(octets) : lireCsv(octets)).filter((l) => l.some((c) => c.trim() !== ''));
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Première ligne = titres des colonnes ; renvoie un objet par ligne, indexé par titre normalisé (sans accents ni majuscules)
export function enObjets(lignes: string[][]): Array<{ numero: number; v: Record<string, string> }> {
  if (!lignes.length) return [];
  const titres = lignes[0].map(norm);
  return lignes.slice(1).map((l, i) => ({ numero: i + 2, v: Object.fromEntries(titres.map((t, c) => [t, (l[c] ?? '').trim()])) }));
}

// Date saisie en jj/mm/aaaa, aaaa-mm-jj ou numéro de série Excel → aaaa-mm-jj ('' si vide, null si illisible)
export function lireDate(s: string): string | null {
  const t = s.trim();
  if (!t) return '';
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (/^\d+(\.\d+)?$/.test(t) && Number(t) > 20000 && Number(t) < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(t)) * 86_400_000).toISOString().slice(0, 10);
  return null;
}

export function lireNombre(s: string): number | null {
  const t = s.replace(/[\s  ]/g, '').replace(',', '.');
  if (t === '') return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
