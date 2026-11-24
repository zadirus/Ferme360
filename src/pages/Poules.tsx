import { useState } from 'preact/hooks';
import { useItems } from '../hooks';
import { fmtDate, fmtInt, fmtPct, today } from '../format';
import { alertes, indicateurs } from '../poules/calculs';
import type { Aliment, Bande, Mortalite, Ramassage } from '../poules/types';
import { newId, saveRecord } from '../sync';
import { Alertes, Boutons, Champ, nombre, Retour } from '../ui';

export function Poules() {
  const bandes = useItems<Bande>('bande');
  const ram = useItems<Ramassage>('ramassage');
  const morts = useItems<Mortalite>('mortalite');
  const aliments = useItems<Aliment>('aliment');
  const [creation, setCreation] = useState(false);

  const actives = bandes.filter((b) => !b.cloturee);
  const cloturees = bandes.filter((b) => b.cloturee);

  const carte = (b: (typeof bandes)[number]) => {
    const r = ram.filter((x) => x.bandeId === b.id);
    const m = morts.filter((x) => x.bandeId === b.id);
    const i = indicateurs(b, r, m, aliments.filter((x) => x.bandeId === b.id));
    const al = alertes(b, r, m);
    return (
      <li key={b.id}>
        <a class="carte" href={`#/poules/${b.id}`}>
          <strong>{b.nom}</strong>
          <span>
            {fmtInt(i.effectif)} poules{b.batiment ? ` · ${b.batiment}` : ''}
          </span>
          <span>
            {i.dernierTaux !== null && i.derniereDate
              ? `Ponte du ${fmtDate(i.derniereDate)} : ${fmtPct(i.dernierTaux)}`
              : 'Pas encore de ramassage'}
          </span>
          {al.length > 0 && <span class="alerte-mini">⚠ {al.length} alerte(s)</span>}
        </a>
      </li>
    );
  };

  return (
    <section>
      <Retour vers="/elevage" texte="Élevage" />
      <h2>Poules pondeuses</h2>
      {!creation && (
        <button class="principal" type="button" onClick={() => setCreation(true)}>
          + Nouvelle bande
        </button>
      )}
      {creation && <BandeForm onFini={() => setCreation(false)} />}
      <ul>
        {actives.map(carte)}
        {actives.length === 0 && !creation && <li class="vide">Aucune bande. Créez la première.</li>}
      </ul>
      {cloturees.length > 0 && (
        <>
          <h3>Bandes clôturées</h3>
          <ul>{cloturees.map(carte)}</ul>
        </>
      )}
    </section>
  );
}

function BandeForm({ onFini }: { onFini: () => void }) {
  const [nom, setNom] = useState('');
  const [batiment, setBatiment] = useState('');
  const [souche, setSouche] = useState('');
  const [dateArrivee, setDateArrivee] = useState(today());
  const [age, setAge] = useState('0');
  const [effectif, setEffectif] = useState('');
  const [origine, setOrigine] = useState('');
  const [prix, setPrix] = useState('');

  async function envoyer(e: Event) {
    e.preventDefault();
    const n = Math.floor(nombre(effectif));
    if (!nom.trim() || n <= 0) return;
    const data: Bande = {
      nom: nom.trim(),
      batiment: batiment.trim(),
      souche: souche.trim(),
      dateArrivee,
      ageArriveeSemaines: Math.max(0, Math.floor(nombre(age))),
      effectifInitial: n,
      origine: origine.trim(),
      prixAchat: Math.max(0, nombre(prix))
    };
    await saveRecord('bande', newId(), data as unknown as Record<string, unknown>);
    onFini();
  }

  return (
    <form onSubmit={envoyer} class="formulaire">
      <h3>Nouvelle bande</h3>
      <Champ label="Nom de la bande" value={nom} onChange={setNom} required placeholder="Ex. : Bande 1" />
      <Champ label="Nombre de poules à l'arrivée" type="number" min={1} value={effectif} onChange={setEffectif} required />
      <Champ label="Date d'arrivée" type="date" max={today()} value={dateArrivee} onChange={setDateArrivee} required />
      <Champ label="Âge à l'arrivée" type="number" min={0} value={age} onChange={setAge} suffixe="semaines" />
      <Champ label="Bâtiment" value={batiment} onChange={setBatiment} placeholder="Ex. : Poulailler 1" />
      <Champ label="Souche" value={souche} onChange={setSouche} placeholder="Ex. : ISA Brown" />
      <Champ label="Origine" value={origine} onChange={setOrigine} placeholder="Ex. : couvoir, fournisseur" />
      <Champ label="Prix d'achat total" type="number" min={0} value={prix} onChange={setPrix} suffixe="FCFA" />
      <Boutons onAnnuler={onFini} texte="Créer la bande" />
    </form>
  );
}

export { Alertes };
