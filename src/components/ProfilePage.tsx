import { useRef, useState } from 'react';
import { bodyInfo, fmtNum } from '../lib/calc';
import { DEFAULT_PROFILE, exportAll, importAll, usePersistent } from '../lib/storage';
import type { Profile } from '../lib/types';
import { fmtPace, hrZones, paceZones, parsePace, powerZones, ZONE_NAMES } from '../lib/zones';
import { Card, Field, Icon, NumField, Segmented, Toggle } from './ui';

export function ProfilePage() {
  const [profile, setProfile] = usePersistent<Profile>('profile', DEFAULT_PROFILE);
  const set = (patch: Partial<Profile>) => setProfile((p) => ({ ...p, ...patch, completed: true }));
  const [paceText, setPaceText] = useState(fmtPace(profile.thresholdPaceSec).replace('–', ''));
  const fileRef = useRef<HTMLInputElement>(null);
  const [backupMsg, setBackupMsg] = useState('');

  const hrBike = hrZones(profile, 'bike');
  const hrRun = hrZones(profile, 'run');
  const pw = powerZones(profile.ftp);
  const pz = paceZones(profile.thresholdPaceSec);
  const body = bodyInfo(profile);

  return (
    <div className="page">
      <div className="page-intro">
        <h1>Profil</h1>
        <p>Deine Körper- und Leistungswerte. Alles bleibt lokal auf diesem Mac. Je mehr du angibst, desto genauer wird die Berechnung – Pflicht ist nur das Gewicht.</p>
      </div>

      <div className="grid-2">
        <Card title="Basisdaten">
          <div className="fields">
            <Field label="Name (optional)">
              <input value={profile.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <NumField label="Gewicht" unit="kg" value={profile.weightKg} step={0.1} min={30} max={200} onChange={(v) => set({ weightKg: v ?? 0 })} hint="Basis für g/kg-Empfehlungen" />
            <NumField label="Größe" unit="cm" value={profile.heightCm} min={120} max={230} onChange={(v) => set({ heightCm: v ?? 0 })} hint="Grundumsatz, Luftwiderstand (Rad)" />
            <NumField label="Alter" unit="Jahre" value={profile.age} min={10} max={100} onChange={(v) => set({ age: v ?? 0 })} hint="Grundumsatz, Protein nach der Einheit" />
            <Field label="Geschlecht" hint="Grundumsatz, Fettverbrennung, Schweißrate">
              <Segmented
                value={profile.sex}
                onChange={(v) => set({ sex: v })}
                options={[
                  { value: 'm', label: 'männlich' },
                  { value: 'w', label: 'weiblich' },
                  { value: 'd', label: 'divers' },
                ]}
              />
            </Field>
          </div>
          <p className="field-hint">
            Grundumsatz ≈ <b>{fmtNum(body.bmr)} kcal/Tag</b> (Mifflin-St Jeor) · Luftwiderstand CdA ≈ {fmtNum(body.cdA, 2)} m² · Protein nach der Einheit {fmtNum(body.proteinGPerKg, 1)} g/kg
          </p>
        </Card>

        <Card title="Leistung" icon={Icon.bolt}>
          <div className="fields">
            <NumField label="FTP (Rad)" unit="W" value={profile.ftp} min={50} max={600} onChange={(v) => set({ ftp: v })} hint={profile.ftp ? `${(profile.ftp / profile.weightKg).toFixed(2).replace('.', ',')} W/kg` : 'Genaueste Basis für den Verbrauch'} />
            <Field label="Schwellenpace (Laufen)" hint="Pace ~1 h Wettkampf, z. B. 4:30">
              <div className="num">
                <input
                  value={paceText}
                  placeholder="m:ss"
                  onChange={(e) => {
                    setPaceText(e.target.value);
                    set({ thresholdPaceSec: e.target.value.trim() ? parsePace(e.target.value) : undefined });
                  }}
                />
                <span className="unit">/km</span>
              </div>
            </Field>
          </div>
        </Card>

        <Card title="Herzfrequenz" icon={Icon.heart}>
          <div className="fields">
            <NumField label="HFmax" unit="bpm" value={profile.hrMax} min={120} max={230} onChange={(v) => set({ hrMax: v })} />
            <NumField label="Ruhe-HF" unit="bpm" value={profile.hrRest} min={30} max={100} onChange={(v) => set({ hrRest: v })} />
            <NumField label="Schwellen-HF Rad" unit="bpm" value={profile.lthrBike} min={100} max={210} onChange={(v) => set({ lthrBike: v })} hint="Ø HF der letzten 20 min eines 30-min-Tests" />
            <NumField label="Schwellen-HF Laufen" unit="bpm" value={profile.lthrRun} min={100} max={210} onChange={(v) => set({ lthrRun: v })} />
          </div>
        </Card>

        <Card title="Verträglichkeit & Physiologie" icon={Icon.drop}>
          <div className="fields">
            <NumField
              label="Trainierte KH-Aufnahme"
              unit="g/h"
              value={profile.carbToleranceGph}
              min={20}
              max={150}
              onChange={(v) => set({ carbToleranceGph: v ?? 60 })}
              hint="Was du unterwegs sicher verträgst – Deckel für den Plan"
            />
          </div>
          <div className="toggles">
            <Toggle checked={profile.saltySweater} onChange={(v) => set({ saltySweater: v })} label="Salziger Schwitzer" hint="Weiße Salzränder auf Trikot/Cap" />
            <Toggle checked={profile.heatAcclimated} onChange={(v) => set({ heatAcclimated: v })} label="Hitzeakklimatisiert" />
            <Toggle checked={profile.caffeineSensitive} onChange={(v) => set({ caffeineSensitive: v })} label="Koffein-empfindlich" hint="Halbiert die Koffeinempfehlung" />
            <Toggle checked={profile.fructoseSensitive} onChange={(v) => set({ fructoseSensitive: v })} label="Fruktose-empfindlich" />
            <Toggle checked={profile.lowCarbDiet} onChange={(v) => set({ lowCarbDiet: v })} label="Low-Carb-Ernährung" hint="Etwas höhere Fettverbrennung angenommen" />
          </div>
        </Card>
      </div>

      <Card title="Deine Zonen">
        {!hrBike && !pw && !pz ? (
          <p className="muted">Gib HFmax, Schwellen-HF, FTP oder Schwellenpace an, um deine Zonen zu sehen.</p>
        ) : (
          <div className="table-wrap">
            <table className="zones-table">
              <thead>
                <tr>
                  <th>Zone</th>
                  {hrBike && <th>HF Rad</th>}
                  {hrRun && <th>HF Laufen</th>}
                  {pw && <th>Leistung</th>}
                  {pz && <th>Pace</th>}
                </tr>
              </thead>
              <tbody>
                {ZONE_NAMES.map((name, i) => (
                  <tr key={name}>
                    <td>
                      <span className={`zone-dot z${i + 1}`} />
                      {name}
                    </td>
                    {hrBike && <td>{range(hrBike.upper, i, 'bpm')}</td>}
                    {hrRun && <td>{range(hrRun.upper, i, 'bpm')}</td>}
                    {pw && <td>{range(pw.upper, i, 'W')}</td>}
                    {pz && <td>{paceRange(pz.upper, i)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="field-hint">
              Methode: {[hrBike?.method, pw?.method, pz?.method].filter(Boolean).join(' · ')}
            </p>
          </div>
        )}
      </Card>

      <Card title="Datensicherung">
        <p className="muted">Profil, Produkte und Pläne als Datei sichern oder wiederherstellen.</p>
        <div className="row-actions">
          <button
            className="btn"
            onClick={() => {
              const blob = new Blob([exportAll()], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `fuelr-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            {Icon.save} Sichern
          </button>
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>
            {Icon.file} Wiederherstellen
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                importAll(await f.text());
                setBackupMsg('Sicherung wiederhergestellt.');
                setPaceText(fmtPace((JSON.parse(localStorage.getItem('fuelr.profile') || '{}') as Profile).thresholdPaceSec).replace('–', ''));
              } catch (err) {
                setBackupMsg((err as Error).message);
              }
              e.target.value = '';
            }}
          />
          {backupMsg && <span className="muted">{backupMsg}</span>}
        </div>
      </Card>
    </div>
  );
}

function range(upper: number[], i: number, unit: string) {
  if (i === 0) return `< ${upper[0]} ${unit}`;
  if (i === 4) return `≥ ${upper[3]} ${unit}`;
  return `${upper[i - 1]}–${upper[i] - 1} ${unit}`;
}

function paceRange(upper: number[], i: number) {
  if (i === 0) return `langsamer ${fmtPace(upper[0])}`;
  if (i === 4) return `schneller ${fmtPace(upper[3])}`;
  return `${fmtPace(upper[i - 1])}–${fmtPace(upper[i])}`;
}
