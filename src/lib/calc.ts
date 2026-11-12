import type { Product, Profile, SegmentInput, SessionInput, Sport, WeatherSummary } from './types';
import { byIntensity, clamp, fmtPace, nearestZone, segmentIntensity, ZONE_NAMES } from './zones';

/*
 * Berechnungsgrundlagen (Orientierungswerte, keine medizinische Beratung):
 * - Intra-KH: ACSM / Jeukendrup – <45 min keine, 1–2,5 h 30–60 g/h, >2,5 h bis 90 g/h, trainiert bis 120 g/h.
 *   >60 g/h nur mit Glukose+Fruktose (2:1), >90 g/h besser 1:0,8.
 * - Pre: 1–4 g/kg KH 1–4 h vorher, 5–7 ml/kg Flüssigkeit 2–4 h vorher, Koffein 3 mg/kg ~60 min vorher.
 * - Post: 1,0–1,2 g/kg/h KH (schnelle Erholung), 0,3 g/kg Protein, 125–150 % des Flüssigkeitsdefizits.
 * - Carb-Loading: 36–48 h vor Rennen >90 min 8–12 g/kg/Tag.
 * - Brick: KH auf dem Rad vorladen (Magen verträgt dort mehr), beim Laufen etwas weniger.
 */

// Tabellen über die Intensität I (siehe zones.ts ZONE_I = [0.5, 0.65, 0.83, 0.98, 1.1])
const CHO_FRACTION = [0.35, 0.5, 0.68, 0.82, 0.92];
const MET_BIKE = [5, 7, 9.5, 12, 14];
const MET_RUN = [7, 9, 11.5, 13.5, 15.5];
const CARB_MULT = [0.6, 0.85, 1.0, 1.15, 1.2];
const SWEAT_MULT = [0.7, 0.9, 1.1, 1.3, 1.4];
const RUN_SPEED_FRAC = [0.72, 0.82, 0.92, 0.99, 1.05];
/** Energiegehalt von Kohlenhydraten (Atwater) */
const KCAL_PER_G_CARB = 4;
/** Leistung in W/kg je Intensität, falls keine FTP bekannt */
const WKG_FALLBACK = [1.3, 1.9, 2.5, 3.0, 3.4];
/** Pace (s/km) je Intensität, falls keine Schwellenpace bekannt */
const PACE_FALLBACK = [420, 370, 320, 290, 265];

// ---------------------------------------------------------------- Körpermaße

/** Grundumsatz nach Mifflin-St Jeor (kcal/Tag) aus Gewicht, Größe, Alter und Geschlecht */
export function bmr(p: Profile): number {
  const kg = p.weightKg || 70;
  const cm = p.heightCm || 178;
  const age = p.age || 35;
  const sexAdj = p.sex === 'm' ? 5 : p.sex === 'w' ? -161 : -78;
  return 10 * kg + 6.25 * cm - 5 * age + sexAdj;
}

/**
 * Korrekturfaktor für MET-Schätzungen: 1 MET = 1 kcal/kg/h setzt einen pauschalen Grundumsatz voraus.
 * Mit dem individuellen Grundumsatz (Größe, Alter, Geschlecht) wird der Verbrauch genauer ("corrected MET").
 */
export function metFactor(p: Profile): number {
  return clamp(bmr(p) / ((p.weightKg || 70) * 24), 0.8, 1.1);
}

/** Luftwiderstandsfläche CdA (m²) aus Größe und Gewicht – Frontfläche nach Bassett et al., Cd ≈ 0,94 (Oberlenker) */
export function bikeCdA(p: Profile): number {
  const h = (p.heightCm || 178) / 100;
  const kg = p.weightKg || 75;
  const area = 0.0293 * h ** 0.725 * kg ** 0.425 + 0.0604;
  return 0.94 * area;
}

/** Frauen verbrennen bei gleicher relativer Intensität etwas mehr Fett */
const SEX_CHO_ADJ = { m: 0, w: -0.04, d: -0.02 } as const;
/** Frauen schwitzen bei gleicher Belastung im Mittel weniger */
const SEX_SWEAT = { m: 1, w: 0.85, d: 0.92 } as const;

export interface BodyInfo {
  bmr: number;
  metFactor: number;
  cdA: number;
  proteinGPerKg: number;
}

export function bodyInfo(p: Profile): BodyInfo {
  return { bmr: Math.round(bmr(p)), metFactor: metFactor(p), cdA: bikeCdA(p), proteinGPerKg: (p.age || 35) >= 50 ? 0.4 : 0.3 };
}

// ---------------------------------------------------------------- Glykogen (Vorbelastung)

export type GlycogenLevel = 'loaded' | 'full' | 'reduced' | 'low';
export interface GlycogenInfo {
  level: GlycogenLevel;
  label: string;
  /** Faktor auf den KH-Bedarf unterwegs */
  carbMult: number;
  /** Zusätzliche g/kg KH in der Mahlzeit vorher */
  preExtraGPerKg: number;
  /** Erste Verpflegung spätestens nach … min */
  firstFeedMax: number;
}

const GLYCOGEN: Record<SessionInput['priorCarbs'], Record<SessionInput['priorLoad'], GlycogenLevel>> = {
  high: { rest: 'loaded', normal: 'full', hard: 'full' },
  normal: { rest: 'full', normal: 'full', hard: 'reduced' },
  low: { rest: 'reduced', normal: 'reduced', hard: 'low' },
};

export function glycogenState(s: Pick<SessionInput, 'priorLoad' | 'priorCarbs'>): GlycogenInfo {
  const level = GLYCOGEN[s.priorCarbs ?? 'normal'][s.priorLoad ?? 'normal'];
  return {
    loaded: { level, label: 'aufgeladen', carbMult: 1, preExtraGPerKg: 0, firstFeedMax: 30 },
    full: { level, label: 'normal gefüllt', carbMult: 1, preExtraGPerKg: 0, firstFeedMax: 30 },
    reduced: { level, label: 'teilweise geleert', carbMult: 1.1, preExtraGPerKg: 0.5, firstFeedMax: 15 },
    low: { level, label: 'stark geleert', carbMult: 1.2, preExtraGPerKg: 1, firstFeedMax: 10 },
  }[level];
}

export type NoteLevel = 'warn' | 'info' | 'ok';
export interface Note {
  level: NoteLevel;
  text: string;
}

export interface TimedItem {
  /** Minuten relativ zum Start (negativ = vorher; bei Post: nach Ende) */
  offsetMin: number;
  title: string;
  detail: string;
  carbsG?: number;
  proteinG?: number;
  ml?: number;
  sodiumMg?: number;
  caffeineMg?: number;
}

export type IntraEventType = 'feed' | 'drink' | 'refill';
export interface IntraEvent {
  /** Minuten ab Start der gesamten Einheit */
  min: number;
  type: IntraEventType;
  label: string;
  sport: Sport;
  carbsG?: number;
  ml?: number;
  caffeineMg?: number;
  productId?: string;
}

export interface PackItem {
  label: string;
  count: string;
}

export interface SegmentResult {
  sport: Sport;
  label: string;
  startMin: number;
  durationMin: number;
  durationFromSpeed: boolean;
  speedLabel: string;
  suggestedSpeedKmh?: number;
  suggestedPaceSec?: number;
  distanceKm?: number;
  elevationM: number;
  I: number;
  intensitySource: string;
  zoneLabel: string;
  kcalPerH: number;
  kcal: number;
  energyMethod: string;
  avgPower?: number;
  carbBurnGph: number;
  fatBurnGph: number;
  carbTargetGph: number;
  sweatLph: number;
  fluidMlPerH: number;
  /** Natrium-Ziel für die Verpflegung (0 = optional) */
  sodiumMgPerH: number;
  /** Geschätzter Natriumbedarf (~60 % des Schweißverlusts), unabhängig von der Dauer */
  sodiumNeedMgPerH: number;
  massLossKg: number;
  // Verpflegung
  events: IntraEvent[];
  drink?: {
    product: Product;
    servingsPerBottle: number;
    carbsPerBottle: number;
    concentrationGL: number;
    mlPerH: number;
    lastsUntilMin: number;
  };
  waterMlPerH: number;
  feedCounts: Record<string, number>;
  autoFeeds: boolean;
  carbs: { total: number; perH: number; drinkPerH: number; feedPerH: number };
  sodium: { total: number; perH: number };
  caffeineMg: number;
  fluidTotalMl: number;
  refills: number;
  fructoseShare: number | null;
  ratioLabel: string;
  packing: PackItem[];
}

export interface PlanResult {
  type: SessionInput['type'];
  totalMin: number;
  durationH: number;
  segments: SegmentResult[];
  intensity: number;
  zoneLabel: string;
  kcalTotal: number;
  kcalPerH: number;
  /** Bedarf vor Begrenzung durch die Verträglichkeit */
  carbNeedGph: number;
  carbTargetGph: number;
  carbTargetReason: string;
  toleranceExceeded: boolean;
  planned: {
    carbsPerH: number;
    drinkPerH: number;
    feedPerH: number;
    carbsTotal: number;
    /** Energie aus Iso + Gels/Riegel (4 kcal pro g KH) */
    kcalTotal: number;
    kcalPerH: number;
    drinkKcal: number;
    feedKcal: number;
  };
  ratioRecommendation: string;
  massLossKg: number;
  massLossPct: number;
  sodiumImportant: boolean;
  /** Natrium über die ganze Einheit: Bedarf vs. was die Produkte liefern */
  sodiumBalance: { needPerH: number; needTotal: number; suppliedPerH: number; suppliedTotal: number; coveragePct: number };
  weather: WeatherSummary;
  body: BodyInfo;
  glycogen: GlycogenInfo;
  carbLoading?: { days: string; gPerKg: string; gramsPerDay: string; detail: string };
  pre: TimedItem[];
  events: IntraEvent[];
  post: TimedItem[];
  notes: Note[];
}

const r5 = (v: number) => Math.round(v / 5) * 5;
const r10 = (v: number) => Math.round(v / 10) * 10;
const r50 = (v: number) => Math.round(v / 50) * 50;

const FRUCTOSE_SHARE: Record<Product['ratio'], number | null> = {
  '2:1': 1 / 3,
  '1:0.8': 0.8 / 1.8,
  glucose: 0,
  other: null,
};

// ---------------------------------------------------------------- Tempo & Dauer

/** Geschätzte Ø-Geschwindigkeit Rad (km/h) aus Leistung, Gewicht und Höhenmetern */
export function suggestBikeSpeed(p: Profile, I: number, distanceKm?: number, elevationM = 0, indoor = false): number {
  const kg = p.weightKg || 75;
  const watts = p.ftp ? I * p.ftp : byIntensity(I, WKG_FALLBACK) * kg;
  const m = kg + 9;
  const grade = distanceKm ? elevationM / (distanceKm * 1000) : 0;
  const pEff = watts / 1.08;
  const cdA = bikeCdA(p);
  const power = (v: number) => 0.005 * m * 9.81 * v + (indoor ? 0 : 0.5 * 1.2 * cdA * v ** 3) + m * 9.81 * grade * v;
  let lo = 1,
    hi = 25;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (power(mid) > pEff) hi = mid;
    else lo = mid;
  }
  // Abfahrten bringen weniger zurück als Anstiege kosten, plus Kreuzungen/Ampeln
  const kmh = lo * 3.6 * (0.95 - Math.min(0.12, grade * 4));
  return Math.round(kmh * 2) / 2;
}

/** Geschätzte Ø-Pace Laufen (s/km) aus Schwellenpace und Höhenmetern */
export function suggestRunPace(p: Profile, I: number, distanceKm?: number, elevationM = 0): number {
  const base = p.thresholdPaceSec ? p.thresholdPaceSec / byIntensity(I, RUN_SPEED_FRAC) : byIntensity(I, PACE_FALLBACK);
  const hmPerKm = distanceKm ? elevationM / distanceKm : 0;
  return Math.round(base + hmPerKm * 0.5); // ~5 s/km pro 10 hm/km
}

function resolveDuration(seg: SegmentInput, p: Profile, I: number) {
  const sugSpeed = seg.sport === 'bike' ? suggestBikeSpeed(p, I, seg.distanceKm, seg.elevationM, seg.indoor) : undefined;
  const sugPace = seg.sport === 'run' ? suggestRunPace(p, I, seg.distanceKm, seg.elevationM) : undefined;
  let durationMin = seg.durationMin || 0;
  let fromSpeed = false;
  if (seg.timeMode === 'speed' && seg.distanceKm) {
    fromSpeed = true;
    if (seg.sport === 'bike') durationMin = (seg.distanceKm / (seg.speedKmh || sugSpeed!)) * 60;
    else durationMin = (seg.distanceKm * (seg.paceSec || sugPace!)) / 60;
    durationMin = Math.round(durationMin);
  }
  return { durationMin, fromSpeed, sugSpeed, sugPace };
}

// ---------------------------------------------------------------- Energie

function energy(p: Profile, seg: SegmentInput, I: number, H: number) {
  const kg = p.weightKg || 70;
  if (seg.sport === 'bike') {
    let watts: number | undefined;
    let method = '';
    if (seg.intensityMode === 'power' && seg.targetPower) {
      watts = seg.targetPower;
      method = 'Ø-Leistung';
    } else if (p.ftp) {
      watts = I * p.ftp;
      method = 'FTP × Intensität';
    } else if (!seg.indoor && seg.distanceKm && H > 0) {
      const v = (seg.distanceKm * 1000) / (H * 3600);
      const m = kg + 9;
      const climb = (seg.elevationM || 0) / (H * 3600);
      watts = (0.005 * m * 9.81 * v + 0.5 * 1.2 * bikeCdA(p) * v ** 3 + m * 9.81 * climb) * 1.08;
      method = 'Physik-Schätzung aus Tempo, Höhenmetern und Körpermaßen';
    }
    if (watts) return { kcalPerH: watts * 3.58, method: `${method} (Ø ${Math.round(watts)} W)`, avgPower: Math.round(watts) };
    return { kcalPerH: byIntensity(I, MET_BIKE) * kg * metFactor(p), method: 'MET-Schätzung (ohne FTP, korrigiert um Grundumsatz)' };
  }
  if (seg.distanceKm && H > 0) {
    const kcal = kg * seg.distanceKm * 1.0 + 0.6 * kg * ((seg.elevationM || 0) / 100);
    return { kcalPerH: kcal / H, method: '≈ 1 kcal/kg/km + Höhenmeter' };
  }
  if (p.thresholdPaceSec) {
    const speed = (3600 / p.thresholdPaceSec) * byIntensity(I, RUN_SPEED_FRAC);
    return { kcalPerH: kg * speed, method: 'Schwellenpace × Intensität' };
  }
  return { kcalPerH: byIntensity(I, MET_RUN) * kg * metFactor(p), method: 'MET-Schätzung (korrigiert um Grundumsatz)' };
}

function sweatRate(p: Profile, sport: Sport, indoor: boolean, I: number, w: WeatherSummary) {
  const kg = p.weightKg || 70;
  const t = w.tempC;
  const tempFactor = t > 15 ? 1 + 0.045 * (t - 15) : Math.max(0.6, 1 + 0.02 * (t - 15));
  const humFactor = w.humidity > 60 ? 1 + 0.005 * (w.humidity - 60) : 1;
  const sunFactor = !indoor && (w.radiationMax ?? 0) > 600 ? 1.05 : 1;
  const indoorFactor = indoor ? (sport === 'bike' ? 1.3 : 1.15) : 1;
  const sportFactor = sport === 'run' ? 1.15 : 1;
  const heatAcc = p.heatAcclimated && t > 22 ? 1.1 : 1;
  const sexFactor = SEX_SWEAT[p.sex] ?? 1;
  return 0.55 * byIntensity(I, SWEAT_MULT) * Math.pow(kg / 70, 0.75) * tempFactor * humFactor * sunFactor * indoorFactor * sportFactor * heatAcc * sexFactor;
}

// ---------------------------------------------------------------- Hauptfunktion

export function activeSegments(s: SessionInput): SegmentInput[] {
  return s.type === 'brick' ? [s.bike, s.run] : [s.type === 'run' ? s.run : s.bike];
}

export function computePlan(p: Profile, s: SessionInput, products: Product[], weather: WeatherSummary): PlanResult {
  const notes: Note[] = [];
  const kg = p.weightKg || 70;
  const segInputs = activeSegments(s);
  const brick = s.type === 'brick';
  const indoorWeather = (): WeatherSummary => ({ source: 'indoor', tempC: s.manualTempC, humidity: s.manualHumidity });

  // 1) Segmente vorbereiten: Intensität, Dauer, Energie, Flüssigkeit
  let cursor = 0;
  const pre = segInputs.map((seg, idx) => {
    const label = seg.sport === 'bike' ? 'Rad' : 'Lauf';
    // Intensität ggf. mit Pace aus Distanz/Zeit
    const firstI = segmentIntensity(seg, p, undefined);
    const dur = resolveDuration(seg, p, firstI.I);
    const effPace = seg.sport === 'run' && seg.distanceKm && dur.durationMin ? (dur.durationMin * 60) / seg.distanceKm : undefined;
    const { I, source, fallback } = seg.sport === 'run' ? segmentIntensity(seg, p, effPace) : firstI;
    if (fallback) notes.push({ level: 'info', text: (brick ? `${label}: ` : '') + fallback });
    const D = Math.max(0, dur.durationMin);
    const H = D / 60;
    const w = seg.indoor ? indoorWeather() : weather;
    const en = energy(p, seg, I, H);
    let choFrac = byIntensity(I, CHO_FRACTION) + (SEX_CHO_ADJ[p.sex] ?? 0);
    if (p.lowCarbDiet) choFrac = Math.max(0.2, choFrac - 0.1);
    const sweat = sweatRate(p, seg.sport, seg.indoor, I, w);
    const startMin = cursor;
    cursor += D + (brick && idx === 0 ? s.transitionMin : 0);
    const speedLabel =
      seg.distanceKm && D
        ? seg.sport === 'bike'
          ? `Ø ${fmtNum(seg.distanceKm / H, 1)} km/h`
          : `Ø ${fmtPace((D * 60) / seg.distanceKm)} /km`
        : '';
    return { seg, label, I, source, D, H, w, en, choFrac, sweat, startMin, dur, speedLabel };
  });

  const totalMin = cursor;
  const totalH = totalMin / 60;
  const moveMin = pre.reduce((a, x) => a + x.D, 0);
  const Imean = moveMin ? pre.reduce((a, x) => a + x.I * x.D, 0) / moveMin : 0.65;
  const zoneLabel = ZONE_NAMES[nearestZone(Imean)];

  // 2) KH-Bedarf über die gesamte Einheit
  const D = totalMin;
  const gly = glycogenState(s);
  let base: number;
  if (D < 45) base = 0;
  else if (D < 75) base = Imean >= 0.85 || gly.level === 'low' ? 30 : 0;
  else if (D < 120) base = 45;
  else if (D < 180) base = 60;
  else if (D < 240) base = 75;
  else base = 90;
  const goalMult = { easy: 0.6, training: 1.0, key: 1.15, race: 1.3 }[s.goal];
  let need = base * byIntensity(Imean, CARB_MULT) * goalMult * gly.carbMult;
  let reason = `Dauer ${fmtDuration(D)}, ${zoneLabel}, Ziel „${goalLabel(s.goal)}“`;
  if (gly.carbMult > 1) reason += `, Glykogen ${gly.label} (+${Math.round((gly.carbMult - 1) * 100)} %)`;
  if (s.goal === 'easy' && D < 120) {
    need = 0;
    reason = 'Lockere Einheit unter 2 h – Kohlenhydrate optional (Train-low möglich)';
    if (gly.level === 'low' && D >= 45) {
      need = 30;
      reason = 'Lockere Einheit, aber Glykogen stark geleert – 30 g/h statt nüchtern';
    } else if (gly.level === 'reduced' && D >= 60) {
      need = 20;
      reason = 'Lockere Einheit, Glykogen teilweise geleert – 20 g/h';
    } else if (D >= 60) notes.push({ level: 'info', text: 'Lockere Einheit: Wasser reicht. Optional 20–30 g/h, wenn du dich schlapp fühlst.' });
  }
  if (D >= 150 && s.goal !== 'easy') need = Math.max(need, 60);
  if (s.goal === 'race' && D >= 150) need = Math.max(need, 90);
  if (s.goal === 'training' || s.goal === 'easy') {
    const burn = moveMin ? pre.reduce((a, x) => a + ((x.en.kcalPerH * x.choFrac) / 4) * x.D, 0) / moveMin : 0;
    // Mit geleerten Speichern muss mehr vom Verbrauch von außen kommen
    const cap = Math.max(30, burn * gly.carbMult);
    if (need > cap) {
      need = cap;
      reason += ' · begrenzt auf geschätzten KH-Verbrauch';
    }
  }
  need = r5(Math.min(need, 120));
  const tol = p.carbToleranceGph;
  const toleranceExceeded = need > tol;
  if (toleranceExceeded)
    notes.push({
      level: 'warn',
      text: `Bedarf ~${need} g KH/h liegt über deiner Verträglichkeit von ${tol} g/h. Der Plan ist auf ${tol} g/h begrenzt – Leistung kann zum Ende nachlassen. Darmtraining erhöht die Toleranz.`,
    });
  const target = Math.min(need, tol);
  if (D >= 45 && D < 75 && target === 0 && Imean >= 0.75)
    notes.push({ level: 'info', text: 'Kurz und intensiv: Mundspülung mit Iso-Drink kann die Leistung verbessern, ohne zu essen.' });
  if (gly.level === 'low' && (s.goal === 'key' || s.goal === 'race'))
    notes.push({
      level: 'warn',
      text: `Glykogen stark geleert (harte Belastung + wenig KH am Vortag): Die Qualität der ${s.goal === 'race' ? 'Wettkampf-Leistung' : 'Key-Session'} leidet deutlich. Wenn möglich verschieben – sonst vorher konsequent auffüllen und früh mit der Verpflegung beginnen.`,
    });
  else if (gly.level === 'low')
    notes.push({ level: 'info', text: 'Glykogen stark geleert: Plan startet die Verpflegung früher und mit mehr KH. Ohne KH wäre das eher Raubbau als Training.' });
  else if (gly.level === 'reduced' && s.goal === 'race')
    notes.push({ level: 'warn', text: 'Vor dem Wettkampf sind die Speicher nicht voll – Carb-Loading (siehe Pre) möglichst noch nachholen.' });
  else if (gly.level === 'reduced' && s.goal !== 'easy')
    notes.push({ level: 'info', text: 'Glykogen teilweise geleert: mehr KH vorher, Verpflegung früher und ca. 10 % höher angesetzt.' });

  // 3) Segmente berechnen
  const sodiumImportant = D >= 90 || (D >= 60 && weather.tempC >= 25);
  const segments: SegmentResult[] = pre.map((x) => {
    let segTarget = target;
    if (brick) segTarget = x.seg.sport === 'bike' ? Math.min(tol, r5(target * 1.1)) : Math.min(tol, r5(target * 0.8));
    const fluidCap = x.seg.sport === 'run' ? 800 : 1000;
    let fluid = r50(clamp(x.sweat * 1000 * 0.7, D >= 60 ? 300 : 0, fluidCap));
    if (D < 45) fluid = r50(Math.min(fluid, 300));
    const sodiumConc = p.saltySweater ? 1200 : 800;
    const sodiumNeed = r50(clamp(x.sweat * sodiumConc * 0.6, 200, 1000));
    const sodium = sodiumImportant ? sodiumNeed : 0;
    const intra = buildIntra(p, s, x.seg, products, x.startMin, x.D, segTarget, fluid, sodium, notes, brick ? `${x.label}: ` : '', gly.firstFeedMax);
    return {
      sport: x.seg.sport,
      label: x.label,
      startMin: x.startMin,
      durationMin: x.D,
      durationFromSpeed: x.dur.fromSpeed,
      speedLabel: x.speedLabel,
      suggestedSpeedKmh: x.dur.sugSpeed,
      suggestedPaceSec: x.dur.sugPace,
      distanceKm: x.seg.distanceKm,
      elevationM: x.seg.elevationM,
      I: x.I,
      intensitySource: x.source,
      zoneLabel: ZONE_NAMES[nearestZone(x.I)],
      kcalPerH: Math.round(x.en.kcalPerH),
      kcal: Math.round(x.en.kcalPerH * x.H),
      energyMethod: x.en.method,
      avgPower: x.en.avgPower,
      carbBurnGph: Math.round((x.en.kcalPerH * x.choFrac) / 4),
      fatBurnGph: Math.round((x.en.kcalPerH * (1 - x.choFrac)) / 9),
      carbTargetGph: segTarget,
      sweatLph: x.sweat,
      fluidMlPerH: fluid,
      sodiumMgPerH: sodium,
      sodiumNeedMgPerH: sodiumNeed,
      massLossKg: Math.max(0, (x.sweat - fluid / 1000) * x.H),
      ...intra,
    };
  });

  const events = segments.flatMap((sg) => sg.events).sort((a, b) => a.min - b.min || order(a.type) - order(b.type));
  const kcalTotal = segments.reduce((a, sg) => a + sg.kcal, 0);
  const massLossKg = segments.reduce((a, sg) => a + sg.massLossKg, 0);
  const massLossPct = (massLossKg / kg) * 100;
  const carbsTotal = segments.reduce((a, sg) => a + sg.carbs.total, 0);
  const sodiumNeedTotal = segments.reduce((a, sg) => a + sg.sodiumNeedMgPerH * (sg.durationMin / 60), 0);
  const sodiumSuppliedTotal = segments.reduce((a, sg) => a + sg.sodium.total, 0);
  const drinkTotal = segments.reduce((a, sg) => a + sg.carbs.drinkPerH * (sg.durationMin / 60), 0);
  const plannedTarget = moveMin ? segments.reduce((a, sg) => a + sg.carbTargetGph * sg.durationMin, 0) / moveMin : 0;

  // Hinweise
  if (weather.source === 'forecast' || weather.source === 'manual') {
    const hot = Math.max(weather.tempMaxC ?? weather.tempC, weather.apparentMaxC ?? weather.tempC);
    if (hot >= 30) notes.push({ level: 'warn', text: `Hitze (bis ${Math.round(hot)} °C gefühlt): früh starten, kalte Getränke, Natrium erhöhen, Intensität anpassen.` });
    else if (hot >= 25) notes.push({ level: 'info', text: 'Warm: Trinken früh beginnen, nicht erst bei Durst.' });
    if (weather.tempC < 5) notes.push({ level: 'info', text: 'Kälte: Das Durstgefühl ist reduziert – trotzdem nach Plan trinken. Gels körpernah tragen, damit sie nicht zäh werden.' });
    if ((weather.precipProb ?? 0) >= 60) notes.push({ level: 'info', text: `Regenwahrscheinlichkeit ${weather.precipProb} % – Verpflegung wasserdicht verpacken.` });
  }
  if (segInputs.some((sg) => sg.indoor && sg.sport === 'bike')) notes.push({ level: 'info', text: 'Indoor: Ohne Fahrtwind schwitzt du deutlich mehr – ein Ventilator hilft enorm.' });
  if (massLossPct > 2)
    notes.push({
      level: 'warn',
      text: `Geschätzter Gewichtsverlust ${fmtNum(massLossPct, 1)} % – über 2 % sinkt die Leistung. Mehr trinken, falls verträglich, oder Nachfüllstopp einplanen.`,
    });
  if (brick)
    notes.push({
      level: 'info',
      text: 'Brick: In den letzten 15–20 min auf dem Rad noch ein Gel und gut trinken – beim Laufen nimmt der Magen weniger auf. Lauf-Verpflegung in T2 bereitlegen.',
    });
  if (segments.some((sg) => sg.sport === 'run' && sg.carbTargetGph > 75))
    notes.push({ level: 'info', text: 'Beim Laufen ist der Magen empfindlicher – hohe KH-Mengen vorher im Training testen.' });

  const plannedPerH = totalH ? carbsTotal / (moveMin / 60) : 0;
  if (plannedPerH > tol + 5)
    notes.push({ level: 'warn', text: `Deine gewählten Produkte ergeben ~${Math.round(plannedPerH)} g KH/h – mehr als deine Verträglichkeit von ${tol} g/h.` });

  // Pre / Post
  const intraCaffeine = segments.reduce((a, sg) => a + sg.caffeineMg, 0);
  const firstSport = segInputs[0].sport;
  const { pre: preItems, carbLoading, preCaffeine } = buildPre(p, s, D, Imean, weather.tempC, intraCaffeine, firstSport, gly);
  const cafTotal = preCaffeine + intraCaffeine;
  const cafMax = (p.caffeineSensitive ? 3 : 6) * kg;
  if (cafTotal > cafMax)
    notes.push({ level: 'warn', text: `Koffein gesamt ${Math.round(cafTotal)} mg – über ${Math.round(cafMax)} mg (${p.caffeineSensitive ? 3 : 6} mg/kg) bringt keinen Vorteil, eher Nebenwirkungen.` });
  if (p.fructoseSensitive && segments.some((sg) => (sg.fructoseShare ?? 0) > 0.3))
    notes.push({ level: 'warn', text: 'Du hast Fruktose-Empfindlichkeit angegeben – hoher Fruktoseanteil im Plan. Verträglichkeit vorher testen.' });
  const post = buildPost(p, s, D, Imean, massLossKg, kcalTotal, gly);

  return {
    type: s.type,
    totalMin,
    durationH: totalH,
    segments,
    intensity: Imean,
    zoneLabel,
    kcalTotal,
    kcalPerH: moveMin ? Math.round(kcalTotal / (moveMin / 60)) : 0,
    carbNeedGph: need,
    carbTargetGph: r5(plannedTarget),
    carbTargetReason: reason,
    toleranceExceeded,
    planned: {
      carbsPerH: moveMin ? Math.round(carbsTotal / (moveMin / 60)) : 0,
      drinkPerH: moveMin ? Math.round(drinkTotal / (moveMin / 60)) : 0,
      feedPerH: moveMin ? Math.round((carbsTotal - drinkTotal) / (moveMin / 60)) : 0,
      carbsTotal: Math.round(carbsTotal),
      kcalTotal: Math.round(carbsTotal * KCAL_PER_G_CARB),
      kcalPerH: moveMin ? Math.round((carbsTotal * KCAL_PER_G_CARB) / (moveMin / 60)) : 0,
      drinkKcal: Math.round(drinkTotal * KCAL_PER_G_CARB),
      feedKcal: Math.round((carbsTotal - drinkTotal) * KCAL_PER_G_CARB),
    },
    ratioRecommendation:
      target > 90 ? '1:0,8 (Glukose : Fruktose)' : target > 60 ? '2:1 (Glukose : Fruktose)' : target > 0 ? 'Einfache KH reichen, 2:1 gut verträglich' : 'nicht nötig',
    massLossKg,
    massLossPct,
    sodiumImportant,
    sodiumBalance: {
      needPerH: moveMin ? r50(sodiumNeedTotal / (moveMin / 60)) : 0,
      needTotal: r50(sodiumNeedTotal),
      suppliedPerH: moveMin ? Math.round(sodiumSuppliedTotal / (moveMin / 60)) : 0,
      suppliedTotal: Math.round(sodiumSuppliedTotal),
      coveragePct: sodiumNeedTotal > 0 ? Math.round((sodiumSuppliedTotal / sodiumNeedTotal) * 100) : 100,
    },
    weather,
    body: bodyInfo(p),
    glycogen: gly,
    carbLoading,
    pre: preItems,
    events,
    post,
    notes: dedupe(notes),
  };
}

function dedupe(notes: Note[]) {
  const seen = new Set<string>();
  return notes.filter((n) => (seen.has(n.text) ? false : (seen.add(n.text), true)));
}

// ---------------------------------------------------------------- Intra (pro Segment)

type IntraOut = Pick<
  SegmentResult,
  'events' | 'drink' | 'waterMlPerH' | 'feedCounts' | 'autoFeeds' | 'carbs' | 'sodium' | 'caffeineMg' | 'fluidTotalMl' | 'refills' | 'fructoseShare' | 'ratioLabel' | 'packing'
>;

function buildIntra(
  p: Profile,
  s: SessionInput,
  seg: SegmentInput,
  products: Product[],
  offset: number,
  D: number,
  target: number,
  fluidMlPerH: number,
  sodiumMgPerH: number,
  notes: Note[],
  prefix: string,
  firstFeedMax = 30,
): IntraOut {
  const H = D / 60;
  const sport = seg.sport;
  const drink = products.find((x) => x.id === seg.drinkId && x.type === 'drink');
  let feeds = seg.feedIds.map((id) => products.find((x) => x.id === id)).filter((x): x is Product => !!x && x.type !== 'drink');
  const manual = !!seg.feedCounts;
  if (!manual && !s.caffeine && feeds.some((f) => f.caffeineMg > 0) && feeds.some((f) => f.caffeineMg === 0)) feeds = feeds.filter((f) => f.caffeineMg === 0);

  // --- Flaschen
  const nIso = drink ? seg.isoBottles : 0;
  const nWater = seg.waterBottles;
  const nTot = nIso + nWater;
  const capTot = nTot * seg.bottleMl;
  const fluidTotal = fluidMlPerH * H;
  if (drink && seg.isoBottles === 0) notes.push({ level: 'info', text: `${prefix}Iso-Drink gewählt, aber keine Iso-Flasche eingeplant.` });
  if (fluidTotal > 0 && nTot === 0) notes.push({ level: 'warn', text: `${prefix}Keine Flaschen eingeplant – du brauchst ~${r50(fluidTotal)} ml.` });

  const refills = capTot > 0 && seg.refillPossible ? Math.max(0, Math.ceil(fluidTotal / capTot - 0.05) - 1) : 0;
  if (capTot > 0 && !seg.refillPossible && fluidTotal > capTot * 1.03)
    notes.push({
      level: 'warn',
      text: `${prefix}Du brauchst ~${r50(fluidTotal)} ml, trägst aber nur ${capTot} ml. Nachfüllen einplanen oder mehr/größere Flaschen mitnehmen.`,
    });

  // --- Iso-Anteil
  let conc = drink ? drink.carbsG / (drink.servingMl || 500) : 0; // g/ml
  let isoMlPerH = nTot > 0 && target > 0 ? fluidMlPerH * (nIso / nTot) : 0;
  if (isoMlPerH * conc > target && conc > 0) isoMlPerH = target / conc;
  if (drink && isoMlPerH > 0 && feeds.length === 0 && isoMlPerH * conc < target - 0.5) {
    conc = target / isoMlPerH;
    const gl = conc * 1000;
    if (gl > 120) notes.push({ level: 'warn', text: `${prefix}Iso müsste sehr konzentriert sein (${Math.round(gl)} g/L) – belastet den Magen. Gels ergänzen oder mehr Iso-Flaschen.` });
    else if (gl > 90) notes.push({ level: 'info', text: `${prefix}Iso stärker angemischt (${Math.round(gl)} g/L) – nur mit erprobtem Produkt (z. B. Hydrogel).` });
  }
  const isoAvail = nIso * seg.bottleMl * (seg.drinkRefill && seg.refillPossible ? refills + 1 : 1);
  const isoEnd = isoMlPerH > 0 ? Math.min(D, (isoAvail / isoMlPerH) * 60) : 0;
  if (drink && isoMlPerH > 0 && isoEnd < D - 10)
    notes.push({ level: 'info', text: `${prefix}Iso reicht bis ca. Minute ${Math.round(offset + isoEnd)} – danach nur Wasser, die Gels übernehmen mehr.` });
  const drinkRate = isoMlPerH * conc; // g/h solange Iso da ist
  const drinkCarbs = (drinkRate * isoEnd) / 60;

  // --- Gel-Bedarf über die Zeit
  const G = (t: number) => (Math.max(0, target - drinkRate) * Math.min(t, isoEnd) + target * Math.max(0, t - isoEnd)) / 60;
  const need = G(D);
  if (!manual && need > 0.5 * 20 && feeds.length === 0)
    notes.push({ level: 'warn', text: `${prefix}Es fehlen ~${r5(need / Math.max(H, 0.1))} g KH/h – wähle Gels, Chews oder Riegel aus.` });

  // --- Stückliste
  const items: Product[] = [];
  const counts: Record<string, number> = {};
  if (manual) {
    const caf: Product[] = [],
      bars: Product[] = [],
      normal: Product[] = [];
    for (const f of feeds) {
      const n = seg.feedCounts?.[f.id] ?? 0;
      counts[f.id] = n;
      for (let i = 0; i < n; i++) (f.caffeineMg > 0 ? caf : f.type === 'bar' && sport === 'bike' ? bars : normal).push(f);
    }
    // Riegel früh, Koffein spät, Rest abwechselnd dazwischen
    items.push(...interleave(bars, normal), ...caf);
  } else if (feeds.length && need > 5) {
    const avg = feeds.reduce((a, f) => a + f.carbsG, 0) / feeds.length;
    const n = Math.max(1, Math.round(need / avg));
    const caf = feeds.filter((f) => f.caffeineMg > 0);
    const bars = feeds.filter((f) => f.type === 'bar');
    let normal = feeds.filter((f) => f.caffeineMg === 0 && f.type !== 'bar');
    if (!normal.length) normal = feeds.filter((f) => f.caffeineMg === 0);
    if (!normal.length) normal = feeds;
    let ni = 0,
      ci = 0,
      bi = 0,
      cafUsed = 0;
    // Koffein aus Gels auf ~3 mg/kg begrenzen (empfindlich: 1,5 mg/kg)
    const cafBudget = (p.caffeineSensitive ? 1.5 : 3) * (p.weightKg || 70);
    for (let k = 0; k < n; k++) {
      const f = (k + 0.5) / n;
      let prod: Product;
      const nextCaf = caf[ci % Math.max(1, caf.length)];
      if (f >= 0.6 && caf.length && s.caffeine && cafUsed + nextCaf.caffeineMg <= cafBudget) {
        prod = caf[ci++ % caf.length];
        cafUsed += prod.caffeineMg;
      }
      else if (f < 0.5 && bars.length && sport === 'bike' && k % 2 === 0) prod = bars[bi++ % bars.length];
      else prod = normal[ni++ % normal.length];
      items.push(prod);
      counts[prod.id] = (counts[prod.id] ?? 0) + 1;
    }
    for (const f of feeds) counts[f.id] = counts[f.id] ?? 0;
  } else {
    for (const f of feeds) counts[f.id] = 0;
  }
  if (sport === 'run' && items.some((i) => i.type === 'bar')) notes.push({ level: 'info', text: 'Riegel sind beim Laufen schwer verdaulich – lieber Gels oder Chews.' });

  // --- Zeitpunkte: proportional zum KH-Bedarf verteilen
  const events: IntraEvent[] = [];
  const first = Math.min(offset > 0 ? 10 : D >= 90 ? 20 : 15, firstFeedMax);
  const last = Math.max(first, D - 10);
  const itemCarbs = items.reduce((a, i) => a + i.carbsG, 0);
  let acc = 0;
  items.forEach((prod, k) => {
    let t: number;
    if (need > 1) {
      const c = ((acc + prod.carbsG / 2) / Math.max(1, itemCarbs)) * need;
      t = invert(G, c, D);
    } else t = items.length === 1 ? D / 2 : first + (k * (last - first)) / Math.max(1, items.length - 1);
    acc += prod.carbsG;
    t = Math.round(clamp(t, first, last));
    const water = prod.type === 'gel' && !prod.isotonic ? ' + Schluck Wasser' : '';
    events.push({ min: offset + t, type: 'feed', sport, label: prod.name + water, carbsG: prod.carbsG, caffeineMg: prod.caffeineMg || undefined, productId: prod.id });
  });

  // --- Trinken alle 15 min
  if (fluidMlPerH > 0 && D >= 20) {
    const sip = fluidMlPerH / 4;
    for (let t = 15; t <= D - 5; t += 15) {
      const iso = t < isoEnd ? isoMlPerH / 4 : 0;
      const water = sip - iso;
      const label =
        drink && iso > 0 && water > 5
          ? `${r10(sip)} ml (≈ ${r10(iso)} Iso / ${r10(water)} Wasser)`
          : drink && iso > 0
            ? `${r10(sip)} ml ${drink.name}`
            : `${r10(sip)} ml Wasser`;
      events.push({ min: offset + t, type: 'drink', sport, label, ml: sip });
    }
  }
  for (let k = 1; k <= refills; k++) {
    const t = Math.round(((k * capTot) / fluidMlPerH) * 60);
    if (t < D)
      events.push({
        min: offset + t,
        type: 'refill',
        sport,
        label: drink && nIso > 0 && seg.drinkRefill ? 'Auffüllen: Iso neu anmischen + Wasser' : 'Flaschen mit Wasser auffüllen',
      });
  }

  // --- Summen
  const feedCarbs = itemCarbs;
  const drinkServings = drink ? drinkCarbs / drink.carbsG : 0;
  const sodiumTotal = (drink ? drinkServings * drink.sodiumMg : 0) + items.reduce((a, i) => a + i.sodiumMg, 0);
  const caffeine = (drink ? drinkServings * drink.caffeineMg : 0) + items.reduce((a, i) => a + i.caffeineMg, 0);

  // Fruktoseanteil
  let fruct = 0,
    known = 0,
    unknown = 0;
  const addShare = (prod: Product, g: number) => {
    const fs = FRUCTOSE_SHARE[prod.ratio];
    if (fs == null) unknown += g;
    else {
      fruct += fs * g;
      known += g;
    }
  };
  if (drink && drinkCarbs > 0) addShare(drink, drinkCarbs);
  for (const i of items) addShare(i, i.carbsG);
  const fructoseShare = known > 0 ? fruct / known : null;
  const ratioLabel = fructoseShare == null ? '–' : fructoseShare < 0.02 ? 'nur Glukose' : `1 : ${(fructoseShare / (1 - fructoseShare)).toFixed(2).replace('.', ',')}`;
  if (target > 60 && fructoseShare != null && fructoseShare < 0.25)
    notes.push({ level: 'warn', text: `${prefix}Bei ${target} g/h reicht Glukose allein nicht (Aufnahme max. ~60 g/h). Produkte mit 2:1 oder 1:0,8 wählen.` });
  else if (target > 90 && fructoseShare != null && fructoseShare < 0.38)
    notes.push({ level: 'info', text: `${prefix}Für über 90 g/h ist ein Verhältnis um 1:0,8 meist besser verträglich als 2:1 (aktuell ${ratioLabel}).` });
  if (unknown > 0 && target > 60) notes.push({ level: 'info', text: `${prefix}Einige Produkte haben kein bekanntes Glukose:Fruktose-Verhältnis.` });

  // Abweichung bei manuellen Mengen
  const carbsTotal = drinkCarbs + feedCarbs;
  if (manual && H > 0.75 && target > 0) {
    const perH = carbsTotal / H;
    if (perH > p.carbToleranceGph + 5)
      notes.push({ level: 'warn', text: `${prefix}Deine Mengen ergeben ~${Math.round(perH)} g KH/h – mehr als deine Verträglichkeit von ${p.carbToleranceGph} g/h.` });
    else if (perH < target * 0.85) notes.push({ level: 'warn', text: `${prefix}Mit deinen Mengen kommst du auf ~${Math.round(perH)} g/h – Ziel sind ${target} g/h. Mehr Gels einplanen.` });
    else if (perH > target * 1.2) notes.push({ level: 'info', text: `${prefix}Deine Mengen ergeben ~${Math.round(perH)} g/h – mehr als das Ziel von ${target} g/h.` });
  }

  // Natrium-Lücke
  if (sodiumMgPerH > 0 && H > 0) {
    const gap = sodiumMgPerH * H - sodiumTotal;
    if (gap > 200)
      notes.push({
        level: 'info',
        text: `${prefix}Natrium: Produkte liefern ~${Math.round(sodiumTotal / H)} mg/h, Ziel ~${sodiumMgPerH} mg/h. Ergänze ~${r50(gap)} mg (Elektrolyt-Tabs oder Salzkapseln).`,
      });
  }

  // --- Packliste
  const packing: PackItem[] = [];
  let drinkInfo: SegmentResult['drink'];
  const bottleWord = sport === 'run' ? 'Softflask' : 'Flasche';
  if (drink && nIso > 0 && isoMlPerH > 0) {
    const carbsPerBottle = conc * seg.bottleMl;
    drinkInfo = {
      product: drink,
      servingsPerBottle: carbsPerBottle / drink.carbsG,
      carbsPerBottle,
      concentrationGL: conc * 1000,
      mlPerH: Math.round(isoMlPerH),
      lastsUntilMin: offset + Math.round(isoEnd),
    };
    packing.push({ label: `${drink.name} (je ${fmtNum(carbsPerBottle / drink.carbsG, 1)} Portionen pro ${bottleWord})`, count: `${nIso} × ${seg.bottleMl} ml` });
    const extra = seg.drinkRefill && seg.refillPossible && refills > 0 ? refills * nIso : 0;
    if (extra) packing.push({ label: `${drink.name} Pulver zum Nachmischen`, count: `${fmtNum(extra * (carbsPerBottle / drink.carbsG), 1)} Portionen` });
  }
  if (nWater > 0) packing.push({ label: `Wasser${sodiumMgPerH ? ' (ggf. mit Elektrolyt-Tab)' : ''}`, count: `${nWater} × ${seg.bottleMl} ml` });
  for (const f of feeds) {
    const c = counts[f.id] ?? 0;
    if (c > 0) packing.push({ label: f.name, count: manual ? `${c}` : `${c} (+1 Reserve)` });
  }

  return {
    events,
    drink: drinkInfo,
    waterMlPerH: Math.round(fluidMlPerH - (isoEnd >= D ? isoMlPerH : 0)),
    feedCounts: counts,
    autoFeeds: !manual,
    carbs: {
      total: Math.round(carbsTotal),
      perH: H ? Math.round(carbsTotal / H) : 0,
      drinkPerH: H ? Math.round(drinkCarbs / H) : 0,
      feedPerH: H ? Math.round(feedCarbs / H) : 0,
    },
    sodium: { total: Math.round(sodiumTotal), perH: H ? Math.round(sodiumTotal / H) : 0 },
    caffeineMg: Math.round(caffeine),
    fluidTotalMl: Math.round(fluidTotal),
    refills,
    fructoseShare,
    ratioLabel,
    packing,
  };
}

/** Zeitpunkt t, an dem die monotone Funktion G den Wert c erreicht */
function invert(G: (t: number) => number, c: number, D: number) {
  let lo = 0,
    hi = D;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (G(mid) < c) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function interleave(early: Product[], rest: Product[]) {
  // Riegel in die erste Hälfte einstreuen
  const out: Product[] = [];
  const total = early.length + rest.length;
  let e = 0,
    r = 0;
  for (let k = 0; k < total; k++) {
    const useEarly = e < early.length && (r >= rest.length || k % 2 === 0) && k < total * 0.6;
    out.push(useEarly ? early[e++] : r < rest.length ? rest[r++] : early[e++]);
  }
  return out;
}

const order = (t: IntraEventType) => ({ refill: 0, feed: 1, drink: 2 })[t];

// ---------------------------------------------------------------- Pre

function buildPre(p: Profile, s: SessionInput, D: number, I: number, tempC: number, intraCaffeine: number, firstSport: Sport, gly: GlycogenInfo) {
  const depleted = gly.level === 'reduced' || gly.level === 'low';
  const kg = p.weightKg;
  const pre: TimedItem[] = [];
  let carbLoading: PlanResult['carbLoading'];

  if (s.goal === 'race' && D >= 90) {
    const hi = (firstSport === 'bike' || s.type === 'brick') && D >= 150;
    const lo = 8,
      up = hi ? 12 : 10;
    carbLoading = {
      days: '36–48 h vor dem Start (2 Tage)',
      gPerKg: `${lo}–${up} g/kg/Tag`,
      gramsPerDay: `${r10(lo * kg)}–${r10(up * kg)} g KH pro Tag`,
      detail: 'Ballaststoff- und fettarm (weißer Reis, Nudeln, Brot, Saft, Haferflocken). Training reduzieren. 1–2 kg Gewichtszunahme durch Glykogen und Wasser sind normal.',
    };
  } else if (s.goal === 'race' && D >= 60) {
    carbLoading = { days: '24 h vor dem Start', gPerKg: '7 g/kg', gramsPerDay: `${r10(7 * kg)} g KH`, detail: 'Am Vortag kohlenhydratreich und ballaststoffarm essen.' };
  }

  const shortEasy = D < 60 && (s.goal === 'easy' || I < 0.7);
  if (shortEasy && !depleted) {
    pre.push({ offsetMin: -120, title: 'Normal essen', detail: 'Kurze, lockere Einheit – eine normale Mahlzeit 2–3 h vorher reicht. Nüchtern ist auch möglich.' });
  } else if (shortEasy) {
    pre.push({
      offsetMin: -120,
      title: 'KH-Mahlzeit',
      detail: `Glykogen ${gly.label} – nicht nüchtern starten. Eine kohlenhydratreiche Mahlzeit 2–3 h vorher (z. B. Haferbrei, Brötchen mit Honig).`,
      carbsG: r5(1 * p.weightKg),
    });
  } else {
    let gkg = D < 60 ? 1 : D < 90 ? 1.5 : D < 150 ? 2 : 2.5;
    if (s.goal === 'race') gkg += 0.5;
    if (s.goal === 'key') gkg += 0.25;
    if (s.goal === 'easy') gkg = Math.max(0.5, gkg - 0.5);
    gkg = Math.min(4, gkg + gly.preExtraGPerKg);
    const glyNote = depleted ? ` Mehr als sonst, weil dein Glykogen ${gly.label} ist.` : '';
    const early = Number(s.start.slice(11, 13)) < 8;
    if (early) {
      pre.push({
        offsetMin: -120,
        title: 'Frühstück (früher Start)',
        detail: `Leicht verdaulich, wenig Fett und Ballaststoffe: z. B. Toast mit Honig, Haferflocken, Banane. Am Vorabend kohlenhydratreich essen.${glyNote}`,
        carbsG: r5(Math.min(gkg, 1.5 + gly.preExtraGPerKg) * kg),
      });
    } else {
      pre.push({
        offsetMin: -180,
        title: 'KH-Mahlzeit',
        detail: `${fmtNum(gkg, 2)} g/kg – leicht verdaulich, wenig Fett, Ballaststoffe und Protein: z. B. Reis, Nudeln, Brötchen mit Honig, Haferbrei.${glyNote}`,
        carbsG: r5(gkg * kg),
      });
    }
    const hot = tempC >= 25 && D >= 90;
    pre.push({
      offsetMin: early ? -110 : -150,
      title: 'Vortrinken',
      detail: `5–7 ml/kg über 1–2 h. Heller Urin = gut hydriert.${hot ? ' Bei Hitze mit ~500 mg Natrium (Elektrolyt-Tab).' : ''}`,
      ml: r50(6 * kg),
      sodiumMg: hot ? 500 : undefined,
    });
    if (s.goal === 'race') pre.push({ offsetMin: -15, title: 'Start-Gel', detail: '1 Gel 10–15 min vor dem Start (mit etwas Wasser).', carbsG: 25 });
    else if (D >= 75 || I >= 0.85 || depleted) pre.push({ offsetMin: -45, title: 'Snack', detail: 'Banane, Reiswaffel, Toast mit Honig oder ein Gel.', carbsG: clamp(r5(0.4 * kg), 20, 40) });
  }

  let preCaffeine = 0;
  if (s.caffeine) {
    const total = (p.caffeineSensitive ? 1.5 : 3) * kg;
    preCaffeine = r5(Math.max(0, total - intraCaffeine));
    if (preCaffeine >= 25)
      pre.push({
        offsetMin: -60,
        title: 'Koffein',
        detail: `${p.caffeineSensitive ? '1,5' : '3'} mg/kg gesamt${intraCaffeine ? ` (abzgl. ${intraCaffeine} mg aus Gels unterwegs)` : ''} – z. B. Espresso (~60–80 mg) oder Koffeintablette.`,
        caffeineMg: preCaffeine,
      });
    else preCaffeine = 0;
  }
  pre.sort((a, b) => a.offsetMin - b.offsetMin);
  return { pre, carbLoading, preCaffeine };
}

// ---------------------------------------------------------------- Post

function buildPost(p: Profile, s: SessionInput, D: number, I: number, massLossKg: number, kcal: number, gly: GlycogenInfo): TimedItem[] {
  const kg = p.weightKg;
  const post: TimedItem[] = [];
  const light = D < 60 && I < 0.75 && gly.level !== 'low';
  // Mit leeren Speichern gestartet → nach der Einheit genauso schnell auffüllen wie vor einer Folgeeinheit
  const fast = s.nextSessionWithin24h || gly.level === 'low';
  const rehydMl = r50(Math.max(massLossKg * 1500, light ? 300 : 500));
  post.push({
    offsetMin: 0,
    title: 'Rehydrieren',
    detail: `${massLossKg > 0.2 ? `Geschätztes Defizit ${fmtNum(massLossKg, 1)} L × 1,5. ` : ''}Über 2–4 h verteilt trinken, mit Natrium (500–700 mg/L) – z. B. Elektrolytgetränk, Brühe oder Salziges dazu essen.`,
    ml: rehydMl,
    sodiumMg: massLossKg > 0.5 ? r50(rehydMl * 0.6) : undefined,
  });
  // Ab ~50 Jahren reagiert der Muskel schwächer auf Protein ("anabole Resistenz") → mehr pro Mahlzeit
  const { proteinGPerKg } = bodyInfo(p);
  const proteinTxt = fmtNum(proteinGPerKg, 1);
  const ageNote = proteinGPerKg > 0.3 ? ' (ab 50 Jahren etwas mehr Protein pro Mahlzeit)' : '';
  const protein = r5(clamp(proteinGPerKg * kg, 20, 45));
  if (light) {
    post.push({ offsetMin: 60, title: 'Normale Mahlzeit', detail: `Lockere Einheit – die nächste reguläre Mahlzeit reicht, mit ~${proteinTxt} g/kg Protein${ageNote}.`, proteinG: protein });
    post.push(dailyBalance(p, D, kcal));
    return post;
  }
  if (fast || D >= 120 || I >= 0.9) {
    post.push({
      offsetMin: 30,
      title: 'Recovery-Snack',
      detail: `1,0–1,2 g/kg KH + ${proteinTxt} g/kg Protein${ageNote} innerhalb von 30–60 min (z. B. Kakao/Milch, Reis mit Hähnchen, Bagel mit Quark).`,
      carbsG: r5(1.1 * kg),
      proteinG: protein,
    });
    if (fast)
      post.push({
        offsetMin: 90,
        title: 'Weiter auffüllen',
        detail: `${s.nextSessionWithin24h ? 'Nächste Einheit innerhalb von 24 h' : 'Mit stark geleertem Glykogen gestartet'}: in den ersten 4 h stündlich ~1 g/kg KH, um die Speicher schnell aufzufüllen.`,
        carbsG: r5(1.0 * kg),
      });
  } else {
    post.push({ offsetMin: 60, title: 'Mahlzeit', detail: `Ausgewogene Mahlzeit mit KH und ~${proteinTxt} g/kg Protein${ageNote} innerhalb von 1–2 h.`, carbsG: r5(1.0 * kg), proteinG: protein });
  }
  post.push(dailyBalance(p, D, kcal));
  return post;
}

/** Tagesbedarf aus Grundumsatz (Mifflin-St Jeor) × Alltag + Einheit, KH-Bedarf nach Trainingsumfang (ACSM) */
function dailyBalance(p: Profile, D: number, kcal: number): TimedItem {
  const kg = p.weightKg || 70;
  const base = bmr(p);
  const total = base * 1.4 + kcal;
  const [lo, hi] = D < 60 ? [3, 5] : D < 150 ? [5, 7] : D < 240 ? [6, 10] : [8, 12];
  return {
    offsetMin: 180,
    title: 'Tagesbilanz',
    detail:
      `Tagesbedarf heute ≈ ${fmtNum(r50(total))} kcal (Grundumsatz ${fmtNum(r50(base))} × 1,4 Alltag + ${fmtNum(r50(kcal))} kcal Einheit). ` +
      `Kohlenhydrate über den Tag: ${lo}–${hi} g/kg ≈ ${fmtNum(r10(lo * kg))}–${fmtNum(r10(hi * kg))} g. Vor dem Schlafen evtl. 30–40 g Protein (z. B. Quark).`,
  };
}

// ---------------------------------------------------------------- Helfer

export function goalLabel(g: SessionInput['goal']) {
  return { easy: 'Locker / Regeneration', training: 'Training', key: 'Key-Session', race: 'Wettkampf' }[g];
}

export function typeLabel(t: SessionInput['type']) {
  return { bike: 'Rennrad', run: 'Laufen', brick: 'Brick (Rad → Lauf)' }[t];
}

export function fmtDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}:${String(m).padStart(2, '0')} h` : `${m} min`;
}

export function fmtNum(v: number, digits = 0) {
  return v.toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

/** Gesamtdauer inkl. Wechsel (für das Wetter-Zeitfenster) */
export function estimateTotalMin(p: Profile, s: SessionInput): number {
  const segs = activeSegments(s);
  const sum = segs.reduce((a, seg) => a + resolveDuration(seg, p, segmentIntensity(seg, p).I).durationMin, 0);
  return sum + (s.type === 'brick' ? s.transitionMin : 0);
}
