import { useState } from 'preact/hooks';
import { go, useRole } from '../hooks';
import { peut, peutEcrire } from '../droits';
import { ageEnMois, fmtDate, fmtDec, fmtInt, fmtPct, joursEntre, today } from '../format';
import { COMPTES, type Achat, type Compte } from '../gestion/types';
import { dernierPoids, fertilite, miseBasPrevue, mortaliteAvantSevrage, prolificite } from '../ruminants/calculs';
import { fmtLitres, litresSur, ParcsListe, TachesEtReforme } from './RuminantsExtras';
import { libelleAnimal, useRuminants } from '../ruminants/donnees';
import { ACTIVITE_ESPECE, ICONE_ESPECE, NOM_ESPECE, NOM_ESPECES, RACES, type Animal, type Espece, type Lot, type MvtAnimal, type Pesee } from '../ruminants/types';
import { newId, saveRecord } from '../sync';
import { Boutons, Champ, Choix, nombre, Retour, Stat } from '../ui';

const TYPES_LOT: Array<[Lot['type'], string]> = [
  ['troupeau', 'Troupeau'],
  ['embouche', 'Embouche (engraissement)'],
  ['reproductrices', 'Reproductrices'],
  ['autre', 'Autre']
];

export function Ruminants({ espece }: { espece: Espece }) {
  const r = useRuminants();
  const [mode, setMode] = useState<'animal' | 'lot' | null>(null);
  const [recherche, setRecherche] = useState('');
  const [sortis, setSortis] = useState(false);
  const [message, setMessage] = useState('');
  const role = useRole();

  const tous = r.animaux.filter((a) => a.espece === espece);
  const presents = tous.filter((a) => r.statut(a.id) === 'present');
  const filtre = (a: Animal) => !recherche.trim() || `${a.boucle} ${a.nom}`.toLowerCase().includes(recherche.trim().toLowerCase());
  const liste = (sortis ? tous.filter((a) => r.statut(a.id) !== 'present') : presents).filter(filtre).sort((a, b) => a.boucle.localeCompare(b.boucle, 'fr', { numeric: true }));
  const lots = r.lots.filter((l) => l.espece === espece);
  const femelles = presents.filter((a) => a.sexe === 'F').length;
  const idsEspece = new Set(tous.map((a) => a.id));
  const reproE = r.repro.filter((x) => idsEspece.has(x.femelleId));
  const mbE = r.misesBas.filter((x) => idsEspece.has(x.mereId));
  const fert = fertilite(reproE, mbE);
  const prolif = prolificite(mbE);
  const mortSevrage = mortaliteAvantSevrage(espece, tous, r.mvts, r.misesBas);
  const lait = espece === 'bovin' ? litresSur(r.traites.filter((t) => idsEspece.has(t.animalId)), 7) : 0;
  const aVenir = presents
    .filter((a) => a.sexe === 'F')
    .map((a) => ({ a, date: miseBasPrevue(a.id, r.repro, r.misesBas) }))
    .filter((x): x is { a: (typeof presents)[number]; date: string } => !!x.date && joursEntre(today(), x.date) <= 30)
    .sort((x, y) => x.date.localeCompare(y.date));
  const nomLot = (id: string) => lots.find((l) => l.id === id)?.nom ?? '';
  const fini = (m: string) => { setMode(null); setMessage(m); };

  return (
    <section>
      <Retour vers="/elevage" texte="Élevage" />
      <h2>{ICONE_ESPECE[espece]} {NOM_ESPECES[espece]}</h2>
      <div class="stats">
        <Stat valeur={fmtInt(presents.length)} label={`${NOM_ESPECES[espece].toLowerCase()} présents`} />
        <Stat valeur={`${femelles} F · ${presents.length - femelles} M`} label="femelles · mâles" />
        {fert !== null && <Stat valeur={fmtPct(fert)} label="Fertilité" />}
        {prolif !== null && <Stat valeur={fmtDec(prolif, 2)} label="Prolificité (petits par mise bas)" />}
        {mortSevrage !== null && <Stat valeur={fmtPct(mortSevrage)} label="Mortalité avant sevrage" />}
        {lait > 0 && <Stat valeur={fmtLitres(lait)} label="Lait trait sur 7 jours" />}
      </div>
      {message && <p class="succes" role="status">{message}</p>}
      {!mode && (
        <div class="actions">
          {peutEcrire(role, 'animal') && <button class="principal" type="button" onClick={() => setMode('animal')}><span class="e">➕</span>Nouvel animal</button>}
          {peutEcrire(role, 'lot') && <button class="principal" type="button" onClick={() => setMode('lot')}><span class="e">🧺</span>Nouveau lot</button>}
        </div>
      )}
      {mode === 'animal' && <AnimalForm espece={espece} onFini={fini} />}
      {mode === 'lot' && <LotForm espece={espece} onFini={fini} />}

      <TachesEtReforme espece={espece} />
      <ParcsListe peutCreer={peutEcrire(role, 'parc')} />

      {aVenir.length > 0 && (
        <>
          <h3>Mises bas prévues (30 jours)</h3>
          <ul>
            {aVenir.map(({ a, date }) => (
              <li key={a.id}><a class="carte" href={`#/animaux/${a.id}`}><strong>{libelleAnimal(a)}</strong><span>{date < today() ? `en retard · prévue le ${fmtDate(date)}` : `le ${fmtDate(date)}`}</span></a></li>
            ))}
          </ul>
        </>
      )}

      {lots.length > 0 && (
        <>
          <h3>Lots</h3>
          <ul>
            {lots.map((l) => {
              const n = r.animaux.filter((a) => r.etat(a.id).lotId === l.id && r.statut(a.id) === 'present').length;
              return (
                <li key={l.id}>
                  <a class="carte" href={`#/lots/${l.id}`}>
                    <strong>{l.nom}</strong>
                    <span>{TYPES_LOT.find(([k]) => k === l.type)?.[1]} · {n} animal(aux)</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <h3>{sortis ? 'Animaux sortis' : 'Registre'}</h3>
      <input type="search" placeholder="Chercher un numéro de boucle ou un nom" value={recherche} onInput={(e) => setRecherche(e.currentTarget.value)} />
      <ul>
        {liste.map((a) => {
          const e = r.etat(a.id);
          const p = dernierPoids(a.id, r.pesees);
          return (
            <li key={a.id}>
              <a class="carte" href={`#/animaux/${a.id}`}>
                <strong>{libelleAnimal(a)}</strong>
                <span>
                  {[a.sexe === 'F' ? 'Femelle' : 'Mâle', a.race, a.naissance ? `${ageEnMois(a.naissance, today())} mois` : '', p ? `${fmtDec(p, 0)} kg` : '', nomLot(e.lotId)].filter(Boolean).join(' · ')}
                </span>
                {e.statut !== 'present' && <span class="alerte-mini">{e.statut} le {fmtDate(e.dateSortie)}</span>}
              </a>
            </li>
          );
        })}
        {liste.length === 0 && <li class="vide">{sortis ? 'Aucun animal sorti.' : 'Aucun animal. Ajoutez le premier avec « Nouvel animal ».'}</li>}
      </ul>
      <button class="secondaire" type="button" onClick={() => setSortis(!sortis)}>{sortis ? 'Voir les animaux présents' : 'Voir les animaux sortis (vendus, morts…)'}</button>
    </section>
  );
}

function AnimalForm({ espece, onFini }: { espece: Espece; onFini: (m: string) => void }) {
  const r = useRuminants();
  const argent = peut(useRole(), 'argent');
  const [boucle, setBoucle] = useState('');
  const [nom, setNom] = useState('');
  const [race, setRace] = useState(RACES[espece][0]);
  const [sexe, setSexe] = useState<'F' | 'M'>('F');
  const [naissance, setNaissance] = useState('');
  const [ageMois, setAgeMois] = useState('');
  const [robe, setRobe] = useState('');
  const [origine, setOrigine] = useState<'ne' | 'achete'>('ne');
  const [mereId, setMereId] = useState('');
  const [pereId, setPereId] = useState('');
  const [dateAchat, setDateAchat] = useState(today());
  const [vendeur, setVendeur] = useState('');
  const [prix, setPrix] = useState('');
  const [poids, setPoids] = useState('');
  const [compte, setCompte] = useState<Compte>('caisse');
  const [lotId, setLotId] = useState('');
  const [erreur, setErreur] = useState('');

  const presentsEspece = r.animaux.filter((a) => a.espece === espece && r.statut(a.id) === 'present');
  const lots = r.lots.filter((l) => l.espece === espece);

  async function envoyer(e: Event) {
    e.preventDefault();
    setErreur('');
    const b = boucle.trim();
    if (!b) return setErreur('Le numéro de boucle est obligatoire.');
    if (r.animaux.some((a) => a.boucle.toLowerCase() === b.toLowerCase())) return setErreur(`Le numéro ${b} existe déjà.`);
    let dateNaiss = naissance;
    let estimee = false;
    if (!dateNaiss && nombre(ageMois) > 0) {
      const d = new Date();
      d.setMonth(d.getMonth() - Math.round(nombre(ageMois)));
      dateNaiss = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      estimee = true;
    }
    const achete = origine === 'achete';
    const prixAchat = achete ? Math.max(0, nombre(prix)) : 0;
    const id = newId();
    const dateEntree = achete ? dateAchat : dateNaiss || today();
    await saveRecord('animal', id, {
      boucle: b, nom: nom.trim(), espece, race, sexe, naissance: dateNaiss, naissanceEstimee: estimee, robe: robe.trim(), origine,
      mereId: achete ? '' : mereId, pereId: achete ? '' : pereId, miseBasId: '', vendeur: achete ? vendeur.trim() : '',
      prixAchat, poidsAchat: achete ? nombre(poids) : 0, dateAchat: achete ? dateAchat : ''
    } satisfies Animal);
    await saveRecord('mvt_animal', newId(), { animalId: id, date: dateEntree, type: 'entree', motif: achete ? 'achat' : 'naissance', lotId, venteId: '', note: '' } satisfies MvtAnimal);
    if (nombre(poids) > 0) await saveRecord('pesee', newId(), { animalId: id, date: dateEntree, poids: nombre(poids), methode: 'balance' } satisfies Pesee);
    if (achete && prixAchat > 0) {
      await saveRecord('achat', newId(), { date: dateAchat, fournisseurId: '', activite: ACTIVITE_ESPECE[espece], articleId: '', libelle: `Achat ${NOM_ESPECE[espece].toLowerCase()} ${b}`, quantite: 0, total: prixAchat, montantPaye: prixAchat, compte, peremption: '', animalId: id } satisfies Achat);
    }
    onFini(`${NOM_ESPECE[espece]} ${b} ajouté`);
  }

  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>Nouvel animal</h3>
      <Champ label="Numéro de boucle" value={boucle} onChange={setBoucle} required />
      <Champ label="Nom (facultatif)" value={nom} onChange={setNom} />
      <Choix label="Sexe" value={sexe} onChange={setSexe} options={[['F', 'Femelle'], ['M', 'Mâle']]} />
      <Choix label="Race" value={race} onChange={setRace} options={[...RACES[espece], 'Autre'].map((x) => [x, x] as [string, string])} />
      <Champ label="Date de naissance" type="date" max={today()} value={naissance} onChange={setNaissance} />
      {!naissance && <Champ label="Ou âge estimé" type="number" min={0} value={ageMois} onChange={setAgeMois} suffixe="mois" />}
      <Champ label="Robe (couleur)" value={robe} onChange={setRobe} />
      <Choix label="Origine" value={origine} onChange={setOrigine} options={argent ? [['ne', 'Né à la ferme'], ['achete', 'Acheté']] : [['ne', 'Né à la ferme']]} />
      {origine === 'ne' ? (
        <>
          <Choix label="Mère" value={mereId} onChange={setMereId} options={[['', 'Inconnue'], ...presentsEspece.filter((a) => a.sexe === 'F').map((a) => [a.id, libelleAnimal(a)] as [string, string])]} />
          <Choix label="Père" value={pereId} onChange={setPereId} options={[['', 'Inconnu'], ...presentsEspece.filter((a) => a.sexe === 'M').map((a) => [a.id, libelleAnimal(a)] as [string, string])]} />
        </>
      ) : (
        <>
          <Champ label="Date d'achat" type="date" max={today()} value={dateAchat} onChange={setDateAchat} />
          <Champ label="Vendeur" value={vendeur} onChange={setVendeur} />
          <Champ label="Prix payé" type="number" min={0} value={prix} onChange={setPrix} suffixe="FCFA" />
          <Choix label="Payé avec" value={compte} onChange={setCompte} options={COMPTES} />
        </>
      )}
      <Champ label={origine === 'achete' ? "Poids à l'achat (facultatif)" : 'Poids actuel (facultatif)'} type="number" min={0} value={poids} onChange={setPoids} suffixe="kg" />
      <Choix label="Lot" value={lotId} onChange={setLotId} options={[['', 'Aucun lot'], ...lots.map((l) => [l.id, l.nom] as [string, string])]} />
      {erreur && <p class="erreur">{erreur}</p>}
      <Boutons texte="Ajouter l'animal" onAnnuler={() => onFini('')} />
    </form>
  );
}

function LotForm({ espece, onFini }: { espece: Espece; onFini: (m: string) => void }) {
  const [nom, setNom] = useState('');
  const [type, setType] = useState<Lot['type']>('embouche');
  const [debut, setDebut] = useState(today());
  const [objPoids, setObjPoids] = useState('');
  const [objDate, setObjDate] = useState('');
  async function envoyer(e: Event) {
    e.preventDefault();
    if (!nom.trim()) return;
    const id = newId();
    await saveRecord('lot', id, { nom: nom.trim(), type, espece, dateDebut: debut, poidsObjectif: type === 'embouche' ? nombre(objPoids) : 0, dateObjectif: type === 'embouche' ? objDate : '' } satisfies Lot);
    onFini('Lot créé');
    go(`/lots/${id}`);
  }
  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>Nouveau lot</h3>
      <Champ label="Nom du lot" value={nom} onChange={setNom} required placeholder="Ex. : Embouche Tabaski" />
      <Choix label="Type" value={type} onChange={setType} options={TYPES_LOT} />
      <Champ label="Date de début" type="date" max={today()} value={debut} onChange={setDebut} />
      {type === 'embouche' && (
        <>
          <Champ label="Poids moyen visé (facultatif)" type="number" min={0} value={objPoids} onChange={setObjPoids} suffixe="kg" />
          <Champ label="Date visée, par exemple la Tabaski (facultatif)" type="date" value={objDate} onChange={setObjDate} />
        </>
      )}
      <Boutons texte="Créer le lot" onAnnuler={() => onFini('')} />
    </form>
  );
}
