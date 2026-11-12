import type { Profile, SegmentInput, Sport } from './types';

/**
 * Intensität wird intern als "I" geführt (≈ Intensity Factor, Anteil an der Schwelle).
 * Repräsentative Werte für die 5 Zonen:
 */
export const ZONE_I = [0.5, 0.65, 0.83, 0.98, 1.1];
export const ZONE_NAMES = ['Z1 Regeneration', 'Z2 Grundlage', 'Z3 Tempo', 'Z4 Schwelle', 'Z5 VO2max'];
export const ZONE_SHORT = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'];

/** Lineare Interpolation einer Tabelle über ZONE_I (Werte außerhalb werden begrenzt). */
export function byIntensity(I: number, table: number[]): number {
  if (I <= ZONE_I[0]) return table[0];
  for (let i = 1; i < ZONE_I.length; i++) {
    if (I <= ZONE_I[i]) {
      const t = (I - ZONE_I[i - 1]) / (ZONE_I[i] - ZONE_I[i - 1]);
      return table[i - 1] + t * (table[i] - table[i - 1]);
    }
  }
  return table[table.length - 1];
}

export function nearestZone(I: number): number {
  let best = 0;
  for (let i = 1; i < ZONE_I.length; i++) if (Math.abs(ZONE_I[i] - I) < Math.abs(ZONE_I[best] - I)) best = i;
  return best;
}

export interface ZoneBounds {
  /** Obergrenzen Z1..Z4 (Z5 ist offen) */
  upper: [number, number, number, number];
  method: string;
}

/** HF-Zonen: Schwellen-HF (Friel) > Herzfrequenzreserve (Karvonen) > %HFmax */
export function hrZones(p: Profile, sport: Sport): ZoneBounds | null {
  const lthr = sport === 'bike' ? p.lthrBike ?? p.lthrRun : p.lthrRun ?? p.lthrBike;
  if (lthr) {
    const f = sport === 'bike' ? [0.81, 0.9, 0.94, 1.0] : [0.85, 0.9, 0.95, 1.0];
    return { upper: f.map((x) => Math.round(lthr * x)) as ZoneBounds['upper'], method: `Schwellen-HF ${lthr} (Friel)` };
  }
  if (p.hrMax && p.hrRest) {
    const r = p.hrMax - p.hrRest;
    return {
      upper: [0.6, 0.7, 0.8, 0.9].map((x) => Math.round(p.hrRest! + r * x)) as ZoneBounds['upper'],
      method: 'Herzfrequenzreserve (Karvonen)',
    };
  }
  if (p.hrMax) {
    return { upper: [0.68, 0.78, 0.87, 0.93].map((x) => Math.round(p.hrMax! * x)) as ZoneBounds['upper'], method: '% HFmax' };
  }
  return null;
}

export function powerZones(ftp?: number): ZoneBounds | null {
  if (!ftp) return null;
  return { upper: [0.55, 0.75, 0.9, 1.05].map((x) => Math.round(ftp * x)) as ZoneBounds['upper'], method: `FTP ${ftp} W (Coggan, 5 Zonen)` };
}

/** Pace-Zonen als Geschwindigkeitsanteil der Schwelle (Friel). Rückgabe: Pace-Grenzen in s/km (langsam → schnell). */
export function paceZones(thresholdPaceSec?: number): ZoneBounds | null {
  if (!thresholdPaceSec) return null;
  return {
    upper: [1.29, 1.14, 1.06, 0.99].map((x) => Math.round(thresholdPaceSec * x)) as ZoneBounds['upper'],
    method: 'Schwellenpace (Friel)',
  };
}

export function zoneIndex(value: number, upper: number[], inverted = false): number {
  for (let i = 0; i < upper.length; i++) {
    if (inverted ? value > upper[i] : value < upper[i]) return i;
  }
  return 4;
}

export function intensityFromHr(hr: number, p: Profile, sport: Sport): number | null {
  const lthr = sport === 'bike' ? p.lthrBike ?? p.lthrRun : p.lthrRun ?? p.lthrBike;
  let I: number | null = null;
  if (lthr) I = 0.55 + (hr / lthr - 0.8) * 2.25;
  else if (p.hrMax && p.hrRest) I = 0.5 + ((hr - p.hrRest) / (p.hrMax - p.hrRest) - 0.5) * 1.375;
  else if (p.hrMax) I = 0.6 + (hr / p.hrMax - 0.7) * 1.8;
  return I == null ? null : clamp(I, 0.4, 1.2);
}

export interface IntensityInfo {
  I: number;
  source: string;
  fallback?: string;
}

/** Intensität eines Segments. effPaceSec = Ø-Pace aus Distanz/Zeit, falls bekannt. */
export function segmentIntensity(s: SegmentInput, p: Profile, effPaceSec?: number): IntensityInfo {
  const fromZones = (): number => {
    const sum = s.zones.reduce((a, b) => a + b, 0);
    if (!sum) return ZONE_I[1];
    return s.zones.reduce((acc, pct, i) => acc + pct * ZONE_I[i], 0) / sum;
  };

  switch (s.intensityMode) {
    case 'power':
      if (p.ftp && s.targetPower) return { I: clamp(s.targetPower / p.ftp, 0.3, 1.3), source: `${s.targetPower} W = ${Math.round((s.targetPower / p.ftp) * 100)} % FTP` };
      return { I: fromZones(), source: 'Zonenverteilung', fallback: 'Für Watt-Planung FTP im Profil und Ø-Watt angeben.' };
    case 'pace': {
      const pace = effPaceSec ?? s.paceSec;
      if (p.thresholdPaceSec && pace) return { I: clamp(p.thresholdPaceSec / pace, 0.3, 1.3), source: `Pace ${fmtPace(pace)} /km` };
      return { I: fromZones(), source: 'Zonenverteilung', fallback: 'Für Pace-Planung Schwellenpace im Profil und Ø-Pace angeben.' };
    }
    case 'hr': {
      const I = s.targetHr ? intensityFromHr(s.targetHr, p, s.sport) : null;
      if (I != null) return { I, source: `Ø HF ${s.targetHr}` };
      return { I: fromZones(), source: 'Zonenverteilung', fallback: 'Für HF-Planung HFmax oder Schwellen-HF im Profil angeben.' };
    }
    default:
      return { I: fromZones(), source: 'Zonenverteilung' };
  }
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function fmtPace(sec?: number): string {
  if (!sec || !isFinite(sec)) return '–';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function parsePace(text: string): number | undefined {
  const m = text.trim().match(/^(\d{1,2})[:.,](\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = Number(text.replace(',', '.'));
  return isFinite(n) && n > 0 ? Math.round(n * 60) : undefined;
}
