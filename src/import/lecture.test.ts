// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { construireXlsx } from '../rapports/xlsx';
import { enObjets, lireCsv, lireDate, lireNombre, lireXlsx } from './lecture';

describe('lecture de fichiers', () => {
  it('lit un vrai fichier Excel (compressé, textes partagés, dates)', async () => {
    const lignes = await lireXlsx(new Uint8Array(readFileSync('src/import/fixtures/exemple.xlsx')));
    expect(lignes[0]).toEqual(['Boucle', 'Nom', 'Espèce', 'Sexe', 'Naissance', 'Poids (kg)', 'Lot']);
    const o = enObjets(lignes);
    expect(o).toHaveLength(3);
    expect(o[0].v.boucle).toBe('M001');
    expect(o[0].v.nom).toBe('Blanche');
    expect(lireDate(o[0].v.naissance)).toBe('2025-03-14');
    expect(lireDate(o[1].v.naissance)).toBe('2025-03-14');
    expect(lireNombre(o[0].v['poids kg'])).toBe(38.5);
    expect(o[2].v.espece).toBe('bœuf');
    expect(o[2].v.naissance).toBe('');
  });

  it('relit un fichier produit par l’application (aller-retour)', async () => {
    const lignes = await lireXlsx(construireXlsx([{ nom: 'Test', colonnes: ['Nom', 'Montant'], lignes: [['Awa', 12000], ['Chez & Fils <1>', 5]] }]));
    expect(lignes).toEqual([['Nom', 'Montant'], ['Awa', '12000'], ['Chez & Fils <1>', '5']]);
  });

  it('CSV : séparateur ; accents, guillemets, retours de ligne', () => {
    const csv = new TextEncoder().encode('﻿Nom;Téléphone;Note\r\nAwa;0707070707;"dit ""bonjour""; merci"\r\nKoffi;;\r\n');
    expect(lireCsv(csv)).toEqual([['Nom', 'Téléphone', 'Note'], ['Awa', '0707070707', 'dit "bonjour"; merci'], ['Koffi', '', '']]);
  });

  it('CSV Windows-1252 (Excel français)', () => {
    const octets = Uint8Array.from([...'Nom;Race\nBœuf;Baoulé'].map((c) => c.charCodeAt(0) > 255 ? 0x9c : c.charCodeAt(0)));
    octets[octets.length - 1] = 0xe9; // é en Windows-1252
    expect(lireCsv(octets)[1][1]).toBe('Baoulé');
  });

  it('dates et nombres', () => {
    expect(lireDate('')).toBe('');
    expect(lireDate('5/3/25')).toBe('2025-03-05');
    expect(lireDate('2025-03-05')).toBe('2025-03-05');
    expect(lireDate('45730')).toBe('2025-03-14');
    expect(lireDate('demain')).toBeNull();
    expect(lireNombre('1 250,5')).toBe(1250.5);
    expect(lireNombre('abc')).toBeNull();
  });
});
