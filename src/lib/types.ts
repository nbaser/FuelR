export type Sex = 'm' | 'w' | 'd';
export type Sport = 'bike' | 'run';
export type SessionType = 'bike' | 'run' | 'brick';

export interface Profile {
  completed: boolean;
  name: string;
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
  hrMax?: number;
  hrRest?: number;
  /** Laktatschwellen-HF (Rad) */
  lthrBike?: number;
  /** Laktatschwellen-HF (Laufen) */
  lthrRun?: number;
  /** Functional Threshold Power in Watt */
  ftp?: number;
  /** Schwellenpace Laufen in Sekunden pro km */
  thresholdPaceSec?: number;
  /** Trainierte maximale KH-Aufnahme in g/h */
  carbToleranceGph: number;
  heatAcclimated: boolean;
  saltySweater: boolean;
  caffeineSensitive: boolean;
  lowCarbDiet: boolean;
  fructoseSensitive: boolean;
}

export type ProductType = 'drink' | 'gel' | 'chew' | 'bar';
/** Glukose(Maltodextrin) : Fruktose */
export type CarbRatio = '2:1' | '1:0.8' | 'glucose' | 'other';

export interface Product {
  id: string;
  name: string;
  type: ProductType;
  /** Kohlenhydrate pro Portion (g) */
  carbsG: number;
  ratio: CarbRatio;
  sodiumMg: number;
  caffeineMg: number;
  /** Nur Drinks: Wassermenge pro Portion laut Packung (ml) */
  servingMl?: number;
  /** Nur Gels: isotonisch (kein Wasser nötig) */
  isotonic?: boolean;
  example?: boolean;
}

export type Goal = 'easy' | 'training' | 'key' | 'race';
/** Belastung in den letzten 24–48 h */
export type PriorLoad = 'rest' | 'normal' | 'hard';
/** Kohlenhydratzufuhr am Vortag */
export type PriorCarbs = 'low' | 'normal' | 'high';
export type IntensityMode = 'zones' | 'power' | 'pace' | 'hr';
export type TimeMode = 'duration' | 'speed';
export type Zones = [number, number, number, number, number];

/** Ein Teilstück der Einheit (Rad oder Lauf) inkl. eigener Verpflegung */
export interface SegmentInput {
  sport: Sport;
  indoor: boolean;
  distanceKm?: number;
  elevationM: number;
  /** Dauer direkt oder aus Distanz + Ø-Tempo */
  timeMode: TimeMode;
  durationMin: number;
  /** Rad: Ø km/h (bei timeMode 'speed') */
  speedKmh?: number;
  /** Lauf: Ø Pace s/km (bei timeMode 'speed' bzw. Intensität 'pace') */
  paceSec?: number;
  intensityMode: IntensityMode;
  zones: Zones;
  targetPower?: number;
  targetHr?: number;
  // Verpflegung
  drinkId?: string;
  feedIds: string[];
  /** Manuelle Stückzahlen; undefined = automatisch */
  feedCounts?: Record<string, number>;
  isoBottles: number;
  waterBottles: number;
  bottleMl: number;
  refillPossible: boolean;
  /** Iso kann unterwegs neu angemischt werden (Pulver dabei / Station) */
  drinkRefill: boolean;
}

export interface SessionInput {
  version: 2;
  title: string;
  type: SessionType;
  /** datetime-local: "YYYY-MM-DDTHH:mm" */
  start: string;
  goal: Goal;
  caffeine: boolean;
  nextSessionWithin24h: boolean;
  /** Belastung in den letzten 24–48 h (für den Glykogenstand) */
  priorLoad: PriorLoad;
  /** KH-Zufuhr am Vortag (für den Glykogenstand) */
  priorCarbs: PriorCarbs;
  bike: SegmentInput;
  run: SegmentInput;
  /** Wechselzeit Rad → Lauf (Brick) */
  transitionMin: number;
  /** Manuelle Wetterwerte (überschreiben die Prognose) */
  manualWeather: boolean;
  manualTempC: number;
  manualHumidity: number;
}

export interface SavedPlan {
  id: string;
  savedAt: string;
  session: SessionInput;
  note?: string;
}

export interface WeatherSummary {
  source: 'forecast' | 'manual' | 'indoor' | 'none';
  tempC: number;
  tempMaxC?: number;
  apparentMaxC?: number;
  humidity: number;
  windKmh?: number;
  radiationMax?: number;
  precipProb?: number;
  weatherCode?: number;
}
