import { useState } from 'react';
import { fmtDuration, fmtNum, goalLabel, typeLabel, type PlanResult, type SegmentResult, type TimedItem } from '../lib/calc';
import type { Profile, SessionInput } from '../lib/types';
import { Card, Icon, Stat } from './ui';
import { Timeline } from './Timeline';
import { CarbDonut } from './CarbDonut';

type Tab = 'pre' | 'intra' | 'post';

export function PlanResultView({ r, s, profile }: { r: PlanResult; s: SessionInput; profile: Profile }) {
  const [tab, setTab] = useState<Tab>('intra');
  const start = new Date(s.start);
  const end = new Date(start.getTime() + r.totalMin * 60000);
  const warn = r.notes.filter((n) => n.level === 'warn');
  const info = r.notes.filter((n) => n.level !== 'warn');
  const brick = r.segments.length > 1;
  const dist = r.segments.reduce((a, sg) => a + (sg.distanceKm ?? 0), 0);
  const hm = r.segments.reduce((a, sg) => a + (sg.elevationM ?? 0), 0);
  const na = r.sodiumBalance;
  const naGap = Math.max(0, Math.round((na.needTotal - na.suppliedTotal) / 50) * 50);
  const naStatus = na.coveragePct >= 85 ? 'ok' : r.sodiumImportant ? 'short' : 'optional';
  const perSeg = (fn: (sg: SegmentResult) => string) => r.segments.map((sg) => `${sg.label} ${fn(sg)}`).join(' · ');

  return (
    <div className="result">
      <div className="result-head">
        <div className="eyebrow">
          {typeLabel(s.type)} · {goalLabel(s.goal)} · {r.zoneLabel}
        </div>
        <h1>{s.title || 'Dein Fuelling-Plan'}</h1>
        <div className="muted small">
          {start.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })} · {clock(start)}–{clock(end)} · {fmtDuration(r.totalMin)}
          {dist ? ` · ${fmtNum(dist, 1)} km` : ''}
          {hm ? ` · ${fmtNum(hm)} hm` : ''}
        </div>
      </div>

      <div className="hero">
        <CarbDonut target={r.carbTargetGph} drink={r.planned.drinkPerH} feed={r.planned.feedPerH} tolerance={profile.carbToleranceGph} need={r.carbNeedGph} />
        <div className="hero-carb">
          <div className="stat-label">Kohlenhydrate unterwegs</div>
          <div className="hero-carb-line">
            <span className="lg-dot drink" /> Iso <b>{r.planned.drinkPerH} g/h</b>
            <span className="lg-dot feed" /> Gels/Riegel <b>{r.planned.feedPerH} g/h</b>
          </div>
          <div className="muted small">
            {r.carbTargetGph > 0 ? `Empfohlen: ${r.ratioRecommendation}` : 'Für diese Einheit nicht nötig'}
            {brick ? ` · ${perSeg((sg) => `${sg.carbTargetGph} g/h`)}` : ''}
          </div>
          {r.toleranceExceeded && (
            <div className="tol-warn">
              {Icon.alert} Bedarf {r.carbNeedGph} g/h &gt; Verträglichkeit {profile.carbToleranceGph} g/h
            </div>
          )}
        </div>
        <div className="stats">
          <Stat
            tone="water"
            label="Trinken"
            value={fmtNum(r.segments[0].fluidMlPerH)}
            unit="ml/h"
            sub={brick ? perSeg((sg) => `${sg.fluidMlPerH}`) + ' ml/h' : `Schweiß ~${fmtNum(r.segments[0].sweatLph, 1)} L/h`}
          />
          <Stat
            tone="salt"
            label="Natrium"
            value={`~${fmtNum(na.needPerH)}`}
            unit="mg/h Bedarf"
            sub={
              <>
                Produkte {fmtNum(na.suppliedPerH)} mg/h · {Math.min(na.coveragePct, 999)} % gedeckt
                <br />
                <span className={`na-status ${naStatus}`}>
                  {naStatus === 'ok'
                    ? '✓ ausreichend'
                    : naStatus === 'optional'
                      ? `unter 90 min optional${naGap > 0 ? ` (~${fmtNum(naGap)} mg fehlen)` : ''}`
                      : `fehlen ~${fmtNum(naGap)} mg ≈ ${fmtNum(naGap / 400, 1)} g Salz`}
                </span>
              </>
            }
          />
          <Stat tone="energy" label="Verbrauch" value={fmtNum(r.kcalTotal)} unit="kcal" sub={`${r.kcalPerH} kcal/h`} />
          <Stat
            tone="carb"
            label="Aufnahme"
            value={fmtNum(r.planned.kcalTotal)}
            unit="kcal"
            sub={
              r.planned.kcalTotal > 0 ? (
                <>
                  {r.planned.kcalPerH} kcal/h · {Math.round((r.planned.kcalTotal / Math.max(1, r.kcalTotal)) * 100)} % gedeckt
                  <br />
                  Iso {fmtNum(r.planned.drinkKcal)} · Gels {fmtNum(r.planned.feedKcal)} kcal
                </>
              ) : (
                'keine Verpflegung geplant'
              )
            }
          />
        </div>
      </div>

      {warn.length > 0 && (
        <div className="notes">
          {warn.map((n, i) => (
            <div key={i} className="note warn">
              {Icon.alert}
              <span>{n.text}</span>
            </div>
          ))}
        </div>
      )}

      <div className="tabs" role="tablist">
        {(
          [
            ['pre', 'Pre', 'Vorher'],
            ['intra', 'Intra', 'Unterwegs'],
            ['post', 'Post', 'Danach'],
          ] as const
        ).map(([k, a, b]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            <b>{a}</b>
            <span>{b}</span>
          </button>
        ))}
      </div>

      {tab === 'pre' && (
        <>
          {r.carbLoading && (
            <Card title="Carb-Loading" className="accent-carb">
              <div className="loading-grid">
                <div>
                  <span>Wann</span>
                  <b>{r.carbLoading.days}</b>
                </div>
                <div>
                  <span>Menge</span>
                  <b>{r.carbLoading.gPerKg}</b>
                </div>
                <div>
                  <span>Für dich</span>
                  <b>{r.carbLoading.gramsPerDay}</b>
                </div>
              </div>
              <p className="small muted">{r.carbLoading.detail}</p>
            </Card>
          )}
          <Card title="Vor dem Start">
            <Schedule items={r.pre} base={start} prefix="vorher" />
          </Card>
        </>
      )}

      {tab === 'intra' && (
        <>
          <Card title="Zeitplan unterwegs">
            {r.carbTargetGph === 0 && r.segments.every((sg) => sg.fluidMlPerH === 0) ? (
              <p className="muted">Für diese Einheit ist keine Verpflegung nötig.</p>
            ) : (
              <>
                <Timeline events={r.events} totalMin={r.totalMin} segments={r.segments} />
                {r.segments.map((sg) => (
                  <SegmentSummary key={sg.sport} sg={sg} brick={brick} />
                ))}
                <IntraTable r={r} start={start} brick={brick} />
              </>
            )}
          </Card>
          {r.segments.some((sg) => sg.packing.length) && (
            <Card title="Packliste">
              {r.segments.map((sg) =>
                sg.packing.length ? (
                  <div key={sg.sport}>
                    {brick && <div className="pack-head">{sg.sport === 'bike' ? 'Rad' : 'Lauf (T2 bereitlegen)'}</div>}
                    <ul className="packlist">
                      {sg.packing.map((p, i) => (
                        <li key={i}>
                          <span>{p.label}</span>
                          <b>{p.count}</b>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
            </Card>
          )}
        </>
      )}

      {tab === 'post' && (
        <Card title="Nach der Einheit">
          <Schedule items={r.post} base={end} prefix="nach Ende" />
        </Card>
      )}

      {info.length > 0 && (
        <div className="notes">
          {info.map((n, i) => (
            <div key={i} className="note info">
              {Icon.info}
              <span>{n.text}</span>
            </div>
          ))}
        </div>
      )}

      <details className="method">
        <summary>So wurde gerechnet</summary>
        <ul>
          {r.segments.map((sg) => (
            <li key={sg.sport}>
              {brick ? `${sg.label}: ` : ''}
              {fmtDuration(sg.durationMin)}
              {sg.durationFromSpeed ? ` (aus Distanz und ${sg.speedLabel})` : ''} · {sg.intensitySource} → {sg.zoneLabel} (I ≈ {fmtNum(sg.I, 2)}) · {sg.energyMethod} → {sg.kcalPerH} kcal/h, ~
              {sg.carbBurnGph} g KH/h und ~{sg.fatBurnGph} g Fett/h verbrannt
            </li>
          ))}
          <li>
            KH-Ziel: {r.carbTargetReason}; trainierte Aufnahme {profile.carbToleranceGph} g/h
            {brick ? '; Rad +10 %, Lauf −20 % (Magen verträgt auf dem Rad mehr)' : ''}
          </li>
          <li>
            Glykogen beim Start: {r.glycogen.label} (Belastung 24–48 h: {{ rest: 'Ruhetag/locker', normal: 'normal', hard: 'hart/lang' }[s.priorLoad]}, KH am Vortag:{' '}
            {{ low: 'wenig', normal: 'normal', high: 'viel' }[s.priorCarbs]})
            {r.glycogen.carbMult > 1
              ? ` → KH unterwegs +${Math.round((r.glycogen.carbMult - 1) * 100)} %, erste Verpflegung spätestens nach ${r.glycogen.firstFeedMax} min, +${fmtNum(r.glycogen.preExtraGPerKg, 1)} g/kg KH vorher`
              : ' → keine Anpassung'}
          </li>
          <li>
            Körpermaße: Grundumsatz {fmtNum(r.body.bmr)} kcal/Tag (Mifflin-St Jeor aus {profile.weightKg} kg, {profile.heightCm} cm, {profile.age} J.,{' '}
            {{ m: 'männlich', w: 'weiblich', d: 'divers' }[profile.sex]}) – korrigiert MET-Schätzungen um Faktor {fmtNum(r.body.metFactor, 2)} und bestimmt die Tagesbilanz. Rad-Luftwiderstand CdA ≈{' '}
            {fmtNum(r.body.cdA, 2)} m² aus Größe und Gewicht.{profile.sex !== 'm' ? ' Geschlecht: etwas höhere Fettverbrennung und niedrigere Schweißrate angenommen.' : ''}
          </li>
          <li>
            Flüssigkeit: Schweißrate geschätzt aus {Math.round(r.weather.tempC)} °C, {Math.round(r.weather.humidity)} % Luftfeuchte, Intensität und Gewicht → ~70 % ersetzen. Gewichtsverlust ≈ {fmtNum(r.massLossKg, 1)} kg (
            {fmtNum(r.massLossPct, 1)} %)
          </li>
          <li>
            Natrium: Schweißrate × ~{profile.saltySweater ? '1.200' : '800'} mg/L Natrium im Schweiß{profile.saltySweater ? ' (salziger Schweiß)' : ''} → ~60 % ersetzen, begrenzt auf 200–1.000 mg/h. Bedarf
            ~{fmtNum(na.needTotal)} mg, Produkte liefern {fmtNum(na.suppliedTotal)} mg. 1 g Salz ≈ 400 mg Natrium.
          </li>
          <li>Orientierungswerte nach gängigen Empfehlungen der Sporternährung (ACSM, Jeukendrup) – keine medizinische Beratung. Neues immer im Training testen.</li>
        </ul>
      </details>
    </div>
  );
}

function SegmentSummary({ sg, brick }: { sg: SegmentResult; brick: boolean }) {
  return (
    <div className="intra-summary">
      {brick && <div className="seg-title wide">{sg.sport === 'bike' ? 'Radteil' : 'Laufteil'} · {fmtDuration(sg.durationMin)}</div>}
      <div>
        <span>Geplant</span>
        <b>{sg.carbs.perH} g KH/h</b>
        <small>
          {sg.carbs.total} g gesamt · Ziel {sg.carbTargetGph}
        </small>
      </div>
      <div>
        <span>Verhältnis</span>
        <b>{sg.ratioLabel}</b>
        <small>Glukose : Fruktose</small>
      </div>
      <div>
        <span>Flüssigkeit</span>
        <b>{fmtNum(sg.fluidTotalMl / 1000, 1)} L</b>
        <small>
          {sg.fluidMlPerH} ml/h{sg.refills ? ` · ${sg.refills}× nachfüllen` : ''}
        </small>
      </div>
      <div>
        <span>Natrium</span>
        <b>{sg.sodium.perH} mg/h</b>
        <small>aus Produkten</small>
      </div>
      {sg.drink && (
        <div className="wide">
          <span>Iso anmischen</span>
          <b>
            {fmtNum(sg.drink.servingsPerBottle, 1)} Portionen {sg.drink.product.name} pro {sg.sport === 'run' ? 'Softflask' : 'Flasche'}
          </b>
          <small>
            = {Math.round(sg.drink.carbsPerBottle)} g KH ({Math.round(sg.drink.concentrationGL)} g/L) · {sg.drink.mlPerH} ml/h Iso
            {sg.drink.lastsUntilMin < sg.startMin + sg.durationMin - 5 ? ` · reicht bis Minute ${sg.drink.lastsUntilMin}, danach Wasser` : ''}
          </small>
        </div>
      )}
    </div>
  );
}

function IntraTable({ r, start, brick }: { r: PlanResult; start: Date; brick: boolean }) {
  const rows = r.events.filter((e) => e.type !== 'drink');
  return (
    <div className="table-wrap">
      <table className="schedule-table">
        <thead>
          <tr>
            <th>Min</th>
            <th>Uhrzeit</th>
            <th>Was</th>
            <th className="num-col">KH</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e, i) => (
            <tr key={i} className={`ev-${e.type}`}>
              <td>{e.min}'</td>
              <td>{clock(new Date(start.getTime() + e.min * 60000))}</td>
              <td>
                <span className={`ev-dot ${e.type}`} />
                {brick && <span className={`seg-tag ${e.sport}`}>{e.sport === 'bike' ? 'Rad' : 'Lauf'}</span>}
                {e.label}
                {e.caffeineMg ? <span className="chip caf small">{e.caffeineMg} mg Koffein</span> : null}
              </td>
              <td className="num-col">{e.carbsG ? `${e.carbsG} g` : ''}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                Nur trinken – keine festen Verpflegungszeitpunkte.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Schedule({ items, base, prefix }: { items: TimedItem[]; base: Date; prefix: string }) {
  return (
    <ol className="schedule">
      {items.map((it, i) => {
        const at = new Date(base.getTime() + it.offsetMin * 60000);
        const rel = it.offsetMin === 0 ? (prefix === 'vorher' ? 'Start' : 'direkt') : `${fmtDuration(Math.abs(it.offsetMin))} ${prefix}`;
        return (
          <li key={i}>
            <div className="sched-time">
              <b>{clock(at)}</b>
              <span>{rel}</span>
            </div>
            <div className="sched-body">
              <div className="sched-title">{it.title}</div>
              <div className="sched-amounts">
                {it.carbsG ? <span className="chip carb">{it.carbsG} g KH</span> : null}
                {it.proteinG ? <span className="chip">{it.proteinG} g Protein</span> : null}
                {it.ml ? <span className="chip water">{fmtNum(it.ml)} ml</span> : null}
                {it.sodiumMg ? <span className="chip salt">{it.sodiumMg} mg Na</span> : null}
                {it.caffeineMg ? <span className="chip caf">{it.caffeineMg} mg Koffein</span> : null}
              </div>
              <p>{it.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const clock = (d: Date) => d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
