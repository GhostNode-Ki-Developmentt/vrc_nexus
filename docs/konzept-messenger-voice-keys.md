# Konzept: Messenger · Voice · Permission & Key System (ab 3.4.0)

Stand 21.11.2026, 4:01 · Grundlage: Roadmap (ghostenode/Roadmap.php, Module 06–08) und Wünsche der Besitzerin vom 20./21.11.
Status: **3.4.0 gebaut** (Zustimmung 21.11.: „Bauen“, Multiaccount = beides). Spätere Releases (3.5 ff.) weiter nur Plan. Auf der Roadmap wird nichts abgehakt ohne Rückfrage.

Legende: ✅ vorhanden · 🟡 teilweise · ⬜ offen

---

## 1. Bestand

### 06 Nexus Messenger (22 Punkte)

| Punkt | Stand | Wo / Anmerkung |
|---|---|---|
| Private Direktnachrichten | ✅ | `backend/chat.js` + `nexuschat.php` – 1:1, Ende-zu-Ende |
| Gruppennachrichten | ⬜ | Community-Feed ist öffentlich, kein privater Gruppenchat |
| Nachrichtenverlauf | ✅ | nur auf dem Gerät, verschlüsselt, 500 je Unterhaltung |
| Bilder und Medien teilen | ⬜ | im Feed gibt es Bilder (`comm_upload`), im Chat nicht |
| GIF-Unterstützung | ⬜ | |
| Nachrichtenreaktionen | ⬜ | im Feed ✅, im Chat ⬜ |
| Nachrichtenfavoriten | ⬜ | |
| Angeheftete Nachrichten | ⬜ | |
| Desktop-Benachrichtigungen | ✅ | `host.notify` bei neuen Nachrichten |
| Android-Benachrichtigungen | ⬜ | Chat läuft auf Android noch gar nicht (Krypto fehlt) |
| Offline-Nachrichten zustellen | ✅ | Briefkasten auf der Webseite, Abholen beim nächsten Start |
| Nachrichten an VRChat-Nutzer ohne Nexus | ⬜ | Frage 3 |
| Nachrichten nach späterer Registrierung abrufen | ⬜ | hängt an Frage 3 |
| Boob-Funktion im Chat | ⬜ | Frage 4 |
| Heartbeat-Integration im Chat | ⬜ | Puls-Quelle (`heart.js`) existiert |
| Signal Protocol für Einzelchats | 🟡 | eigenes „Nexus-Protokoll“ nach X3DH + Double-Ratchet-Prinzip (`e2ee.js`). Ein Wechsel zu libsignal/PQXDH ist **nicht** entschieden. |
| Geräte-Schlüsselverwaltung | 🟡 | Gerät entfernen geht (`remove`), Übersicht in der App fehlt |
| Multi-Device-Unterstützung | ✅ | Nachricht geht an alle Geräte beider Seiten |
| Sicherheitsnummern | ✅ | mit Warnung bei Schlüsselwechsel |
| Matrix für Gruppenkommunikation | ⬜ | Frage 2 |
| Megolm-Gruppenverschlüsselung | ⬜ | Frage 2 |
| Gruppenschlüssel bei Mitgliederänderung erneuern | ⬜ | gehört zu Gruppen |

### 07 Nexus Voice (13 Punkte)

Alle Punkte sind ⬜, es gibt noch nichts. Voice braucht drei Bausteine:
- WebRTC mit Opus. Das kann Electron/Chromium von Haus aus, auf Android geht es in der WebView.
- Signalisierung zum Verbindungsaufbau.
- Für Gruppen und schwierige Netze zusätzlich einen TURN- bzw. SFU-Server. Das geht **nicht** auf einem reinen PHP-/Plesk-Webhosting: Dafür ist ein eigener Server oder Dienst nötig (siehe Frage 5).

### 08 Permission & Key System (22 Punkte)

| Punkt | Stand | Wo / Anmerkung |
|---|---|---|
| NXK1-Lizenzformat | ✅ | `backend/nsfw.js` |
| Public Key im Client | ✅ | |
| Private Key bleibt beim Herausgeber | ✅ | nur auf dem PC der Besitzerin, verschlüsselt |
| Signierte Lizenz-Keys | ✅ | Ed25519 |
| Bindung an VRChat User ID | ✅ | |
| Identitätsprüfung über die angemeldete VRChat-API | ✅ | ID kommt aus der eigenen Sitzung |
| Ausstellungs- und Ablaufdatum | ✅ | `iat` / `exp` |
| Multiaccount-Lizenztyp | ⬜ | **3.4**, Frage 1 |
| Mehrere gebundene Accounts verwalten | ⬜ | **3.4**, Frage 1 |
| Lizenzverwaltung | 🟡 | Liste ausgestellter Schlüssel und Widerruf im Admin; Verlängern und Suchen fehlen |
| Admin-Berechtigung | ✅ | Besitzerin über festen Hash der UID |
| Supporter-Berechtigung | ✅ | Rolle `supporter` |
| Toys-Berechtigung | 🟡 | seit 3.0 über Verified 18+ statt Schlüssel (so gewollt) |
| Remote-Berechtigung | 🟡 | wie Toys |
| Individuelle Funktionsrechte | 🟡 | nur Rollen, keine Einzelrechte |
| Zentrale Rechteprüfung | 🟡 | `access()`, aber nicht in allen Modulen genutzt |
| Fest hinterlegte Admin-UID | ✅ | als Hash (Owner-Lock, **wird nicht geschwächt**) |
| Admin-Identität über die VRChat-API prüfen | ✅ | |
| Admin-PC-Registrierung | ⬜ | Frage 6 |
| Admin-Zugriff bei fremder Identität verweigern | ✅ | |
| Admin-Funktion auf fremdem PC entfernen | ✅ | Admin-Seite wird gar nicht ausgeliefert |
| Berechtigungsänderungen protokollieren | 🟡 | Webseite loggt Teile (`nw_log`), die App nicht |

---

## 2. Vorschlag Release 3.4.0: Chat + Multiaccount + Menü-Umbau

### 2a. Mehr Chat-Funktionen

Ausgewählt nach Nutzen und Machbarkeit auf dem vorhandenen Briefkasten. Alles bleibt Ende-zu-Ende-verschlüsselt, die Webseite sieht weiterhin nur verschlüsselte Daten.

1. **Reaktionen** auf Nachrichten (Emoji). Werden als kleine verschlüsselte Steuer-Nachrichten verschickt.
2. **Antworten/Zitieren** sowie **Bearbeiten/Löschen** eigener Nachrichten, ebenfalls als Steuer-Nachrichten.
3. **Bilder** im Chat. Das Bild wird auf dem Gerät mit einem Zufallsschlüssel verschlüsselt und als Blob auf die Webseite hochgeladen (max. 5 MB). Der Schlüssel steckt in der E2E-Nachricht. Automatisches Löschen nach Abholung bzw. nach 30 Tagen.
4. **GIFs**. Als Bild-Upload ohne Fremddienst; eine GIF-Suche (Tenor/Giphy) wäre eine eigene Frage, weil sie Daten an Dritte gibt.
5. **Angeheftete Nachrichten** und **Favoriten**. Rein lokal, mit eigener Ansicht „★ Gemerkt“.
6. **Puls im Chat**. Knopf „💓 Puls teilen“ schickt den aktuellen Wert, auf Wunsch live für 5 Minuten. Nutzt `heart.js`.
7. **Gelesen/Zugestellt-Häkchen**, abschaltbar.
8. **Geräte-Übersicht** im Chat: eigene Geräte sehen und entfernen.

Bewusst **nicht** in 3.4:
- Gruppenchats (brauchen Gruppenschlüssel, siehe Abschnitt 3)
- Android-Chat (das Android-Krypto-Modul braucht erst X25519/Ed25519/AES-GCM, z. B. über WebCrypto in der WebView; machbar, aber eigener Schritt)
- Voice

### 2b. Multiaccount (Hauptfunktion, Bedeutung in Frage 1)

**Variante A – mehrere VRChat-Konten in VRC Nexus**
- Mehrere Konten anmelden und in der Profil-Box oben rechts umschalten.
- Jedes Konto hat eigene Sitzung (verschlüsselte Cookies), Freunde, Verlauf, Favoriten, Notizen, Chat-Schlüssel und Nexus-Konto.
- **Das Passwort wird nie gespeichert**, auch hier nicht. Ist eine Sitzung abgelaufen, wird neu angemeldet.
- Technisch: Die Datenbank hat schon überall `user_id`, bisher immer fest 1. Das wird pro Konto vergeben. Betroffen sind 8 Module mit `const UID = 1` und die Tabelle `accounts`. Die Daten des ersten Kontos bleiben unverändert.
- Optional später: zwei Konten gleichzeitig abgleichen (mehr Anfragen bei VRChat, deshalb zuerst nur Umschalten).
- Android: gleiches Prinzip.

**Variante B – Multiaccount-Lizenz (NXK1)**
- Ein Schlüssel gilt für mehrere VRChat-IDs, z. B. Haupt- und Zweitkonto.
- Neues Feld `uids` (Liste) statt `uid`, plus Höchstzahl. Alte Schlüssel bleiben gültig.
- Im Admin: gebundene Konten ansehen, hinzufügen, entfernen; jede Änderung wird protokolliert.
- Prüfung weiterhin über die angemeldete VRChat-ID. Der Owner-Lock bleibt unberührt: Die Besitzerin ist nur über den festen Hash erkennbar, ein Multiaccount-Schlüssel macht niemanden zur Besitzerin.

Beide Varianten ergänzen sich (A: mehrere Konten in der App, B: ein Schlüssel für alle diese Konten).

### 2c. Menü-Umbau (Wünsche vom 21.11., ~0:20)

1. Rechte Freundes-Seitenleiste: „ICH“ entfällt. Ein Klick auf die Profil-Box oben rechts öffnet Community → Mein Profil.
2. „NSFW / ERP“ kommt in den Abschnitt „Spiel“ unter Stream-Bot, weiterhin nur sichtbar, wenn freigeschaltet.
3. Gruppe „Mehr“ entfällt: Gruppen-Kalender, Galerie & Inventar sowie Shop & Käufe kommen in die Gruppe „Werkzeuge“ (Unterleiste). Die Einstellungen bleiben unten.
4. Abschnitt „Spiel“ heißt künftig „Spiel und Mehr“.
5. Die linke Seitenleiste beginnt wieder ganz oben. Der «-Einklapp-Knopf kommt in die Fußzeile der Leiste.
6. „Avatar-Suche“ kommt unter „Suche“ (als Unterreiter neben der Personen-/Weltsuche).

Das wird überall nachgezogen: Handy-Menü, Strg+1…9, Unterleisten, Befehlspalette, Übersetzungen. Keine Funktion geht verloren; alte Direktlinks werden umgeleitet.

### Tests für 3.4

Nur lokal mit Mocks:
- Chat mit zwei Test-Geräten gegen die lokale Webseiten-Kopie
- Multiaccount mit zwei Mock-Konten im `mock-vrchat.js`
- Lizenz mit Test-Schlüsselpaar
- Playwright-Bilder für das Menü

---

## 3. Spätere Releases (Vorschlag)

| Release | Inhalt |
|---|---|
| **3.5 – Chat auf Android + Gruppen** | Chat-Krypto für Android (WebCrypto); Android-Benachrichtigungen (lokal beim Abholen, im Hintergrund über den vorhandenen Web-Push-Weg `nexus_push.php`); **private Gruppenchats** nach dem Megolm-Prinzip (je Gruppe ein Sender-Schlüssel, verteilt über die vorhandenen 1:1-Sitzungen, Erneuerung bei Mitgliederänderung), max. ~50 Mitglieder |
| **3.6 – Voice 1:1** | WebRTC/Opus-Anrufe zwischen zwei Nutzern, Signalisierung über den vorhandenen Chat-Briefkasten (Abholen alle 1–2 s während des Anrufs); Mikro an/aus, Push-to-Talk, Lautstärke, Geräusch- und Echo-Unterdrückung (Browser-Standard); Medien-Verschlüsselung über DTLS-SRTP (WebRTC-Standard) |
| **3.7 – Voice-Räume/Gruppen** | Gruppen-Sprachchats und Räume für VRChat-Gruppen, aktiver Sprecher. **Braucht SFU + TURN auf einem eigenen Server** (Frage 5) |
| **3.8 – Rechte-System fertig** | Einzelrechte je Funktion, zentrale Prüfung in allen Modulen, Lizenzverwaltung (verlängern, suchen, Notizen), vollständiges Rechte-Protokoll, Admin-PC-Registrierung (Frage 6) |

Datenschutz überall: Online-Dienste bleiben standardmäßig aus (Opt-in), die Webseite sieht keine Inhalte, und es landen keine Secrets im Repo.

---

## 4. Offene Fragen an die Besitzerin

1. **Multiaccount**: Meinst du (A) mehrere VRChat-Konten in der App, (B) einen Lizenzschlüssel für mehrere Konten, oder beides? Bei A: reicht Umschalten, oder sollen zwei Konten gleichzeitig laufen?
2. **Gruppen-Verschlüsselung**: eigene Umsetzung nach Megolm-Prinzip (wie bisher beim Einzelchat) oder eine fertige Bibliothek (z. B. vodozemac/olm; Lizenzen und Größe müssten geprüft werden)?
3. **Nachrichten an VRChat-Nutzer ohne Nexus**: Wie sollen die ankommen? Vorschlag: Die Nachricht wird verschlüsselt für die VRChat-ID hinterlegt. Die Person bekommt nur eine VRChat-Einladung oder einen Hinweis „Du hast eine Nexus-Nachricht“ und liest sie nach der Registrierung. VRChat selbst hat keine Nachrichten-API, nur Einladungs- und Anfrage-Texte.
4. **„Boob-Funktion im Chat“**: Was genau ist gemeint? Zum Beispiel ein „Anstupsen“/Boop mit Vibration und Ton, oder etwas für den NSFW-Bereich (dann nur für Verified 18+)?
5. **Voice-Server**: Gibt es einen eigenen Server (VPS) für TURN/SFU, oder soll Voice zunächst nur 1:1 laufen (geht meist ohne eigenen Server)?
6. **Admin-PC-Registrierung**: Soll der Admin-Bereich zusätzlich nur auf vorher freigegebenen PCs gehen, also UID **und** registriertes Gerät?
7. **GIF-Suche** über Tenor/Giphy: ja (Daten gehen an den Anbieter) oder nur eigene GIFs hochladen?
8. Soll ich 3.4 so bauen: Chat-Punkte 1–8, Multiaccount nach deiner Antwort auf Frage 1, Menü-Umbau?
