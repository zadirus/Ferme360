import { useState } from 'preact/hooks';
import { definirPin, pinDefini, pinValide, retirerPin, verifierPin } from '../pin';
import { Boutons, Retour } from '../ui';

export function Pin() {
  const [actuel, setActuel] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirme, setConfirme] = useState('');
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');
  const [, maj] = useState(0);
  const defini = pinDefini();
  const chiffres = (set: (v: string) => void) => (e: Event) => set((e.currentTarget as HTMLInputElement).value.replace(/\D/g, '').slice(0, 4));

  async function enregistrer(e: Event) {
    e.preventDefault();
    setErreur('');
    if (defini && !(await verifierPin(actuel))) return setErreur('Code actuel incorrect.');
    if (!pinValide(nouveau)) return setErreur('Le code doit avoir exactement 4 chiffres.');
    if (nouveau !== confirme) return setErreur('Les deux codes ne sont pas identiques.');
    await definirPin(nouveau);
    setMessage('Code PIN enregistré. L’application se verrouillera après 2 minutes hors de l’écran.');
    setActuel(''); setNouveau(''); setConfirme('');
    maj((n) => n + 1);
  }

  async function retirer() {
    setErreur('');
    if (!(await verifierPin(actuel))) return setErreur('Entrez votre code actuel pour le retirer.');
    retirerPin();
    setActuel('');
    setMessage('Code PIN retiré.');
    maj((n) => n + 1);
  }

  return (
    <section>
      <Retour vers="/plus" texte="Plus" />
      <h2>Code PIN</h2>
      <p class="intro">Quatre chiffres pour verrouiller l'application sur ce téléphone. Il protège des regards curieux ; la vraie protection de votre compte reste le mot de passe. Après 5 erreurs, il faut se reconnecter avec le mot de passe.</p>
      {message && <p class="succes" role="status">{message}</p>}
      <form class="formulaire" onSubmit={enregistrer}>
        {defini && <label>Code actuel<input type="password" inputMode="numeric" value={actuel} onInput={chiffres(setActuel)} /></label>}
        <label>{defini ? 'Nouveau code' : 'Choisissez un code'} (4 chiffres)<input type="password" inputMode="numeric" value={nouveau} onInput={chiffres(setNouveau)} required /></label>
        <label>Confirmez le code<input type="password" inputMode="numeric" value={confirme} onInput={chiffres(setConfirme)} required /></label>
        {erreur && <p class="erreur">{erreur}</p>}
        <Boutons texte={defini ? 'Changer le code' : 'Activer le code'} />
      </form>
      {defini && <button class="secondaire" type="button" onClick={() => void retirer()}>Retirer le code (entrez d'abord le code actuel)</button>}
    </section>
  );
}
