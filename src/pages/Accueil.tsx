import { useItems } from '../hooks';
import { fmtDate, fmtInt, fmtPlateaux, joursEntre, today } from '../format';
import { alertes, effectifActuel, stockOeufs } from '../poules/calculs';
import type { Bande, Mortalite, MvtOeufs, Ramassage, Sante } from '../poules/types';
import { Alertes } from '../ui';

export function Accueil() {
  const bandes = useItems<Bande>('bande').filter((b) => !b.cloturee);
  const ram = useItems<Ramassage>('ramassage');
  const morts = useItems<Mortalite>('mortalite');
  const mvts = useItems<MvtOeufs>('oeufs_mvt');
  const santes = useItems<Sante>('sante');

  const effectif = bandes.reduce((s, b) => s + effectifActuel(b, morts.filter((m) => m.bandeId === b.id)), 0);
  const alertesToutes = bandes.flatMap((b) =>
    alertes(b, ram.filter((r) => r.bandeId === b.id), morts.filter((m) => m.bandeId === b.id)).map((a) => `${b.nom} : ${a}`)
  );
  const rappels = santes
    .filter((s) => s.rappel && joursEntre(today(), s.rappel) <= 14)
    .sort((a, b) => a.rappel.localeCompare(b.rappel));
  const nomBande = (id: string) => bandes.find((b) => b.id === id)?.nom ?? '';

  return (
    <section>
      <Alertes liste={alertesToutes} />
      <ul class="cartes">
        <li>
          <a class="carte" href="#/poules">
            <strong>Poules pondeuses</strong>
            <span>
              {bandes.length} bande(s) · {fmtInt(effectif)} poules
            </span>
          </a>
        </li>
        <li>
          <a class="carte" href="#/oeufs">
            <strong>Stock d'œufs</strong>
            <span>
              {fmtInt(stockOeufs(ram, mvts))} œufs · {fmtPlateaux(stockOeufs(ram, mvts))}
            </span>
          </a>
        </li>
        <li class="carte inactive">
          <strong>Moutons</strong>
          <span>Bientôt</span>
        </li>
        <li class="carte inactive">
          <strong>Bœufs</strong>
          <span>Bientôt</span>
        </li>
      </ul>
      {rappels.length > 0 && (
        <>
          <h3>Rappels de santé</h3>
          <ul>
            {rappels.map((s) => (
              <li key={s.id}>
                <span>
                  {s.produit} {nomBande(s.bandeId) && `· ${nomBande(s.bandeId)}`}
                </span>
                <small>{s.rappel < today() ? `en retard (${fmtDate(s.rappel)})` : `le ${fmtDate(s.rappel)}`}</small>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
