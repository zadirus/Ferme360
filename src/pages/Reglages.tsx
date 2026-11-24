import { useState } from 'preact/hooks';
import { useItems } from '../hooks';
import { EXEMPLE_COURBE, EXEMPLE_PROPHYLAXIE, lireCourbe, lireProphylaxie } from '../poules/programmes';
import { DEFAUTS, ID_PROGRAMMES, ID_REGLAGES, type Reglages as TypeReglages } from '../reglages';
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
  ['gestationBovin', 'Gestation de la vache (mise bas prévue)', 'jours'],
  ['sevrageOvinJours', 'Rappel de sevrage des agneaux (0 = aucun)', 'jours après la naissance'],
  ['sevrageBovinJours', 'Rappel de sevrage des veaux (0 = aucun)', 'jours après la naissance'],
  ['castrationJours', 'Rappel de castration des mâles (0 = aucun)', 'jours après la naissance'],
  ['reformeOvinAns', 'Proposer à la réforme un mouton de plus de', 'ans'],
  ['reformeBovinAns', 'Proposer à la réforme un bœuf de plus de', 'ans'],
  ['eauBaissePct', 'Alerte si l’eau bue par poule baisse de', '%'],
  ['heureNotif', 'Heure des notifications du matin (0 à 23)', 'h'],
  ['decalageUtc', 'Décalage horaire de la ferme (0 en Côte d’Ivoire et au Sénégal, 1 au Bénin et au Cameroun)', 'h']
];

function Programmes() {
  const stocke = useItems<{ prophylaxie?: string; courbe?: string }>('reglage').find((x) => x.id === ID_PROGRAMMES);
  const [proph, setProph] = useState(stocke?.prophylaxie ?? '');
  const [courbe, setCourbe] = useState(stocke?.courbe ?? '');
  const [message, setMessage] = useState('');
  async function enregistrer(e: Event) {
    e.preventDefault();
    await saveRecord('reglage', ID_PROGRAMMES, { prophylaxie: proph, courbe });
    setMessage('Programmes enregistrés.');
  }
  return (
    <form class="formulaire" onSubmit={enregistrer}>
      <h3>Programme de vaccination des poules</h3>
      <p class="intro">Une ligne par vaccin : « nom : âge de la poule en jours ». Chaque bande reçoit alors le rappel automatiquement, et il disparaît dès que vous enregistrez le vaccin dans sa fiche.</p>
      <textarea rows={6} value={proph} onInput={(e) => setProph(e.currentTarget.value)} placeholder="Newcastle : 7" />
      <p class="intro">{lireProphylaxie(proph).length} vaccin(s) reconnu(s). <button type="button" class="lien vert" onClick={() => setProph(EXEMPLE_PROPHYLAXIE)}>Mettre un exemple (à valider avec votre vétérinaire)</button></p>
      <h3>Courbe de ponte de référence</h3>
      <p class="intro">Une ligne par point : « âge en semaines : taux de ponte en % ». Elle s'affiche en pointillé sur la courbe de chaque bande.</p>
      <textarea rows={6} value={courbe} onInput={(e) => setCourbe(e.currentTarget.value)} placeholder="30 : 94" />
      <p class="intro">{lireCourbe(courbe).length} point(s) reconnu(s). <button type="button" class="lien vert" onClick={() => setCourbe(EXEMPLE_COURBE)}>Mettre une courbe d'exemple (indicative, à remplacer par celle de votre souche)</button></p>
      {message && <p class="succes" role="status">{message}</p>}
      <Boutons texte="Enregistrer les programmes" />
    </form>
  );
}

export function Reglages() {
  const stockes = useItems<Partial<TypeReglages>>('reglage').find((x) => x.id === ID_REGLAGES);
  const [valeurs, setValeurs] = useState<Record<string, string>>(() =>
    Object.fromEntries(CHAMPS.map(([k]) => [k, String(stockes?.[k] ?? DEFAUTS[k])]))
  );
  const [message, setMessage] = useState('');

  async function enregistrer(e: Event) {
    e.preventDefault();
    const data = Object.fromEntries(CHAMPS.map(([k]) => [k, k === 'decalageUtc' ? Math.max(-12, Math.min(14, nombre(valeurs[k]))) : k === 'heureNotif' ? Math.max(0, Math.min(23, Math.round(nombre(valeurs[k])))) : Math.max(0, nombre(valeurs[k]))]));
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
          <Champ key={k} label={label} type="number" min={k === 'decalageUtc' ? -12 : 0} value={valeurs[k]} onChange={(v) => setValeurs({ ...valeurs, [k]: v })} suffixe={unite} />
        ))}
        <Boutons texte="Enregistrer" />
      </form>
      <button class="secondaire" type="button" onClick={() => void remettre()}>Remettre les valeurs par défaut</button>
      <Programmes />
    </section>
  );
}
