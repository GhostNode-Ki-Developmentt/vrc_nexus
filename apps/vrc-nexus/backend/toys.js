'use strict';
/*
 * Spielzeug-Steuerung über Intiface Central (Buttplug-Protokoll v3, WebSocket – Standard ws://127.0.0.1:12345).
 * Eigene, schlanke Umsetzung des offenen Buttplug-Nachrichtenformats (kein fremder Code):
 *   RequestServerInfo → StartScanning → DeviceList/DeviceAdded/DeviceRemoved → ScalarCmd / StopAllDevices
 * Avatar-Parameter (OSC) können die Stärke steuern: Regel = Parameter → Gerät, Bereich, Kurve.
 */
const { str, int, arr, cut, UserError } = require('./util');

const DEF = { url: 'ws://127.0.0.1:12345', auto: false, max: 100, rules: [], idle_stop: 3, ogb: false, ogb_self: false, ogb_device: 'all', ogb_min: 0.05, links: {}, links_on: false };
/** OGB-/SPS-kompatible Avatar-Parameter (OscGoesBrrr, VRCFury Haptics): …/<Name>/(Touch|Pen|Frot)(Self|Others) bzw. VFH/Zone/… – Werte 0…1 = Nähe */
const OGB_RE = /^(?:OGB|VFH)\/.*?(Touch|Pen|Frot)(Self|Others)$/i;
/** SPS-Zonen: OGB/<Pen|Orf|Touch>/<Name>/<Wert> (auch VFH/Zone/…) – Pen = Plug, Orf = Socket.
 *  Werte: PenOthers/PenSelf (fremde/eigene Gegenstücke), TouchOthers/TouchSelf (Hände/Füße/Kopf), FrotOthers (fremde Plugs) */
const ZONE_RE = /^(?:OGB|VFH(?:\/Zone)?)\/(Pen|Orf|Touch)\/([^/]+)\/(\w+)$/i;
const ZONE_KIND = { pen: 'plugs', orf: 'sockets', touch: 'touch' };
const LINK_TYPES = ['plugs', 'sockets', 'touch', 'constant', 'param'];
/** „berührt von“: Schalter → Wert-Namen */
const SRC = { pen_others: ['penothers'], touch_others: ['touchothers', 'others'], frot_others: ['frotothers'], pen_self: ['penself'], touch_self: ['touchself', 'self'], frot_self: ['frotself'] };
const SRC_DEF = { pen_others: true, touch_others: true, frot_others: true, pen_self: false, touch_self: false, frot_self: false };

class Toys {
    constructor(app) {
        this.app = app; this.ws = null; this.id = 1; this.wait = new Map(); this.devices = new Map(); this.state = 'aus'; this.error = '';
        this.level = new Map(); this.sentAt = 0; this.pending = null; this.lastParam = 0;
        this.zones = { plugs: {}, sockets: {}, touch: {} }; this.pvals = {}; this.linkSent = new Map(); this.linkLevel = new Map();
        this.linkTimer = setInterval(() => this.compute(), 250); if (this.linkTimer.unref) this.linkTimer.unref();
        if (app.game && app.game.osc) { app.game.osc.taps = app.game.osc.taps || new Set(); app.game.osc.taps.add((a, v) => this.onOsc(a, v)); }
        this.timer = setInterval(() => this.idle(), 1000); if (this.timer.unref) this.timer.unref();
    }
    cfg() { try { return Object.assign({}, DEF, JSON.parse(this.app.db.setting('toys_cfg', '{}'))); } catch (e) { return Object.assign({}, DEF); } }
    saveCfg(c) {
        const cur = this.cfg(), n = Object.assign({}, cur);
        if (c.url !== undefined) { let u = str(c.url).trim(); if (!/^wss?:\/\/[\w.\-]+(:\d+)?\/?$/.test(u)) throw new UserError('Adresse ungültig (z. B. ws://127.0.0.1:12345).');
            if (/^wss?:\/\/0\.0\.0\.0/.test(u)) u = u.replace('0.0.0.0', '127.0.0.1');   // 0.0.0.0 = Intiface hört überall → auf diesem PC über 127.0.0.1
            if (u !== cur.url) { this.error = ''; this.state = 'aus'; }
            n.url = u; }
        if (c.auto !== undefined) n.auto = c.auto === true || c.auto === '1';
        if (c.max !== undefined) n.max = Math.max(5, Math.min(100, int(c.max)));
        if (c.idle_stop !== undefined) n.idle_stop = Math.max(0, Math.min(60, int(c.idle_stop)));
        if (c.links_on !== undefined) n.links_on = c.links_on === true || c.links_on === '1';
        if (c.links !== undefined) {
            let l = c.links; if (typeof l === 'string') { try { l = JSON.parse(l); } catch (e) { l = {}; } }
            const names = v => arr(v).map(x => cut(str(x), 60)).filter(Boolean).slice(0, 30);
            n.links = {};
            for (const [dev, arrL] of Object.entries(l || {}).slice(0, 20)) {
                const list = arr(arrL).map(x => ({ type: LINK_TYPES.includes(x.type) ? x.type : '', include: names(x.include), exclude: names(x.exclude),
                    src: Object.fromEntries(Object.keys(SRC).map(k => [k, x.src && x.src[k] !== undefined ? !!x.src[k] : SRC_DEF[k]])),
                    value: Math.max(0, Math.min(100, int(x.value === undefined ? 100 : x.value))), param: cut(str(x.param).replace(/^\/avatar\/parameters\//, ''), 80),
                    mut: arr(x.mut).map(m => ({ t: ['scale', 'dead', 'motion'].includes(m.t) ? m.t : '', v: Math.max(0, Math.min(10, Number(m.v) || 0)) })).filter(m => m.t).slice(0, 6) })).filter(x => x.type).slice(0, 10);
                if (list.length) n.links[cut(str(dev), 80)] = list;
            }
        }
        if (c.ogb !== undefined) n.ogb = c.ogb === true || c.ogb === '1';
        if (c.ogb_self !== undefined) n.ogb_self = c.ogb_self === true || c.ogb_self === '1';
        if (c.ogb_device !== undefined) n.ogb_device = str(c.ogb_device || 'all');
        if (c.ogb_min !== undefined) n.ogb_min = Math.max(0, Math.min(0.9, Number(c.ogb_min) || 0));
        if (c.rules !== undefined) {
            let r = c.rules; if (typeof r === 'string') { try { r = JSON.parse(r); } catch (e) { r = []; } }
            n.rules = arr(r).map(x => ({ param: cut(str(x.param).replace(/^\/avatar\/parameters\//, '').trim(), 80), device: str(x.device || 'all'), min: Math.max(0, Math.min(1, Number(x.min) || 0)),
                max: Math.max(0, Math.min(1, x.max === undefined ? 1 : Number(x.max))), invert: !!x.invert })).filter(x => /^[\w./\-]+$/.test(x.param)).slice(0, 30);
        }
        this.app.db.setSetting('toys_cfg', JSON.stringify(n));
        return n;
    }
    status() {
        return { state: this.state, error: this.error, connected: !!(this.ws && this.ws.readyState === 1), cfg: this.cfg(),
            ogb_params: [...(this.ogbSeen || [])].slice(0, 30),
            zones: Object.fromEntries(Object.entries(this.zones).map(([k, m]) => [k, Object.keys(m).sort()])), link_levels: Object.fromEntries(this.linkLevel || []),
            devices: [...this.devices.values()].map(d => ({ index: d.index, name: d.name, motors: d.motors.length, level: Math.round((this.level.get(d.index) || 0) * 100) })) };
    }

    // ---------- Verbindung ----------
    /** Ist überhaupt etwas auf host:port? (unterscheidet „Server aus“ von „lehnt ab“) */
    probe(host, port) {
        if (this.probeHook) return Promise.resolve(this.probeHook(host, port));
        return new Promise(res => {
            const sock = require('net').connect({ host, port, timeout: 2000 });
            const done = ok => { try { sock.destroy(); } catch (e) { /* egal */ } res(ok); };
            sock.once('connect', () => done(true)); sock.once('error', () => done(false)); sock.once('timeout', () => done(false));
        });
    }
    async connect() {
        if (this.ws && this.ws.readyState <= 1) return this.status();
        let url = this.cfg().url;
        const WS = this.WebSocket || globalThis.WebSocket;
        if (!WS) throw new UserError('WebSocket wird in dieser App-Version nicht unterstützt.');
        this.state = 'verbindet …'; this.error = '';
        let u; try { u = new URL(url); } catch (e) { throw new UserError('Adresse ungültig.'); }
        const port = int(u.port) || 12345, local = /^(127\.0\.0\.1|localhost|\[::1\])$/i.test(u.hostname);
        let open = await this.probe(u.hostname, port);
        if (!open && !local && await this.probe('127.0.0.1', port)) {
            // Intiface hört standardmäßig nur auf diesem PC → automatisch auf 127.0.0.1 umstellen
            url = 'ws://127.0.0.1:' + port; this.saveCfg({ url }); open = true;
            this.note = 'Adresse auf ' + url + ' umgestellt – Intiface hört nur auf diesem PC.';
        }
        if (!open) {
            this.state = 'getrennt';
            this.error = local ? 'Auf Port ' + port + ' läuft nichts – in Intiface Central „Start Server“ drücken und den Port prüfen (Einstellungen → Server Port).'
                : 'Unter ' + u.hostname + ':' + port + ' antwortet nichts. Läuft Intiface auf dem Handy oder einem anderen PC: dort in Intiface unter Settings → Server „Listen on all network interfaces“ einschalten, Server neu starten, gleiches WLAN, Handy wach lassen (Akku-Optimierung für Intiface aus). Läuft es auf diesem PC: ws://127.0.0.1:' + port + ' nehmen.';
            throw new UserError(this.error);
        }
        return new Promise((resolve, reject) => {
            let opened = false;
            const ws = new WS(url);
            this.ws = ws;
            const t = setTimeout(() => fail(), 6000);
            const fail = () => {
                clearTimeout(t);
                if (this.ws === ws) this.ws = null;
                try { ws.close(); } catch (e) { /* egal */ }
                this.state = 'getrennt';
                this.error = opened ? 'Intiface hat die Anmeldung abgelehnt (Protokoll-Version?) – Intiface Central aktualisieren.'
                    : 'Intiface ist erreichbar, lehnt die Verbindung aber ab. Meist ist schon ein anderes Programm verbunden (z. B. VRCFury Haptics, OscGoesBrrr) – Intiface erlaubt nur eine Verbindung: das andere Programm trennen oder beenden.';
                reject(new UserError(this.error));
            };
            ws.onerror = () => { if (!opened || this.state === 'verbindet …') fail(); };
            ws.onclose = () => { if (!opened) return fail(); if (this.ws === ws) { this.ws = null; this.state = 'getrennt'; this.error = 'Verbindung zu Intiface beendet.'; this.devices.clear(); } };
            ws.onmessage = ev => this.onMessage(String(ev.data));
            ws.onopen = async () => {
                opened = true;
                try {
                    const info = await this.req({ RequestServerInfo: { ClientName: 'VRC Nexus', MessageVersion: 3 } });
                    const si = info.ServerInfo || {};
                    if (si.MaxPingTime) { clearInterval(this.ping); this.ping = setInterval(() => this.req({ Ping: {} }).catch(() => {}), Math.max(500, si.MaxPingTime / 2)); }
                    this.state = 'verbunden · ' + (si.ServerName || 'Intiface');
                    const dl = await this.req({ RequestDeviceList: {} });
                    for (const d of arr((dl.DeviceList || {}).Devices)) this.addDevice(d);
                    clearTimeout(t);
                    resolve(Object.assign(this.status(), this.note ? { msg: this.note } : {}));
                    this.note = '';
                } catch (e) { fail(); }
            };
        });
    }
    disconnect() { clearInterval(this.ping); try { if (this.ws) this.ws.close(); } catch (e) { /* egal */ } this.ws = null; this.devices.clear(); this.state = 'aus'; }
    req(msg) {
        if (!this.ws || this.ws.readyState !== 1) return Promise.reject(new UserError('Nicht mit Intiface verbunden.'));
        const id = this.id++, type = Object.keys(msg)[0];
        msg[type].Id = id;
        return new Promise((res, rej) => {
            const t = setTimeout(() => { this.wait.delete(id); rej(new UserError('Intiface antwortet nicht.')); }, 5000);
            this.wait.set(id, { res: m => { clearTimeout(t); res(m); }, rej: e => { clearTimeout(t); rej(e); } });
            this.ws.send(JSON.stringify([msg]));
        });
    }
    onMessage(text) {
        let list; try { list = JSON.parse(text); } catch (e) { return; }
        for (const m of arr(list)) {
            const type = Object.keys(m)[0], body = m[type] || {};
            if (type === 'DeviceAdded') this.addDevice(body);
            if (type === 'DeviceRemoved') this.devices.delete(body.DeviceIndex);
            const w = this.wait.get(body.Id);
            if (w) { this.wait.delete(body.Id); if (type === 'Error') w.rej(new UserError('Intiface: ' + str(body.ErrorMessage))); else w.res(m); }
        }
    }
    addDevice(d) {
        const motors = arr(((d.DeviceMessages || {}).ScalarCmd)).map((s, i) => ({ index: i, type: str(s.ActuatorType || 'Vibrate'), steps: int(s.StepCount) || 20 }));
        this.devices.set(d.DeviceIndex, { index: d.DeviceIndex, name: str(d.DeviceDisplayName || d.DeviceName || 'Gerät'), motors });
    }
    async scan(sec = 10) {
        if (!this.ws) await this.connect();
        await this.req({ StartScanning: {} });
        setTimeout(() => this.req({ StopScanning: {} }).catch(() => {}), sec * 1000);
        return this.status();
    }

    // ---------- Stärke ----------
    /** level 0…1 für ein Gerät (oder 'all'); höchstens 10× pro Sekunde wirklich gesendet */
    async set(device, level) {
        const max = this.cfg().max / 100;
        const lv = Math.max(0, Math.min(1, Number(level) || 0)) * max;
        const targets = device === 'all' || device === undefined || device === '' ? [...this.devices.keys()] : [int(device)];
        for (const i of targets) {
            const d = this.devices.get(i);
            if (!d || !d.motors.length) continue;
            this.level.set(i, lv);
            await this.req({ ScalarCmd: { DeviceIndex: i, Scalars: d.motors.map(m => ({ Index: m.index, Scalar: Math.round(lv * m.steps) / m.steps, ActuatorType: m.type })) } }).catch(() => {});
        }
        return this.status();
    }
    async stopAll() {
        this.level.clear(); this.rule = {}; this.linkSent.clear();
        if (this.cfg().links_on) this.saveCfg({ links_on: false });   // Not-Aus: Verknüpfungen erst wieder von Hand einschalten
        if (this.ws && this.ws.readyState === 1) await this.req({ StopAllDevices: {} }).catch(() => {});
        return this.status();
    }
    /** Avatar-Parameter → Stärke (Regeln) */
    onOsc(address, args) {
        const c = this.cfg();
        if (c.links_on && address.startsWith('/avatar/parameters/')) this.track(address.slice(19), args[0]);
        if (!(c.auto && c.rules.length) && !c.ogb) return;
        if (!this.devices.size || !address.startsWith('/avatar/parameters/')) return;
        if (this.app.nsfw && !this.app.nsfw.access().features.includes('toys')) return;
        const name = address.slice(19), v = args[0];
        const val = typeof v === 'boolean' ? (v ? 1 : 0) : Number(v);
        if (!Number.isFinite(val)) return;
        this.rule = this.rule || {};
        // OGB/SPS: stärkste Berührung zählt (Self optional)
        const og = c.ogb ? OGB_RE.exec(name) : null;
        if (og) {
            this.ogbSeen = this.ogbSeen || new Set(); this.ogbSeen.add(name);
            if (/self/i.test(og[2]) && !c.ogb_self) return;
            const x = Math.max(0, Math.min(1, val));
            this.rule['ogb|' + name] = { device: c.ogb_device || 'all', lv: x < 0.01 ? 0 : c.ogb_min + (1 - c.ogb_min) * x };
            this.lastParam = Date.now();
            return this.flush();
        }
        if (!c.auto) return;
        for (const r of c.rules) {
            if (r.param !== name) continue;
            let x = Math.max(0, Math.min(1, val)); if (r.invert) x = 1 - x;
            this.rule[r.device + '|' + r.param] = { device: r.device, lv: x <= 0.001 ? 0 : r.min + (r.max - r.min) * x };
            this.lastParam = Date.now();
        }
        this.flush();
    }
    /** SPS-Zonen und Parameter für die Geräte-Verknüpfungen merken (inkl. Bewegung = Änderung pro Sekunde) */
    track(name, v) {
        const val = typeof v === 'boolean' ? (v ? 1 : 0) : Number(v);
        if (!Number.isFinite(val)) return;
        const x = Math.max(0, Math.min(1, val)), t = Date.now();
        const z = ZONE_RE.exec(name);
        if (z) {
            const kind = ZONE_KIND[z[1].toLowerCase()], zone = this.zones[kind][z[2]] = this.zones[kind][z[2]] || {};
            const key = z[3].toLowerCase(), old = zone[key];
            const speed = old ? Math.abs(x - old.v) / Math.max(0.02, (t - old.at) / 1000) : 0;
            zone[key] = { v: x, at: t, speed: old ? Math.max(speed, old.speed * 0.6) : 0 };
        }
        const o = this.pvals[name];
        this.pvals[name] = { v: x, at: t, speed: o ? Math.abs(x - o.v) / Math.max(0.02, (t - o.at) / 1000) : 0 };
    }
    /** Mutatoren: Totzone → Bewegung → Skalieren */
    mutate(raw, speed, mut) {
        let x = raw;
        for (const m of mut) {
            if (m.t === 'dead') x = x <= m.v / 10 ? 0 : (x - m.v / 10) / (1 - m.v / 10);
            if (m.t === 'motion') x = Math.min(1, speed * (m.v || 1) * 0.5);
            if (m.t === 'scale') x = Math.min(1, x * (m.v || 1));
        }
        return Math.max(0, Math.min(1, x));
    }
    linkValue(l, fresh) {
        const motion = l.mut.some(m => m.t === 'motion');
        if (l.type === 'constant') return this.mutate(l.value / 100, 0, l.mut);
        if (l.type === 'param') { const p = this.pvals[l.param]; return p && p.at > fresh ? this.mutate(p.v, p.speed, l.mut) : 0; }
        let best = 0;
        for (const [name, zone] of Object.entries(this.zones[l.type] || {})) {
            if ((l.include.length && !l.include.includes(name)) || l.exclude.includes(name)) continue;
            for (const [s, keys] of Object.entries(SRC)) {
                if (!l.src[s]) continue;
                for (const k of keys) {
                    const e = zone[k];
                    if (!e || e.at < fresh) continue;
                    best = Math.max(best, this.mutate(e.v, motion ? e.speed * Math.max(0, 1 - (Date.now() - e.at) / 600) : 0, l.mut));
                }
            }
        }
        return best;
    }
    /** Stärke je Gerät = höchster Wert aller Verknüpfungen */
    compute() {
        const c = this.cfg();
        if (!c.links_on || !this.devices.size || !this.ws) return;
        if (this.app.nsfw && !this.app.nsfw.access().features.includes('toys')) return;
        const fresh = Date.now() - Math.max(1, c.idle_stop || 3) * 1000;
        for (const d of this.devices.values()) {
            const links = c.links[d.name];
            if (!links) continue;
            const lv = links.reduce((m, l) => Math.max(m, this.linkValue(l, fresh)), 0);
            this.linkLevel.set(d.name, Math.round(lv * 100));
            const last = this.linkSent.get(d.index);
            if (last !== undefined && Math.abs(last - lv) < 0.02) continue;
            this.linkSent.set(d.index, lv);
            this.set(String(d.index), lv).catch(() => {});
        }
    }
    flush() {
        if (Date.now() - this.sentAt < 100) { if (!this.pending) this.pending = setTimeout(() => { this.pending = null; this.flush(); }, 110); return; }
        this.sentAt = Date.now();
        const per = {};
        for (const k of Object.keys(this.rule || {})) { const r = this.rule[k]; per[r.device] = Math.max(per[r.device] || 0, r.lv); }
        for (const [dev, lv] of Object.entries(per)) this.set(dev, lv).catch(() => {});
    }
    /** keine Parameter mehr → nach x s aus (falls VRChat hängt) */
    idle() {
        const c = this.cfg();
        if ((c.auto || c.ogb) && c.idle_stop && this.lastParam && Date.now() - this.lastParam > c.idle_stop * 1000 && [...this.level.values()].some(v => v > 0)) { this.lastParam = 0; this.stopAll().catch(() => {}); }
    }

    async action(act, input) {
        if (this.app.nsfw) this.app.nsfw.need('toys');
        switch (act) {
            case 'toys_status': return this.status();
            case 'toys_cfg': { const c = this.saveCfg(input); return Object.assign(this.status(), { cfg: c, msg: 'Gespeichert.' }); }
            case 'toys_connect': { const r = await this.connect(); return Object.assign({ msg: 'Mit Intiface verbunden.' }, r); }
            case 'toys_disconnect': this.disconnect(); return this.status();
            case 'toys_scan': return Object.assign(await this.scan(), { msg: 'Suche Geräte (10 s) …' });
            case 'toys_set': return await this.set(str(input.device || 'all'), Number(input.level));
            case 'toys_stop': return Object.assign(await this.stopAll(), { msg: '⏹ Alles gestoppt.' });
        }
        throw new UserError('Unbekannte Aktion.');
    }
    stop() { clearInterval(this.timer); clearInterval(this.linkTimer); this.disconnect(); }
}

module.exports = { Toys, SRC, SRC_DEF };
