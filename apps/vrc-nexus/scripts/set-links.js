#!/usr/bin/env node
/* Vor dem Build: Discord-Einladung aus dem GitHub-Secret/der Variable DISCORD_INVITE in backend/links.json schreiben.
 * Leer = Standard aus der Datei bleibt. Nur echte Discord-Einladungen werden übernommen. */
'use strict';
const fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', 'backend', 'links.json');
const pu = String(process.env.PATREON_URL || '').trim();
if (pu) { if (/^https:\/\/(www\.)?patreon\.com\/[\w./?=-]{2,80}$/.test(pu)) { const d0 = JSON.parse(fs.readFileSync(file, 'utf8')); d0.patreon = pu; fs.writeFileSync(file, JSON.stringify(d0) + '\n'); console.log('Patreon-Link gesetzt: ' + pu); } else console.log('::warning::PATREON_URL ist kein Patreon-Link – ignoriert.'); }
const v = String(process.env.DISCORD_INVITE || '').trim();
const ok = /^https:\/\/(discord\.gg|(www\.)?discord\.com\/invite)\/[\w-]{2,40}$/.test(v);
if (!v) { console.log('Discord-Link: Standard (' + JSON.parse(fs.readFileSync(file, 'utf8')).discord + ')'); process.exit(0); }
if (!ok) { console.log('::warning::DISCORD_INVITE ist keine Discord-Einladung (https://discord.gg/…) – Standard bleibt.'); process.exit(0); }
const d = JSON.parse(fs.readFileSync(file, 'utf8')); d.discord = v;
fs.writeFileSync(file, JSON.stringify(d) + '\n');
console.log('Discord-Link gesetzt: ' + v);
