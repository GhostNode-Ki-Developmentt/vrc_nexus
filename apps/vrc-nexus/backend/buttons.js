'use strict';
/*
 * 🎛 Nexus-Knöpfe – lokale Stream-Deck-Alternative für die Android-App (Idee von Natsu).
 *   Frei belegbare Knöpfe auf mehreren Seiten, eigene Anordnung, Symbol, Text und Farbe.
 *   Ausgeführt direkt aus der App – ohne Stream-Deck-Software:
 *     - am PC über die Dashboard-Verbindung (wie die PC-Fernbedienung): Chatbox, Eingaben, Avatar-Parameter, „tippt …“
 *     - über die VRChat-API: Status ändern
 *     - in der App: Bereich öffnen (macht die Oberfläche selbst)
 *     - seit 3.0.3 alle Aktionen des Stream-Deck-Plugins: „Nexus-Aktion“ Handy → Dashboard → PC (tools.apiAction, Liste in dashlink.NEXUS_ACTIONS)
 *     - Anzeige-Knöpfe (Freunde online, Spieler in der Instanz, Benachrichtigungen, Info-Anzeige) zeigen Live-Werte
 *   Gespeichert auf dem Gerät (Datenbank → auch in Sicherungen).
 */
const crypto = require('crypto');
const { str, int, cut, UserError } = require('./util');
const CAM = require('./camera');

const KINDS = {
    chatbox: ['💬', 'Chatbox-Text', 'PC'], clear: ['🧹', 'Chatbox leeren', 'PC'], typing: ['⌨', '„tippt …“ an/aus', 'PC'],
    input: ['🎮', 'Eingabe (z. B. Springen, Mikro)', 'PC'], param: ['🎚', 'Avatar-Parameter', 'PC'],
    status: ['🟢', 'VRChat-Status', 'VRChat'], tab: ['📂', 'Bereich in der App öffnen', 'App'],
};
/** Felder: [Name, Art (text|num|sel|check), Auswahl bzw. Platzhalter]. Leere Auswahl-Werte = „umschalten“ */
const ONOFF = [['', 'umschalten'], ['1', 'an'], ['0', 'aus']];
const CAM_CMDS = [['Capture', 'Foto'], ['CaptureDelayed', 'Foto mit Selbstauslöser'], ['burst', 'Serienbild'], ['Close', 'Kamera schließen'], ['Mode', 'Modus · 0–6']]
    .concat(CAM.TOGGLES.map(t => [t[0], t[1] + ' · 1/0'])).concat(CAM.SLIDERS.map(t => [t[0], t[1] + ' · ' + t[2] + '…' + t[3]]));
const PC_TABS = [['', 'Start'], ['friends', 'Freunde'], ['game', 'Spiel & OSC'], ['notifs', 'Benachrichtigungen'], ['community', 'Community'], ['tools', 'Werkzeuge'], ['settings', 'Einstellungen']];
/** Stream-Deck-Aktionen (wie das Plugin): Art → [Symbol, Name, Ort, Felder, Aktion am PC] */
const NX = {
    param_step: ['➕', 'Parameter-Schritt (+/−)', 'PC', [['name', 'text', 'Parameter-Name'], ['ptype', 'sel', [['float', 'Float'], ['int', 'Int']]], ['step', 'num', 'Schritt, z. B. 0.1 oder -1']]],
    rotator: ['🔁', 'Chatbox-Rotator', 'PC', [['on', 'sel', ONOFF]]],
    launch: ['🚀', 'VRChat starten', 'PC', []],
    rejoin: ['↻', 'Instanz neu betreten', 'PC', []],
    pc_open: ['🖥', 'VRC Nexus öffnen (am PC)', 'PC', [['tab', 'sel', PC_TABS]], 'open'],
    camera: ['📷', 'Kamera', 'PC', [['cmd', 'sel', CAM_CMDS], ['value', 'text', 'Wert (falls nötig)']]],
    macro: ['⚙', 'Makro', 'PC', [['id', 'text', 'Makro-Name (am PC angelegt)']]],
    macro_stop: ['⏹', 'Makros stoppen', 'PC', []],
    avatar: ['🧍', 'Avatar wechseln', 'VRChat', [['id', 'text', 'avtr_…']]],
    friend: ['👤', 'Freund', 'PC', [['id', 'friend', ''], ['op', 'sel', [['smart', 'beitreten oder Einladung anfragen'], ['invite', 'in meine Instanz einladen'], ['request', 'Einladung anfragen'], ['invite_me', 'Selbst-Einladung zu ihm/ihr']]]]],
    overlay: ['🥽', 'SteamVR-Overlay', 'PC', [['on', 'sel', ONOFF]]],
    speech: ['🎤', 'Spracheingabe', 'PC', [['op', 'sel', [['toggle', 'umschalten'], ['start', 'Aufnahme starten'], ['stop', 'Aufnahme stoppen']]]]],
    media: ['⏯', 'Medien', 'PC', [['cmd', 'sel', [['toggle', 'Play/Pause'], ['next', 'Weiter'], ['prev', 'Zurück'], ['play', 'Play'], ['pause', 'Pause']]]]],
    quicktext: ['⚡', 'Schnelltext', 'PC', [['index', 'num', 'Nr. (1 = erster Schnelltext)'], ['mode', 'sel', [['', 'Schnelltext Nr.'], ['last', 'letzten Text erneut senden']]]]],
    scene: ['🎭', 'Parameter-Szene', 'PC', [['id', 'text', 'Szenen-ID oder Name']]],
    record: ['⏺', 'Aufnahme', 'PC', [['op', 'sel', [['rec', 'Aufnahme starten/stoppen'], ['play', 'Abspielen/stoppen']]], ['id', 'text', 'Aufnahme (zum Abspielen)']]],
    chatmods: ['🧩', 'Chatbox-Module', 'PC', [['mod', 'text', 'Modul (leer = alle), z. B. time, media, status'], ['on', 'sel', ONOFF]]],
    tts: ['🔊', 'Vorlesen', 'PC', [['text', 'text', 'Text, auch mit {Variablen}'], ['chatbox', 'check', 'auch in die Chatbox']]],
    instance_create: ['🌍', 'Instanz erstellen + einladen', 'PC', [['world', 'text', 'wrld_… (leer = aktuelle Welt)'], ['type', 'sel', [['friends+', 'Freunde+'], ['friends', 'Freunde'], ['invite+', 'Einladung+'], ['invite', 'Einladung'], ['public', 'Öffentlich'], ['group', 'Gruppe']]],
        ['region', 'sel', [['eu', 'Europa'], ['us', 'USA West'], ['use', 'USA Ost'], ['jp', 'Japan']]], ['group', 'text', 'grp_… (nur bei Gruppe)']]],
    // Anzeige-Knöpfe: zeigen Live-Werte, Antippen öffnet den passenden Bereich
    show_friends: ['👥', 'Freunde online (Anzeige)', 'Anzeige', []],
    show_players: ['🧑', 'Spieler in der Instanz (Anzeige)', 'Anzeige', []],
    show_notifs: ['🔔', 'Benachrichtigungen (Anzeige)', 'Anzeige', []],
    show_info: ['ℹ', 'Info-Anzeige', 'Anzeige', [['tpl', 'text', '{world} · {players} Spieler · {time}']]],
};
for (const [k, v] of Object.entries(NX)) KINDS[k] = v.slice(0, 3);
const FIELDS = Object.fromEntries(Object.entries(NX).map(([k, v]) => [k, v[3]]));
const SHOW_TAB = { show_friends: 'friends', show_notifs: 'notifs', show_players: 'remote', show_info: 'remote' };
const INPUTS = ['Jump', 'Voice', 'QuickMenuToggleLeft', 'QuickMenuToggleRight', 'Run', 'PanicButton', 'MoveForward', 'MoveBackward', 'LookLeft', 'LookRight', 'GrabRight', 'UseRight'];
const STATUSES = ['join me', 'active', 'ask me', 'busy'];
const COLORS = ['', 'cyan', 'gold', 'pink', 'green', 'red', 'violet'];
const id = () => crypto.randomBytes(5).toString('hex');
const DEF = () => ({ v: 1, cols: 3, pages: [{ id: id(), name: 'Start', buttons: [
    { id: id(), icon: '👋', label: 'Hallo', color: 'cyan', kind: 'chatbox', text: 'Hallo zusammen! 👋' },
    { id: id(), icon: '🎙', label: 'Mikro', color: '', kind: 'input', name: 'Voice' },
    { id: id(), icon: '⤴', label: 'Springen', color: '', kind: 'input', name: 'Jump' },
    { id: id(), icon: '🔵', label: 'Join Me', color: 'cyan', kind: 'status', status: 'join me' },
    { id: id(), icon: '🔴', label: 'Beschäftigt', color: 'red', kind: 'status', status: 'busy' },
    { id: id(), icon: '🧹', label: 'Chatbox leeren', color: '', kind: 'clear' },
] }] });

/** Knopf prüfen und säubern (alles kommt aus der Oberfläche) */
function clean(b) {
    const k = KINDS[str(b.kind)] ? str(b.kind) : 'chatbox';
    const o = { id: /^[0-9a-f]{10}$/.test(str(b.id)) ? str(b.id) : id(), icon: cut(str(b.icon).trim(), 4) || KINDS[k][0], label: cut(str(b.label).trim(), 30), color: COLORS.includes(str(b.color)) ? str(b.color) : '', kind: k };
    if (k === 'chatbox') o.text = cut(str(b.text).replace(/\r/g, ''), 500);
    if (k === 'typing') o.on = b.on === true || b.on === '1' || b.on === 1;
    if (k === 'input') o.name = INPUTS.includes(str(b.name)) ? str(b.name) : 'Jump';
    if (k === 'param') { o.name = str(b.name).replace(/[^\w/\-.]/g, '').slice(0, 64); o.mode = ['toggle', 'set'].includes(str(b.mode)) ? str(b.mode) : 'toggle'; o.ptype = ['bool', 'int', 'float'].includes(str(b.ptype)) ? str(b.ptype) : 'bool'; o.value = str(b.value).slice(0, 12); }
    if (k === 'status') { o.status = STATUSES.includes(str(b.status)) ? str(b.status) : 'active'; o.desc = cut(str(b.desc), 32); }
    if (k === 'tab') o.tab = str(b.tab).replace(/[^\w-]/g, '').slice(0, 20) || 'home';
    for (const [n, t, x] of FIELDS[k] || []) {
        if (t === 'sel') o[n] = x.some(e => e[0] === str(b[n])) ? str(b[n]) : x[0][0];
        else if (t === 'check') o[n] = b[n] === true || b[n] === '1' || b[n] === 1;
        else if (t === 'num') o[n] = str(b[n]).replace(/[^\d.\-]/g, '').slice(0, 10);
        else o[n] = cut(str(b[n]).replace(/[\r\n]+/g, ' ').trim(), n === 'text' || n === 'tpl' ? 200 : 64);
    }
    return o;
}

class Buttons {
    constructor(app) { this.app = app; }
    cfg() {
        let c = null;
        try { c = JSON.parse(this.app.db.setting('nx_buttons', '')); } catch (e) { c = null; }
        return c && Array.isArray(c.pages) && c.pages.length ? c : DEF();
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
        const pc = d => this.app.link.remoteSend(d.kind, d).then(r => Object.assign({ msg: '✔ ' + (b.label || KINDS[b.kind][1]) + ' → PC' }, r || {}));
        switch (b.kind) {
            case 'chatbox': if (!b.text) throw new UserError('Kein Text hinterlegt.'); return pc({ kind: 'chatbox', text: b.text, split: '1' });
            case 'clear': return pc({ kind: 'chatbox', clear: '1', text: ' ' });
            case 'typing': return pc({ kind: 'typing', on: b.on ? '1' : '0' });
            case 'input': return pc({ kind: 'input', name: b.name, value: '1', pulse: '1' });
            case 'param': {
                if (!b.name) throw new UserError('Kein Parameter hinterlegt.');
                let value = b.value;
                if (b.mode === 'toggle') {
                    let cur = false;
                    try { const s = await this.app.link.remoteState(); cur = !!(s && s.state && s.state.params && s.state.params[b.name]); } catch (e) { /* unbekannt → einschalten */ }
                    value = cur ? '0' : '1';
                }
                return pc({ kind: 'param', name: b.name, type: b.mode === 'toggle' ? 'bool' : b.ptype, value: str(value) || '1' });
            }
            case 'status': { const r = await this.app.post({ act: 'status', status: b.status, desc: b.desc || '' }, {}); return Object.assign({ msg: '✔ Status: ' + b.status }, r); }
            case 'tab': return { tab: b.tab, msg: '' };
        }
        if (SHOW_TAB[b.kind]) return { tab: SHOW_TAB[b.kind], msg: '' };
        if (NX[b.kind]) {
            const data = this.nxData(b), action = NX[b.kind][4] || b.kind;
            if (b.kind === 'avatar' && this.app.tools) {          // geht direkt über die VRChat-Sitzung des Handys – auch ohne PC
                const r = await this.app.tools.apiAction('avatar', data);
                return { msg: '✔ ' + (r.msg || 'Avatar gewechselt.') };
            }
            const r = await this.app.link.remoteSend('nexus', { action, data });
            return Object.assign({ msg: '✔ ' + (b.label || KINDS[b.kind][1]) + ' → PC' }, r || {});
        }
        throw new UserError('Unbekannte Aktion.');
    }
    /** Knopf → Daten für tools.apiAction am PC (gleiche Felder wie die Stream-Deck-Tasten) */
    nxData(b) {
        const d = {};
        for (const [n, t] of FIELDS[b.kind] || []) {
            const v = b[n];
            if (t === 'check') d[n] = !!v;
            else if (v !== '' && v !== undefined) d[n] = v;
        }
        if ('on' in d) d.on = d.on === '1';                 // fehlt → am PC umschalten
        if (b.kind === 'param_step') { d.type = d.ptype || 'float'; delete d.ptype; d.step = Number(d.step) || 0; }
        if (b.kind === 'quicktext') { if (d.index !== undefined) d.index = Math.max(0, int(d.index) - 1); }
        if (b.kind === 'camera' && d.cmd === 'burst') { d.count = int(d.value) || 5; delete d.value; }
        if (b.kind === 'record' && d.op === 'rec') delete d.op;
        if (b.kind === 'instance_create') d.invite_me = '1';
        return d;
    }
    /** Live-Werte für Anzeige-Knöpfe der Seite (Freunde vom Handy, Spieler/Welt vom PC über das Dashboard) */
    async live(pid) {
        const p = this.cfg().pages.find(x => x.id === str(pid)) || this.cfg().pages[0];
        const shows = p.buttons.filter(b => SHOW_TAB[b.kind]);
        if (!shows.length) return { values: {} };
        const vals = {};
        let friends = null, notifs = null, pc = null;
        const need = k => shows.some(b => b.kind === k || (b.kind === 'show_info' && new RegExp('\\{' + k + '\\}').test(b.tpl || '{world}')));
        try { if (need('show_friends') || need('friends')) friends = (this.app.vrc.friendList() || []).filter(f => f.state === 'online').length; } catch (e) { /* noch nicht geladen */ }
        try { if (need('show_notifs') || need('notifs')) notifs = int(this.app.db.prepare('SELECT COUNT(*) FROM notif_log WHERE active = 1 AND seen = 0').value()); } catch (e) { /* keine Tabelle */ }
        if (need('show_players') || need('players') || need('world') || shows.some(b => b.kind === 'show_info')) {
            try { const s = await this.app.link.remoteState(); pc = s && s.state ? s.state : null; } catch (e) { pc = null; }
        }
        const players = pc && pc.running !== false && Array.isArray(pc.players) ? pc.players.length : null;
        const fmt = v => v === null || v === undefined ? '–' : String(v);
        for (const b of shows) {
            if (b.kind === 'show_friends') vals[b.id] = fmt(friends);
            if (b.kind === 'show_notifs') vals[b.id] = fmt(notifs);
            if (b.kind === 'show_players') vals[b.id] = fmt(players);
            if (b.kind === 'show_info') {
                const t = new Date();
                const map = { world: pc ? str(pc.world_name) || '–' : '–', players: fmt(players), friends: fmt(friends), notifs: fmt(notifs), avatar: pc ? str(pc.avatar) || '–' : '–',
                    time: String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0') };
                vals[b.id] = cut((b.tpl || '{world} · {players}').replace(/\{(\w+)\}/g, (m, k) => k in map ? map[k] : m), 60);
            }
        }
        return { values: vals };
    }
    friends() { try { return (this.app.vrc.friendList() || []).map(f => [f.id, f.name]).slice(0, 2000); } catch (e) { return []; } }
    async action(act, input) {
        switch (act) {
            case 'btn_get': return { cfg: this.cfg(), kinds: KINDS, fields: FIELDS, inputs: INPUTS, statuses: STATUSES, colors: COLORS, friends: this.friends() };
            case 'btn_live': return await this.live(input.page);
            case 'btn_save': return { cfg: this.save(input), msg: input.quiet ? '' : 'Gespeichert.' };
            case 'btn_run': return await this.run(input.id);
            case 'btn_reset': this.app.db.setSetting('nx_buttons', ''); return { cfg: this.cfg(), msg: 'Auf Beispiel-Knöpfe zurückgesetzt.' };
        }
        throw new UserError('Unbekannte Aktion.');
    }
}

module.exports = { Buttons, KINDS, FIELDS, clean };
