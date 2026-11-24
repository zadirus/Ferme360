// Téléchargement et partage de fichiers (PDF, Excel, sauvegarde)
const blob = (octets: Uint8Array, mime: string) => new Blob([octets as unknown as BlobPart], { type: mime });

export function telecharger(octets: Uint8Array, nom: string, mime: string) {
  const url = URL.createObjectURL(blob(octets, mime));
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// Ouvre le partage du téléphone (WhatsApp, e-mail…) ; à défaut, télécharge le fichier.
export async function partager(octets: Uint8Array, nom: string, mime: string, texte: string): Promise<'partage' | 'telecharge'> {
  const fichier = new File([blob(octets, mime)], nom, { type: mime });
  try {
    if (navigator.canShare?.({ files: [fichier] })) {
      await navigator.share({ files: [fichier], title: nom, text: texte });
      return 'partage';
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'partage'; // l'utilisateur a fermé le partage
  }
  telecharger(octets, nom, mime);
  return 'telecharge';
}

export const MIME_PDF = 'application/pdf';
export const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const MIME_JSON = 'application/json';
