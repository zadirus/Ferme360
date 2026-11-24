// Fichier Excel (.xlsx) minimal : une feuille par tableau, textes et nombres.
import { zip } from './zip';

export interface Feuille {
  nom: string;
  colonnes: string[];
  lignes: Array<Array<string | number>>;
}

const echappe = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

function nomColonne(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

const nomFeuille = (n: string, i: number) => (n.replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 31) || `Feuille ${i + 1}`);

function xmlFeuille(f: Feuille): string {
  const cellule = (v: string | number, col: number, ligne: number, gras: boolean) => {
    const ref = `${nomColonne(col)}${ligne}`;
    const s = gras ? ' s="1"' : '';
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${echappe(String(v))}</t></is></c>`;
  };
  const toutes = [f.colonnes, ...f.lignes];
  const largeurs = f.colonnes.map((_, c) => Math.min(60, Math.max(10, ...toutes.map((l) => String(l[c] ?? '').length + 2))));
  const lignes = toutes
    .map((l, i) => `<row r="${i + 1}">${l.map((v, c) => cellule(v, c, i + 1, i === 0)).join('')}</row>`)
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<cols>${largeurs.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${lignes}</sheetData></worksheet>`
  );
}

export function construireXlsx(feuilles: Feuille[]): Uint8Array {
  const enc = new TextEncoder();
  const f = (nom: string, contenu: string) => ({ nom, donnees: enc.encode(contenu) });
  const noms = feuilles.map((x, i) => nomFeuille(x.nom, i));
  return zip([
    f('[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      feuilles.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
      `</Types>`),
    f('_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    f('xl/workbook.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
      noms.map((n, i) => `<sheet name="${echappe(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
      `</sheets></workbook>`),
    f('xl/_rels/workbook.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      feuilles.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${feuilles.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    f('xl/styles.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
      `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
      `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>` +
      `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
      `</styleSheet>`),
    ...feuilles.map((x, i) => f(`xl/worksheets/sheet${i + 1}.xml`, xmlFeuille(x)))
  ]);
}
