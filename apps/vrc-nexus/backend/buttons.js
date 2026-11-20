'use strict';
/*
 * 🎛 Nexus-Knöpfe – lokale Stream-Deck-Alternative für die Android-App (Idee von Natsu).
 *   Frei belegbare Knöpfe auf mehreren Seiten, eigene Anordnung, Symbol, Text und Farbe.
 *   Seit 3.2.4 nur Aktionen ohne PC: VRChat-Status, Avatar wechseln, Freund (Selbst-Einladung / Einladung anfragen / einladen),
 *   Instanz erstellen, Bereich in der App öffnen, Anzeige-Knöpfe (Freunde online, Benachrichtigungen) – alles über die VRChat-API des Handys.
 *   Gespeichert auf dem Gerät (Datenbank → auch in Sicherungen).
 */
const crypto = require('crypto');
const { str, int, cut, UserError } = require('./util');

/* 3.2.4: Am Handy nur noch Knöpfe, die ohne PC gehen – direkt über die VRChat-API des Handys (oder in der App).
 *   Alte PC-Knöpfe (Chatbox, Eingaben, Parameter, Kamera, Medien …) werden beim Laden entfernt. */
const KINDS = {
    status: ['🟢', 'VRChat-Status', 'VRChat'], tab: ['📂', 'Bereich in der App öffnen', 'App'],
};
const FRIEND_OPS = [['invite_me', 'Selbst-Einladung zu ihm/ihr'], ['request', 'Einladung anfragen'], ['invite', 'in meine Instanz einladen']];
/** API-Aktionen: Art → [Symbol, Name, Ort, Felder] */
const NX = {
    avatar: ['🧍', 'Avatar wechseln', 'VRChat', [['avatar', 'text', 'avtr_…']]],
    friend: ['👤', 'Freund', 'VRChat', [['user', 'friend', ''], ['op', 'sel', FRIEND_OPS]]],
    instance_create: ['🌍', 'Instanz erstellen + einladen', 'VRChat', [['world', 'text', 'wrld_… oder Welt-Link'], ['type', 'sel', [['friends+', 'Freunde+'], ['friends', 'Freunde'], ['invite+', 'Einladung+'], ['invite', 'Einladung'], ['public', 'Öffentlich'], ['group', 'Gruppe']]],
        ['region', 'sel', [['eu', 'Europa'], ['us', 'USA West'], ['use', 'USA Ost'], ['jp', 'Japan']]], ['group', 'text', 'grp_… (nur bei Gruppe)']]],
    // Anzeige-Knöpfe: Live-Werte vom Handy, Antippen öffnet den passenden Bereich
    show_friends: ['👥', 'Freunde online (Anzeige)', 'Anzeige', []],
    show_notifs: ['🔔', 'Benachrichtigungen (Anzeige)', 'Anzeige', []],
};
for (const [k, v] of Object.entries(NX)) KINDS[k] = v.slice(0, 3);
const FIELDS = Object.fromEntries(Object.entries(NX).map(([k, v]) => [k, v[3]]));
const SHOW_TAB = { show_friends: 'friends', show_notifs: 'notifs' };
const STATUSES = ['join me', 'active', 'ask me', 'busy'];
const COLORS = ['', 'cyan', 'gold', 'pink', 'green', 'red', 'violet'];
const id = () => crypto.randomBytes(5).toString('hex');
const DEF = () => ({ v: 1, cols: 3, pages: [{ id: id(), name: 'Start', buttons: [
    { id: id(), icon: '🔵', label: 'Join Me', color: 'cyan', kind: 'status', status: 'join me' },
    { id: id(), icon: '🟢', label: 'Online', color: 'green', kind: 'status', status: 'active' },
    { id: id(), icon: '🔴', label: 'Beschäftigt', color: 'red', kind: 'status', status: 'busy' },
    { id: id(), icon: '👥', label: 'Freunde online', color: '', kind: 'show_friends' },
    { id: id(), icon: '🔔', label: 'Benachrichtigungen', color: '', kind: 'show_notifs' },
    { id: id(), icon: '🫂', label: 'Community', color: 'violet', kind: 'tab', tab: 'community' },
] }] });

/** Knopf prüfen und säubern (alles kommt aus der Oberfläche) */
function clean(b) {
    const k = KINDS[str(b.kind)] ? str(b.kind) : 'status';
    // bis 3.2.3 hieß das Ziel „id“ und überschrieb die Knopf-ID → in eigenes Feld übernehmen
    if (k === 'avatar' && !b.avatar && /^avtr_/.test(str(b.id))) b = Object.assign({}, b, { avatar: b.id, id: '' });
    if (k === 'friend' && !b.user && /^usr_/.test(str(b.id))) b = Object.assign({}, b, { user: b.id, id: '' });
    const o = { id: /^[0-9a-f]{10}$/.test(str(b.id)) ? str(b.id) : id(), icon: cut(str(b.icon).trim(), 4) || KINDS[k][0], label: cut(str(b.label).trim(), 30), color: COLORS.includes(str(b.color)) ? str(b.color) : '', kind: k };
    if (k === 'status') { o.status = STATUSES.includes(str(b.status)) ? str(b.status) : 'active'; o.desc = cut(str(b.desc), 32); }
    if (k === 'tab') o.tab = str(b.tab).replace(/[^\w-]/g, '').slice(0, 20) || 'home';
    for (const [n, t, x] of FIELDS[k] || []) {
        if (t === 'sel') o[n] = x.some(e => e[0] === str(b[n])) ? str(b[n]) : x[0][0];
        else if (t === 'check') o[n] = b[n] === true || b[n] === '1' || b[n] === 1;
        else if (t === 'num') o[n] = str(b[n]).replace(/[^\d.\-]/g, '').slice(0, 10);
        else if (n === 'world') { const w = /wrld_[0-9a-f-]{36}/i.exec(str(b[n])); o[n] = w ? w[0] : ''; }   // Welt-Link → ID
        else o[n] = cut(str(b[n]).replace(/[\r\n]+/g, ' ').trim(), n === 'text' || n === 'tpl' ? 200 : 64);
    }
    return o;
}

class Buttons {
    constructor(app) { this.app = app; }
    cfg() {
        let c = null;
        try { c = JSON.parse(this.app.db.setting('nx_buttons', '')); } catch (e) { c = null; }
        if (!c || !Array.isArray(c.pages) || !c.pages.length) { c = DEF(); this.app.db.setSetting('nx_buttons', JSON.stringify(c)); }   // einmal speichern → feste IDs (sonst passen Live-Werte nicht)
        for (const p of c.pages) p.buttons = (Array.isArray(p.buttons) ? p.buttons : []).filter(b => b && KINDS[b.kind]);   // alte PC-Knöpfe ausblenden
        return c;
    }
    save(input) {
        let c;
        try { c = typeof input.cfg === 'string' ? JSON.parse(input.cfg) : input.cfg; } catch (e) { throw new UserError('Ungültige Daten.'); }
        if (!c || !Array.isArray(c.pages)) throw new UserError('Ungültige Daten.');
        const out = { v: 1, cols: Math.max(2, Math.min(6, int(c.cols) || 3)),
            pages: c.pages.slice(0, 12).map(p => ({ id: /^[0-9a-f]{10}$/.test(str(p.id)) ? str(p.id) : id(), name: cut(str(p.name).trim(), 20) || 'Seite', buttons: (Array.isArray(p.buttons) ? p.buttons : []).slice(0, 48).map(clean) })) };
        if (!out.pages.length) out.pages = DEF().pages;
        this.app.db.setSetting('nx_buttons', JSON.stringify(out));
        return out;
    }
    find(bid) { for (const p of this.cfg().pages) for (const b of p.buttons) if (b.id === str(bid)) return b; return null; }
    async run(bid) {
        const b = this.find(bid);
        if (!b) throw new UserError('Knopf nicht gefunden.');
        switch (b.kind) {
            case 'status': { const r = await this.app.post({ act: 'status', status: b.status, desc: b.desc || '' }, {}); return Object.assign({ msg: '✔ Status: ' + b.status }, r); }
            case 'tab': return { tab: b.tab, msg: '' };
            case 'avatar': {
                if (!/^avtr_[0-9a-f-]{36}$/i.test(str(b.avatar))) throw new UserError('Ungültige Avatar-ID.');
                const r = await this.app.tools.apiAction('avatar', { id: b.avatar });
                return { msg: '✔ ' + (r.msg || 'Avatar gewechselt.') };
            }
            case 'friend': {
                if (!/^usr_/.test(str(b.user))) throw new UserError('Kein Freund gewählt.');
                if (b.op === 'invite') { const r = await this.app.post({ act: 'invite', id: b.user }, {}); return { msg: '✔ ' + (r.msg || 'Einladung verschickt.') }; }
                const r = await this.app.tools.apiAction('friend', { id: b.user, op: b.op === 'request' ? 'request' : 'invite_me' });
                return { msg: '✔ ' + (r.msg || 'Erledigt.') };
            }
            case 'instance_create': {
                const d = this.nxData(b), w = /wrld_[0-9a-f-]{36}/i.exec(str(d.world));
                if (!w) throw new UserError('Auf dem Knopf ist keine Welt eingetragen (wrld_… oder Welt-Link).');
                const r = await this.app.post({ act: 'instance_create', world: w[0], type: d.type || 'friends+', region: d.region || 'eu', invite_me: '1', group: str(d.group) }, {});
                return { msg: '✔ ' + (r.msg || 'Instanz erstellt.'), location: r.location };
            }
        }
        if (SHOW_TAB[b.kind]) return { tab: SHOW_TAB[b.kind], msg: '' };
        throw new UserError('Unbekannte Aktion.');
    }
    /** Knopf → Daten für die API-Aktion */
    nxData(b) {
        const d = {};
        for (const [n, t] of FIELDS[b.kind] || []) {
            const v = b[n];
            if (t === 'check') d[n] = !!v;
            else if (v !== '' && v !== undefined) d[n] = v;
        }
        return d;
    }
    /** Live-Werte für Anzeige-Knöpfe der Seite (alles vom Handy, kein PC nötig) */
    async live(pid) {
        const p = this.cfg().pages.find(x => x.id === str(pid)) || this.cfg().pages[0];
        const vals = {};
        for (const b of p.buttons) {
            if (b.kind === 'show_friends') { try { vals[b.id] = String((this.app.vrc.friendList() || []).filter(f => f.state === 'online').length); } catch (e) { vals[b.id] = '–'; } }
            if (b.kind === 'show_notifs') { try { vals[b.id] = String(int(this.app.db.prepare('SELECT COUNT(*) FROM notif_log WHERE active = 1 AND seen = 0').value())); } catch (e) { vals[b.id] = '–'; } }
        }
        return { values: vals };
    }
    friends() { try { return (this.app.vrc.friendList() || []).map(f => [f.id, f.name]).slice(0, 2000); } catch (e) { return []; } }
    async action(act, input) {
        switch (act) {
            case 'btn_get': return { cfg: this.cfg(), kinds: KINDS, fields: FIELDS, statuses: STATUSES, colors: COLORS, friends: this.friends() };
            case 'btn_live': return await this.live(input.page);
            case 'btn_save': return { cfg: this.save(input), msg: input.quiet ? '' : 'Gespeichert.' };
            case 'btn_run': return await this.run(input.id);
            case 'btn_reset': this.app.db.setSetting('nx_buttons', ''); return { cfg: this.cfg(), msg: 'Auf Beispiel-Knöpfe zurückgesetzt.' };
        }
        throw new UserError('Unbekannte Aktion.');
    }
}

module.exports = { Buttons, KINDS, FIELDS, clean };
