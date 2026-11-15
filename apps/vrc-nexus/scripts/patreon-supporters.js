#!/usr/bin/env node
/* Vor dem Build: aktive Unterstützer von Patreon holen → backend/supporters.json (nur Anzeigename + Stufe).
 * Braucht das GitHub-Secret PATREON_TOKEN (Creator Access Token, nur lesen). Ohne Token bleibt die Datei, wie sie ist.
 * Der Token kommt nie in die App – nur die fertige Namensliste. */
'use strict';
const fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', 'backend', 'supporters.json');
const API = (process.env.PATREON_API || 'https://www.patreon.com/api/oauth2/v2').replace(/\/+$/, '');
const token = String(process.env.PATREON_TOKEN || '').trim();
async function get(url) {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'VRC-Nexus-Build' } });
    if (!r.ok) throw new Error('Patreon HTTP ' + r.status);
    return r.json();
}
async function run() {
    if (!token) { console.log('Patreon: kein PATREON_TOKEN – Unterstützer-Liste bleibt unverändert.'); return; }
    const camp = await get(API + '/campaigns');
    const id = camp.data && camp.data[0] && camp.data[0].id;
    if (!id) throw new Error('Keine Kampagne gefunden.');
    let url = API + '/campaigns/' + id + '/members?include=currently_entitled_tiers&fields%5Bmember%5D=full_name,patron_status&fields%5Btier%5D=title&page%5Bcount%5D=500';
    const out = [];
    for (let i = 0; url && i < 20; i++) {
        const d = await get(url);
        const tiers = new Map((d.included || []).filter(x => x.type === 'tier').map(x => [x.id, String((x.attributes || {}).title || '')]));
        for (const m of d.data || []) {
            const a = m.attributes || {};
            if (a.patron_status !== 'active_patron') continue;
            const name = String(a.full_name || '').trim().slice(0, 40);
            if (!name) continue;
            const t = (((m.relationships || {}).currently_entitled_tiers || {}).data || []).map(x => tiers.get(x.id)).filter(Boolean)[0] || '';
            out.push({ name, tier: t.slice(0, 40) });
        }
        url = d.links && d.links.next;
    }
    out.sort((a, b) => a.tier.localeCompare(b.tier) || a.name.localeCompare(b.name));
    fs.writeFileSync(file, JSON.stringify(out) + '\n');
    console.log('Patreon: ' + out.length + ' aktive Unterstützer → backend/supporters.json');
}
if (require.main === module) run().catch(e => { console.log('::warning::Patreon-Unterstützer nicht geladen: ' + e.message); });
module.exports = { run };
