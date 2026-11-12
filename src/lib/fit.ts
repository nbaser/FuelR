import { Decoder, Stream } from '@garmin/fitsdk';
import type { Profile, SegmentInput, SessionInput, Sport, Zones } from './types';
import { hrZones, powerZones, zoneIndex } from './zones';

export interface FitPart {
  sport: Sport;
  indoor: boolean;
  start?: Date;
  distanceKm?: number;
  durationMin?: number;
  elevationM?: number;
  avgHr?: number;
  avgPower?: number;
  normalizedPower?: number;
  kcal?: number;
  zones?: Zones;
  zonesSource?: string;
}

export interface FitSummary {
  kind: 'activity' | 'course';
  name?: string;
  date?: Date;
  /** Rad- und Lauf-Teile (Multisport-Dateien enthalten mehrere) */
  parts: FitPart[];
  /** Wechselzeit zwischen Rad und Lauf in Minuten */
  transitionMin?: number;
}

type Rec = { timestamp?: Date; heartRate?: number; power?: number; distance?: number; altitude?: number; enhancedAltitude?: number };

const sportOf = (raw: unknown): Sport | 'transition' | undefined => {
  const s = String(raw ?? '');
  if (/transition/i.test(s)) return 'transition';
  if (/cycl|bik/i.test(s)) return 'bike';
  if (/run|walk|hik/i.test(s)) return 'run';
  return undefined;
};

export async function parseFit(file: File, profile: Profile): Promise<FitSummary> {
  const stream = Stream.fromArrayBuffer(await file.arrayBuffer());
  if (!Decoder.isFIT(stream)) throw new Error('Das ist keine gültige FIT-Datei.');
  const { messages, errors } = new Decoder(stream).read();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = messages as any;
  if (errors.length && !m.recordMesgs?.length && !m.sessionMesgs?.length) throw new Error(`FIT-Datei fehlerhaft: ${errors[0].message}`);

  const records: Rec[] = m.recordMesgs ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessions: any[] = m.sessionMesgs ?? [];
  const course = m.courseMesgs?.[0];

  // Kursdatei (Strecke ohne Zeit)
  if (!sessions.length) {
    const sport = (sportOf(course?.sport) as Sport) || 'bike';
    const lastDist = [...records].reverse().find((r) => r.distance != null)?.distance;
    return {
      kind: 'course',
      name: course?.name,
      parts: [{ sport: sport === ('transition' as Sport) ? 'bike' : sport, indoor: false, distanceKm: lastDist ? lastDist / 1000 : undefined, elevationM: ascentOf(records) }],
    };
  }

  const parts: FitPart[] = [];
  let transitionSec = 0;
  for (const ses of sessions) {
    const sp = sportOf(ses.sport);
    const t = ses.totalTimerTime ?? ses.totalElapsedTime;
    if (sp === 'transition') {
      transitionSec += ses.totalElapsedTime ?? t ?? 0;
      continue;
    }
    if (!sp) continue;
    const start: Date | undefined = ses.startTime instanceof Date ? ses.startTime : undefined;
    const end = start && ses.totalElapsedTime ? new Date(start.getTime() + ses.totalElapsedTime * 1000) : undefined;
    const recs = start && end ? records.filter((r) => r.timestamp && r.timestamp >= start && r.timestamp <= end) : records;
    const part: FitPart = {
      sport: sp,
      indoor: /indoor|virtual|treadmill|trainer/i.test(String(ses.subSport ?? '')),
      start,
      distanceKm: ses.totalDistance ? ses.totalDistance / 1000 : undefined,
      durationMin: t ? Math.round(t / 60) : undefined,
      elevationM: ses.totalAscent ?? ascentOf(recs),
      avgHr: ses.avgHeartRate ?? undefined,
      avgPower: ses.avgPower ?? undefined,
      normalizedPower: ses.normalizedPower ?? undefined,
      kcal: ses.totalCalories ?? undefined,
    };
    Object.assign(part, zonesOf(recs, profile, sp));
    parts.push(part);
  }
  if (!parts.length) throw new Error('Keine Rad- oder Laufaktivität in der Datei gefunden.');

  return {
    kind: 'activity',
    date: parts[0].start,
    parts,
    transitionMin: transitionSec ? Math.max(1, Math.round(transitionSec / 60)) : undefined,
  };
}

function ascentOf(records: Rec[]): number | undefined {
  let ascent = 0,
    ref: number | undefined;
  for (const r of records) {
    const alt = r.enhancedAltitude ?? r.altitude;
    if (alt == null) continue;
    if (ref == null) ref = alt;
    else if (alt - ref > 3) {
      ascent += alt - ref;
      ref = alt;
    } else if (alt < ref) ref = alt;
  }
  return ascent > 0 ? Math.round(ascent) : undefined;
}

function zonesOf(records: Rec[], profile: Profile, sport: Sport): Pick<FitPart, 'zones' | 'zonesSource'> {
  const pz = sport === 'bike' && profile.ftp && records.some((r) => r.power != null) ? powerZones(profile.ftp) : null;
  const bounds = pz ?? (records.some((r) => r.heartRate != null) ? hrZones(profile, sport) : null);
  if (!bounds || records.length < 10) return {};
  const z = [0, 0, 0, 0, 0];
  for (let i = 1; i < records.length; i++) {
    const a = records[i - 1].timestamp,
      b = records[i].timestamp;
    const dt = a && b ? Math.min(10, Math.max(0, (b.getTime() - a.getTime()) / 1000)) : 1;
    const v = pz ? records[i].power : records[i].heartRate;
    if (v == null || dt === 0) continue;
    z[zoneIndex(v, bounds.upper)] += dt;
  }
  const total = z.reduce((x, y) => x + y, 0);
  if (!total) return {};
  const pct = z.map((x) => Math.round((x / total) * 100));
  pct[pct.indexOf(Math.max(...pct))] += 100 - pct.reduce((x, y) => x + y, 0);
  return { zones: pct as Zones, zonesSource: pz ? 'Leistung' : 'Herzfrequenz' };
}

/** Übernimmt die FIT-Werte in die geplante Einheit (Startzeit und Verpflegung bleiben). */
export function applyFit(s: SessionInput, f: FitSummary): SessionInput {
  const next: SessionInput = { ...s, bike: { ...s.bike }, run: { ...s.run } };
  const bike = f.parts.find((p) => p.sport === 'bike');
  const run = f.parts.find((p) => p.sport === 'run');
  next.type = bike && run ? 'brick' : run ? 'run' : 'bike';
  const fill = (seg: SegmentInput, part: FitPart) => {
    seg.indoor = part.indoor;
    if (part.distanceKm) seg.distanceKm = Math.round(part.distanceKm * 10) / 10;
    if (part.durationMin) {
      seg.durationMin = part.durationMin;
      seg.timeMode = 'duration';
    }
    if (part.elevationM != null) seg.elevationM = Math.round(part.elevationM);
    if (part.zones) {
      seg.zones = part.zones;
      seg.intensityMode = 'zones';
    }
  };
  if (bike) fill(next.bike, bike);
  if (run) fill(next.run, run);
  if (f.transitionMin) next.transitionMin = f.transitionMin;
  if (!next.title) {
    const d = f.date ? ` vom ${f.date.toLocaleDateString('de-DE')}` : '';
    next.title = f.name || `Wie ${next.type === 'brick' ? 'Brick' : next.type === 'run' ? 'Lauf' : 'Fahrt'}${d}`;
  }
  return next;
}
