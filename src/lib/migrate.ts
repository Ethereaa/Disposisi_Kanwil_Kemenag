import { supabase } from './supabase';
import { bulkInsertMasuk, bulkInsertKeluar, getNextNomorUrut, suratMasukStore, suratKeluarStore } from './db';
import type { SuratMasuk, SuratKeluar } from '@/types';

// Check whether the old single-user IndexedDB database exists with data.
// The old app used DB name "disposisi-db" with stores "suratMasuk"/"suratKeluar".

const OLD_DB_NAME = 'disposisi-db';
const OLD_STORE_MASUK = 'suratMasuk';
const OLD_STORE_KELUAR = 'suratKeluar';

function readOldStore<T>(store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OLD_DB_NAME);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(store)) {
        db.close();
        resolve([]);
        return;
      }
      const tx = db.transaction(store, 'readonly');
      const getAll = tx.objectStore(store).getAll();
      getAll.onsuccess = () => {
        db.close();
        resolve(getAll.result as T[]);
      };
      getAll.onerror = () => {
        db.close();
        reject(getAll.error);
      };
    };
    req.onerror = () => reject(req.error);
  });
}

interface OldSuratMasuk {
  id: string;
  nomorUrut: number;
  nomorSurat: string;
  nomorAgenda: string;
  tanggalSurat: string;
  pengirim: string;
  tanggalDiterima: string;
  perihal: string;
  tujuanDisposisi: SuratMasuk['tujuanDisposisi'];
  subDisposisi?: string;
  isiDisposisi: string;
  keterangan: string;
  createdAt: number;
  updatedAt: number;
}

interface OldSuratKeluar {
  id: string;
  nomorUrut: number;
  nomorSurat: string;
  tanggalSurat: string;
  pengirim: string;
  perihal: string;
  ditandatangani: boolean;
  keterangan: string;
  createdAt: number;
  updatedAt: number;
}

export async function getLocalMigrationData(): Promise<{ masuk: number; keluar: number } | null> {
  try {
    const masuk = await readOldStore<OldSuratMasuk>(OLD_STORE_MASUK);
    const keluar = await readOldStore<OldSuratKeluar>(OLD_STORE_KELUAR);
    if (masuk.length === 0 && keluar.length === 0) return null;
    return { masuk: masuk.length, keluar: keluar.length };
  } catch {
    return null;
  }
}

export async function migrateLocalDataToCloud(): Promise<{ masuk: number; keluar: number }> {
  const oldMasuk = await readOldStore<OldSuratMasuk>(OLD_STORE_MASUK);
  const oldKeluar = await readOldStore<OldSuratKeluar>(OLD_STORE_KELUAR);

  let baseMasuk = await getNextNomorUrut(suratMasukStore);
  let baseKeluar = await getNextNomorUrut(suratKeluarStore);

  const newMasuk: SuratMasuk[] = oldMasuk
    .sort((a, b) => a.nomorUrut - b.nomorUrut)
    .map((r, i) => ({
      id: r.id,
      nomorUrut: baseMasuk + i,
      nomorSurat: r.nomorSurat,
      nomorAgenda: r.nomorAgenda,
      tanggalSurat: r.tanggalSurat || null,
      pengirim: r.pengirim,
      tanggalDiterima: r.tanggalDiterima || null,
      perihal: r.perihal,
      tujuanDisposisi: r.tujuanDisposisi,
      subDisposisi: (r.subDisposisi ?? null) as SuratMasuk['subDisposisi'],
      isiDisposisi: r.isiDisposisi,
      keterangan: r.keterangan,
      lampiran: [],
      createdAt: new Date(r.createdAt).toISOString(),
      updatedAt: new Date(r.updatedAt).toISOString(),
    }));
  baseMasuk += newMasuk.length;

  const newKeluar: SuratKeluar[] = oldKeluar
    .sort((a, b) => a.nomorUrut - b.nomorUrut)
    .map((r, i) => ({
      id: r.id,
      nomorUrut: baseKeluar + i,
      nomorSurat: r.nomorSurat,
      tanggalSurat: r.tanggalSurat || null,
      pengirim: r.pengirim,
      perihal: r.perihal,
      ditandatangani: r.ditandatangani,
      keterangan: r.keterangan,
      lampiran: [],
      createdAt: new Date(r.createdAt).toISOString(),
      updatedAt: new Date(r.updatedAt).toISOString(),
    }));
  baseKeluar += newKeluar.length;

  await bulkInsertMasuk(newMasuk);
  await bulkInsertKeluar(newKeluar);

  return { masuk: newMasuk.length, keluar: newKeluar.length };
}

export async function deleteOldLocalDatabase(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(OLD_DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}
