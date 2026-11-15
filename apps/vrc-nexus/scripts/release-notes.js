#!/usr/bin/env node
/* Öffentlicher Changelog einer Version (aus der README, 🔞-Teil nur als „***“) – für GitHub-Release und Discord.
 *   node scripts/release-notes.js 2.13.0            → Markdown
 *   node scripts/release-notes.js 2.13.0 --discord        → JSON für einen Discord-Webhook (RELEASE_URL aus der Umgebung)
 *   node scripts/release-notes.js 2.13.0 --discord-nsfw   → 🔞 JSON für den extra NSFW-Webhook (leer, wenn die Version keinen NSFW-Teil hat) */
'use strict';
const { build, buildNsfw } = require('./changelog-build');
function section(ver) { return build().find(e => e.version === ver) || null; }
function sectionNsfw(ver) { return buildNsfw().find(e => e.version === ver) || null; }
function discord(ver, url) {
    const s = section(ver);
    let body = s ? s.body : '';
    if (body.length > 3800) body = body.slice(0, 3800).replace(/\n[^\n]*$/, '') + '\n…';
    return {
        username: 'VRC Nexus', allowed_mentions: { parse: [] },
        embeds: [{ title: '🚀 VRC Nexus ' + ver + (s && s.title ? ' – ' + s.title : ''), url: url || undefined, color: 0xf5c242, description: body || 'Neue Version.',
            fields: [{ name: '⬇️ Download', value: url ? '[Windows · Android · Stream Deck](' + url + ')' : 'GitHub-Releases' }, { name: '🔄 Update', value: 'In der App: Einstellungen → Über → Nach Updates suchen' }],
            footer: { text: 'VRC Nexus' }, timestamp: new Date().toISOString() }] };
}
/** 🔞 eigener Kanal: nur der NSFW-Teil der Version */
function discordNsfw(ver, url) {
    const s = sectionNsfw(ver);
    if (!s) return null;
    let body = s.body;
    if (body.length > 3800) body = body.slice(0, 3800).replace(/\n[^\n]*$/, '') + '\n…';
    return {
        username: 'VRC Nexus 🔞', allowed_mentions: { parse: [] },
        embeds: [{ title: '🔞 VRC Nexus ' + ver + (s.title ? ' – ' + s.title : ''), url: url || undefined, color: 0xff6fb5, description: body,
            fields: [{ name: '🔓 Freischalten', value: 'Nur mit Freischalt-Schlüssel sichtbar und nutzbar (NSFW → in der App).' }, { name: '⬇️ Download', value: url ? '[Windows · Android](' + url + ')' : 'GitHub-Releases' }],
            footer: { text: 'VRC Nexus · NSFW' }, timestamp: new Date().toISOString() }] };
}
if (require.main === module) {
    const ver = process.argv[2], s = section(ver);
    if (process.argv.includes('--discord-nsfw')) { const d = discordNsfw(ver, process.env.RELEASE_URL || ''); process.stdout.write(d ? JSON.stringify(d) : ''); }
    else if (process.argv.includes('--discord')) process.stdout.write(JSON.stringify(discord(ver, process.env.RELEASE_URL || '')));
    else process.stdout.write(s ? '### Neu in ' + ver + (s.title ? ' – ' + s.title : '') + '\n\n' + s.body + '\n' : '');
}
module.exports = { section, sectionNsfw, discord, discordNsfw };
