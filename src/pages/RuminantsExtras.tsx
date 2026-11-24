import { useState } from 'preact/hooks';
import { Courbe } from '../courbe';
import { ajouteJours, fmtDate, fmtDec, fmtFcfa, joursEntre, today } from '../format';
import { dataOf, useItems, type Item } from '../hooks';
import { compresserPhoto } from '../photo';
import { propositionsReforme, tachesAutomatiques } from '../ruminants/calculs';
import { libelleAnimal, useRuminants } from '../ruminants/donnees';
import { occupation, parcActuel } from '../ruminants/parcs';
import type { Client, Paiement, Vente } from '../gestion/types';
import type { Animal, Parc, Pature, Pesee, Photo, Traite, Travail, Lot } from '../ruminants/types';
import { newId, saveRecord } from '../sync';
import { Boutons, Champ, Choix, nombre } from '../ui';

export function PhotosAnimal({ animalId, peutAjouter }: { animalId: string; peutAjouter: boolean }) {
  const photos = useItems<Photo>('photo').filter((p) => p.animalId === animalId).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt);
  const [erreur, setErreur] = useState('');
  const [grande, setGrande] = useState<string | null>(null);
  async function ajouter(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    setErreur('');
    try {
      await saveRecord('photo', newId(), { animalId, date: today(), image: await compresserPhoto(f), legende: '' } satisfies Photo);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Photo impossible à enregistrer.');
    }
  }
  if (!photos.length && !peutAjouter) return null;
  return (
    <>
      <h3>Photos</h3>
      {erreur && <p class="erreur">{erreur}</p>}
      <div class="photos">
        {photos.map((p) => (
          <figure key={p.id} class={grande === p.id ? 'grande' : ''}>
            <img src={p.image} alt={`Photo du ${fmtDate(p.date)}`} onClick={() => setGrande(grande === p.id ? null : p.id)} />
            <figcaption>{fmtDate(p.date)}{peutAjouter && <button type="button" class="lien" onClick={async () => { if (window.confirm('Supprimer cette photo ?')) await saveRecord('photo', p.id, dataOf(p), true); }}>Supprimer</button>}</figcaption>
          </figure>
        ))}
      </div>
      {peutAjouter && <label class="fichier">📷 Ajouter une photo<input type="file" accept="image/*" capture="environment" onChange={(e) => void ajouter(e)} /></label>}
    </>
  );
}

const serieDates = (points: Array<{ date: string; poids: number }>): Array<[number, number]> => {
  const premier = points[0].date;
  return points.map((p) => [joursEntre(premier, p.date), p.poids]);
};

export function CroissanceAnimal({ pesees }: { pesees: Pesee[] }) {
  const l = [...pesees].sort((a, b) => a.date.localeCompare(b.date));
  if (l.length < 2) return null;
  return (
    <>
      <h3>Courbe de croissance</h3>
      <Courbe titre="Poids de l'animal selon la date" unite=" kg" formatX={(d) => fmtDate(ajouteJours(l[0].date, Math.round(d))).slice(0, 5)} series={[{ nom: 'Poids', points: serieDates(l), couleur: '#2f6b3a' }]} />
    </>
  );
}

export function CroissanceLot({ animalIds, pesees }: { animalIds: string[]; pesees: Pesee[] }) {
  const ids = new Set(animalIds);
  const parDate = new Map<string, number[]>();
  for (const p of pesees) if (ids.has(p.animalId)) parDate.set(p.date, [...(parDate.get(p.date) ?? []), p.poids]);
  const moy = [...parDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, poids: v.reduce((s, x) => s + x, 0) / v.length }));
  if (moy.length < 2) return null;
  return (
    <>
      <h3>Courbe de croissance du lot</h3>
      <Courbe titre="Poids moyen du lot selon la date" unite=" kg" formatX={(d) => fmtDate(ajouteJours(moy[0].date, Math.round(d))).slice(0, 5)} series={[{ nom: 'Poids moyen', points: serieDates(moy), couleur: '#2f6b3a' }]} />
    </>
  );
}

export function TraiteForm({ animalId, onFini }: { animalId: string; onFini: (m: string) => void }) {
  const [date, setDate] = useState(today());
  const [litres, setLitres] = useState('');
  async function envoyer(e: Event) {
    e.preventDefault();
    const l = nombre(litres);
    if (l <= 0 || l > 80) return;
    await saveRecord('traite', newId(), { animalId, date, litres: l } satisfies Traite);
    onFini('Traite enregistrée');
  }
  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>Traite</h3>
      <Champ label="Lait trait" type="number" min={0} value={litres} onChange={setLitres} suffixe="litres" required />
      <Champ label="Date" type="date" max={today()} value={date} onChange={setDate} required />
      <p class="intro">Pour vendre du lait : Ventes, article « Lait ».</p>
      <Boutons onAnnuler={() => onFini('')} />
    </form>
  );
}

export function TravailForm({ animal, argent, onFini }: { animal: Item<Animal>; argent: boolean; onFini: (m: string) => void }) {
  const clients = useItems<Client>('client');
  const [date, setDate] = useState(today());
  const [jours, setJours] = useState('1');
  const [recette, setRecette] = useState('');
  const [clientId, setClientId] = useState('');
  const [paye, setPaye] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const r = argent ? Math.max(0, nombre(recette)) : 0;
  async function envoyer(e: Event) {
    e.preventDefault();
    const j = nombre(jours);
    if (j <= 0) return;
    let venteId = '';
    if (r > 0) {
      venteId = newId();
      await saveRecord('vente', venteId, { date, clientId, activite: 'bovins', lignes: [{ article: 'autre', libelle: `Location de traction (${animal.boucle})`, quantite: j, unite: 'unite', prixUnitaire: r / j }], total: r, note: '' } satisfies Vente);
      const montant = clientId ? Math.min(r, paye === null ? r : nombre(paye)) : r;
      if (montant > 0) await saveRecord('paiement', newId(), { date, clientId, venteId, montant, mode: 'especes', note: '' } satisfies Paiement);
    }
    await saveRecord('travail', newId(), { animalId: animal.id, date, jours: j, recette: r, venteId, note: note.trim() } satisfies Travail);
    onFini(r > 0 ? `Travail enregistré, recette de ${fmtFcfa(r)} ajoutée aux ventes` : 'Travail enregistré');
  }
  return (
    <form class="formulaire" onSubmit={envoyer}>
      <h3>Travail de traction</h3>
      <Champ label="Jours de travail" type="number" min={0} value={jours} onChange={setJours} suffixe="jours" required />
      <Champ label="Date" type="date" max={today()} value={date} onChange={setDate} required />
      {argent && (
        <>
          <Champ label="Recette si le bœuf est loué (facultatif)" type="number" min={0} value={recette} onChange={setRecette} suffixe="FCFA" />
          {r > 0 && <Choix label="Loué à" value={clientId} onChange={setClientId} options={[['', 'Sans nom (payé comptant)'], ...clients.map((c) => [c.id, c.nom] as [string, string])]} />}
          {r > 0 && clientId && <Champ label="Payé maintenant" type="number" min={0} value={paye === null ? String(r) : paye} onChange={setPaye} suffixe="FCFA" />}
        </>
      )}
      <Champ label="Note (facultatif)" value={note} onChange={setNote} placeholder="Ex. : labour du champ de M. Koffi" />
      <Boutons onAnnuler={() => onFini('')} />
    </form>
  );
}

export const supprimerTravail = async (t: Item<Travail>, ventes: Array<Item<Vente>>, paiements: Array<Item<Paiement>>) => {
  await saveRecord('travail', t.id, dataOf(t), true);
  for (const v of ventes.filter((x) => x.id === t.venteId)) await saveRecord('vente', v.id, dataOf(v), true);
  for (const p of paiements.filter((x) => x.venteId === t.venteId && t.venteId)) await saveRecord('paiement', p.id, dataOf(p), true);
};

export function ParcLot({ lot, peutModifier }: { lot: Item<Lot>; peutModifier: boolean }) {
  const r = useRuminants();
  const parcs = useItems<Parc>('parc');
  const patures = useItems<Pature>('pature');
  const [ouvert, setOuvert] = useState(false);
  const [parcId, setParcId] = useState('');
  const [date, setDate] = useState(today());
  const actuel = parcActuel(lot.id, patures);
  const parc = parcs.find((p) => p.id === actuel?.parcId);
  const histo = patures.filter((p) => p.lotId === lot.id).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt).slice(0, 8);
  void r;
  async function envoyer(e: Event) {
    e.preventDefault();
    if (actuel && actuel.parcId !== parcId) await saveRecord('pature', newId(), { lotId: lot.id, parcId: actuel.parcId, date, type: 'sortie' } satisfies Pature);
    if (parcId && actuel?.parcId !== parcId) await saveRecord('pature', newId(), { lotId: lot.id, parcId, date, type: 'entree' } satisfies Pature);
    setOuvert(false);
  }
  return (
    <>
      <h3>Pâturage</h3>
      <ul>
        <li>
          <div class="ligne"><strong>{parc ? parc.nom : 'Hors parc'}</strong>{actuel && <span class="badge">depuis {Math.max(0, joursEntre(actuel.depuis, today()))} jour(s)</span>}</div>
          {peutModifier && !ouvert && <button type="button" class="lien vert" onClick={() => { setOuvert(true); setParcId(actuel?.parcId ?? ''); }}>Changer de parc ou sortir du parc</button>}
        </li>
      </ul>
      {ouvert && (
        <form class="formulaire" onSubmit={envoyer}>
          <Choix label="Parc" value={parcId} onChange={setParcId} options={[['', 'Hors parc (étable, enclos)'], ...parcs.map((p) => [p.id, p.nom] as [string, string])]} />
          <Champ label="Date" type="date" max={today()} value={date} onChange={setDate} required />
          {parcs.length === 0 && <p class="intro">Créez d'abord vos parcs dans la page Moutons ou Bœufs.</p>}
          <Boutons onAnnuler={() => setOuvert(false)} />
        </form>
      )}
      {histo.length > 0 && <ul>{histo.map((h) => <li key={h.id}><div class="ligne"><small>{h.type === 'entree' ? 'Entrée dans' : 'Sortie de'} {parcs.find((p) => p.id === h.parcId)?.nom ?? 'parc supprimé'}</small><small>{fmtDate(h.date)}</small></div></li>)}</ul>}
    </>
  );
}

export function ParcsListe({ peutCreer }: { peutCreer: boolean }) {
  const r = useRuminants();
  const parcs = useItems<Parc>('parc');
  const patures = useItems<Pature>('pature');
  const [creation, setCreation] = useState(false);
  const [nom, setNom] = useState('');
  const [capacite, setCapacite] = useState('');
  const effectifLot = (lotId: string) => r.animaux.filter((a) => r.etat(a.id).lotId === lotId && r.statut(a.id) === 'present').length;
  const lots = r.lots.map((l) => l.id);
  if (!parcs.length && !peutCreer) return null;
  async function envoyer(e: Event) {
    e.preventDefault();
    if (!nom.trim()) return;
    await saveRecord('parc', newId(), { nom: nom.trim(), capacite: Math.max(0, Math.floor(nombre(capacite))), note: '' } satisfies Parc);
    setNom(''); setCapacite(''); setCreation(false);
  }
  return (
    <>
      <h3>Parcs de pâturage</h3>
      <ul>
        {parcs.map((p) => {
          const n = occupation(p.id, lots, patures, effectifLot);
          return (
            <li key={p.id}>
              <div class="ligne"><strong>{p.nom}</strong><span class={`badge ${p.capacite > 0 && n > p.capacite ? 'rouge' : ''}`}>{n}{p.capacite > 0 ? ` / ${p.capacite}` : ''} animaux</span></div>
              {p.capacite > 0 && n > p.capacite && <small class="dette">Trop d'animaux pour ce parc</small>}
            </li>
          );
        })}
        {!parcs.length && <li class="vide">Aucun parc. Créez-en pour suivre où paissent vos lots.</li>}
      </ul>
      {peutCreer && !creation && <button class="secondaire" type="button" onClick={() => setCreation(true)}>+ Nouveau parc</button>}
      {creation && (
        <form class="formulaire" onSubmit={envoyer}>
          <Champ label="Nom du parc" value={nom} onChange={setNom} required placeholder="Ex. : Pâturage du bas-fond" />
          <Champ label="Nombre d'animaux qu'il peut porter (facultatif)" type="number" min={0} value={capacite} onChange={setCapacite} />
          <Boutons texte="Créer le parc" onAnnuler={() => setCreation(false)} />
        </form>
      )}
    </>
  );
}

export function TachesEtReforme({ espece }: { espece: 'ovin' | 'bovin' }) {
  const r = useRuminants();
  const animaux = r.animaux.filter((a) => a.espece === espece);
  const taches = tachesAutomatiques(animaux, r.statut, r.soins, today(), 7);
  const reforme = propositionsReforme(animaux, r.statut, r.repro, r.misesBas, r.soins, today());
  const a = (id: string) => animaux.find((x) => x.id === id)!;
  return (
    <>
      {taches.length > 0 && (
        <>
          <h3>Sevrage et castration à prévoir</h3>
          <ul>
            {taches.map((t) => (
              <li key={t.animalId + t.type}>
                <a class="carte" href={`#/animaux/${t.animalId}`}>
                  <strong>{t.type === 'sevrage' ? 'Sevrage' : 'Castration'} : {libelleAnimal(a(t.animalId))}</strong>
                  <span>{t.retard ? `en retard (prévu le ${fmtDate(t.date)})` : `prévu le ${fmtDate(t.date)}`}</span>
                </a>
              </li>
            ))}
          </ul>
          <p class="intro">Une fois fait, enregistrez-le comme soin (type « Sevrage » ou « Castration ») dans la fiche : le rappel disparaît. La castration ne concerne pas les mâles gardés comme reproducteurs.</p>
        </>
      )}
      {reforme.length > 0 && (
        <>
          <h3>À examiner pour la réforme</h3>
          <ul>
            {reforme.map((p) => (
              <li key={p.animalId}>
                <a class="carte" href={`#/animaux/${p.animalId}`}>
                  <strong>{libelleAnimal(a(p.animalId))}</strong>
                  <span>{p.raisons.join(' · ')}</span>
                </a>
              </li>
            ))}
          </ul>
          <p class="intro">Simple suggestion : c'est vous qui décidez. Les seuils se règlent dans Plus, Réglages.</p>
        </>
      )}
    </>
  );
}

export const litresSur = (traites: Array<{ animalId: string; date: string; litres: number }>, jours: number, animalId?: string) =>
  traites.filter((t) => (!animalId || t.animalId === animalId) && joursEntre(t.date, today()) < jours && joursEntre(t.date, today()) >= 0).reduce((s, t) => s + t.litres, 0);

export const fmtLitres = (l: number) => `${fmtDec(l, 1)} L`;
