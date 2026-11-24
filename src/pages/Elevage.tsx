import { useItems } from '../hooks';
import { fmtInt } from '../format';
import { effectifActuel } from '../poules/calculs';
import type { Bande, Mortalite } from '../poules/types';
import { useRuminants } from '../ruminants/donnees';
import { ICONE_ESPECE, NOM_ESPECES, type Espece } from '../ruminants/types';

export function Elevage() {
  const bandes = useItems<Bande>('bande').filter((b) => !b.cloturee);
  const morts = useItems<Mortalite>('mortalite');
  const r = useRuminants();
  const poules = bandes.reduce((s, b) => s + effectifActuel(b, morts.filter((m) => m.bandeId === b.id)), 0);
  const presents = (e: Espece) => r.animaux.filter((a) => a.espece === e && r.statut(a.id) === 'present').length;

  return (
    <section>
      <h2>Élevage</h2>
      <p class="intro">Choisissez ce que vous voulez suivre.</p>
      <ul class="tuiles">
        <li>
          <a class="tuile" href="#/poules">
            <span class="ico">🐔</span>
            <span class="gros">{fmtInt(poules)}</span>
            <span class="petit">poules pondeuses · {bandes.length} bande(s)</span>
          </a>
        </li>
        {(['ovin', 'bovin'] as Espece[]).map((e) => (
          <li key={e}>
            <a class="tuile" href={e === 'ovin' ? '#/moutons' : '#/boeufs'}>
              <span class="ico">{ICONE_ESPECE[e]}</span>
              <span class="gros">{fmtInt(presents(e))}</span>
              <span class="petit">{NOM_ESPECES[e].toLowerCase()} présents</span>
            </a>
          </li>
        ))}
        <li>
          <a class="tuile" href="#/oeufs">
            <span class="ico">🥚</span>
            <span class="gros">Œufs</span>
            <span class="petit">stock et sorties</span>
          </a>
        </li>
      </ul>
    </section>
  );
}
