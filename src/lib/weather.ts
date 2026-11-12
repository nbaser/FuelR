import { useCallback, useEffect, useState } from 'react';
import { load, save } from './storage';
import type { SessionInput, WeatherSummary } from './types';

interface Coords {
  lat: number;
  lon: number;
  at: number;
}

interface Forecast {
  lat: number;
  lon: number;
  fetchedAt: number;
  hourly: {
    time: string[];
    temperature_2m: number[];
    relative_humidity_2m: number[];
    apparent_temperature: number[];
    precipitation_probability: number[];
    wind_speed_10m: number[];
    shortwave_radiation: number[];
    weather_code: number[];
  };
}

const FORECAST_MAX_AGE = 60 * 60 * 1000; // 1 h
const LOCATION_MAX_AGE = 30 * 60 * 1000;

function getPosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Standortabfrage wird nicht unterstützt'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, at: Date.now() }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? 'Standortzugriff verweigert – in Chrome (Schloss-Symbol) und in macOS unter Datenschutz → Ortungsdienste erlauben.'
              : 'Standort konnte nicht ermittelt werden.',
          ),
        ),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: LOCATION_MAX_AGE },
    );
  });
}

async function fetchForecast(c: Coords): Promise<Forecast> {
  const params = new URLSearchParams({
    latitude: c.lat.toFixed(3),
    longitude: c.lon.toFixed(3),
    hourly: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,wind_speed_10m,shortwave_radiation,weather_code',
    timezone: 'auto',
    forecast_days: '16',
    past_days: '1',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`Wetterdienst antwortet nicht (${res.status})`);
  const json = await res.json();
  return { lat: c.lat, lon: c.lon, fetchedAt: Date.now(), hourly: json.hourly };
}

export interface WeatherState {
  status: 'idle' | 'loading' | 'ok' | 'error';
  error?: string;
  forecast?: Forecast;
  coords?: Coords;
  refresh: () => void;
}

export function useForecast(): WeatherState {
  const [forecast, setForecast] = useState<Forecast | undefined>(() => load<Forecast | undefined>('forecast', undefined));
  const [coords, setCoords] = useState<Coords | undefined>(() => load<Coords | undefined>('location', undefined));
  const [status, setStatus] = useState<WeatherState['status']>(forecast ? 'ok' : 'idle');
  const [error, setError] = useState<string>();

  const run = useCallback(async (force: boolean) => {
    const cached = load<Forecast | undefined>('forecast', undefined);
    if (!force && cached && Date.now() - cached.fetchedAt < FORECAST_MAX_AGE) {
      setStatus('ok');
      return;
    }
    setStatus('loading');
    setError(undefined);
    try {
      let c: Coords;
      try {
        c = await getPosition();
        save('location', c);
        setCoords(c);
      } catch (e) {
        const last = load<Coords | undefined>('location', undefined);
        if (!last) throw e;
        c = last; // letzter bekannter Standort
      }
      const f = await fetchForecast(c);
      save('forecast', f);
      setForecast(f);
      setStatus('ok');
    } catch (e) {
      setError((e as Error).message);
      setStatus(cached ? 'ok' : 'error');
      if (cached) setForecast(cached);
    }
  }, []);

  useEffect(() => {
    run(false);
  }, [run]);

  return { status, error, forecast, coords, refresh: () => run(true) };
}

/** Wetter über das Zeitfenster der Einheit zusammenfassen. */
export function summarize(s: SessionInput, totalMin: number, f?: Forecast): WeatherSummary {
  const segs = s.type === 'brick' ? [s.bike, s.run] : [s.type === 'run' ? s.run : s.bike];
  if (segs.every((x) => x.indoor)) return { source: 'indoor', tempC: s.manualTempC, humidity: s.manualHumidity };
  if (s.manualWeather) return { source: 'manual', tempC: s.manualTempC, humidity: s.manualHumidity };
  if (!f) return { source: 'none', tempC: 18, humidity: 55 };

  const startKey = s.start.slice(0, 13); // "YYYY-MM-DDTHH"
  const startIdx = f.hourly.time.findIndex((t) => t.slice(0, 13) === startKey);
  if (startIdx < 0) return { source: 'none', tempC: 18, humidity: 55 };
  const hours = Math.max(1, Math.ceil((totalMin || 60) / 60));
  const idx = Array.from({ length: hours + 1 }, (_, i) => startIdx + i).filter((i) => i < f.hourly.time.length);
  const pick = (arr: number[]) => idx.map((i) => arr[i]).filter((v) => v != null);
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const temps = pick(f.hourly.temperature_2m);
  const app = pick(f.hourly.apparent_temperature);
  return {
    source: 'forecast',
    tempC: avg(temps),
    tempMaxC: Math.max(...temps),
    apparentMaxC: Math.max(...app),
    humidity: avg(pick(f.hourly.relative_humidity_2m)),
    windKmh: avg(pick(f.hourly.wind_speed_10m)),
    radiationMax: Math.max(...pick(f.hourly.shortwave_radiation)),
    precipProb: Math.max(...pick(f.hourly.precipitation_probability)),
    weatherCode: mostSevere(pick(f.hourly.weather_code)),
  };
}

export function forecastCovers(s: SessionInput, f?: Forecast): boolean {
  if (!f) return false;
  return f.hourly.time.some((t) => t.slice(0, 13) === s.start.slice(0, 13));
}

function mostSevere(codes: number[]) {
  return codes.length ? Math.max(...codes) : undefined;
}

export function weatherText(code?: number): string {
  if (code == null) return '';
  if (code === 0) return 'Klar';
  if (code <= 2) return 'Leicht bewölkt';
  if (code === 3) return 'Bedeckt';
  if (code <= 48) return 'Nebel';
  if (code <= 57) return 'Nieselregen';
  if (code <= 67) return 'Regen';
  if (code <= 77) return 'Schnee';
  if (code <= 82) return 'Regenschauer';
  if (code <= 86) return 'Schneeschauer';
  return 'Gewitter';
}
