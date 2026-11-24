// Petit graphique en lignes (SVG), sans bibliothèque : courbes de ponte et de croissance
export interface Serie {
  nom: string;
  points: Array<[number, number]>;
  couleur: string;
  pointille?: boolean;
}

const L = 340;
const H = 190;
const G = 36; // marge gauche
const B = 24; // marge basse

export function Courbe({ series, unite = '', formatX = (x: number) => String(Math.round(x)), titre }: { series: Serie[]; unite?: string; formatX?: (x: number) => string; titre: string }) {
  const pts = series.flatMap((s) => s.points);
  if (pts.length < 2) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs) === x0 ? x0 + 1 : Math.max(...xs);
  const y0 = Math.max(0, Math.floor(Math.min(...ys) * 0.9));
  const y1 = Math.ceil(Math.max(...ys) * 1.05) || 1;
  const X = (x: number) => G + ((x - x0) / (x1 - x0)) * (L - G - 8);
  const Y = (y: number) => H - B - ((y - y0) / (y1 - y0)) * (H - B - 10);
  const traits = [0, 1, 2, 3].map((i) => y0 + ((y1 - y0) * i) / 3);
  return (
    <figure class="courbe">
      <svg viewBox={`0 0 ${L} ${H}`} role="img" aria-label={titre}>
        {traits.map((y) => (
          <g key={y}>
            <line x1={G} x2={L - 8} y1={Y(y)} y2={Y(y)} stroke="#e8e3d3" />
            <text x={G - 4} y={Y(y) + 3} text-anchor="end" font-size="9" fill="#667064">{Math.round(y)}{unite}</text>
          </g>
        ))}
        {[x0, (x0 + x1) / 2, x1].map((x) => (
          <text key={x} x={X(x)} y={H - 8} text-anchor="middle" font-size="9" fill="#667064">{formatX(x)}</text>
        ))}
        {series.map((s) => (
          s.points.length > 1 && <polyline key={s.nom} points={s.points.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ')} fill="none" stroke={s.couleur} stroke-width="2.2" stroke-dasharray={s.pointille ? '5 4' : undefined} stroke-linejoin="round" />
        ))}
        {series.filter((s) => !s.pointille).map((s) => s.points.map(([x, y], i) => <circle key={`${s.nom}${i}`} cx={X(x)} cy={Y(y)} r="2.6" fill={s.couleur} />))}
      </svg>
      <figcaption>{series.map((s) => <span key={s.nom}><i style={`background:${s.couleur}`} />{s.nom}</span>)}</figcaption>
    </figure>
  );
}
