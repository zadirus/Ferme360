// Photo réduite pour tenir dans la synchronisation (environ 60 Ko) : pas besoin d'un stockage de fichiers
export async function compresserPhoto(f: File): Promise<string> {
  const bmp = await createImageBitmap(f);
  let cote = 640;
  let qualite = 0.7;
  for (let i = 0; i < 12; i++) {
    const r = Math.min(1, cote / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * r));
    c.height = Math.max(1, Math.round(bmp.height * r));
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/jpeg', qualite);
    if (url.length <= 70_000) return url;
    qualite -= 0.1;
    if (qualite < 0.4) {
      qualite = 0.6;
      cote = Math.round(cote * 0.8);
    }
  }
  throw new Error('Photo trop lourde : essayez une autre photo.');
}
