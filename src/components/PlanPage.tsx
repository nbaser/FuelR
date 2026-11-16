import { useMemo, useRef, useState } from 'react';
import { computePlan, estimateTotalMin, fmtDuration, fmtNum, glycogenState, type SegmentResult } from '../lib/calc';
import type { FitSummary } from '../lib/fit';
import { DEFAULT_PROFILE, defaultSession, EXAMPLE_PRODUCTS, migrateSession, uid, usePersistent } from '../lib/storage';
import type { Goal, IntensityMode, PriorCarbs, PriorLoad, Product, Profile, SavedPlan, SegmentInput, SessionInput, SessionType, TimeMode, Zones } from '../lib/types';
import { forecastCovers, summarize, useForecast, weatherText } from '../lib/weather';
import { fmtPace, ZONE_NAMES } from '../lib/zones';
import { PlanResultView } from './PlanResult';
import { TYPE_LABEL } from './ProductsPage';
import { Card, Field, Icon, NumField, NumInput, PaceInput, Segmented, Stepper, Toggle } from './ui';

type SegKey = 'bike' | 'run';

export function PlanPage({ onGoto }: { onGoto: (page: 'profile' | 'products') => void }) {
  const [profile] = usePersistent<Profile>('profile', DEFAULT_PROFILE);
  const [products] = usePersistent<Product[]>('products', EXAMPLE_PRODUCTS);
  const [rawDraft, setRawDraft] = usePersistent<SessionInput>('draft', defaultSession());
  const s = useMemo(() => migrateSession(rawDraft), [rawDraft]);
  const setS = (fn: (x: SessionInput) => SessionInput) => setRawDraft((x) => fn(migrateSession(x)));
  const [, setPlans] = usePersistent<SavedPlan[]>('plans', []);
  const wx = useForecast();
  const [fitInfo, setFitInfo] = useState<FitSummary | null>(null);
  const [fitError, setFitError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<SessionInput>) => setS((x) => ({ ...x, ...patch }));
  const setSeg = (key: SegKey, patch: Partial<SegmentInput>) => setS((x) => ({ ...x, [key]: { ...x[key], ...patch } }));

  const totalMin = useMemo(() => estimateTotalMin(profile, s), [profile, s]);
  const weather = useMemo(() => summarize(s, totalMin, wx.forecast), [s, totalMin, wx.forecast]);
  const result = useMemo(() => computePlan(profile, s, products, weather), [profile, s, products, weather]);
  const segKeys: SegKey[] = s.type === 'brick' ? ['bike', 'run'] : [s.type === 'run' ? 'run' : 'bike'];
  const segResult = (k: SegKey) => result.segments.find((r) => r.sport === k)!;
  const allIndoor = segKeys.every((k) => s[k].indoor);
  const covered = forecastCovers(s, wx.forecast);

  async function onFit(file: File) {
    setFitError('');
    try {
      const { parseFit, applyFit } = await import('../lib/fit');
      const f = await parseFit(file, profile);
      setFitInfo(f);
      setS((x) => applyFit(x, f));
    } catch (e) {
      setFitError((e as Error).message);
      setFitInfo(null);
    }
  }

  return (
    <div className="page plan-page">
      {!profile.completed && (
        <div className="banner">
          {Icon.info}
          <span>Für eine genaue Berechnung zuerst dein Profil ausfüllen (Gewicht, FTP/Schwellenpace, HF, KH-Verträglichkeit).</span>
          <button className="btn small" onClick={() => onGoto('profile')}>
            Zum Profil
          </button>
        </div>
      )}

      <div className="plan-layout">
        <div className="plan-form">
          <Card
            title="Einheit"
            icon={s.type === 'run' ? Icon.run : Icon.bike}
            actions={
              <>
                <button className="btn small ghost" onClick={() => fileRef.current?.click()} title="Werte aus einer Garmin/Wahoo-FIT-Datei übernehmen (auch Multisport)">
                  {Icon.file} FIT importieren
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".fit,application/octet-stream"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onFit(f);
                    e.target.value = '';
                  }}
                />
              </>
            }
          >
            {fitError && <div className="note warn">{fitError}</div>}
            {fitInfo && <FitInfo f={fitInfo} onClose={() => setFitInfo(null)} />}
            <div className="fields">
              <Field label="Titel" wide>
                <input value={s.title} placeholder="z. B. Lange Ausfahrt Taunus" onChange={(e) => set({ title: e.target.value })} />
              </Field>
              <Field label="Art" wide>
                <Segmented<SessionType>
                  value={s.type}
                  onChange={(type) => set({ type })}
                  options={[
                    { value: 'bike', label: <>{Icon.bike} Rennrad</> },
                    { value: 'run', label: <>{Icon.run} Laufen</> },
                    { value: 'brick', label: <>{Icon.bike}{Icon.run} Brick</> },
                  ]}
                />
              </Field>
              <Field label="Start">
                <input type="datetime-local" value={s.start} onChange={(e) => e.target.value && set({ start: e.target.value })} />
              </Field>
              {s.type === 'brick' && <NumField label="Wechsel (T2)" unit="min" value={s.transitionMin} min={0} max={30} onChange={(v) => set({ transitionMin: v ?? 0 })} />}
              <Field label="Ziel der Einheit" wide>
                <Segmented<Goal>
                  value={s.goal}
                  onChange={(goal) => set({ goal })}
                  options={[
                    { value: 'easy', label: 'Locker' },
                    { value: 'training', label: 'Training' },
                    { value: 'key', label: 'Key-Session' },
                    { value: 'race', label: 'Wettkampf' },
                  ]}
                />
              </Field>
              <Field label="Belastung letzte 24–48 h" wide>
                <Segmented<PriorLoad>
                  value={s.priorLoad}
                  onChange={(priorLoad) => set({ priorLoad })}
                  options={[
                    { value: 'rest', label: 'Ruhetag / locker' },
                    { value: 'normal', label: 'Normal' },
                    { value: 'hard', label: 'Hart / lang' },
                  ]}
                />
              </Field>
              <Field label="Kohlenhydrate am Vortag" wide hint={<>Glykogen geschätzt: <b>{glycogenState(s).label}</b></>}>
                <Segmented<PriorCarbs>
                  value={s.priorCarbs}
                  onChange={(priorCarbs) => set({ priorCarbs })}
                  options={[
                    { value: 'low', label: 'Wenig' },
                    { value: 'normal', label: 'Normal' },
                    { value: 'high', label: 'Viel / Carb-Loading' },
                  ]}
                />
              </Field>
            </div>
            <div className="toggles">
              <Toggle checked={s.caffeine} onChange={(caffeine) => set({ caffeine })} label="Koffein nutzen" />
              <Toggle checked={s.nextSessionWithin24h} onChange={(nextSessionWithin24h) => set({ nextSessionWithin24h })} label="Nächste Einheit innerhalb von 24 h" hint="Schnellere Glykogen-Auffüllung" />
            </div>
          </Card>

          {segKeys.map((k) => (
            <SegmentCard key={k} seg={s[k]} r={segResult(k)} profile={profile} brick={s.type === 'brick'} onChange={(patch) => setSeg(k, patch)} />
          ))}

          <Card
            title="Wetter"
            icon={Icon.sun}
            actions={
              !allIndoor && (
                <button className="btn small ghost" onClick={wx.refresh} disabled={wx.status === 'loading'}>
                  {Icon.refresh} {wx.status === 'loading' ? 'Lädt …' : 'Aktualisieren'}
                </button>
              )
            }
          >
            {allIndoor ? (
              <div className="fields">
                <NumField label="Raumtemperatur" unit="°C" value={s.manualTempC} min={-10} max={45} onChange={(v) => set({ manualTempC: v ?? 20 })} />
                <NumField label="Luftfeuchte" unit="%" value={s.manualHumidity} min={0} max={100} onChange={(v) => set({ manualHumidity: v ?? 50 })} />
              </div>
            ) : (
              <>
                {wx.error && <div className="note warn">{wx.error}</div>}
                {!s.manualWeather && weather.source === 'forecast' && (
                  <div className="weather">
                    <div className="weather-main">
                      <span className="weather-temp">{Math.round(weather.tempC)}°</span>
                      <div>
                        <div>{weatherText(weather.weatherCode)}</div>
                        <div className="muted small">
                          max. {Math.round(weather.tempMaxC ?? weather.tempC)}° · gefühlt bis {Math.round(weather.apparentMaxC ?? weather.tempC)}°
                        </div>
                      </div>
                    </div>
                    <div className="weather-grid">
                      <span>Luftfeuchte</span>
                      <b>{Math.round(weather.humidity)} %</b>
                      <span>Wind</span>
                      <b>{Math.round(weather.windKmh ?? 0)} km/h</b>
                      <span>Regen</span>
                      <b>{weather.precipProb ?? 0} %</b>
                    </div>
                    {wx.coords && (
                      <div className="muted small weather-loc">
                        {Icon.pin} Standort {wx.coords.lat.toFixed(2)}°, {wx.coords.lon.toFixed(2)}° · Prognose für {fmtDuration(totalMin)} ab Start
                      </div>
                    )}
                  </div>
                )}
                {!s.manualWeather && weather.source === 'none' && (
                  <p className="muted">
                    {wx.status === 'loading'
                      ? 'Standort und Wetter werden geladen …'
                      : wx.forecast && !covered
                        ? 'Für den Startzeitpunkt gibt es noch keine Prognose (max. 16 Tage). Standardwerte 18 °C / 55 % – oder manuell eintragen.'
                        : 'Kein Wetter verfügbar – Standardwerte 18 °C / 55 %.'}
                  </p>
                )}
                <div className="toggles">
                  <Toggle checked={s.manualWeather} onChange={(manualWeather) => set({ manualWeather })} label="Wetter manuell eingeben" />
                </div>
                {s.manualWeather && (
                  <div className="fields">
                    <NumField label="Temperatur" unit="°C" value={s.manualTempC} min={-20} max={50} onChange={(v) => set({ manualTempC: v ?? 20 })} />
                    <NumField label="Luftfeuchte" unit="%" value={s.manualHumidity} min={0} max={100} onChange={(v) => set({ manualHumidity: v ?? 50 })} />
                  </div>
                )}
              </>
            )}
          </Card>

          {segKeys.map((k) => (
            <FuelCard key={k} seg={s[k]} r={segResult(k)} products={products} brick={s.type === 'brick'} onChange={(patch) => setSeg(k, patch)} onManage={() => onGoto('products')} />
          ))}

          <div className="row-actions">
            <button
              className="btn"
              onClick={() => {
                setPlans((l) => [{ id: uid(), savedAt: new Date().toISOString(), session: s }, ...l]);
                setSavedMsg('Plan gespeichert');
                setTimeout(() => setSavedMsg(''), 2500);
              }}
            >
              {Icon.save} Plan speichern
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                const d = defaultSession();
                const drinks = products.filter((p) => p.type === 'drink');
                const feeds = products.filter((p) => p.type !== 'drink');
                d.bike.drinkId = drinks[0]?.id;
                d.bike.feedIds = feeds.slice(0, 1).map((f) => f.id);
                d.run.feedIds = feeds.filter((f) => f.type === 'gel').slice(0, 1).map((f) => f.id);
                setRawDraft(d);
                setFitInfo(null);
              }}
            >
              Neu beginnen
            </button>
            {savedMsg && <span className="muted">{savedMsg}</span>}
          </div>
        </div>

        <div className="plan-result">
          <PlanResultView r={result} s={s} profile={profile} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Segment: Strecke, Zeit, Intensität

function SegmentCard({ seg, r, profile, brick, onChange }: { seg: SegmentInput; r: SegmentResult; profile: Profile; brick: boolean; onChange: (p: Partial<SegmentInput>) => void }) {
  const bike = seg.sport === 'bike';
  const title = brick ? (bike ? 'Radteil' : 'Laufteil') : 'Umfang und Intensität';
  const byDistance = seg.timeMode === 'speed';
  const suggestion = bike ? `${fmtNum(r.suggestedSpeedKmh ?? 0, 1)} km/h` : `${fmtPace(r.suggestedPaceSec)} /km`;
  const suggestionTitle = profile.ftp || profile.thresholdPaceSec ? 'Aus FTP/Schwellenpace, Gewicht, Höhenmetern und Intensität' : 'Grobe Schätzung – mit FTP/Schwellenpace im Profil genauer';

  return (
    <Card title={title} icon={bike ? Icon.bike : Icon.run}>
      <div className="toggles">
        <Toggle
          checked={seg.indoor}
          onChange={(indoor) => onChange(indoor ? { indoor, timeMode: 'duration' } : { indoor })}
          label={bike ? 'Indoor (Rolle / Smart-Trainer)' : 'Indoor (Laufband)'}
          hint={seg.indoor ? 'Indoor planst du am besten über die Zeit.' : undefined}
        />
      </div>

      <div className="mode-tabs">
        <Segmented<TimeMode>
          value={seg.timeMode}
          onChange={(timeMode) => onChange({ timeMode })}
          options={[
            { value: 'duration', label: <>{Icon.clock} Zeit</> },
            { value: 'speed', label: <>{Icon.pin} Distanz &amp; Tempo</> },
          ]}
        />
        <div className="mode-panel">
          {byDistance ? (
            <>
              <p className="mode-hint">Die Dauer ergibt sich aus Distanz und {bike ? 'Ø-Geschwindigkeit' : 'Ø-Pace'}. Ohne eigenes Tempo nimmt FuelR den Vorschlag.</p>
              <div className="fields">
                <NumField label="Distanz" unit="km" step={0.1} value={seg.distanceKm} min={0} max={1000} onChange={(v) => onChange({ distanceKm: v })} />
                <NumField label="Höhenmeter" unit="hm" value={seg.elevationM} min={0} max={10000} onChange={(v) => onChange({ elevationM: v ?? 0 })} />
                {bike ? (
                  <NumField
                    label="Ø-Geschwindigkeit"
                    unit="km/h"
                    step={0.5}
                    value={seg.speedKmh}
                    min={5}
                    max={60}
                    onChange={(v) => onChange({ speedKmh: v })}
                    placeholder={r.suggestedSpeedKmh ? String(r.suggestedSpeedKmh).replace('.', ',') : ''}
                  />
                ) : (
                  <Field label="Ø-Pace">
                    <PaceInput value={seg.paceSec} onChange={(paceSec) => onChange({ paceSec })} placeholder={r.suggestedPaceSec ? fmtPace(r.suggestedPaceSec) : 'm:ss'} />
                  </Field>
                )}
                <Field label="Ergibt Dauer">
                  <div className="derived">
                    {seg.distanceKm ? <b>{fmtDuration(r.durationMin)}</b> : <span className="muted">Distanz fehlt</span>}
                    <button
                      type="button"
                      className="link"
                      onClick={() => (bike ? onChange({ speedKmh: r.suggestedSpeedKmh }) : onChange({ paceSec: r.suggestedPaceSec }))}
                      title={suggestionTitle}
                    >
                      Vorschlag: {suggestion}
                    </button>
                  </div>
                </Field>
              </div>
              {!seg.distanceKm && (
                <div className="note warn">
                  {Icon.alert}
                  <span>Distanz eingeben, damit die Dauer berechnet werden kann. Bis dahin rechnet FuelR mit {fmtDuration(r.durationMin)} aus dem Tab „Zeit“.</span>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="mode-hint">{seg.indoor ? 'Gib die geplante Trainingszeit ein.' : 'Gib die geplante Dauer ein – ideal, wenn du die Strecke nicht genau kennst.'}</p>
              <div className="fields">
                <Field label="Dauer" wide>
                  <div className="duo duo-time">
                    <NumInput value={Math.floor(seg.durationMin / 60)} unit="h" min={0} max={24} onChange={(v) => onChange({ durationMin: (v ?? 0) * 60 + (seg.durationMin % 60) })} />
                    <NumInput value={seg.durationMin % 60} unit="min" min={0} max={59} onChange={(v) => onChange({ durationMin: Math.floor(seg.durationMin / 60) * 60 + Math.min(59, v ?? 0) })} />
                  </div>
                </Field>
              </div>
              <div className="mode-optional">
                <span className="mode-optional-label">Optional</span>
                <div className="fields">
                  <NumField
                    label="Distanz"
                    unit="km"
                    step={0.1}
                    value={seg.distanceKm}
                    min={0}
                    max={1000}
                    onChange={(v) => onChange({ distanceKm: v })}
                    placeholder="–"
                    hint={r.speedLabel || 'Zeigt dein Ø-Tempo und verfeinert die Energie'}
                  />
                  {!!seg.distanceKm && <NumField label="Höhenmeter" unit="hm" value={seg.elevationM} min={0} max={10000} onChange={(v) => onChange({ elevationM: v ?? 0 })} />}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="fields">
        <Field label="Intensität nach" wide>
          <Segmented<IntensityMode>
            value={seg.intensityMode}
            onChange={(intensityMode) => onChange({ intensityMode })}
            options={[
              { value: 'zones', label: 'HF-Zonen' },
              bike ? { value: 'power' as const, label: 'Ø Watt' } : { value: 'pace' as const, label: 'Ø Pace' },
              { value: 'hr', label: 'Ø Herzfrequenz' },
            ]}
          />
        </Field>
      </div>
      {seg.intensityMode === 'zones' && <ZoneSliders zones={seg.zones} onChange={(zones) => onChange({ zones })} />}
      {seg.intensityMode === 'power' && (
        <div className="fields">
          <NumField label="Ø Leistung" unit="W" value={seg.targetPower} min={50} max={600} onChange={(v) => onChange({ targetPower: v })} hint={profile.ftp && seg.targetPower ? `${Math.round((seg.targetPower / profile.ftp) * 100)} % FTP` : 'FTP im Profil nötig'} />
        </div>
      )}
      {seg.intensityMode === 'pace' && (
        <div className="fields">
          {seg.timeMode === 'speed' || !seg.distanceKm ? (
            <Field label="Ø Pace" hint={profile.thresholdPaceSec ? `Schwelle ${fmtPace(profile.thresholdPaceSec)} /km` : 'Schwellenpace im Profil nötig'}>
              <PaceInput value={seg.paceSec} onChange={(paceSec) => onChange({ paceSec })} />
            </Field>
          ) : (
            <p className="muted small">Pace aus Distanz und Dauer: {r.speedLabel || '–'}</p>
          )}
        </div>
      )}
      {seg.intensityMode === 'hr' && (
        <div className="fields">
          <NumField label="Ø Herzfrequenz" unit="bpm" value={seg.targetHr} min={80} max={210} onChange={(v) => onChange({ targetHr: v })} />
        </div>
      )}
    </Card>
  );
}

function ZoneSliders({ zones, onChange }: { zones: Zones; onChange: (z: Zones) => void }) {
  const sum = zones.reduce((a, b) => a + b, 0);
  return (
    <div className="zone-sliders">
      {ZONE_NAMES.map((name, i) => (
        <div className="zone-slider" key={name}>
          <span className={`zone-dot z${i + 1}`} />
          <span className="zone-name">{name}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={zones[i]}
            style={{ ['--pct' as string]: `${zones[i]}%` }}
            onChange={(e) => {
              const z = [...zones] as Zones;
              z[i] = Number(e.target.value);
              onChange(z);
            }}
            aria-label={`Anteil ${name}`}
          />
          <span className="zone-pct">{zones[i]} %</span>
        </div>
      ))}
      <div className={`zone-sum ${sum === 100 ? 'ok' : ''}`}>
        Summe {sum} %
        {sum !== 100 && sum > 0 && (
          <button
            className="link"
            onClick={() => {
              const z = zones.map((v) => Math.round((v / sum) * 20) * 5) as Zones;
              z[z.indexOf(Math.max(...z))] += 100 - z.reduce((a, b) => a + b, 0);
              onChange(z);
            }}
          >
            auf 100 % verteilen
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Verpflegung

function FuelCard({
  seg,
  r,
  products,
  brick,
  onChange,
  onManage,
}: {
  seg: SegmentInput;
  r: SegmentResult;
  products: Product[];
  brick: boolean;
  onChange: (p: Partial<SegmentInput>) => void;
  onManage: () => void;
}) {
  const bike = seg.sport === 'bike';
  const drinks = products.filter((p) => p.type === 'drink');
  const feeds = products.filter((p) => p.type !== 'drink');
  const selected = seg.feedIds.map((id) => feeds.find((f) => f.id === id)).filter((x): x is Product => !!x);
  const manual = !!seg.feedCounts;
  const countOf = (id: string) => (manual ? seg.feedCounts![id] ?? 0 : r.feedCounts[id] ?? 0);
  const bottle = bike ? 'Flaschen' : 'Softflasks';

  const setCount = (id: string, n: number) => {
    const base: Record<string, number> = {};
    for (const f of selected) base[f.id] = countOf(f.id);
    onChange({ feedCounts: { ...base, [id]: n } });
  };

  const toggle = (f: Product) => {
    const on = seg.feedIds.includes(f.id);
    if (on) {
      const fc = seg.feedCounts ? { ...seg.feedCounts } : undefined;
      if (fc) delete fc[f.id];
      onChange({ feedIds: seg.feedIds.filter((x) => x !== f.id), feedCounts: fc });
    } else {
      onChange({ feedIds: [...seg.feedIds, f.id], feedCounts: seg.feedCounts ? { ...seg.feedCounts, [f.id]: 1 } : undefined });
    }
  };

  return (
    <Card
      title={brick ? `Verpflegung ${bike ? 'Rad' : 'Lauf'}` : 'Verpflegung'}
      icon={Icon.bolt}
      actions={
        <button className="btn small ghost" onClick={onManage}>
          Produkte verwalten
        </button>
      }
    >
      <div className="fields">
        <Field label="Iso-Drink" wide>
          <select value={seg.drinkId ?? ''} onChange={(e) => onChange({ drinkId: e.target.value || undefined, isoBottles: e.target.value && seg.isoBottles === 0 ? 1 : seg.isoBottles })}>
            <option value="">Kein Drink – nur Wasser</option>
            {drinks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.carbsG} g / {d.servingMl ?? 500} ml)
              </option>
            ))}
          </select>
        </Field>
        {seg.drinkId && <NumField label={`Iso-${bottle}`} value={seg.isoBottles} min={0} max={6} onChange={(v) => onChange({ isoBottles: v ?? 0 })} />}
        <NumField label={`Wasser-${bottle}`} value={seg.waterBottles} min={0} max={6} onChange={(v) => onChange({ waterBottles: v ?? 0 })} />
        <NumField label="Größe je Flasche" unit="ml" value={seg.bottleMl} min={100} max={1500} onChange={(v) => onChange({ bottleMl: v ?? 500 })} />
      </div>
      <div className="toggles">
        <Toggle checked={seg.refillPossible} onChange={(refillPossible) => onChange({ refillPossible })} label="Wasser nachfüllen unterwegs möglich" hint="Tankstelle, Friedhof, Verpflegungsstation" />
        {seg.drinkId && seg.refillPossible && (
          <Toggle checked={seg.drinkRefill} onChange={(drinkRefill) => onChange({ drinkRefill })} label="Iso kann neu angemischt werden" hint="Pulver dabei oder Iso an der Station – sonst nur Wasser nach dem Auffüllen" />
        )}
      </div>

      <Field label="Gels, Chews und Riegel" wide hint="Antippen zum Auswählen. Koffein-Gels kommen ins letzte Drittel.">
        <div className="chip-select">
          {feeds.length === 0 && <span className="muted">Noch keine Produkte angelegt.</span>}
          {feeds.map((f) => {
            const on = seg.feedIds.includes(f.id);
            return (
              <button key={f.id} type="button" className={`chip-toggle ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggle(f)}>
                <span>{f.name}</span>
                <small>
                  {TYPE_LABEL[f.type]} · {f.carbsG} g{f.caffeineMg ? ` · ${f.caffeineMg} mg Koffein` : ''}
                </small>
              </button>
            );
          })}
        </div>
      </Field>

      {selected.length > 0 && (
        <div className="qty-list">
          <div className="qty-head">
            <span>Anzahl mitnehmen</span>
            {manual ? (
              <button className="link" onClick={() => onChange({ feedCounts: undefined })}>
                automatisch berechnen
              </button>
            ) : (
              <span className="pill">automatisch</span>
            )}
          </div>
          {selected.map((f) => (
            <div className="qty-row" key={f.id}>
              <div>
                <div>{f.name}</div>
                <small className="muted">
                  {f.carbsG} g KH{f.caffeineMg ? ` · ${f.caffeineMg} mg Koffein` : ''} · zusammen {countOf(f.id) * f.carbsG} g
                </small>
              </div>
              <Stepper value={countOf(f.id)} muted={!manual} onChange={(n) => setCount(f.id, n)} />
            </div>
          ))}
          <div className="qty-sum">
            Unterwegs gesamt: <b>{r.carbs.perH} g KH/h</b> (Ziel {r.carbTargetGph} g/h)
          </div>
        </div>
      )}
    </Card>
  );
}

function FitInfo({ f, onClose }: { f: FitSummary; onClose: () => void }) {
  return (
    <div className="fit-info">
      <div className="fit-head">
        <b>{f.kind === 'course' ? 'Strecke' : f.parts.length > 1 ? 'Multisport-Aktivität' : 'Aktivität'} übernommen</b>
        {f.date && <span className="muted small">{f.date.toLocaleDateString('de-DE')}</span>}
        <button className="link" onClick={onClose}>
          schließen
        </button>
      </div>
      {f.parts.map((p, i) => {
        const items: [string, string][] = [];
        if (p.distanceKm) items.push(['Distanz', `${fmtNum(p.distanceKm, 1)} km`]);
        if (p.durationMin) items.push(['Dauer', fmtDuration(p.durationMin)]);
        if (p.elevationM != null) items.push(['Höhenmeter', `${p.elevationM} hm`]);
        if (p.avgHr) items.push(['Ø HF', `${p.avgHr} bpm`]);
        if (p.avgPower) items.push(['Ø Leistung', `${p.avgPower} W${p.normalizedPower ? ` (NP ${p.normalizedPower})` : ''}`]);
        if (p.kcal) items.push(['Gerät kcal', `${p.kcal} kcal`]);
        if (p.zonesSource) items.push(['Zonen aus', p.zonesSource]);
        return (
          <div key={i}>
            {f.parts.length > 1 && <div className="small muted">{p.sport === 'bike' ? 'Rad' : 'Lauf'}</div>}
            <div className="fit-grid">
              {items.map(([k, v]) => (
                <div key={k}>
                  <span>{k}</span>
                  <b>{v}</b>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {f.kind === 'course' && <p className="small muted">Kursdatei ohne Zeit – Dauer oder Ø-Tempo eintragen.</p>}
    </div>
  );
}
