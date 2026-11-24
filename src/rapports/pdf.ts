// Générateur de PDF minimal (texte et tableaux, police standard Helvetica) : pas de bibliothèque, quelques Ko.

export interface Section {
  titre: string;
  colonnes: string[];
  lignes: Array<Array<string | number>>;
  note?: string;
}

export interface Doc {
  titre: string;
  sousTitre: string;
  sections: Section[];
}

const L = 595.28;
const H = 841.89;
const MARGE = 40;
const UTILE = L - 2 * MARGE;

// Largeurs approximatives de Helvetica (millièmes de la taille)
const ETROIT = new Set("il.,:;'|! ()[]/\\jtfI".split(''));
const LARGE = new Set('mwMWÆŒ%@'.split(''));
const TRAIT = new Set('-−'.split(''));
function largeur(t: string, taille: number, gras = false): number {
  let w = 0;
  for (const c of t) w += LARGE.has(c) ? 830 : ETROIT.has(c) ? 270 : TRAIT.has(c) ? 340 : c >= 'A' && c <= 'Z' ? 680 : 560;
  return (w * taille * (gras ? 1.06 : 1)) / 1000;
}

const SPECIAUX: Record<string, number> = { 'Œ': 0x8c, 'œ': 0x9c, '–': 0x96, '—': 0x97, '’': 0x92, '‘': 0x91, '“': 0x93, '”': 0x94, '…': 0x85, '€': 0x80, '•': 0x95 };

// Chaîne PDF (WinAnsi) en ASCII pur : les caractères accentués passent en octal
function chaine(t: string): string {
  let s = '(';
  for (const c of t.replace(/[  ]/g, ' ')) {
    const code = SPECIAUX[c] ?? c.charCodeAt(0);
    if (c === '(' || c === ')' || c === '\\') s += '\\' + c;
    else if (code >= 32 && code < 127) s += c;
    else if (code >= 128 && code <= 255) s += '\\' + code.toString(8).padStart(3, '0');
    else s += '?';
  }
  return s + ')';
}

function tronque(t: string, max: number, taille: number, gras = false): string {
  if (largeur(t, taille, gras) <= max) return t;
  let r = t;
  while (r.length > 1 && largeur(r + '...', taille, gras) > max) r = r.slice(0, -1);
  return r + '...';
}

export function construirePdf(doc: Doc): Uint8Array {
  const pages: string[][] = [[]];
  let y = H - MARGE;
  const ops = () => pages[pages.length - 1];
  const nouvellePage = () => {
    pages.push([]);
    y = H - MARGE;
  };
  const texte = (t: string, x: number, yy: number, taille: number, gras = false, droite = false, maxW?: number) => {
    const s = maxW ? tronque(t, maxW, taille, gras) : t;
    const xx = droite ? x - largeur(s, taille, gras) : x;
    ops().push(`BT /${gras ? 'F2' : 'F1'} ${taille} Tf ${xx.toFixed(1)} ${yy.toFixed(1)} Td ${chaine(s)} Tj ET`);
  };
  const place = (h: number) => {
    if (y - h < MARGE + 20) nouvellePage();
  };

  texte(doc.titre, MARGE, y - 18, 18, true);
  y -= 26;
  texte(doc.sousTitre, MARGE, y - 10, 10);
  y -= 24;

  for (const sec of doc.sections) {
    place(50);
    texte(sec.titre, MARGE, y - 12, 12, true);
    y -= 20;
    const n = sec.colonnes.length;
    const cell = (v: string | number | undefined) => (typeof v === 'number' ? v.toLocaleString('fr-FR') : String(v ?? ''));
    const brut = sec.colonnes.map((c, i) => Math.max(largeur(c, 9, true), ...sec.lignes.map((l) => largeur(cell(l[i]), 9))) + 14);
    const somme = brut.reduce((a, b) => a + b, 0);
    const facteur = somme > UTILE ? UTILE / somme : 1;
    const ws = brut.map((w) => w * facteur);
    const xs = ws.map((_, i) => MARGE + ws.slice(0, i).reduce((a, b) => a + b, 0));
    const aDroite = (i: number) => sec.lignes.length > 0 && sec.lignes.every((l) => typeof l[i] === 'number' || /^[-+]?[\d\s.,]+( [A-Za-z%]+)?$/.test(String(l[i] ?? '')));

    const entete = () => {
      ops().push(`0.93 0.95 0.92 rg ${MARGE} ${(y - 15).toFixed(1)} ${UTILE.toFixed(1)} 16 re f 0 g`);
      sec.colonnes.forEach((c, i) => texte(c, aDroite(i) ? xs[i] + ws[i] - 5 : xs[i] + 5, y - 11, 9, true, aDroite(i), ws[i] - 8));
      y -= 16;
    };
    place(36);
    entete();
    if (sec.lignes.length === 0) {
      texte('Aucune donnée ce mois-ci.', MARGE + 5, y - 11, 9);
      y -= 16;
    }
    for (const ligne of sec.lignes) {
      if (y - 16 < MARGE + 20) {
        nouvellePage();
        entete();
      }
      ligne.forEach((v, i) => {
        const t = cell(v);
        texte(t, aDroite(i) ? xs[i] + ws[i] - 5 : xs[i] + 5, y - 11, 9, false, aDroite(i), ws[i] - 8);
      });
      ops().push(`0.88 g ${MARGE} ${(y - 15).toFixed(1)} ${UTILE.toFixed(1)} 0.4 re f 0 g`);
      y -= 16;
    }
    if (sec.note) {
      place(16);
      texte(sec.note, MARGE + 5, y - 10, 8);
      y -= 14;
    }
    y -= 12;
    void n;
  }

  pages.forEach((p, i) => p.push(`BT /F1 8 Tf ${MARGE} 24 Td ${chaine(`Ferme360 - page ${i + 1} / ${pages.length}`)} Tj ET`));

  // objets : 1 catalogue, 2 pages, 3 et 4 polices, puis (page, contenu) pour chaque page
  const objets: string[] = [];
  objets[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objets[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${5 + 2 * i} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objets[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objets[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach((p, i) => {
    const flux = p.join('\n');
    objets[5 + 2 * i] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${L} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + 2 * i} 0 R >>`;
    objets[6 + 2 * i] = `<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`;
  });

  let sortie = '%PDF-1.4\n';
  const positions: number[] = [];
  for (let i = 1; i < objets.length; i++) {
    positions[i] = sortie.length;
    sortie += `${i} 0 obj\n${objets[i]}\nendobj\n`;
  }
  const xref = sortie.length;
  sortie += `xref\n0 ${objets.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objets.length; i++) sortie += `${String(positions[i]).padStart(10, '0')} 00000 n \n`;
  sortie += `trailer\n<< /Size ${objets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Uint8Array.from(sortie, (c) => c.charCodeAt(0));
}
