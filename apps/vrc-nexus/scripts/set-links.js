#!/usr/bin/env node
/* Vor dem Build: Discord-Einladung aus dem GitHub-Secret/der Variable DISCORD_INVITE in backend/links.json schreiben.
 * Leer = Standard aus der Datei bleibt. Nur echte Discord-Einladungen werden übernommen. */
'use strict';
const fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', 'backend', 'links.json');
const v = String(process.env.DISCORD_INVITE || '').trim();
const ok = /^https:\/\/(discord\.gg|(www\.)?discord\.com\/invite)\/[\w-]{2,40}$/.test(v);
if (!v) { console.log('Discord-Link: Standard (' + JSON.parse(fs.readFileSync(file, 'utf8')).discord + ')'); process.exit(0); }
if (!ok) { console.log('::warning::DISCORD_INVITE ist keine Discord-Einladung (https://discord.gg/…) – Standard bleibt.'); process.exit(0); }
const d = JSON.parse(fs.readFileSync(file, 'utf8')); d.discord = v;
fs.writeFileSync(file, JSON.stringify(d) + '\n');
console.log('Discord-Link gesetzt: ' + v);
