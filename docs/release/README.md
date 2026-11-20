# Release 3.0.0 – wartet auf die Webseite

`3.0.0.patch` enthält Versionssprung (2.15.3 → 3.0.0), README-/NSFW-Changelog und gebaute changelog*.json.
Ein Push davon startet sofort Build + Release + Auto-Update. Erst anwenden, wenn
1. die GhostNode-Webseite (ghostenode `main`) auf privat.sylvanclub.eu hochgeladen ist und
2. unter Admin → 🪪 Nexus-Konten das Dienst-Konto gewählt ist.

Anwenden: `git apply docs/release/3.0.0.patch && (cd apps/vrc-nexus && node scripts/changelog-build.js && npm test)` → committen → pushen.
