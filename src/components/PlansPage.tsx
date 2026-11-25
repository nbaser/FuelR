import { activeSegments, fmtDuration, fmtNum, goalLabel, typeLabel } from '../lib/calc';
import { defaultSession, migrateSession, usePersistent } from '../lib/storage';
import type { SavedPlan, SessionInput } from '../lib/types';
import { Card, Icon } from './ui';

export function PlansPage({ onOpen }: { onOpen: () => void }) {
  const [plans, setPlans] = usePersistent<SavedPlan[]>('plans', []);
  const [, setDraft] = usePersistent<SessionInput>('draft', defaultSession());
  const [, setLocked] = usePersistent<boolean>('draftLocked', false);

  return (
    <div className="page">
      <div className="page-intro">
        <h1>Gespeicherte Pläne</h1>
        <p>Einheiten, die du gespeichert hast. Öffnen lädt sie in die Planung – das Wetter wird dann neu abgerufen.</p>
      </div>
      {plans.length === 0 ? (
        <Card>
          <p className="muted">Noch keine Pläne gespeichert. In der Planung unten auf „Plan speichern“ klicken.</p>
        </Card>
      ) : (
        <Card>
          <div className="product-list">
            {plans.map((p) => {
              const s = migrateSession(p.session);
              const segs = activeSegments(s);
              const dur = segs.reduce((a, x) => a + x.durationMin, 0);
              const dist = segs.reduce((a, x) => a + (x.distanceKm ?? 0), 0);
              return (
                <div className="product-row" key={p.id}>
                  <div className="product-main">
                    <div className="product-name">
                      <span className="inline-icon">{s.type === 'run' ? Icon.run : Icon.bike}</span>
                      {s.title || typeLabel(s.type)}
                    </div>
                    <div className="product-meta">
                      <span className="chip">{new Date(s.start).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      <span className="chip">{typeLabel(s.type)}</span>
                      <span className="chip">{fmtDuration(dur)}</span>
                      {dist ? <span className="chip">{fmtNum(dist, 1)} km</span> : null}
                      <span className="chip">{goalLabel(s.goal)}</span>
                    </div>
                  </div>
                  <div className="product-actions">
                    <button
                      className="btn small"
                      onClick={() => {
                        setDraft(s);
                        setLocked(true);
                        onOpen();
                      }}
                    >
                      Öffnen
                    </button>
                    <button className="icon-btn" aria-label="Plan löschen" onClick={() => setPlans((l) => l.filter((x) => x.id !== p.id))}>
                      {Icon.trash}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
