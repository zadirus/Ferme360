import { useState } from 'preact/hooks';
import { retirerPin, verifierPin } from './pin';
import { deconnexion } from './session';

// Écran de verrouillage : 4 chiffres. Après 5 erreurs, il faut se reconnecter avec le mot de passe.
export function Verrou({ onOuvert }: { onOuvert: () => void }) {
  const [code, setCode] = useState('');
  const [echecs, setEchecs] = useState(0);
  const [erreur, setErreur] = useState('');

  async function saisir(c: string) {
    if (code.length >= 4) return;
    const n = code + c;
    setCode(n);
    if (n.length < 4) return;
    if (await verifierPin(n)) return onOuvert();
    const e = echecs + 1;
    setEchecs(e);
    setCode('');
    if (e >= 5) {
      retirerPin();
      deconnexion();
      location.hash = '/';
      location.reload();
      return;
    }
    setErreur(`Code incorrect (${5 - e} essai(s) restant(s))`);
  }

  return (
    <main class="contenu verrou">
      <div class="accueil-auth"><span class="logo-grand" aria-hidden="true">🔒</span><h2>Ferme360</h2></div>
      <p class="intro">Entrez votre code à 4 chiffres.</p>
      <div class="points" aria-label={`${code.length} chiffre(s) saisi(s)`}>{[0, 1, 2, 3].map((i) => <span key={i} class={i < code.length ? 'plein' : ''} />)}</div>
      {erreur && <p class="erreur centre">{erreur}</p>}
      <div class="clavier">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((c) => <button key={c} type="button" onClick={() => void saisir(c)}>{c}</button>)}
        <button type="button" class="vide" onClick={() => { setCode(''); setErreur(''); }} aria-label="Effacer">⌫</button>
        <button type="button" onClick={() => void saisir('0')}>0</button>
        <button type="button" class="vide" onClick={() => { if (window.confirm('Se déconnecter ? Il faudra le mot de passe pour revenir.')) { retirerPin(); deconnexion(); location.hash = '/'; location.reload(); } }} aria-label="Se déconnecter">⏻</button>
      </div>
    </main>
  );
}
