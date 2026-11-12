const MAX = 120;

/**
 * Kreisdiagramm KH g/h (Skala 0–120 g/h).
 * Bögen: Iso (Bermuda) + Gels/Riegel (Corvette). Markierungen: Ziel (weiß), Verträglichkeit (Froly).
 */
export function CarbDonut({ target, drink, feed, tolerance, need }: { target: number; drink: number; feed: number; tolerance: number; need: number }) {
  const R = 52,
    C = 2 * Math.PI * R;
  const len = (g: number) => (Math.min(MAX, Math.max(0, g)) / MAX) * C;
  const dLen = len(drink);
  const fLen = Math.min(len(feed), C - dLen);
  const point = (g: number, r: number) => {
    const a = (Math.min(MAX, g) / MAX) * 2 * Math.PI - Math.PI / 2;
    return [60 + r * Math.cos(a), 60 + r * Math.sin(a)];
  };
  const tick = (g: number, cls: string, title: string) => {
    const [x1, y1] = point(g, R - 9);
    const [x2, y2] = point(g, R + 9);
    return (
      <line x1={x1} y1={y1} x2={x2} y2={y2} className={cls}>
        <title>{title}</title>
      </line>
    );
  };
  const over = need > tolerance;

  return (
    <div className={`donut ${over ? 'over' : ''}`}>
      <svg viewBox="0 0 120 120" role="img" aria-label={`Ziel ${target} g Kohlenhydrate pro Stunde, geplant ${drink + feed} g`}>
        <circle cx="60" cy="60" r={R} className="d-track" />
        {[30, 60, 90].map((g) => {
          const [x, y] = point(g, R);
          return <circle key={g} cx={x} cy={y} r="1.2" className="d-grid" />;
        })}
        {dLen > 0 && <circle cx="60" cy="60" r={R} className="d-drink" strokeDasharray={`${dLen} ${C}`} transform="rotate(-90 60 60)" />}
        {fLen > 0 && <circle cx="60" cy="60" r={R} className="d-feed" strokeDasharray={`${fLen} ${C}`} strokeDashoffset={-dLen} transform="rotate(-90 60 60)" />}
        {tolerance < MAX && tick(tolerance, 'd-tol', `Verträglichkeit ${tolerance} g/h`)}
        {target > 0 && tick(target, 'd-target', `Ziel ${target} g/h`)}
        <text x="60" y="58" textAnchor="middle" className="d-value">
          {target}
        </text>
        <text x="60" y="73" textAnchor="middle" className="d-unit">
          g KH / h
        </text>
        <text x="60" y="85" textAnchor="middle" className="d-sub">
          von max. {MAX}
        </text>
      </svg>
    </div>
  );
}
