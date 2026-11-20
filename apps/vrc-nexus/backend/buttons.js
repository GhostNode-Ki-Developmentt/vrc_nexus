'use strict';
/*
 * 🎛 Nexus-Knöpfe – lokale Stream-Deck-Alternative für die Android-App (Idee von Natsu).
 *   Frei belegbare Knöpfe auf mehreren Seiten, eigene Anordnung, Symbol, Text und Farbe.
 *   Ausgeführt direkt aus der App – ohne Stream-Deck-Software:
 *     - am PC über die Dashboard-Verbindung (wie die PC-Fernbedienung): Chatbox, Eingaben, Avatar-Parameter, „tippt …“
 *     - über die VRChat-API: Status ändern
 *     - in der App: Bereich öffnen (macht die Oberfläche selbst)
 *   Gespeichert auf dem Gerät (Datenbank → auch in Sicherungen).
 */
const crypto = require('crypto');
const { str, int, cut, UserError } = require('./util');

const KINDS = {
    chatbox: ['💬', 'Chatbox-Text', 'PC'], clear: ['🧹', 'Chatbox leeren', 'PC'], typing: ['⌨', '„tippt …“ an/aus', 'PC'],
    input: ['🎮', 'Eingabe (z. B. Springen, Mikro)', 'PC'], param: ['🎚', 'Avatar-Parameter', 'PC'],
    status: ['🟢', 'VRChat-Status', 'VRChat'], tab: ['📂', 'Bereich in der App öffnen', 'App'],
};
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
        throw new UserError('Unbekannte Aktion.');
    }
    async action(act, input) {
        switch (act) {
            case 'btn_get': return { cfg: this.cfg(), kinds: KINDS, inputs: INPUTS, statuses: STATUSES, colors: COLORS };
            case 'btn_save': return { cfg: this.save(input), msg: input.quiet ? '' : 'Gespeichert.' };
            case 'btn_run': return await this.run(input.id);
            case 'btn_reset': this.app.db.setSetting('nx_buttons', ''); return { cfg: this.cfg(), msg: 'Auf Beispiel-Knöpfe zurückgesetzt.' };
        }
        throw new UserError('Unbekannte Aktion.');
    }
}

module.exports = { Buttons, KINDS, clean };
