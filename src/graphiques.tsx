// Graphiques du tableau de bord : barres groupées, barres horizontales, carte de chiffre clé. SVG et HTML simples, sans bibliothèque.
import type { ComponentChildren } from 'preact';
import { fmtCourt } from './tableau/indicateurs';

export interface SerieBarres { nom: string; couleur: string; valeurs: number[] }

const L = 360;
const H = 200;
const G = 44;
const B = 26;

export function Barres({ categories, series, titre, format = fmtCourt }: { categories: string[]; series: SerieBarres[]; titre: string; format?: (n: number) => string }) {
  const brutMax = Math.max(1, ...series.flatMap((s) => s.valeurs));
  const max = brutMax <= 4 ? Math.ceil(brutMax) : brutMax; // petits effectifs : axe en nombres entiers
  const min = Math.min(0, ...series.flatMap((s) => s.valeurs));
  const haut = H - B - 10;
  const Y = (v: number) => 10 + ((max - v) / (max - min)) * haut;
  const largeurGroupe = (L - G - 6) / categories.length;
  const lb = Math.max(2, Math.min(18, (largeurGroupe * 0.78) / series.length));
  const ticks = max <= 4 && min === 0 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, 1, 2, 3].map((i) => min + ((max - min) * i) / 3);
  return (
    <figure class="courbe">
      <svg viewBox={`0 0 ${L} ${H}`} role="img" aria-label={titre}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={G} x2={L - 6} y1={Y(t)} y2={Y(t)} stroke="#e8e3d3" />
            <text x={G - 4} y={Y(t) + 3} text-anchor="end" font-size="9" fill="#667064">{format(t)}</text>
          </g>
        ))}
        {categories.map((c, i) => {
          const x0 = G + i * largeurGroupe + (largeurGroupe - lb * series.length) / 2;
          return (
            <g key={c + i}>
              {series.map((s, k) => {
                const v = s.valeurs[i] ?? 0;
                return <rect key={s.nom} x={x0 + k * lb} y={Math.min(Y(v), Y(0))} width={lb - 1} height={Math.max(1, Math.abs(Y(v) - Y(0)))} rx="2" fill={s.couleur} />;
              })}
              <text x={G + i * largeurGroupe + largeurGroupe / 2} y={H - 9} text-anchor="middle" font-size={categories.length > 8 ? 8 : 9.5} fill="#667064">{c}</text>
            </g>
          );
        })}
      </svg>
      {series.length > 1 && <figcaption>{series.map((s) => <span key={s.nom}><i style={`background:${s.couleur}`} />{s.nom}</span>)}</figcaption>}
    </figure>
  );
}

export function BarresH({ lignes, format = fmtCourt, couleur = '#2f6b3a', vide = 'Rien à afficher pour le moment.' }: { lignes: Array<{ nom: string; valeur: number; detail?: string; couleur?: string; lien?: string }>; format?: (n: number) => string; couleur?: string; vide?: string }) {
  const max = Math.max(1, ...lignes.map((l) => l.valeur));
  if (!lignes.length) return <p class="intro">{vide}</p>;
  return (
    <div class="bh">
      {lignes.map((l) => (
        <div key={l.nom} class="bh-ligne">
          <div class="bh-titre">{l.lien ? <a href={`#${l.lien}`}>{l.nom}</a> : l.nom}<span>{format(l.valeur)}{l.detail ? ` · ${l.detail}` : ''}</span></div>
          <div class="bh-piste"><div class="bh-barre" style={`width:${Math.max(2, (l.valeur / max) * 100)}%;background:${l.couleur ?? couleur}`} /></div>
        </div>
      ))}
    </div>
  );
}

export function Kpi({ titre, valeur, detail, variation, hausseBonne = true, lien }: { titre: string; valeur: string; detail?: string; variation?: number | null; hausseBonne?: boolean; lien?: string }) {
  const v = variation ?? null;
  const bon = v === null || Math.abs(v) < 0.5 ? null : (v > 0) === hausseBonne;
  const corps = (
    <>
      <span class="kpi-titre">{titre}</span>
      <strong class="kpi-valeur">{valeur}</strong>
      <span class="kpi-pied">
        {v !== null && <span class={`tendance ${bon === null ? '' : bon ? 'bon' : 'mauvais'}`}>{v > 0 ? '▲' : v < 0 ? '▼' : '='} {Math.abs(v).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} %</span>}
        {detail && <span>{detail}</span>}
      </span>
    </>
  );
  return lien ? <a class="kpi" href={`#${lien}`}>{corps}</a> : <div class="kpi">{corps}</div>;
}

export function Carte({ titre, sous, children }: { titre: string; sous?: string; children: ComponentChildren }) {
  return (
    <section class="carte-graph">
      <h3>{titre}</h3>
      {sous && <p class="intro">{sous}</p>}
      {children}
    </section>
  );
}
