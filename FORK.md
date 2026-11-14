# Dieser Fork

Persönlicher Fork von [niltonheck/open-posture-companion](https://github.com/niltonheck/open-posture-companion) mit dem Ziel, den Upright GO 1 unter Android zu nutzen und die App später selbst zu erweitern.

Der Fork ändert am Original so wenig wie möglich. Alles Eigene liegt in zusätzlichen Dateien, damit Updates aus dem Original ohne Konflikte übernommen werden können:

| Datei | Zweck |
|---|---|
| `app.config.js` | Fork-Einstellungen über `app.json`: eigene App-ID, Versionskennung, entfernte Berechtigungen |
| `scripts/build-android.sh` | Baut die APK (lokal und in GitHub Actions identisch) |
| `scripts/check-ble-write-safety.mjs` | Prüfung gegen gefährliche Schreibzugriffe auf das Gerät |
| `scripts/upstream-sync.sh` | Bereitet Updates aus dem Original als Pull Request vor |
| `.github/workflows/android-apk.yml` | Baut die APK bei jedem Pull Request und veröffentlicht sie nach dem Merge |
| `.github/workflows/upstream-sync.yml` | Sucht wöchentlich nach Updates im Original |
| `STATUS.md` | Offene Punkte |

Aus dem Original übernommen ist außerdem der Android-Beitrag von Dmitry Brant ([Original-PR #1](https://github.com/niltonheck/open-posture-companion/pull/1), Commit `eca6449`): Android-Berechtigungen und die korrekte Auswertung negativer Neigungswerte.

## APK installieren

1. APK aufs Smartphone laden. Die jeweils neueste liegt unter
   <https://github.com/IlianP/open-posture-companion/releases/latest/download/open-posture-companion.apk>
   (sobald der erste Release gebaut ist, siehe „Einmalige Einrichtung“).
2. Datei öffnen. Android fragt beim ersten Mal, ob der Browser oder Dateimanager Apps installieren darf — erlauben. Eine Warnung von Play Protect vor einer unbekannten App ist bei selbst gebauten APKs normal.
3. App öffnen, auf „Scan“ tippen und die Berechtigung **Geräte in der Nähe** erlauben. Standortzugriff braucht die App nicht.
4. Upright GO einschalten und in der Liste auswählen. Nach jedem Ausschalten verliert das Gerät seine Kalibrierung; die App bietet sie direkt nach dem Verbinden an.

Das Gerät lässt nur eine Bluetooth-Verbindung zu. Wenn die App es nicht findet: die alte Hersteller-App schließen oder deinstallieren und das Gerät **nicht** in den Bluetooth-Einstellungen von Android koppeln.

Ohne Gerät lässt sich die App im Demo-Modus ansehen: „About“ öffnen, fünfmal auf die Versionszeile tippen, dann scannen.

### Updates der App

Die neue APK einfach über die vorhandene installieren; Einstellungen und Verlauf bleiben erhalten. Die installierte Version steht auf der „About“-Seite, z. B. `1.0.0-fork.20261114+abc1234` (Datum und Kennung des Commits, aus dem gebaut wurde).

Android lehnt eine APK ab, die älter ist als die installierte. Das betrifft nur den Wechsel zurück auf einen früheren Stand; dann vorher deinstallieren (der Verlauf geht dabei verloren).

## Updates aus dem Original

Jeden Montag prüft der Workflow **Upstream sync**, ob das Original neue Commits hat. Wenn ja, öffnet er einen Pull Request „Update aus dem Original“. Für diesen PR laufen dieselben Prüfungen wie für jede andere Änderung, und es wird eine Test-APK gebaut. Übernommen wird erst beim Mergen; bis dahin bleibt `main` unverändert.

- **Immer mit „Create a merge commit“ mergen**, nicht mit Squash oder Rebase. Nur so erkennt der nächste Lauf, was schon übernommen ist.
- Bei Konflikten mit eigenen Änderungen zeigt der PR die betroffenen Dateien; auflösen über „Resolve conflicts“ oder lokal.
- Den Knopf „Sync fork → Discard commits“ auf der GitHub-Startseite des Forks nicht benutzen: Er verwirft die eigenen Änderungen.
- Sofort prüfen statt bis Montag warten: Actions → Upstream sync → „Run workflow“.

Nach dem Mergen baut **Android APK** automatisch einen neuen Release.

## Selbst bauen

Über GitHub: Jeder Pull Request und jeder Push auf `main` baut die APK. Bei Pull Requests liegt sie als Artefakt am Workflow-Lauf, nach dem Merge als Release.

Lokal (Node 22, JDK 17, Android SDK mit gesetztem `ANDROID_HOME`):

```bash
npm ci
./scripts/build-android.sh    # Ergebnis: dist/open-posture-companion.apk
```

Der Ordner `android/` wird bei jedem Build aus `app.json` und `app.config.js` neu erzeugt und nicht eingecheckt. Es gibt also keinen nativen Code, der gepflegt werden muss.

Für die Entwicklung mit Live-Reload ist weiterhin der Weg des Originals gedacht (`npx expo run:android`, siehe README).

### Signatur

Die APK ist mit dem Debug-Schlüssel signiert, der dem Expo-Projekt-Template beiliegt. Er ist bei jedem Build derselbe, deshalb lassen sich neue Versionen über alte installieren. Er ist aber öffentlich bekannt: Die Signatur belegt nicht, dass eine APK aus diesem Fork stammt. APKs daher nur aus den eigenen Releases beziehen. Ein eigener Schlüssel ist möglich, bedeutet aber einmalig eine Neuinstallation.

## Firmware-Sicherheit

Der Upright GO 1 nimmt Firmware-Schreibzugriffe ohne jede Prüfung an. Der Autor des Originals hat so ein Gerät unbrauchbar gemacht; Ersatz gibt es nicht. Die [Protokolldokumentation](https://github.com/niltonheck/upright-go-1-reverse-engineering/blob/main/PROTOCOL.md) ist eindeutig: nie in den Dienst `aae0` schreiben, nie in ein Merkmal schreiben, dessen Funktion nicht belegt ist.

Die App schreibt ausschließlich in fünf auf Hardware bestätigte Merkmale: Kalibrieren (`aab1`), Pausenmodus (`aac7`), Vibration (`aad3`), rote und grüne LED (`aad4`, `aad6`).

`scripts/check-ble-write-safety.mjs` macht diese Regel überprüfbar und läuft bei jedem Build und in jedem Pull Request — auch bei Updates aus dem Original. Die Prüfung schlägt fehl, wenn

- eine Bluetooth-Kennung im Code auftaucht, die nicht auf der geprüften Liste steht,
- ein Schreibzugriff ein anderes als die fünf Merkmale zum Ziel hat, oder
- eine neue Stelle im Code schreibt, die die Prüfung noch nicht kennt.

Ein Fehlschlag heißt: erst mit der Protokolldokumentation abgleichen, dann die Listen im Skript im selben Pull Request erweitern. Ohne bestandene Prüfung wird kein Release veröffentlicht.

Für eigene Erweiterungen gilt dasselbe wie im Original (README, „Ground rules“): Bluetooth-Kennungen und Befehlsbytes nur in `src/device/characteristics.ts`, Zugriffe aufs Gerät nur über `src/device/`.

## Bekannte Einschränkungen unter Android

- **Statistik nur bei geöffneter App.** Die Hintergrund-Erfassung des Originals ist für iOS gebaut. Android darf eine App im Hintergrund jederzeit anhalten oder beenden; dann fehlen in der Statistik die Minuten, bis die App wieder geöffnet wird. Die Haltungserinnerung selbst (Vibration im Trainingsmodus) erzeugt das Gerät eigenständig und funktioniert auch ohne Verbindung.
- **Nur 64-Bit-ARM** (`arm64-v8a`), ab Android 12. Andere Architekturen: `ANDROID_ABIS=arm64-v8a,x86_64 ./scripts/build-android.sh`.
- Das Original nennt Android ausdrücklich als noch nicht auf Geräten verifiziert. Was in diesem Fork bereits getestet ist und was noch aussteht, steht in `STATUS.md`.

## Einmalige Einrichtung auf GitHub

1. **Actions aktivieren:** In diesem Fork bereits geschehen. Falls die Workflows einmal nicht laufen: Reiter „Actions“ öffnen und dort freischalten.
2. **Pull Requests durch Actions erlauben:** Settings → Actions → General → Workflow permissions → „Allow GitHub Actions to create and approve pull requests“. Ohne diese Einstellung kann der Sync-Workflow den Branch vorbereiten, aber keinen PR öffnen.
3. Optional, erst wenn das Original eigene Workflows unter `.github/workflows/` einführt: ein Personal Access Token (Contents, Pull requests, Workflows: Read and write) als Secret `SYNC_TOKEN`. Das eingebaute Token darf solche Dateien nicht pushen.

GitHub schaltet zeitgesteuerte Workflows ab, wenn 60 Tage lang nichts im Repository passiert. Dann im Reiter „Actions“ wieder aktivieren.
