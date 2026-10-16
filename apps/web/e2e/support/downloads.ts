// support/downloads.ts · descargas (PDF/xlsx/png/csv) y chequeo de firma de archivo.
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

export interface Downloaded {
  filename: string;
  size: number;
  buffer: Buffer;
}

export async function downloadVia(page: Page, trigger: () => Promise<unknown>): Promise<Downloaded> {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), trigger()]);
  const p = await dl.path();
  const buffer = await readFile(p);
  return { filename: dl.suggestedFilename(), size: buffer.length, buffer };
}

export const isPdf = (b: Buffer): boolean => b.subarray(0, 4).toString('latin1') === '%PDF';
/** xlsx es un zip: firma PK\x03\x04. */
export const isXlsx = (b: Buffer): boolean => b[0] === 0x50 && b[1] === 0x4b;
export const isPng = (b: Buffer): boolean => b.subarray(1, 4).toString('latin1') === 'PNG';
