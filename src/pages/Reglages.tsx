import { useState } from 'preact/hooks';
import { useItems } from '../hooks';
import { DEFAUTS, ID_REGLAGES, type Reglages as TypeReglages } from '../reglages';
import { saveRecord } from '../sync';
import { Boutons, Champ, nombre, Retour } from '../ui';

const CHAMPS: Array<[keyof TypeReglages, string, string]> = [
  ['chutePonteSeuil', 'Alerte de chute de ponte : points perdus', 'points'],
  ['chutePonteJours', '… sur combien de jours', 'jours'],
  ['mortaliteJourPct', 'Alerte de mortalité : part de la bande en un jour', '%'],
  ['mortaliteJourMin', '… et au moins', 'poules'],
  ['joursPeremption', 'Alerte avant la péremption d’un produit', 'jours'],
  ['joursCreance', 'Alerte pour une créance client ancienne de', 'jours'],
  ['poidsOeufG', 'Poids moyen d’un œuf (indice de consommation)', 'g'],
  ['gestationOvin', 'Gestation de la brebis (mise bas prévue)', 'jours'],
  ['gestationBovin', 'Gestation de la vache (mise bas prévue)', 'jours']
];

export function Reglages() {
  const stockes = useItems<Partial<TypeReglages>>('reglage').find((x) => x.id === ID_REGLAGES);
  const [valeurs, setValeurs] = useState<Record<string, string>>(() =>
    Object.fromEntries(CHAMPS.map(([k]) => [k, String(stockes?.[k] ?? DEFAUTS[k])]))
  );
  const [message, setMessage] = useState('');

  async function enregistrer(e: Event) {
    e.preventDefault();
    const data = Object.fromEntries(CHAMPS.map(([k]) => [k, Math.max(0, nombre(valeurs[k]))]));
    await saveRecord('reglage', ID_REGLAGES, data);
    setMessage('Réglages enregistrés. Ils s’appliquent à tous les téléphones.');
  }

  async function remettre() {
    if (!window.confirm('Remettre toutes les valeurs par défaut ?')) return;
    await saveRecord('reglage', ID_REGLAGES, { ...DEFAUTS });
    setValeurs(Object.fromEntries(CHAMPS.map(([k]) => [k, String(DEFAUTS[k])])));
    setMessage('Valeurs par défaut rétablies.');
  }

  return (
    <section>
      <Retour vers="/plus" texte="Plus" />
      <h2>Réglages</h2>
      {message && <p class="succes" role="status">{message}</p>}
      <form class="formulaire" onSubmit={enregistrer}>
        {CHAMPS.map(([k, label, unite]) => (
          <Champ key={k} label={label} type="number" min={0} value={valeurs[k]} onChange={(v) => setValeurs({ ...valeurs, [k]: v })} suffixe={unite} />
        ))}
        <Boutons texte="Enregistrer" />
      </form>
      <button class="secondaire" type="button" onClick={() => void remettre()}>Remettre les valeurs par défaut</button>
    </section>
  );
}
