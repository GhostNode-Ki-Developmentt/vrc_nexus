'use strict';
/*
 * 👑 Admin (nur Besitzer): API-Konsole (nur lesen), Ereignisse simulieren (Automatik/Warnungen testen),
 * Systeminfo & Log, ein paar Spielereien für die Chatbox.
 */
const fs = require('fs');
const path = require('path');
const { str, int, cut, now, UserError } = require('./util');

class Admin {
    constructor(app) { this.app = app; this.started = Date.now(); }
    need() { if (!this.app.nsfw || !this.app.nsfw.isOwner()) throw new UserError('Nur für den Besitzer.'); }
    sys() {
        const t = this.app.tools, m = process.memoryUsage();
        let log = '';
        try { const f = path.join(t.userData || '', 'nexus.log'); if (fs.existsSync(f)) { const b = fs.readFileSync(f, 'utf8'); log = b.slice(-6000); } } catch (e) { /* egal */ }
        let db = null; try { db = t.dbInfo(); } catch (e) { /* egal */ }
        return { version: require('./vrchat').VERSION, uptime: Math.round((Date.now() - this.started) / 1000), node: process.versions.node, electron: process.versions.electron || '', platform: process.platform,
            mem: Math.round(m.rss / 1048576), heap: Math.round(m.heapUsed / 1048576), db: db ? { size: db.size, rows: db.tables.reduce((n, x) => n + x.rows, 0) } : null,
            game: { running: !!this.app.game.state.running, world: this.app.game.state.worldName || '', players: this.app.game.state.players.size }, debug: !!this.app.settings.get('adv.debug'), log };
    }
    async api(p) {
        p = str(p).trim();
        if (!/^\/[\w\/\-.~%]+(\?[\w\-.~%=&,:]*)?$/.test(p) || /\.\./.test(p)) throw new UserError('Pfad ungültig – z. B. /auth/user oder /worlds/wrld_…');
        const [pathname, qs] = p.split('?');
        const q = Object.fromEntries(new URLSearchParams(qs || ''));
        const t0 = Date.now();
        const data = await this.app.tools.call('GET', pathname, q);
        return { ms: Date.now() - t0, data };
    }
    /** künstliches Spiel-Ereignis – läuft durch Benachrichtigungen, Automatik, Warnliste … */
    sim(kind, input) {
        const st = this.app.game.state, ts = now();
        const name = cut(str(input.name).trim() || 'Testspieler', 40), id = /^usr_[0-9a-f-]{36}$/i.test(str(input.id)) ? str(input.id) : 'usr_00000000-0000-0000-0000-00000000test';
        let e;
        if (kind === 'player_join' || kind === 'player_leave') {
            e = { ts, kind, world_id: st.worldId, instance: st.instance, world_name: st.worldName, player_id: id, player_name: name, detail: 'simuliert' };
            if (kind === 'player_join') st.players.set(id, { id, name, since: ts }); else st.players.delete(id);
        } else if (kind === 'video') e = { ts, kind, world_id: st.worldId, world_name: st.worldName, detail: str(input.url) || 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', player_id: '', player_name: '' };
        else throw new UserError('Unbekanntes Ereignis.');
        if (kind === 'video') st.video = { url: e.detail, at: ts };
        const cb = this.app.game.onEvent;
        if (cb) cb(e);
        return { ok: true, msg: '🧪 Simuliert: ' + kind + (e.player_name ? ' – ' + e.player_name : '') };
    }
    async fun(kind, input) {
        const osc = this.app.game.osc;
        const TEXTS = {
            crown: '👑 Admin ist anwesend 👑',
            hearts: ['💖', '💗💖💗', '💞💗💖💗💞', '💗💖💗', '💖'],
            countdown: ['3️⃣', '2️⃣', '1️⃣', '🎉 LOS! 🎉'],
            wave: ['🌊', '🌊🌊', '🌊🌊🌊', '🌊🌊🌊🌊', '🏄'],
            dice: () => '🎲 ' + (1 + Math.floor(Math.random() * 6)),
            coin: () => Math.random() < 0.5 ? '🪙 Kopf' : '🪙 Zahl',
        };
        const t = TEXTS[kind];
        if (!t) throw new UserError('Unbekannt.');
        if (typeof t === 'function') { const s = t(); await osc.chatbox(s, true); return { msg: s }; }
        if (typeof t === 'string') { await osc.chatbox(t, true); return { msg: t }; }
        // kleine Animation: Bild für Bild (VRChat nimmt höchstens etwa 1 Nachricht pro 1,5 s an)
        (async () => { for (const f of t) { await osc.chatbox(f, false).catch(() => {}); await new Promise(r => setTimeout(r, int(input.ms) || 1600)); } })();
        return { msg: '✨ ' + kind + ' läuft in der Chatbox' };
    }
    async action(act, input) {
        this.need();
        switch (act) {
            case 'admin_sys': return this.sys();
            case 'admin_api': return await this.api(input.path);
            case 'admin_sim': return this.sim(str(input.kind), input);
            case 'admin_fun': return await this.fun(str(input.kind), input);
            case 'admin_debug': this.app.settings.save({ 'adv.debug': input.on === '1' }); return this.sys();
            case 'admin_log_clear': { try { fs.writeFileSync(path.join(this.app.tools.userData, 'nexus.log'), ''); } catch (e) { /* egal */ } return this.sys(); }
        }
        throw new UserError('Unbekannte Aktion.');
    }
}

module.exports = { Admin };
