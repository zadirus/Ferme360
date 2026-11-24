import { useState } from 'preact/hooks';
import { dataOf, go, type Item } from '../hooks';
import { ageEnMois, fmtDate, fmtDec, fmtFcfa, joursEntre, today } from '../format';
import { COMPTES, type Compte, type Depense } from '../gestion/types';
import { dernierPoids, finDelaiAttente, gmq, gmqAnimal, miseBasPrevue, poidsAnimal } from '../ruminants/calculs';
import { libelleAnimal, useRuminants } from '../ruminants/donnees';
import {
  ACTIVITE_ESPECE, GESTATION_JOURS, ICONE_ESPECE, NOM_ESPECE, NOM_SOIN,
  type Animal, type Espece, type MiseBas, type MvtAnimal, type Pesee, type Repro, type Soin
} from '../ruminants/types';
import { newId, saveRecord } from '../sync';
import { Alertes, Boutons, Champ, Choix, nombre, Retour, Stat } from '../ui';

type Action = 'pesee' | 'soin' | 'repro' | 'misebas' | 'lot' | 'sortie';

interface Evt { cle: string; date: string; maj: number; texte: string; supprimer?: () => Promise<void> }

export function AnimalDetail({ id }: { id: string }) {
  const r = useRuminants();
  const [action, setAction] = useState<Action | null>(null);
  const [message, setMessage] = useState('');
  const a = r.animaux.find((x) => x.id === id);
  if (!a) return (<section><Retour vers="/elevage" texte="Élevage" /><p class="intro">Animal introuvable.</p></section>);

  const etat = r.etat(id);
  const present = etat.statut === 'present';
  const lot = r.lots.find((l) => l.id === etat.lotId);
  const pesees = poidsAnimal(id, r.pesees);
  const soins = r.soins.filter((s) => s.animalId === id || (s.lotId && s.lotId === etat.lotId));
  const prevue = a.sexe === 'F' ? miseBasPrevue(id, r.repro, r.misesBas) : null;
  const fin = present ? finDelaiAttente(id, etat.lotId, r.soins, today()) : null;
  const retour = a.espece === 'ovin' ? '/moutons' : '/boeufs';
  const poids = dernierPoids(id, r.pesees);
  const dernierGmq = pesees.length >= 2 ? gmq(pesees[pesees.length - 2], pesees[pesees.length - 1]) : null;
  const fini = (m: string) => { setAction(null); setMessage(m); };
  const nom = (i: string) => { const x = r.animaux.find((y) => y.id === i); return x ? libelleAnimal(x) : ''; };

  const effacer = async (collection: string, item: Item<object>, confirmation: string, suite?: () => Promise<void>) => {
    if (!window.confirm(confirmation)) return;
    await saveRecord(collection, item.id, dataOf(item), true);
    if (suite) await suite();
    setMessage('Saisie supprimée');
  };

  const evts: Evt[] = [
    ...r.pesees.filter((p) => p.animalId === id).map((p) => ({ cle: 'p' + p.id, date: p.date, maj: p.updatedAt, texte: `Pesée : ${fmtDec(p.poids, 1)} kg (${p.methode === 'balance' ? 'balance' : 'ruban'})`, supprimer: () => effacer('pesee', p, 'Supprimer cette pesée ?') })),
    ...r.soins.filter((s) => s.animalId === id).map((s) => ({ cle: 's' + s.id, date: s.date, maj: s.updatedAt, texte: `${NOM_SOIN[s.type]} : ${s.produit}${s.delaiAttente ? ` · délai d'attente ${s.delaiAttente} j` : ''}${s.cout ? ` · ${fmtFcfa(s.cout)}` : ''}`,
      supprimer: () => effacer('soin', s, 'Supprimer ce soin et sa dépense ?', async () => { for (const d of r.depenses.filter((x) => x.soinId === s.id)) await saveRecord('depense', d.id, dataOf(d), true); }) })),
    ...r.repro.filter((x) => x.femelleId === id).map((x) => ({ cle: 'r' + x.id, date: x.date, maj: x.updatedAt,
      texte: x.type === 'chaleurs' ? 'Chaleurs' : x.type === 'saillie' ? `Saillie${x.maleId ? ` par ${nom(x.maleId)}` : ''}` : `Diagnostic de gestation : ${x.resultat === 'gestante' ? 'gestante' : 'vide'}`,
      supprimer: () => effacer('repro', x, 'Supprimer cette saisie ?') })),
    ...r.misesBas.filter((m) => m.mereId === id).map((m) => ({ cle: 'b' + m.id, date: m.date, maj: m.updatedAt, texte: `Mise bas : ${m.vivants} vivant(s)${m.mortNes ? `, ${m.mortNes} mort-né(s)` : ''}`,
      supprimer: () => effacer('misebas', m, 'Supprimer cette mise bas ET les fiches des petits créés ?', async () => {
        for (const p of r.animaux.filter((x) => x.miseBasId === m.id)) {
          await saveRecord('animal', p.id, dataOf(p), true);
          for (const v of r.mvts.filter((x) => x.animalId === p.id)) await saveRecord('mvt_animal', v.id, dataOf(v), true);
          for (const v of r.pesees.filter((x) => x.animalId === p.id)) await saveRecord('pesee', v.id, dataOf(v), true);
        }
      }) })),
    ...r.mvts.filter((m) => m.animalId === id).map((m) => ({ cle: 'm' + m.id, date: m.date, maj: m.updatedAt,
      texte: m.type === 'entree' ? (m.motif === 'achat' ? 'Entrée : achat' : 'Entrée : naissance') : m.type === 'lot' ? `Changement de lot${m.lotId ? ` : ${r.lots.find((l) => l.id === m.lotId)?.nom ?? ''}` : ' : aucun lot'}` : `Sortie : ${m.motif}`,
      supprimer: m.type === 'entree' || m.venteId ? undefined : () => effacer('mvt_animal', m, 'Annuler ce mouvement ?') }))
  ].sort((x, y) => y.date.localeCompare(x.date) || y.maj - x.maj);

  return (
    <section>
      <Retour vers={retour} texte="Registre" />
      <h2>{ICONE_ESPECE[a.espece]} {libelleAnimal(a)}</h2>
      <p class="intro">
        {[a.sexe === 'F' ? 'Femelle' : 'Mâle', a.race, a.naissance ? `${a.naissanceEstimee ? '≈ ' : ''}${ageEnMois(a.naissance, today())} mois` : '', a.robe].filter(Boolean).join(' · ')}
        {!present && <> · <span class="badge rouge">{etat.statut} le {fmtDate(etat.dateSortie)}</span></>}
      </p>
      {fin && <Alertes liste={[`Délai d'attente en cours : vente et abattage interdits jusqu'au ${fmtDate(fin)}`]} />}
      <div class="stats">
        <Stat valeur={poids ? `${fmtDec(poids, 1)} kg` : '—'} label="Dernier poids" />
        <Stat valeur={dernierGmq !== null ? `${fmtDec(dernierGmq, 0)} g/j` : '—'} label="GMQ (dernières pesées)" />
        <Stat valeur={gmqAnimal(id, r.pesees) !== null ? `${fmtDec(gmqAnimal(id, r.pesees)!, 0)} g/j` : '—'} label="GMQ depuis la 1re pesée" />
        <Stat valeur={lot ? <a href={`#/lots/${lot.id}`}>{lot.nom}</a> : 'Aucun'} label="Lot" />
        {prevue && <Stat valeur={fmtDate(prevue)} label={prevue < today() ? 'Mise bas prévue (en retard)' : 'Mise bas prévue'} />}
        {a.origine === 'achete' && <Stat valeur={fmtFcfa(a.prixAchat)} label={`Acheté le ${fmtDate(a.dateAchat)}${a.vendeur ? ` à ${a.vendeur}` : ''}`} />}
      </div>
      {message && <p class="succes" role="status">{message}</p>}

      {present && !action && (
        <div class="actions">
          <button class="principal" type="button" onClick={() => setAction('pesee')}><span class="e">⚖️</span>Pesée</button>
          <button class="principal" type="button" onClick={() => setAction('soin')}><span class="e">💉</span>Soin</button>
          {a.sexe === 'F' && <button class="principal" type="button" onClick={() => setAction('repro')}><span class="e">❤️</span>Reproduction</button>}
          {a.sexe === 'F' && <button class="principal" type="button" onClick={() => setAction('misebas')}><span class="e">🍼</span>Mise bas</button>}
          <button class="principal" type="button" onClick={() => setAction('lot')}><span class="e">🧺</span>Changer de lot</button>
          <button class="principal" type="button" onClick={() => setAction('sortie')}><span class="e">🚪</span>Sortie</button>
        </div>
      )}
      {present && !action && <p class="intro">Pour vendre cet animal, utilisez l'onglet Ventes.</p>}

      {action === 'pesee' && <PeseeForm animalId={id} onFini={fini} />}
      {action === 'soin' && <SoinForm animalId={id} lotId="" espece={a.espece} onFini={fini} />}
      {action === 'repro' && <ReproForm femelle={a} onFini={fini} />}
      {action === 'misebas' && <MiseBasForm mere={a} lotId={etat.lotId} onFini={fini} />}
      {action === 'lot' && <ChangerLot animal={a} lotActuel={etat.lotId} onFini={fini} />}
      {action === 'sortie' && <SortieForm animalId={id} lotId={etat.lotId} soins={r.soins} onFini={fini} />}

      {(a.mereId || a.pereId) && (<><h3>Ascendance</h3><Parents animal={a} animaux={r.animaux} niveau={1} /></>)}

      <h3>Historique</h3>
      <ul>
        {evts.map((e) => (
          <li key={e.cle}>
            <div class="ligne"><span>{e.texte}</span><small>{fmtDate(e.date)}</small></div>
            {e.supprimer && <button type="button" class="lien" onClick={() => void e.supprimer!()}>Supprimer</button>}
          </li>
        ))}
        {evts.length === 0 && <li class="vide">Aucune saisie.</li>}
      </ul>
      {soins.some((s) => s.lotId) && <p class="intro">Les soins de lot s'appliquent aussi à cet animal.</p>}
    </section>
  );
}

function Parents({ animal, animaux, niveau }: { animal: Animal; animaux: Array<Item<Animal>>; niveau: number }) {
  if (niveau > 3) return null;
  const lignes: Array<[string, Item<Animal> | undefined]> = [['Mère', animaux.find((x) => x.id === animal.mereId)], ['Père', animaux.find((x) => x.id === animal.pereId)]];
  return (
    <div class="lignee">
      {lignes.map(([titre, p]) => p && (
        <div key={titre + p.id}>
          <a href={`#/animaux/${p.id}`}>{libelleAnimal(p)}</a> <small>{titre}</small>
          <Parents animal={p} animaux={animaux} niveau={niveau + 1} />
        </div>
      ))}
    </div>
  );
}

function PeseeForm({ animalId, onFini }: { animalId: string; onFini: (m: string) => void }) {
  const [date, setDate] = useState(today());
  const [poids, setPoids] = useState('');
  const [methode, setMethode] = useState<Pesee['methode']>('balance');
  async function envoyer(e: Event) {
    e.preventDefault();
    const p = nombre(poids);
    if (p <= 0 || p > 2000) return;
    await saveRecord('pesee', newId(), { animalId, date, poids: p, methode } satisfies Pesee);
    onFini('Pesée enregistrée');
  }
  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>Pesée</h3>
      <Champ label="Poids" type="number" min={0} value={poids} onChange={setPoids} suffixe="kg" required />
      <Choix label="Mesuré avec" value={methode} onChange={setMethode} options={[['balance', 'Balance'], ['ruban', 'Ruban barymétrique']]} />
      <Champ label="Date" type="date" max={today()} value={date} onChange={setDate} required />
      <Boutons onAnnuler={() => onFini('')} />
    </form>
  );
}

// Soin d'un animal ou d'un lot ; le coût crée aussi une dépense (activité et trésorerie)
export function SoinForm({ animalId, lotId, espece, onFini }: { animalId: string; lotId: string; espece: Espece; onFini: (m: string) => void }) {
  const [type, setType] = useState<Soin['type']>('vaccin');
  const [produit, setProduit] = useState('');
  const [date, setDate] = useState(today());
  const [veto, setVeto] = useState('');
  const [cout, setCout] = useState('');
  const [compte, setCompte] = useState<Compte>('caisse');
  const [delai, setDelai] = useState('');
  const [rappel, setRappel] = useState('');
  const [note, setNote] = useState('');
  async function envoyer(e: Event) {
    e.preventDefault();
    if (!produit.trim()) return;
    const c = Math.max(0, nombre(cout));
    const soinId = newId();
    await saveRecord('soin', soinId, { animalId, lotId, date, type, produit: produit.trim(), veterinaire: veto.trim(), cout: c, delaiAttente: Math.max(0, Math.floor(nombre(delai))), rappel, note: note.trim() } satisfies Soin);
    if (c > 0) {
      await saveRecord('depense', newId(), { date, activite: ACTIVITE_ESPECE[espece], categorie: 'Soins vétérinaires', libelle: `${NOM_SOIN[type]} ${produit.trim()}`, montant: c, compte, soinId } satisfies Depense);
    }
    onFini('Soin enregistré');
  }
  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>{lotId ? 'Soin du lot' : 'Soin'}</h3>
      <Choix label="Type" value={type} onChange={setType} options={(Object.keys(NOM_SOIN) as Soin['type'][]).map((k) => [k, NOM_SOIN[k]] as [Soin['type'], string])} />
      <Champ label="Produit ou maladie" value={produit} onChange={setProduit} required />
      <Champ label="Date" type="date" max={today()} value={date} onChange={setDate} required />
      <Champ label="Délai d'attente avant vente ou abattage" type="number" min={0} value={delai} onChange={setDelai} suffixe="jours" placeholder="0" />
      <Champ label="Prochain rappel (facultatif)" type="date" value={rappel} onChange={setRappel} />
      <Champ label="Vétérinaire (facultatif)" value={veto} onChange={setVeto} />
      <Champ label="Coût (facultatif)" type="number" min={0} value={cout} onChange={setCout} suffixe="FCFA" />
      {nombre(cout) > 0 && <Choix label="Payé avec" value={compte} onChange={setCompte} options={COMPTES} />}
      <Champ label="Note (facultatif)" value={note} onChange={setNote} />
      <Boutons onAnnuler={() => onFini('')} />
    </form>
  );
}

function ReproForm({ femelle, onFini }: { femelle: Item<Animal>; onFini: (m: string) => void }) {
  const r = useRuminants();
  const [type, setType] = useState<Repro['type']>('saillie');
  const [date, setDate] = useState(today());
  const [maleId, setMaleId] = useState('');
  const [resultat, setResultat] = useState<'gestante' | 'vide'>('gestante');
  const [gest, setGest] = useState(String(GESTATION_JOURS[femelle.espece]));
  const males = r.animaux.filter((x) => x.espece === femelle.espece && x.sexe === 'M' && r.statut(x.id) === 'present');
  async function envoyer(e: Event) {
    e.preventDefault();
    await saveRecord('repro', newId(), { femelleId: femelle.id, type, date, maleId: type === 'saillie' ? maleId : '', resultat: type === 'diagnostic' ? resultat : '', gestationJours: Math.round(nombre(gest)) || GESTATION_JOURS[femelle.espece], note: '' } satisfies Repro);
    onFini(type === 'saillie' ? 'Saillie enregistrée : la mise bas prévue est dans le calendrier' : 'Enregistré');
  }
  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>Reproduction</h3>
      <Choix label="Événement" value={type} onChange={setType} options={[['saillie', 'Saillie / lutte'], ['chaleurs', 'Chaleurs observées'], ['diagnostic', 'Diagnostic de gestation']]} />
      <Champ label="Date" type="date" max={today()} value={date} onChange={setDate} required />
      {type === 'saillie' && (
        <>
          <Choix label="Mâle" value={maleId} onChange={setMaleId} options={[['', 'Inconnu'], ...males.map((m) => [m.id, libelleAnimal(m)] as [string, string])]} />
          <Champ label="Durée de gestation" type="number" min={1} value={gest} onChange={setGest} suffixe="jours" />
        </>
      )}
      {type === 'diagnostic' && <Choix label="Résultat" value={resultat} onChange={setResultat} options={[['gestante', 'Gestante'], ['vide', 'Vide (pas gestante)']]} />}
      <Boutons onAnnuler={() => onFini('')} />
    </form>
  );
}

interface Petit { boucle: string; sexe: 'F' | 'M'; poids: string }

function MiseBasForm({ mere, lotId, onFini }: { mere: Item<Animal>; lotId: string; onFini: (m: string) => void }) {
  const r = useRuminants();
  const dernier = [...r.repro].filter((x) => x.femelleId === mere.id && x.type === 'saillie').sort((a, b) => b.date.localeCompare(a.date))[0];
  const [date, setDate] = useState(today());
  const [pereId, setPereId] = useState(dernier?.maleId ?? '');
  const [difficulte, setDifficulte] = useState<MiseBas['difficulte']>('normale');
  const [mortNes, setMortNes] = useState('0');
  const [petits, setPetits] = useState<Petit[]>([{ boucle: '', sexe: 'F', poids: '' }]);
  const [erreur, setErreur] = useState('');
  const males = r.animaux.filter((x) => x.espece === mere.espece && x.sexe === 'M' && r.statut(x.id) === 'present');
  const modif = (i: number, p: Partial<Petit>) => setPetits(petits.map((x, k) => (k === i ? { ...x, ...p } : x)));

  async function envoyer(e: Event) {
    e.preventDefault();
    setErreur('');
    const boucles = petits.map((p) => p.boucle.trim());
    if (boucles.some((b) => !b)) return setErreur('Donnez un numéro de boucle à chaque petit vivant.');
    if (new Set(boucles.map((b) => b.toLowerCase())).size !== boucles.length) return setErreur('Deux petits ont le même numéro.');
    const doublon = boucles.find((b) => r.animaux.some((x) => x.boucle.toLowerCase() === b.toLowerCase()));
    if (doublon) return setErreur(`Le numéro ${doublon} existe déjà.`);
    const mbId = newId();
    await saveRecord('misebas', mbId, { mereId: mere.id, date, pereId, vivants: petits.length, mortNes: Math.max(0, Math.floor(nombre(mortNes))), difficulte } satisfies MiseBas);
    for (const p of petits) {
      const id = newId();
      await saveRecord('animal', id, {
        boucle: p.boucle.trim(), nom: '', espece: mere.espece, race: mere.race, sexe: p.sexe, naissance: date, naissanceEstimee: false, robe: '',
        origine: 'ne', mereId: mere.id, pereId, miseBasId: mbId, vendeur: '', prixAchat: 0, poidsAchat: 0, dateAchat: ''
      } satisfies Animal);
      await saveRecord('mvt_animal', newId(), { animalId: id, date, type: 'entree', motif: 'naissance', lotId, venteId: '', note: '' } satisfies MvtAnimal);
      if (nombre(p.poids) > 0) await saveRecord('pesee', newId(), { animalId: id, date, poids: nombre(p.poids), methode: 'balance' } satisfies Pesee);
    }
    onFini(`Mise bas enregistrée : ${petits.length} fiche(s) créée(s) avec la mère`);
  }

  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>Mise bas</h3>
      <Champ label="Date" type="date" max={today()} value={date} onChange={setDate} required />
      <Choix label="Père" value={pereId} onChange={setPereId} options={[['', 'Inconnu'], ...males.map((m) => [m.id, libelleAnimal(m)] as [string, string])]} />
      <Choix label="Déroulement" value={difficulte} onChange={setDifficulte} options={[['normale', 'Normal'], ['assistee', 'Avec aide'], ['difficile', 'Difficile']]} />
      {petits.map((p, i) => (
        <div key={i} class="ligne-vente">
          <Champ label={`Petit vivant ${i + 1} : numéro de boucle`} value={p.boucle} onChange={(v) => modif(i, { boucle: v })} />
          <Choix label="Sexe" value={p.sexe} onChange={(v) => modif(i, { sexe: v })} options={[['F', 'Femelle'], ['M', 'Mâle']]} />
          <Champ label="Poids à la naissance (facultatif)" type="number" min={0} value={p.poids} onChange={(v) => modif(i, { poids: v })} suffixe="kg" />
          {petits.length > 1 && <button type="button" class="lien" onClick={() => setPetits(petits.filter((_, k) => k !== i))}>Retirer ce petit</button>}
        </div>
      ))}
      <button type="button" class="secondaire" onClick={() => setPetits([...petits, { boucle: '', sexe: 'F', poids: '' }])}>+ Ajouter un petit vivant</button>
      <Champ label="Mort-nés" type="number" min={0} value={mortNes} onChange={setMortNes} />
      {erreur && <p class="erreur">{erreur}</p>}
      <Boutons texte="Enregistrer la mise bas" onAnnuler={() => onFini('')} />
    </form>
  );
}

function ChangerLot({ animal, lotActuel, onFini }: { animal: Item<Animal>; lotActuel: string; onFini: (m: string) => void }) {
  const r = useRuminants();
  const [lotId, setLotId] = useState(lotActuel);
  const [date, setDate] = useState(today());
  async function envoyer(e: Event) {
    e.preventDefault();
    if (lotId === lotActuel) return onFini('');
    await saveRecord('mvt_animal', newId(), { animalId: animal.id, date, type: 'lot', motif: 'changement_lot', lotId, venteId: '', note: '' } satisfies MvtAnimal);
    onFini('Lot modifié');
  }
  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>Changer de lot</h3>
      <Choix label="Lot" value={lotId} onChange={setLotId} options={[['', 'Aucun lot'], ...r.lots.filter((l) => l.espece === animal.espece).map((l) => [l.id, l.nom] as [string, string])]} />
      <Champ label="Date" type="date" max={today()} value={date} onChange={setDate} required />
      <Boutons onAnnuler={() => onFini('')} />
    </form>
  );
}

function SortieForm({ animalId, lotId, soins, onFini }: { animalId: string; lotId: string; soins: Soin[]; onFini: (m: string) => void }) {
  const [motif, setMotif] = useState<'mort' | 'abattage' | 'perte'>('mort');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [erreur, setErreur] = useState('');
  async function envoyer(e: Event) {
    e.preventDefault();
    if (motif === 'abattage') {
      const fin = finDelaiAttente(animalId, lotId, soins, date);
      if (fin) return setErreur(`Abattage interdit : délai d'attente en cours jusqu'au ${fmtDate(fin)}.`);
    }
    await saveRecord('mvt_animal', newId(), { animalId, date, type: 'sortie', motif, lotId: '', venteId: '', note: note.trim() } satisfies MvtAnimal);
    onFini('Sortie enregistrée : l\'animal quitte le registre');
  }
  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>Sortie du registre</h3>
      <p class="intro">Pour une vente, utilisez l'onglet Ventes.</p>
      <Choix label="Motif" value={motif} onChange={setMotif} options={[['mort', 'Mort'], ['abattage', 'Abattage'], ['perte', 'Perte, vol, disparition']]} />
      <Champ label="Date" type="date" max={today()} value={date} onChange={setDate} required />
      <Champ label="Note (facultatif)" value={note} onChange={setNote} />
      {erreur && <p class="erreur">{erreur}</p>}
      <Boutons texte="Enregistrer la sortie" onAnnuler={() => onFini('')} />
    </form>
  );
}

export { go, joursEntre };
