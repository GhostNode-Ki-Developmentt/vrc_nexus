#!/usr/bin/env node
/* Öffentlicher Changelog einer Version (aus der README, 🔞-Teil nur als „***“) – für GitHub-Release und Discord.
 *   node scripts/release-notes.js 2.13.0            → Markdown
 *   node scripts/release-notes.js 2.13.0 --discord        → JSON für einen Discord-Webhook (RELEASE_URL aus der Umgebung)
 *   node scripts/release-notes.js 2.13.0 --discord-nsfw   → 🔞 JSON für den extra NSFW-Webhook (leer, wenn die Version keinen NSFW-Teil hat) */
'use strict';
const { build, buildNsfw } = require('./changelog-build');
// Bilder für die Webhooks (öffentliches Repository, Standard-Branch)
const RAW = 'https://raw.githubusercontent.com/' + (process.env.GITHUB_REPOSITORY || 'xxloonaxx/vrc_nexus') + '/' + (process.env.BRAND_REF || 'claude/friendly-gates-kzgsll') + '/apps/vrc-nexus/';
const ICON = RAW + 'renderer/icon.png', AD_ICON = RAW + 'brand/afterdark-icon.png', AD_LOGO = RAW + 'brand/afterdark-logo.png';
function invite() { const v = String(process.env.DISCORD_INVITE || '').trim(); if (/^https:\/\/(discord\.gg|(www\.)?discord\.com\/invite)\//.test(v)) return v; try { return require('../backend/links.json').discord || ''; } catch (e) { return ''; } }
function section(ver) { return build().find(e => e.version === ver) || null; }
function sectionNsfw(ver) { return buildNsfw().find(e => e.version === ver) || null; }
function discord(ver, url) {
    const s = section(ver);
    let body = s ? s.body : '';
    if (body.length > 3800) body = body.slice(0, 3800).replace(/\n[^\n]*$/, '') + '\n…';
    return {
        username: 'VRC Nexus', avatar_url: ICON, allowed_mentions: { parse: [] },
        embeds: [{ title: '🚀 VRC Nexus ' + ver + (s && s.title ? ' – ' + s.title : ''), url: url || undefined, color: 0xf5c242, description: body || 'Neue Version.', thumbnail: { url: ICON },
            fields: [{ name: '⬇️ Download', value: url ? '[Windows · Android · Stream Deck](' + url + ')' : 'GitHub-Releases' }, { name: '🔄 Update', value: 'In der App: Einstellungen → Über → Nach Updates suchen' }].concat(invite() ? [{ name: '💬 Discord', value: invite() }] : []),
            footer: { text: 'VRC Nexus' }, timestamp: new Date().toISOString() }] };
}
/** 🔞 eigener Kanal: nur der NSFW-Teil der Version */
function discordNsfw(ver, url) {
    const s = sectionNsfw(ver);
    if (!s) return null;
    let body = s.body;
    if (body.length > 3800) body = body.slice(0, 3800).replace(/\n[^\n]*$/, '') + '\n…';
    return {
        username: 'VRC Nexus After Dark', avatar_url: AD_ICON, allowed_mentions: { parse: [] },
        embeds: [{ title: '🔞 VRC Nexus After Dark · ' + ver + (s.title ? ' – ' + s.title : ''), url: url || undefined, color: 0xff6fb5, description: body, thumbnail: { url: AD_ICON }, image: process.env.NSFW_BANNER === '1' ? { url: AD_LOGO } : undefined,
            fields: [{ name: '🔓 Freischalten', value: 'Nur mit Freischalt-Schlüssel sichtbar und nutzbar (NSFW → in der App).' }, { name: '⬇️ Download', value: url ? '[Windows · Android](' + url + ')' : 'GitHub-Releases' }],
            footer: { text: 'VRC Nexus After Dark · 18+' }, timestamp: new Date().toISOString() }] };
}
if (require.main === module) {
    const ver = process.argv[2], s = section(ver);
    if (process.argv.includes('--discord-nsfw')) { const d = discordNsfw(ver, process.env.RELEASE_URL || ''); process.stdout.write(d ? JSON.stringify(d) : ''); }
    else if (process.argv.includes('--discord')) process.stdout.write(JSON.stringify(discord(ver, process.env.RELEASE_URL || '')));
    else process.stdout.write(s ? '### Neu in ' + ver + (s.title ? ' – ' + s.title : '') + '\n\n' + s.body + '\n' : '');
}
module.exports = { section, sectionNsfw, discord, discordNsfw };
