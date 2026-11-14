# Status

Stand: 2026-11-14. Arbeitsweise und Aufbau des Forks: [FORK.md](FORK.md).

## Offene Punkte

Kennungen: A = Aufgabe, D = Entscheidung, I = Idee, W = Warnung. Kennungen werden nicht neu vergeben.

| Kennung | Stichwort | Zuständig | Quelle | Status |
|---|---|---|---|---|
| A1 | Pull Request „Android-APK, Builds und Upstream-Sync“ prüfen und mit Merge-Commit mergen | Du | PR im Fork | offen |
| A2 | GitHub-Einstellung setzen: „Allow GitHub Actions to create and approve pull requests“ (Actions selbst sind schon aktiv) | Du | FORK.md, „Einmalige Einrichtung“ | offen |
| A3 | APK installieren und Gerätetests durchgehen (Liste unten) | Du | dieser Abschnitt | offen |
| A4 | Nach dem Merge den ersten Release-Lauf und einen manuell gestarteten „Upstream sync“ kontrollieren | KI | `.github/workflows/` | wartet auf A1, A2 |
| W1 | Unter Android wird die Statistik nur bei geöffneter App erfasst (keine Hintergrund-Erfassung wie unter iOS) | – | FORK.md, „Bekannte Einschränkungen“ | offen |
| W2 | APK ist mit dem öffentlichen Debug-Schlüssel des Expo-Templates signiert | – | FORK.md, „Signatur“ | offen |
| W3 | Das Original wird laut Repository-Beschreibung auf Codeberg gepflegt, GitHub ist ein Spiegel. Der Sync liest den GitHub-Spiegel; beide waren am 2026-11-14 identisch. Bleibt der Spiegel einmal zurück, kommen Updates verspätet an | – | FORK.md, „Updates aus dem Original“ | offen |
| I1 | Eigener Signaturschlüssel über GitHub-Secrets (einmalige Neuinstallation nötig) | – | zu W2 | Idee |
| I2 | Android-Vordergrunddienst, damit die Statistik auch im Hintergrund weiterläuft | – | zu W1 | Idee |
| I3 | Ergebnisse der Gerätetests an das Original zurückmelden (dort ist Android noch nicht verifiziert) | – | Original-PR #1 | Idee |

## Gerätetests (zu A3)

Was nur mit dem echten Gerät geprüft werden kann. Reihenfolge so, dass ein Fehler früh auffällt.

1. **Start:** App öffnet ohne Absturz; „About“ zeigt die Version `1.0.0-fork.<Datum>+<Commit>`.
2. **Demo-Modus** (ohne Gerät): fünfmal auf die Versionszeile tippen, scannen, simuliertes Gerät verbinden, alle Seiten einmal öffnen.
3. **Berechtigung und Suche:** „Geräte in der Nähe“ erlauben; eingeschalteter Upright GO erscheint als `UprightGO` mit Signalstärke.
4. **Verbinden:** Status „verbunden“; Akkustand, Laden und „getragen“ werden angezeigt.
5. **Testvibration:** ein kurzes Vibrieren, das von selbst endet.
6. **Kalibrieren:** Gerät bestätigt mit doppeltem Vibrieren; danach zeigt die App aufrecht/gebeugt passend zur Haltung, und das Gerät vibriert im Trainingsmodus bei gebeugter Haltung.
7. **Zurücklehnen:** Nach hinten lehnen darf nicht als „gebeugt“ gelten (das behebt der übernommene Android-Beitrag).
8. **Modus:** Umschalten zwischen Training und Tracking in der App; Tastendruck am Gerät wird in der App angezeigt.
9. **Verbindungsabbruch:** außer Reichweite gehen und zurückkommen — die App verbindet sich wieder. App schließen und neu öffnen — sie verbindet sich direkt mit dem gemerkten Gerät.
10. **Hintergrund:** Telefon 15 Minuten sperren, dann die Statistik ansehen. Erwartung laut W1: Lücken. Bitte notieren, was tatsächlich passiert.
11. **Statistik:** nach einer Stunde Tragen plausible Werte für heute.
12. **Update:** eine neuere APK über die installierte installieren; Verlauf und gemerktes Gerät bleiben erhalten.

## Bereits geprüft

Stand 2026-11-14, ohne echtes Gerät.

- **Build:** Die Prüfungen (Schreibschutz, Typen, Lint) und der APK-Build laufen lokal und in GitHub Actions durch (Pull Request #1).
- **APK-Inhalt:** eigene App-ID, Versionskennung aus dem Commit, JavaScript eingebettet (kein Entwicklungsserver nötig), Signatur gültig, nur `arm64-v8a`, kompatibel mit 16-KB-Speicherseiten. Berechtigungen: Bluetooth (Suche ohne Standortbezug), Internet, Netzwerkstatus, Vibration.
- **Emulator** (Android 14, x86-64-Variante desselben Builds): App startet; Startseite, „About“ mit Versionszeile, Demo-Modus, Berechtigungsdialog „Geräte in der Nähe“, Hinweis bei ausgeschaltetem Bluetooth, Verbinden mit dem simulierten Gerät, Statusseite, Wechsel Training/Tracking, Testvibration, Statistik und Kalibrier-Seite funktionieren. Kein Absturz und kein JavaScript-Fehler im Geräteprotokoll.
- **Schreibschutz-Prüfung:** erkennt sieben absichtlich eingebaute Verstöße (u. a. Kennung aus dem Firmware-Dienst, Schreibzugriff auf ein Nur-Lese-Merkmal, neue Schreibstelle außerhalb der Geräteschicht).
- **Sync-Skript:** zehn Abläufe gegen nachgestellte Repositories, darunter Konflikte, von Hand aufgelöste Konflikte und ein bereits gemergtes Update.

## Noch nicht geprüft

- **Alles mit echtem Bluetooth:** Suche, Verbindung, Kalibrierung, Vibration, Moduswechsel und Statistik mit einem Upright GO 1. Der Emulator hat kein funktionierendes Bluetooth.
- **Die ARM-APK auf einem echten Telefon** (OnePlus 15, Android 16). Im Emulator lief die x86-64-Variante unter Android 14.
- **Release-Job und „Upstream sync“ auf GitHub.** Beide laufen erst, wenn die Workflows auf `main` liegen. Offen ist dabei insbesondere, ob das eingebaute Token den Sync-Branch pushen darf, obwohl dieser die Workflow-Dateien des Forks enthält (sonst: `SYNC_TOKEN`, siehe FORK.md).
