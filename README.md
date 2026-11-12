# FuelR – Fuelling-Planer

Lokale Web-App (PWA) für Pre-, Intra- und Post-Fuelling beim Rennrad und Laufen.
Alle Daten bleiben im Browser auf diesem Mac (localStorage). Wetter kommt von Open-Meteo (ohne API-Key).

## Starten & als App installieren

```bash
npm install        # einmalig
npm run start      # baut die App und startet sie auf http://localhost:4173
```

1. In Chrome `http://localhost:4173` öffnen.
2. In der Adressleiste auf das Installieren-Symbol klicken (oder ⋮ → „Streamen, speichern und teilen“ → „Seite als App installieren“).
3. FuelR erscheint im Dock bzw. Launchpad. Nach dem ersten Laden läuft die App auch **ohne laufenden Server** (Service Worker).

Nach Code-Änderungen erneut `npm run start` ausführen und die App öffnen. Sie aktualisiert sich dann selbst.

> Wichtig: Immer Port **4173** verwenden. Die gespeicherten Daten hängen an `localhost:4173`.
> Für die Standortabfrage muss Chrome in macOS unter Systemeinstellungen → Datenschutz & Sicherheit → Ortungsdienste erlaubt sein.

## Entwicklung

```bash
npm run dev        # Hot-Reload auf http://localhost:5173 (eigene Daten, getrennt von 4173)
```

## Veröffentlichen auf GitHub Pages (Android & Co.)

Branches: Entwickelt wird auf `dev`, veröffentlicht wird `master`. Jeder Push auf `master` baut die App
über GitHub Actions (`.github/workflows/deploy.yml`) und stellt sie unter `https://<nutzer>.github.io/<repo>/` bereit.

Einmalig:

1. Auf GitHub ein öffentliches Repo anlegen (z. B. `fuelr`) und als `origin` hinzufügen.
2. Im Repo unter **Settings → Pages → Source** „GitHub Actions“ wählen.
3. `master` pushen – nach ~1 min ist die App online.

Auf dem Smartphone die Adresse in Chrome öffnen → ⋮ → „App installieren“. Daten liegen danach im Browser
des Handys (getrennt vom Mac) – übertragen über Profil → Datensicherung.

Der Pfad kommt aus der Umgebungsvariable `BASE_PATH` (im Workflow automatisch der Repo-Name).
Lokal testen: `BASE_PATH=/fuelr/ npm run build`.

## Aufbau

- `src/lib/calc.ts`: Berechnung (Energie, KH-Ziel, Flüssigkeit, Natrium, Pre/Intra/Post, Zeitplan)
- `src/lib/zones.ts`: HF-, Leistungs- und Pace-Zonen, Intensität
- `src/lib/weather.ts`: Standort + Open-Meteo-Prognose für das Zeitfenster der Einheit
- `src/lib/fit.ts`: FIT-Import (Garmin FIT SDK): Aktivitäten und Strecken
- `src/components/`: Seiten Planen, Pläne, Produkte, Profil
