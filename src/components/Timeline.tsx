import type { IntraEvent, SegmentResult } from '../lib/calc';

/** Horizontaler Zeitstrahl mit Segmenten (Rad/Lauf), Verpflegung, Trinken und Nachfüllen. */
export function Timeline({ events, totalMin, segments }: { events: IntraEvent[]; totalMin: number; segments: SegmentResult[] }) {
  const W = 1000,
    H = 104,
    pad = 24,
    axisY = 62;
  const x = (min: number) => pad + (min / Math.max(1, totalMin)) * (W - 2 * pad);
  const step = totalMin > 300 ? 60 : totalMin > 120 ? 30 : 15;
  const ticks: number[] = [];
  for (let t = 0; t <= totalMin; t += step) ticks.push(t);
  const feeds = events.filter((e) => e.type === 'feed');
  const brick = segments.length > 1;

  return (
    <div className="timeline">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Zeitstrahl der Verpflegung">
        {segments.map((sg) => (
          <g key={sg.sport}>
            <rect x={x(sg.startMin)} y={axisY - 4} width={Math.max(2, x(sg.startMin + sg.durationMin) - x(sg.startMin))} height={8} rx={4} className={`tl-seg ${sg.sport}`} />
            {brick && (
              <text x={x(sg.startMin) + 4} y={axisY + 40} className="tl-seg-label">
                {sg.label}
              </text>
            )}
          </g>
        ))}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={axisY + 7} y2={axisY + 12} className="tl-tick" />
            <text x={x(t)} y={axisY + 26} textAnchor="middle" className="tl-label">
              {t >= 60 ? `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` : `${t}'`}
            </text>
          </g>
        ))}
        {events
          .filter((e) => e.type === 'drink')
          .map((e, i) => (
            <rect key={`d${i}`} x={x(e.min) - 2} y={axisY - 15} width={4} height={9} rx={2} className="tl-drink">
              <title>{`${e.min}' – ${e.label}`}</title>
            </rect>
          ))}
        {events
          .filter((e) => e.type === 'refill')
          .map((e, i) => (
            <g key={`r${i}`} transform={`translate(${x(e.min)} ${axisY})`}>
              <rect x={-6} y={-6} width={12} height={12} transform="rotate(45)" className="tl-refill" />
              <title>{`${e.min}' – ${e.label}`}</title>
            </g>
          ))}
        {feeds.map((e, i) => (
          <g key={`f${i}`}>
            <line x1={x(e.min)} x2={x(e.min)} y1={axisY - 5} y2={32} className="tl-stem" />
            <circle cx={x(e.min)} cy={22} r={e.caffeineMg ? 12 : 11} className={e.caffeineMg ? 'tl-feed caf' : 'tl-feed'} />
            <text x={x(e.min)} y={26} textAnchor="middle" className="tl-feed-label">
              {e.carbsG}
            </text>
            <title>{`${e.min}' – ${e.label} (${e.carbsG} g KH)`}</title>
          </g>
        ))}
      </svg>
      <div className="tl-legend">
        <span>
          <i className="lg-feed" /> Gel/Riegel (g KH)
        </span>
        <span>
          <i className="lg-caf" /> mit Koffein
        </span>
        <span>
          <i className="lg-drink" /> Trinken (alle 15 min)
        </span>
        <span>
          <i className="lg-refill" /> Nachfüllen
        </span>
        {brick && (
          <>
            <span>
              <i className="lg-bike" /> Rad
            </span>
            <span>
              <i className="lg-run" /> Lauf
            </span>
          </>
        )}
      </div>
    </div>
  );
}
