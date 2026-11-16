import { Card, Icon } from './ui';

export function InfoPage() {
  return (
    <div className="page info-page">
      <div className="page-intro">
        <h1>Info</h1>
        <p>Wie FuelR rechnet und worauf du achten solltest. Alle Werte sind Orientierungswerte aus der Sporternährung – keine medizinische Beratung.</p>
      </div>

      <Card title="Sicherheitshinweise" icon={Icon.alert} className="info-safety">
        <ul className="info-list">
          <li>
            <b>Keine medizinische Beratung.</b> FuelR schätzt Bedarfe aus Durchschnittswerten. Dein tatsächlicher Bedarf kann deutlich abweichen. Bei Diabetes, Herz-, Nieren- oder
            Magen-Darm-Erkrankungen, Bluthochdruck, Essstörungen, in der Schwangerschaft oder bei regelmäßiger Medikamenteneinnahme den Plan vorher ärztlich abklären.
          </li>
          <li>
            <b>Nichts Neues am Wettkampftag.</b> Produkte, Mengen und Koffein immer zuerst im Training testen. Hohe KH-Mengen (über 60 g/h) muss der Darm erst lernen.
          </li>
          <li>
            <b>Nicht zu viel trinken.</b> Mehr trinken als du schwitzt kann zu einer gefährlichen Natrium-Verdünnung (Hyponatriämie) führen. Warnzeichen: Kopfschmerzen, Übelkeit, aufgeblähter
            Bauch, geschwollene Finger, Verwirrtheit. Wer nach der Einheit schwerer ist als vorher, hat zu viel getrunken.
          </li>
          <li>
            <b>Hitze ernst nehmen.</b> Bei Schwindel, Gänsehaut oder Frösteln trotz Hitze, ausbleibendem Schweiß oder Verwirrtheit sofort abbrechen, in den Schatten, kühlen und trinken. Bei
            Bewusstseinsstörungen den Notruf 112 wählen.
          </li>
          <li>
            <b>Unterzuckerung (Hungerast).</b> Zittern, plötzliche Schwäche, Heißhunger oder Konzentrationsprobleme: Tempo raus und sofort schnelle Kohlenhydrate (Gel, Iso, Cola) nehmen.
          </li>
          <li>
            <b>Koffein begrenzen.</b> Mehr als ~6 mg/kg (bei Empfindlichkeit ~3 mg/kg) bringt keinen Vorteil, erhöht aber Herzrasen, Unruhe und Magenprobleme. Koffein am Nachmittag stört den
            Schlaf und damit die Erholung.
          </li>
          <li>
            <b>Konzentrierte Iso-Drinks und Gels</b> mit Wasser nehmen. Zu viel Kohlenhydrat pro Liter bremst die Flüssigkeitsaufnahme und schlägt auf den Magen.
          </li>
          <li>
            <b>Wetter ist eine Prognose.</b> Vor dem Start die tatsächlichen Bedingungen prüfen und den Plan anpassen, wenn es wärmer oder länger wird.
          </li>
        </ul>
      </Card>

      <div className="grid-2">
        <Card title="Dauer und Intensität" icon={Icon.clock}>
          <ul className="info-list">
            <li>
              <b>Dauer</b> gibst du direkt ein oder sie ergibt sich aus Distanz und Ø-Tempo. Ohne eigenes Tempo nutzt FuelR einen Vorschlag.
            </li>
            <li>
              <b>Tempo-Vorschlag Rad:</b> aus FTP (oder W/kg-Richtwerten) über Rollwiderstand, Luftwiderstand und Steigung. Die Stirnfläche (CdA) wird aus Größe und Gewicht geschätzt, indoor
              entfällt der Luftwiderstand.
            </li>
            <li>
              <b>Tempo-Vorschlag Laufen:</b> aus der Schwellenpace je nach Intensität, plus ~5 s/km pro 10 Höhenmeter je km.
            </li>
            <li>
              <b>Intensität I</b> (Anteil der Schwelle) kommt aus der Zonenverteilung, Ø-Watt (÷ FTP), Ø-Pace oder Ø-Herzfrequenz:
              <div className="info-zones">
                <span>Z1 ≈ 0,50</span>
                <span>Z2 ≈ 0,65</span>
                <span>Z3 ≈ 0,83</span>
                <span>Z4 ≈ 0,98</span>
                <span>Z5 ≈ 1,10</span>
              </div>
            </li>
          </ul>
        </Card>

        <Card title="Energieverbrauch" icon={Icon.bolt}>
          <ul className="info-list">
            <li>
              <b>Rad:</b> Leistung × 3,58 ≈ kcal/h (Wirkungsgrad ~24 %). Die Leistung kommt aus Ø-Watt, FTP × Intensität oder – ohne FTP – aus Tempo und Höhenmetern.
            </li>
            <li>
              <b>Laufen:</b> ≈ 1 kcal pro kg und km plus Zuschlag für Höhenmeter, ohne Distanz aus Schwellenpace × Intensität.
            </li>
            <li>
              <b>Fallback:</b> MET-Werte je Intensität, korrigiert um deinen Grundumsatz (Mifflin-St Jeor aus Gewicht, Größe, Alter, Geschlecht).
            </li>
            <li>
              <b>KH-Anteil am Verbrauch</b> steigt mit der Intensität von ~35 % (Z1) bis ~92 % (Z5). Frauen und Low-Carb-Ernährung: etwas mehr Fett.
            </li>
          </ul>
        </Card>
      </div>

      <Card title="Kohlenhydrate unterwegs" icon={Icon.bolt}>
        <div className="info-cols">
          <table className="info-table">
            <thead>
              <tr>
                <th>Gesamtdauer</th>
                <th>Grundbedarf</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>unter 45 min</td>
                <td>keine</td>
              </tr>
              <tr>
                <td>45–75 min</td>
                <td>keine (30 g/h bei hoher Intensität oder leeren Speichern)</td>
              </tr>
              <tr>
                <td>75 min – 2 h</td>
                <td>45 g/h</td>
              </tr>
              <tr>
                <td>2–3 h</td>
                <td>60 g/h</td>
              </tr>
              <tr>
                <td>3–4 h</td>
                <td>75 g/h</td>
              </tr>
              <tr>
                <td>über 4 h</td>
                <td>90 g/h</td>
              </tr>
            </tbody>
          </table>
          <ul className="info-list">
            <li>
              Grundbedarf × <b>Intensität</b> (0,6–1,2) × <b>Ziel</b> (Locker 0,6 · Training 1,0 · Key 1,15 · Wettkampf 1,3) × <b>Glykogen</b> (1,0–1,2).
            </li>
            <li>Bei Training und lockeren Einheiten höchstens so viel, wie du schätzungsweise verbrennst. Lockere Einheiten unter 2 h: KH optional.</li>
            <li>
              Obergrenze 120 g/h und deine <b>Verträglichkeit</b> aus dem Profil.
            </li>
            <li>Über 60 g/h Glukose + Fruktose im Verhältnis 2:1, über 90 g/h 1:0,8.</li>
            <li>Brick: auf dem Rad +10 %, beim Laufen −20 % – der Magen verträgt auf dem Rad mehr.</li>
          </ul>
        </div>
      </Card>

      <div className="grid-2">
        <Card title="Flüssigkeit und Natrium" icon={Icon.drop}>
          <ul className="info-list">
            <li>
              <b>Schweißrate</b> aus Intensität, Gewicht, Temperatur (+4,5 % je °C über 15 °C), Luftfeuchte über 60 %, Sonne, Sportart und Geschlecht. Indoor ohne Fahrtwind: Rad +30 %,
              Laufband +15 %.
            </li>
            <li>Ersetzt werden ~70 % – höchstens 1.000 ml/h auf dem Rad und 800 ml/h beim Laufen.</li>
            <li>
              <b>Natrium:</b> Schweiß enthält ~800 mg/L (salziger Schweiß ~1.200 mg/L), davon ~60 % ersetzen, begrenzt auf 200–1.000 mg/h. Wichtig ab ~90 min oder ab 60 min bei 25 °C und
              mehr.
            </li>
            <li>Über 2 % Gewichtsverlust sinkt die Leistung spürbar.</li>
          </ul>
        </Card>

        <Card title="Vorher und nachher" icon={Icon.clock}>
          <ul className="info-list">
            <li>
              <b>Vorher:</b> 1–4 g/kg KH 1–4 h vor dem Start, 5–7 ml/kg Flüssigkeit 2–4 h vorher, Koffein ~3 mg/kg etwa 60 min vorher. Mit geleerten Speichern zusätzlich 0,5–1 g/kg.
            </li>
            <li>
              <b>Carb-Loading</b> vor Wettkämpfen über 90 min: 36–48 h vorher 8–12 g/kg pro Tag.
            </li>
            <li>
              <b>Nachher:</b> 1,0–1,2 g/kg KH pro Stunde bei schneller Erholung, 0,3 g/kg Protein (ab 50 Jahren 0,4 g/kg) und 125–150 % des Flüssigkeitsverlusts.
            </li>
          </ul>
        </Card>
      </div>

      <Card title="Quellen und Daten" icon={Icon.info}>
        <ul className="info-list">
          <li>Empfehlungen nach ACSM-Positionspapieren und Arbeiten von Asker Jeukendrup zur Kohlenhydrat-Aufnahme im Ausdauersport; Grundumsatz nach Mifflin-St Jeor.</li>
          <li>Profil, Produkte und Pläne bleiben nur in deinem Browser gespeichert. Für das Wetter wird dein Standort (auf ~100 m gerundet) an Open-Meteo gesendet.</li>
        </ul>
      </Card>
    </div>
  );
}
