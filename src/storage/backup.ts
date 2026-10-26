// Backup / restore with optional AES-GCM encryption (PBKDF2-SHA-256 key
// derivation). Pure functions over plain data so they can be tested in Node.
import { z } from 'zod';

export const BACKUP_FORMAT = 'threex-vi-backup';
export const BACKUP_VERSION = 2;

export interface BackupData {
  scenarios: unknown[];
  documents: unknown[];
  chunks: unknown[];
  blobs: { key: string; base64: string }[];
  settings: { key: string; value: unknown }[];
  facts: unknown[];
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  app: string;
  encrypted: boolean;
  data?: BackupData;
  cipher?: { alg: 'AES-GCM'; kdf: 'PBKDF2-SHA256'; iterations: number; salt: string; iv: string; payload: string };
}

const b64 = {
  enc(u8: Uint8Array): string {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return btoa(s);
  },
  dec(s: string): Uint8Array {
    const bin = atob(s);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  },
};
export const base64 = b64;

async function deriveKey(pass: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function makeBackup(data: BackupData, passphrase?: string): Promise<BackupFile> {
  const base: BackupFile = { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: new Date().toISOString(), app: 'THREE X | Venture Intelligence', encrypted: !!passphrase };
  if (!passphrase) return { ...base, data };
  if (passphrase.length < 8) throw new Error('Use a passphrase of at least 8 characters.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = 250_000;
  const key = await deriveKey(passphrase, salt, iterations);
  const plain = new TextEncoder().encode(JSON.stringify(data));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plain as BufferSource));
  return { ...base, cipher: { alg: 'AES-GCM', kdf: 'PBKDF2-SHA256', iterations, salt: b64.enc(salt), iv: b64.enc(iv), payload: b64.enc(ct) } };
}

const fileSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().positive(),
  createdAt: z.string(),
  encrypted: z.boolean(),
  data: z.any().optional(),
  cipher: z.object({ alg: z.literal('AES-GCM'), kdf: z.literal('PBKDF2-SHA256'), iterations: z.number(), salt: z.string(), iv: z.string(), payload: z.string() }).optional(),
});

const dataSchema = z.object({
  scenarios: z.array(z.any()).default([]),
  documents: z.array(z.any()).default([]),
  chunks: z.array(z.any()).default([]),
  blobs: z.array(z.object({ key: z.string(), base64: z.string() })).default([]),
  settings: z.array(z.object({ key: z.string(), value: z.any() })).default([]),
  facts: z.array(z.any()).default([]),
});

export interface RestoreReport {
  data: BackupData;
  version: number;
  migratedFrom?: number;
  warnings: string[];
}

/** Parse, decrypt, validate and migrate a backup. Invalid records are dropped with a warning instead of failing the whole restore. */
export async function readBackup(text: string, passphrase?: string): Promise<RestoreReport> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('The file is not valid JSON — it may be damaged or not a THREE X backup.');
  }
  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) throw new Error('This file is not a THREE X | Venture Intelligence backup.');
  const f = parsed.data;
  if (f.version > BACKUP_VERSION) throw new Error(`Backup version ${f.version} is newer than this app (${BACKUP_VERSION}). Update the app first.`);
  let data: unknown = f.data;
  if (f.encrypted) {
    if (!passphrase) throw new Error('This backup is encrypted. Enter its passphrase.');
    const c = f.cipher!;
    const key = await deriveKey(passphrase, b64.dec(c.salt), c.iterations);
    try {
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64.dec(c.iv) as BufferSource }, key, b64.dec(c.payload) as BufferSource);
      data = JSON.parse(new TextDecoder().decode(pt));
    } catch {
      throw new Error('Wrong passphrase, or the backup has been altered.');
    }
  }
  const warnings: string[] = [];
  let migratedFrom: number | undefined;
  if (f.version === 1) {
    migratedFrom = 1;
    // v1 had no facts store and stored settings as an object
    const d = data as Record<string, unknown>;
    if (d && !Array.isArray(d.settings) && typeof d.settings === 'object' && d.settings) d.settings = Object.entries(d.settings).map(([key, value]) => ({ key, value }));
    if (d && !d.facts) d.facts = [];
  }
  const v = dataSchema.safeParse(data);
  if (!v.success) throw new Error('The backup data is malformed and cannot be restored.');
  const out = v.data as BackupData;
  out.scenarios = out.scenarios.filter((s, i) => {
    const ok = !!s && typeof s === 'object' && typeof (s as { id?: unknown }).id === 'string' && Array.isArray((s as { entities?: unknown }).entities);
    if (!ok) warnings.push(`Scenario #${i + 1} was invalid and skipped.`);
    return ok;
  });
  out.documents = out.documents.filter((d, i) => {
    const ok = !!d && typeof (d as { id?: unknown }).id === 'string';
    if (!ok) warnings.push(`Document #${i + 1} was invalid and skipped.`);
    return ok;
  });
  return { data: out, version: f.version, migratedFrom, warnings };
}
