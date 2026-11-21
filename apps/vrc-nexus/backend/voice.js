'use strict';
/*
 * 3.7 Sprachanrufe 1:1 (nur PC-App): WebRTC läuft in der Oberfläche (Opus, DTLS-SRTP, Rausch- und Echo-Unterdrückung des Browsers).
 * Dieses Modul ist nur die Signalisierung: Angebot/Antwort/Auflegen gehen als Ende-zu-Ende-verschlüsselte Steuer-Nachricht
 * (t: 'call') über den vorhandenen Chat-Briefkasten. Weil die SDP (mit den DTLS-Fingerabdrücken) E2E-verschlüsselt und
 * signiert übertragen wird, kann der Server keinen Mann-in-der-Mitte spielen.
 * ICE: nur der EIGENE STUN/TURN-Server (Webseite gibt kurzlebige TURN-Zugangsdaten aus) oder ein selbst eingetragener Server –
 * keine öffentlichen Server. Ohne Server klappen Anrufe nur im selben Netz.
 */
const { str, int, cut, UserError } = require('./util');

const UID = /^(?:usr_[0-9a-f-]{36}|[0-9a-z]{10})$/;
const CALL = /^[0-9a-f]{16}$/;
const OFFER_TTL = 60000;

class Voice {
    constructor(app, crypt) { this.app = app; this.crypt = crypt; this.queue = []; this.ring = null; this.active = null; this.ice = null; this.iceAt = 0; this.outbox = []; }
    get chat() { if (!this.app.chat) throw new UserError('Der Chat ist nicht verfügbar.'); return this.app.chat; }
    /** eigener Server (optional, statt der Webseite): { urls, user, pass } – verschlüsselt gespeichert */
    cfg() { try { return JSON.parse(this.crypt.decrypt(this.app.db.setting('voice_cfg', '')) || '{}') || {}; } catch (e) { return {}; } }
    names() { try { return this.chat.names(); } catch (e) { return {}; } }
    log(uid, text) { try { this.chat.store(uid, { id: 'c' + Date.now().toString(16) + Math.random().toString(16).slice(2, 6), sys: true, call: true, text, at: Date.now() }); } catch (e) { /* egal */ } }
    dur(s) { s = Math.max(0, int(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

    /** eingehende Anruf-Steuerung (aus chat.poll, schon entschlüsselt) */
    signal(from, p, mine) {
        const call = str(p.call), op = str(p.op);
        if (!CALL.test(call)) return;
        if (from === mine) {   // von meinem anderen Gerät: dort angenommen/abgelehnt → hier nicht weiter klingeln
            if ((op === 'answer' || op === 'decline') && this.ring && this.ring.call === call) { this.ring = null; this.queue.push({ op: 'elsewhere', call }); }
            return;
        }
        if (!UID.test(from)) return;
        if (op === 'offer') {
            if (Date.now() - int(p.at) > OFFER_TTL) { this.log(from, '📞 Verpasster Anruf'); return; }
            if (this.active || this.ring) { this.outbox.push([from, { t: 'call', op: 'busy', call }]); return; }   // erst nach dem Abholen senden (Sitzungsstand)
            this.ring = { call, from, sdp: cut(str(p.sdp), 20000), at: Date.now() };
            this.queue.push({ op: 'ring', call, from, name: this.names()[from] || '' });
            const host = this.app.tools && this.app.tools.host;
            if (host && host.notify) host.notify('📞 Anruf', (this.names()[from] || 'Jemand') + ' ruft dich über VRC Nexus an.', false);
            return;
        }
        if (op === 'answer') { if (this.active && this.active.call === call && this.active.uid === from) this.queue.push({ op: 'answer', call, sdp: cut(str(p.sdp), 20000) }); return; }
        if (op === 'hangup' || op === 'decline' || op === 'busy') {
            if (this.ring && this.ring.call === call && this.ring.from === from) { this.ring = null; this.log(from, '📞 Verpasster Anruf'); }
            if (this.active && this.active.call === call && this.active.uid === from) {
                this.active = null;
                if (op === 'hangup' && int(p.secs) > 0) this.log(from, '📞 Anruf · ' + this.dur(p.secs));
                else if (op !== 'hangup') this.log(from, op === 'busy' ? '📞 Besetzt' : '📞 Anruf abgelehnt');
            }
            this.queue.push({ op, call });
        }
    }
    async iceServers() {
        const c = this.cfg();
        if (c.urls && c.urls.length) return [{ urls: c.urls, ...(c.user ? { username: c.user, credential: c.pass || '' } : {}) }];
        if (this.ice && Date.now() - this.iceAt < 3600000) return this.ice;
        try { this.ice = (await this.chat.call('turn', {})).ice || []; this.iceAt = Date.now(); } catch (e) { this.ice = this.ice || []; }
        return this.ice;
    }
    async action(act, input) {
        const uid = str(input.uid).toLowerCase(), call = str(input.call);
        switch (act) {
            case 'voice_ice': { const c = this.cfg(); return { ice: await this.iceServers(), custom: { urls: (c.urls || []).join(' '), user: c.user || '', has_pass: !!c.pass } }; }
            case 'voice_cfg': {   // eigener STUN/TURN-Server (leer = Server der Webseite)
                const urls = str(input.urls).split(/[\s,]+/).filter(Boolean);
                for (const u of urls) if (!/^(stun|turns?):[\w.\-[\]:]+(\?transport=(udp|tcp))?$/.test(u)) throw new UserError('Ungültige Server-Adresse: ' + cut(u, 80) + ' (Beispiel: turn:mein-server.de:3478)');
                const old = this.cfg();
                const c = urls.length ? { urls: urls.slice(0, 6), user: cut(str(input.user).trim(), 120), pass: input.pass !== undefined && str(input.pass) !== '' ? cut(str(input.pass), 200) : old.pass || '' } : {};
                this.app.db.setSetting('voice_cfg', urls.length ? this.crypt.encrypt(JSON.stringify(c)) : '');
                this.ice = null;
                return { ok: true, msg: urls.length ? 'Eigener Server gespeichert.' : 'Es wird der Server der Webseite benutzt.' };
            }
            case 'voice_offer': {
                if (!UID.test(uid)) throw new UserError('Ungültige VRChat-User-ID.');
                if (!CALL.test(call)) throw new UserError('Ungültiger Anruf.');
                if (this.active || this.ring) throw new UserError('Es läuft schon ein Anruf.');
                this.active = { call, uid, out: true, at: Date.now() };
                try { await this.chat.control(uid, { t: 'call', op: 'offer', call, sdp: cut(str(input.sdp), 20000) }); }
                catch (e) { this.active = null; throw e; }
                return { ok: true };
            }
            case 'voice_accept': {   // eingehenden Anruf annehmen (SDP-Antwort kommt aus der Oberfläche)
                if (!this.ring || this.ring.call !== call) throw new UserError('Der Anruf ist nicht mehr da.');
                const r = this.ring; this.ring = null;
                this.active = { call, uid: r.from, out: false, at: Date.now() };
                await this.chat.control(r.from, { t: 'call', op: 'answer', call, sdp: cut(str(input.sdp), 20000) });
                return { ok: true };
            }
            case 'voice_incoming': return { ring: this.ring ? { call: this.ring.call, from: this.ring.from, sdp: this.ring.sdp, name: this.names()[this.ring.from] || '' } : null };
            case 'voice_decline': {
                if (!this.ring || this.ring.call !== call) return { ok: true };
                const r = this.ring; this.ring = null;
                this.log(r.from, '📞 Anruf abgelehnt');
                await this.chat.control(r.from, { t: 'call', op: 'decline', call }).catch(() => {});
                return { ok: true };
            }
            case 'voice_hangup': {
                const a = this.active;
                if (!a || a.call !== call) return { ok: true };
                this.active = null;
                const secs = int(input.secs);
                this.log(a.uid, secs > 0 ? '📞 Anruf · ' + this.dur(secs) : a.out ? '📞 Anruf abgebrochen' : '📞 Anruf beendet');
                await this.chat.control(a.uid, { t: 'call', op: 'hangup', call, secs }).catch(() => {});
                return { ok: true };
            }
            case 'voice_poll': {   // während Klingeln/Anruf: Briefkasten öfter abholen (alle 1–2 s)
                if (input.fast === '1') await this.chat.poll().catch(() => {});
                while (this.outbox.length) { const [to, msg] = this.outbox.shift(); await this.chat.control(to, msg).catch(() => {}); }
                const q = this.queue; this.queue = [];
                if (this.ring && Date.now() - this.ring.at > OFFER_TTL) { this.log(this.ring.from, '📞 Verpasster Anruf'); this.ring = null; q.push({ op: 'hangup', call: '' }); }
                return { events: q, ring: this.ring ? { call: this.ring.call, from: this.ring.from, name: this.names()[this.ring.from] || '' } : null, active: this.active ? { call: this.active.call, uid: this.active.uid } : null };
            }
            default: throw new UserError('Unbekannte Anruf-Aktion.');
        }
    }
}

module.exports = { Voice };
