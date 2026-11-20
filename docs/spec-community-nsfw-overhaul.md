# Nexus Community & NSFW Overhaul – Technische Spezifikation

> Vorgabe der Besitzerin vom 20.11.2026 für das **Update nach der Warnliste** (3.x).
> Status: **noch nicht umgesetzt**. Die offenen Punkte in Abschnitt 8 sind ausdrücklich **nicht** beschlossen und dürfen nicht eigenständig entschieden werden.
>
> Ergänzung (20.11.2026): Es gibt ein allgemeines Recht **„🛡 Moderator“** (Feld `mod` im NXK1-Schlüssel), das die Besitzerin im 👑 Admin-Bereich der App vergibt.
> Es gilt bereits für die Warnliste und soll in diesem Update auch für Community, Privat-Chat (Signal-E2EE) und NSFW-Moderation genutzt werden. Moderator schaltet **kein** NSFW frei und gibt **keine** Besitzer-Rechte.

**Projekt:** Nexus · **Bereiche:** Community, NSFW und VRChat-Integration · Community mit **Signal-E2EE-Privatchat** und NSFW (Nutzer müssen in VRChat 18+ verifiziert sein).

## 1. Projektübersicht

Nexus soll einen integrierten Community-Bereich erhalten, der Bestandteil des bestehenden Nexus-Systems ist. Die Community ist keine eigenständige Plattform mit separatem Benutzerkonto; sämtliche Community-Funktionen werden direkt in das bestehende Nexus-Konto integriert.

Schwerpunkte: Community-Funktionen · VRChat-Integration · Benutzerprofile · SFW- und NSFW-Inhalte · Altersfreigaben und Zugriffskontrollen · Datenschutz und Sicherheit.

## 2. Nexus Community

### 2.1 Grundkonzept
Die Community darf **nicht** als eigenständiges, vom Nexus-Konto getrenntes System umgesetzt werden. Es gibt **ein** gemeinsames Nexus-Konto für alle Nexus-Funktionen. Die VRChat-Integration dient zur Identifikation und Verknüpfung der VRChat-Identität.

### 2.2 Benutzerkonten und Identifikation
Jeder Benutzer hat ein zentrales Nexus-Konto. Die VRChat-Integration unterstützt:
- Identifikation der VRChat-Benutzeridentität
- Zuordnung des VRChat-Kontos zum Nexus-Konto
- Abruf des relevanten VRChat-Altersstatus
- Überprüfung des VRChat-Status bei altersbeschränkten Funktionen

### 2.3 Community-Bereich
Direkt innerhalb der Nexus-Oberfläche erreichbar. Community- und NSFW-Funktionen technisch und visuell sauber integriert.

## 3. NSFW Overhaul

### 3.1 Zielsetzung
Das bestehende NSFW-System wird grundlegend überarbeitet und vollständig in Nexus Community integriert. Klare Trennung SFW/NSFW. NSFW-Inhalte nicht automatisch für alle sichtbar.

### 3.2 Altersfreigabe über VRChat
Grundlage: API-Wert `ageVerificationStatus="18+"`.
- Ein Benutzer muss einen sichtbaren und gültigen 18+-Status besitzen.
- Ohne Status kein Zugriff auf NSFW-Inhalte; fehlender Status sperrt die NSFW-Funktionen.
- Der Status muss regelmäßig erneut geprüft werden; eine einmalige Prüfung ist keine dauerhafte Freigabe.

### 3.3 Standardverhalten
NSFW ist standardmäßig deaktiviert. Neue Benutzer haben keinen NSFW-Zugriff, Inhalte bleiben ausgeblendet. Aktivierung freiwillig über die Benutzereinstellungen und nur bei gültiger Altersfreigabe.

### 3.4 NSFW-Einstellungen
Standardmäßig aus · bewusste Aktivierung · nur bei gültiger Altersfreigabe verfügbar · jederzeit deaktivierbar. Unabhängig von der allgemeinen Community-Nutzung steuerbar.

## 4. Verifizierung und Rollen

### 4.1 NXK1-Verifizierung
NXK1 wird **nicht mehr** zur Altersfreigabe verwendet. NXK1 bleibt für **Supporter** und **Administratoren** (und Moderatoren, siehe oben). NXK1 ist kein Ersatz für den VRChat-18+-Status.

### 4.2 Discord- und Bio-Code-Verifizierung
Bleibt Teil des Verifizierungssystems zur Zuordnung/Bestätigung der Identität. Ist **keine** Altersfreigabe.

### 4.3 Rolle „Verified 18+“
Bildet den erfolgreichen 18+-Status ab. Nicht allein durch Discord-Verifizierung oder NXK1 vergeben. An den gültigen VRChat-Altersstatus gebunden; bei ungültigem oder nicht mehr sichtbarem Status wird sie entzogen.

## 5. SFW- und NSFW-Trennung
SFW ist Standard · NSFW standardmäßig ausgeblendet · NSFW braucht gültige Altersfreigabe · NSFW freiwillig · fehlender Altersstatus sperrt · Community-Nutzung hängt nicht von NSFW ab. **Zugriffskontrolle serverseitig** – Ausblenden in der Oberfläche reicht nicht.

## 6. Integration in Nexus Community
Kein separates Produkt. Umfasst: gemeinsame Konten und Profile, VRChat-Identifikation, Altersstatusprüfung, NSFW-Zugriffskontrolle, Sichtbarkeitseinstellungen, Rollen- und Berechtigungsverwaltung.

## 7. Sicherheit und Zugriffskontrolle
Das Backend prüft bei jeder relevanten Anfrage: Gültigkeit des VRChat-18+-Status, aktuelle NSFW-Einstellung, Berechtigungen und Rollen, regelmäßige Statusprüfung, Entzug bei fehlendem/ungültigem Status. Keine NSFW-Inhalte über alternative Endpunkte ohne Prüfung.

## 8. Offene Designentscheidungen (NICHT eigenständig entscheiden)
1. Timeline: NSFW nur in separatem Feed oder nach Aktivierung auch in der normalen Timeline?
2. Navigation: Darstellung von SFW- und NSFW-Bereichen in der Oberfläche?
3. Statusprüfung: Intervall der erneuten VRChat-Altersprüfung?
4. Statusänderungen: Wie werden Benutzer über den Verlust der Altersfreigabe informiert?
5. Moderation: Welche zusätzlichen Moderationswerkzeuge für NSFW-Inhalte?

## 9. Vorgehen bei der Umsetzung
Vorher: Architektur analysieren · vorhandene Community-Funktionen untersuchen · NSFW- und Verifizierungssystem untersuchen · Datenbankstrukturen und API-Endpunkte prüfen · Abhängigkeiten zwischen Konten, VRChat-API und Rollen dokumentieren.

Dann: technisches Umsetzungskonzept · bestehende Funktionen kompatibel erweitern · Community und NSFW sauber integrieren · serverseitige Berechtigungsprüfungen · automatisierte Tests für Altersfreigaben und Zugriffsrechte · Fehlerfälle und Statusänderungen testen · Änderungen dokumentieren.

Bestehende Funktionen nicht ohne Notwendigkeit entfernen oder beschädigen; vorhandene Konten und Daten bleiben erhalten.

## 10. Endziel
Integrierte Community-Plattform mit zentralem Konto, VRChat-Identifikation und vollständig überarbeitetem, optionalem NSFW-System. SFW bleibt Standard; NSFW ist freiwillig, altersbeschränkt und nur mit gültiger Freigabe zugänglich.
