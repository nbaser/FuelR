import { useCallback, useEffect, useState } from 'react';
import type { Product, Profile, SavedPlan, SegmentInput, SessionInput, Sport } from './types';

const PREFIX = 'fuelr.';

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save<T>(key: string, value: T) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent('fuelr-storage', { detail: key }));
  } catch {
    /* Speicher voll oder blockiert */
  }
}

/** useState, das automatisch lokal gespeichert wird und zwischen Komponenten synchron bleibt. */
export function usePersistent<T>(key: string, fallback: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => load(key, fallback));

  useEffect(() => {
    const onChange = (e: Event) => {
      if ((e as CustomEvent).detail === key) setValue(load(key, fallback));
    };
    window.addEventListener('fuelr-storage', onChange);
    return () => window.removeEventListener('fuelr-storage', onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback(
    (v: T | ((prev: T) => T)) => {
      const next = typeof v === 'function' ? (v as (p: T) => T)(load(key, fallback)) : v;
      setValue(next);
      save(key, next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  return [value, set];
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const DEFAULT_PROFILE: Profile = {
  completed: false,
  name: '',
  weightKg: 75,
  heightCm: 180,
  age: 35,
  sex: 'm',
  carbToleranceGph: 60,
  heatAcclimated: false,
  saltySweater: false,
  caffeineSensitive: false,
  lowCarbDiet: false,
  fructoseSensitive: false,
};

export const EXAMPLE_PRODUCTS: Product[] = [
  { id: 'ex-drink', name: 'Beispiel Iso-Drink 2:1', type: 'drink', carbsG: 40, ratio: '2:1', sodiumMg: 300, caffeineMg: 0, servingMl: 500, example: true },
  { id: 'ex-gel', name: 'Beispiel Gel 2:1', type: 'gel', carbsG: 25, ratio: '2:1', sodiumMg: 50, caffeineMg: 0, isotonic: false, example: true },
  { id: 'ex-gel40', name: 'Beispiel Gel 1:0,8 (40 g)', type: 'gel', carbsG: 40, ratio: '1:0.8', sodiumMg: 100, caffeineMg: 0, isotonic: false, example: true },
  { id: 'ex-gelcaf', name: 'Beispiel Koffein-Gel', type: 'gel', carbsG: 25, ratio: '2:1', sodiumMg: 50, caffeineMg: 75, isotonic: false, example: true },
  { id: 'ex-bar', name: 'Beispiel Riegel', type: 'bar', carbsG: 40, ratio: 'other', sodiumMg: 100, caffeineMg: 0, example: true },
];

function nextFullHour(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return toLocalInput(d);
}

export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function defaultBike(): SegmentInput {
  return {
    sport: 'bike',
    indoor: false,
    distanceKm: 80,
    elevationM: 600,
    timeMode: 'duration',
    durationMin: 180,
    speedKmh: 27,
    intensityMode: 'zones',
    zones: [10, 70, 15, 5, 0],
    drinkId: 'ex-drink',
    feedIds: ['ex-gel'],
    isoBottles: 1,
    waterBottles: 1,
    bottleMl: 750,
    refillPossible: false,
    drinkRefill: false,
  };
}

export function defaultRun(): SegmentInput {
  return {
    sport: 'run',
    indoor: false,
    distanceKm: 10,
    elevationM: 50,
    timeMode: 'duration',
    durationMin: 60,
    paceSec: 330,
    intensityMode: 'zones',
    zones: [10, 70, 20, 0, 0],
    drinkId: undefined,
    feedIds: ['ex-gel'],
    isoBottles: 0,
    waterBottles: 1,
    bottleMl: 250,
    refillPossible: false,
    drinkRefill: false,
  };
}

export function defaultSession(): SessionInput {
  return {
    version: 2,
    title: '',
    type: 'bike',
    start: nextFullHour(),
    goal: 'training',
    caffeine: false,
    nextSessionWithin24h: false,
    priorLoad: 'normal',
    priorCarbs: 'normal',
    bike: defaultBike(),
    run: defaultRun(),
    transitionMin: 3,
    manualWeather: false,
    manualTempC: 20,
    manualHumidity: 50,
  };
}

/** Ältere gespeicherte Einheiten (v1, ohne Segmente) in das neue Format übernehmen. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrateSession(raw: any): SessionInput {
  const d = defaultSession();
  if (!raw || typeof raw !== 'object') return d;
  if (raw.version === 2) return { ...d, ...raw, bike: { ...d.bike, ...raw.bike }, run: { ...d.run, ...raw.run } };
  const sport: Sport = raw.sport === 'run' ? 'run' : 'bike';
  const seg: SegmentInput = {
    ...(sport === 'bike' ? d.bike : d.run),
    indoor: !!raw.indoor,
    distanceKm: raw.distanceKm,
    elevationM: raw.elevationM ?? 0,
    durationMin: raw.durationMin ?? 60,
    intensityMode: raw.intensityMode ?? 'zones',
    zones: raw.zones ?? d.bike.zones,
    targetPower: raw.targetPower,
    targetHr: raw.targetHr,
    paceSec: raw.targetPaceSec,
    drinkId: raw.drinkId,
    feedIds: raw.feedIds ?? [],
    bottleMl: raw.bottleMl ?? 750,
    isoBottles: raw.drinkId ? Math.max(1, Math.ceil((raw.bottles ?? 2) / 2)) : 0,
    waterBottles: raw.drinkId ? Math.floor((raw.bottles ?? 2) / 2) : raw.bottles ?? 2,
    refillPossible: !!raw.refillPossible,
  };
  return {
    ...d,
    title: raw.title ?? '',
    type: sport,
    start: raw.start ?? d.start,
    goal: raw.goal ?? 'training',
    caffeine: !!raw.caffeine,
    nextSessionWithin24h: !!raw.nextSessionWithin24h,
    [sport]: seg,
    manualWeather: !!raw.manualWeather,
    manualTempC: raw.manualTempC ?? 20,
    manualHumidity: raw.manualHumidity ?? 50,
  };
}

/** Komplette Datensicherung als JSON */
export function exportAll(): string {
  const data: Record<string, unknown> = {};
  for (const k of ['profile', 'products', 'plans', 'draft']) data[k] = load(k, null);
  return JSON.stringify({ app: 'fuelr', version: 1, exportedAt: new Date().toISOString(), data }, null, 2);
}

export function importAll(json: string) {
  const parsed = JSON.parse(json);
  if (parsed?.app !== 'fuelr' || !parsed.data) throw new Error('Keine FuelR-Sicherung');
  for (const [k, v] of Object.entries(parsed.data)) if (v != null) save(k, v);
}

export type { Product, Profile, SavedPlan, SessionInput };
