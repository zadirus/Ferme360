import type { ComponentChildren } from 'preact';

export function Retour({ vers, texte = 'Retour' }: { vers: string; texte?: string }) {
  return (
    <a class="retour" href={`#${vers}`}>
      ← {texte}
    </a>
  );
}

interface ChampProps {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: 'text' | 'number' | 'date';
  required?: boolean;
  min?: number;
  max?: string;
  placeholder?: string;
  suffixe?: string;
}

export function Champ({ label, value, onChange, type = 'text', required, min, max, placeholder, suffixe }: ChampProps) {
  return (
    <label>
      {label}
      <span class="champ">
        <input
          type={type}
          value={value}
          onInput={(e) => onChange(e.currentTarget.value)}
          required={required}
          min={min}
          max={max}
          placeholder={placeholder}
          inputMode={type === 'number' ? 'decimal' : undefined}
          step={type === 'number' ? 'any' : undefined}
        />
        {suffixe && <em>{suffixe}</em>}
      </span>
    </label>
  );
}

export function Choix<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: T;
  options: Array<[T, string]>;
  onChange: (v: T) => void;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.currentTarget.value as T)}>
        {options.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Boutons({ onAnnuler, texte = 'Enregistrer', desactive }: { onAnnuler?: () => void; texte?: string; desactive?: boolean }) {
  return (
    <div class="boutons">
      <button class="principal" type="submit" disabled={desactive}>
        {texte}
      </button>
      {onAnnuler && (
        <button class="secondaire" type="button" onClick={onAnnuler}>
          Annuler
        </button>
      )}
    </div>
  );
}

export function Stat({ valeur, label }: { valeur: ComponentChildren; label: string }) {
  return (
    <div class="stat">
      <strong>{valeur}</strong>
      <span>{label}</span>
    </div>
  );
}

// Les alertes restent affichées tant qu'elles ne sont pas levées. Sur l'accueil on en montre quelques-unes
// (`max`) et un lien ouvre la liste complète.
export function Alertes({ liste, max = 4, lien = false }: { liste: string[]; max?: number; lien?: boolean }) {
  if (!liste.length) return null;
  const vues = lien ? liste.slice(0, max) : liste;
  return (
    <div class="alertes" role="alert">
      {vues.map((a) => (
        <p key={a}>⚠ {a}</p>
      ))}
      {lien && <a class="toutes-alertes" href="#/alertes">{liste.length > max ? `Voir les ${liste.length} alertes →` : 'Liste des alertes →'}</a>}
    </div>
  );
}

export const nombre = (v: string) => (v.trim() === '' ? 0 : Number(v.replace(',', '.')));
