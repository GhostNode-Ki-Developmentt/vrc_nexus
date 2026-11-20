# Umsetzungskonzept: Nexus Community, Chat (E2EE) & NSFW-Overhaul

Stand 20.11.2026 · Grundlage: `docs/spec-community-nsfw-overhaul.md` · Status: **Konzept – wartet auf Entscheidungen (Abschnitt 7)**

## 1. Bestandsaufnahme (Analyse)

| Bereich | Heute | Folge für das Update |
|---|---|---|
| **Konto in der App** | Kein zentrales Konto. Identität = lokal angemeldetes VRChat-Konto (Sitzungs-Cookie verschlüsselt, Passwort nie gespeichert). | Neues **Nexus-Konto** auf GhostNode, eindeutig an die VRChat-User-ID gebunden – ohne eigenes Passwort. |
| **Rechte** | NXK1-Schlüssel (Ed25519, von der Besitzerin unterschrieben, an eine User-ID gebunden). Rechte `nsfw`, `toys`, `remote`, neu `mod`. Besitzerin per SHA-256 der User-ID. | NXK1 bleibt für **Supporter, Moderator, Admin**. NXK1 schaltet **kein NSFW mehr frei** (Spez. 4.1). |
| **NSFW in der App** | Freischaltung über NXK1 (`nsfw.js`), Werkzeuge lokal (Panik, Privat-Modus, Spielzeuge, Fernsteuerung). | Freischaltung künftig über **Verified 18+** (VRChat `ageVerificationStatus = "18+"`) + freiwilliger Schalter. Bestehende Werkzeuge bleiben, nur das Tor ändert sich. |
| **Webseite (GhostNode)** | PHP ohne Framework, SQLite/MySQL über `Db`, Dashboard-Benutzer mit Rollen/Rechten, VRChat-Anbindung je Dashboard-Benutzer, Krypto-Helfer, `toyrelay.php`, neu `nexuswarn.php` (NXK1-geprüfte JSON-API). | Wird das **zentrale Backend**: Konten, Profile, Rollen, Altersprüfung, Community-Beiträge, Chat-Zustellung (nur verschlüsselt). |
| **Echtzeit** | Keine WebSockets auf der Webseite (PHP). Toy-Relay arbeitet mit Abholen (Polling). | Chat-Zustellung per **Abholen** (offener Chat: alle 2–3 s, sonst 30–60 s) – läuft auf jedem PHP-Hoster. WebSocket später optional. |
| **Android** | Gleiches Backend per esbuild, eigenes `crypto`-Shim. | Kryptografie muss auch im Android-Build laufen (X25519/Ed25519/AES-GCM im Shim prüfen bzw. ergänzen). |

## 2. Identität & Nexus-Konto (Spez. 2.2, 4.2)

1. App fragt GhostNode nach einem **Bio-Code** (einmalig, 10 min gültig).
2. Die App schreibt den Code mit Zustimmung kurz in die eigene VRChat-Bio (über die eigene Sitzung) – oder der Nutzer trägt ihn selbst ein.
3. GhostNode liest die Bio über ein **Dienst-Konto** (VRChat-Konto der Webseite, Cookie verschlüsselt) → Code passt → **Nexus-Konto** für diese User-ID.
4. GhostNode gibt ein **Konto-Token** aus (nur als Hash gespeichert, widerrufbar, je Gerät). Der Code wird danach wieder aus der Bio entfernt.
5. Optional: Discord-Verknüpfung (`/verify`) als zweite Bestätigung der Identität – **keine** Altersfreigabe.

Bestehende Daten bleiben: die Warnliste nutzt weiter NXK1, ein späterer Wechsel auf das Konto-Token ist kompatibel möglich.

## 3. Altersfreigabe „Verified 18+“ (Spez. 3.2, 4.3, 7)

- **Nur serverseitig:** GhostNode ruft `GET /users/{id}` mit dem Dienst-Konto ab und liest `ageVerificationStatus`. Die App meldet den Status **nicht** selbst (nicht fälschbar).
- `18+` sichtbar → Rolle **Verified 18+** mit Ablaufzeit (Intervall = offene Entscheidung). Fehlt der Status oder ist er unsichtbar → Rolle entzogen, NSFW sofort gesperrt.
- Prüfung beim Aktivieren von NSFW, beim Ablauf der Rolle und zufällig verteilt im Hintergrund (Cron), damit die VRChat-API nicht belastet wird.
- **Jede** NSFW-Anfrage (Feed, Beiträge, Medien, Chat-Räume mit NSFW-Kennzeichen) prüft serverseitig: Konto gültig · Rolle Verified 18+ gültig · NSFW-Schalter des Nutzers an. Keine Ausnahme-Endpunkte.

## 4. Community

- **Profile** (gemeinsam mit dem Konto): Anzeigename aus VRChat, Bild, Banner, Beschreibung, Pronomen, Sprachen, Links, Interessen, Pride-Themes; optionaler **18+-Profilteil** nur für Verified 18+ mit NSFW an.
- **Beiträge/Timeline**: Text + Bilder, Reaktionen, Antworten; jedes Element trägt `rating = sfw | nsfw`. NSFW-Elemente liefert der Server nur bei bestandener Prüfung aus.
- **Gruppen** über VRChat Group-ID (später, 3.x).
- **Moderation**: Melden, Ausblenden, Löschen, Sperren durch **Moderatoren (`mod`)** und Admin; Protokoll wie bei der Warnliste.
- **Datenschutz**: Online-Dienste sind **opt-in**; ohne Aktivierung funktioniert die App wie bisher lokal.

## 5. Privat-Chat mit Ende-zu-Ende-Verschlüsselung

- **Server sieht nur verschlüsselte Nachrichten** (Absender-ID, Empfänger-ID/Gerät, Zeit, Größe). Kein Klartext, keine Schlüssel.
- Ablauf nach dem **Signal-Verfahren**: Geräteschlüssel (Identität), signierte Pre-Keys + Einmal-Pre-Keys auf dem Server, Sitzungsaufbau (X3DH bzw. PQXDH), danach **Double Ratchet** (Vorwärts-Geheimhaltung).
- **Sicherheitsnummern** zum Abgleich, Mehrgeräte-Unterstützung (je Gerät eigene Sitzung).
- Gruppenchats in einem späteren Schritt (Roadmap: Matrix/Megolm-Prinzip).
- Bibliothek: **offene Entscheidung** (siehe 7.1) – davon hängt Lizenz und Risiko ab.
- Speicherung in der App verschlüsselt (wie heute die Tokens), Nachrichten auf dem Server werden nach Abholung bzw. spätestens nach 30 Tagen gelöscht.

## 6. Reihenfolge (Vorschlag)

1. **Konto & Altersprüfung** (Bio-Code, Dienst-Konto, Rolle Verified 18+, NSFW-Schalter, serverseitige Prüfung) + Tests für alle Fehlerfälle (kein Status, unsichtbar, abgelaufen, entzogen, gefälschte Anfrage).
2. **NSFW-Tor in der App umstellen**: NSFW-Bereich nur noch mit Verified 18+ + Schalter; NXK1 nur noch Supporter/Moderator/Admin. Die Besitzerin behält Zugriff (Owner-Lock bleibt).
3. **Profile & Community-Feed** (SFW zuerst, dann NSFW-Teil gemäß Entscheidung).
4. **Privat-Chat E2EE** (1:1), danach Mehrgeräte, danach Gruppen.
5. Moderation, Benachrichtigungen, Android.

Jeder Schritt: eigene Version, Tests (Backend + Mock-Server + PHP-API), Übersetzungen DE/EN/FR/JA, Changelog.

## 7. Offene Entscheidungen (von der Besitzerin)

1. **E2EE-Bibliothek**: (a) eigene Umsetzung der veröffentlichten Signal-Spezifikationen mit Standard-Kryptografie (X25519, Ed25519, HKDF, AES-GCM) + Testvektoren; (b) offizielle `libsignal` – Lizenz **AGPL-3.0**, d. h. die App müsste quelloffen unter AGPL stehen; (c) Matrix-Krypto (vodozemac, Apache-2.0) – größer, auf Matrix zugeschnitten.
2. **Timeline**: NSFW nur im eigenen Feed oder nach Aktivierung auch in der normalen Timeline? (Spez. 8.1)
3. **Navigation**: Darstellung SFW/NSFW in der Oberfläche (Spez. 8.2).
4. **Prüfintervall** der Altersfreigabe (Spez. 8.3).
5. **Info bei Verlust** der Freigabe (Spez. 8.4).
6. **Moderationswerkzeuge für NSFW** (Spez. 8.5).
7. **Dienst-Konto**: Welches VRChat-Konto nutzt die Webseite zum Prüfen (empfohlen: eigenes Zweitkonto, nicht das Hauptkonto)?
8. **Bestehende NXK1-NSFW-Freischaltungen**: Übergangszeit, oder sofort Verified 18+ verlangen?
