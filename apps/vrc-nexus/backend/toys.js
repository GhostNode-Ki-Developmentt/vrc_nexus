'use strict';
/*
 * Spielzeug-Steuerung über Intiface Central (Buttplug-Protokoll v3, WebSocket – Standard ws://127.0.0.1:12345).
 * Eigene, schlanke Umsetzung des offenen Buttplug-Nachrichtenformats (kein fremder Code):
 *   RequestServerInfo → StartScanning → DeviceList/DeviceAdded/DeviceRemoved → ScalarCmd / StopAllDevices
 * Avatar-Parameter (OSC) können die Stärke steuern: Regel = Parameter → Gerät, Bereich, Kurve.
 */
const { str, int, arr, cut, UserError } = require('./util');

const DEF = { url: 'ws://127.0.0.1:12345', auto: false, max: 100, rules: [], idle_stop: 3, ogb: false, ogb_self: false, ogb_device: 'all', ogb_min: 0.05 };
/** OGB-/SPS-kompatible Avatar-Parameter (OscGoesBrrr, VRCFury Haptics): …/<Name>/(Touch|Pen|Frot)(Self|Others) bzw. VFH/Zone/… – Werte 0…1 = Nähe */
const OGB_RE = /^(?:OGB|VFH)\/.*?(Touch|Pen|Frot)(Self|Others)$/i;

class Toys {
    constructor(app) {
        this.app = app; this.ws = null; this.id = 1; this.wait = new Map(); this.devices = new Map(); this.state = 'aus'; this.error = '';
        this.level = new Map(); this.sentAt = 0; this.pending = null; this.lastParam = 0;
        if (app.game && app.game.osc) { app.game.osc.taps = app.game.osc.taps || new Set(); app.game.osc.taps.add((a, v) => this.onOsc(a, v)); }
        this.timer = setInterval(() => this.idle(), 1000); if (this.timer.unref) this.timer.unref();
    }
    cfg() { try { return Object.assign({}, DEF, JSON.parse(this.app.db.setting('toys_cfg', '{}'))); } catch (e) { return Object.assign({}, DEF); } }
    saveCfg(c) {
        const cur = this.cfg(), n = Object.assign({}, cur);
        if (c.url !== undefined) { const u = str(c.url).trim(); if (!/^wss?:\/\/[\w.\-]+(:\d+)?\/?$/.test(u)) throw new UserError('Adresse ungültig (z. B. ws://127.0.0.1:12345).'); n.url = u; }
        if (c.auto !== undefined) n.auto = c.auto === true || c.auto === '1';
        if (c.max !== undefined) n.max = Math.max(5, Math.min(100, int(c.max)));
        if (c.idle_stop !== undefined) n.idle_stop = Math.max(0, Math.min(60, int(c.idle_stop)));
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
            devices: [...this.devices.values()].map(d => ({ index: d.index, name: d.name, motors: d.motors.length, level: Math.round((this.level.get(d.index) || 0) * 100) })) };
    }

    // ---------- Verbindung ----------
    connect() {
        if (this.ws && this.ws.readyState <= 1) return Promise.resolve(this.status());
        const url = this.cfg().url;
        const WS = this.WebSocket || globalThis.WebSocket;
        if (!WS) throw new UserError('WebSocket wird hier nicht unterstützt.');
        this.state = 'verbindet …'; this.error = '';
        return new Promise((resolve, reject) => {
            const ws = new WS(url);
            this.ws = ws;
            const fail = e => { this.state = 'getrennt'; this.error = 'Intiface Central nicht erreichbar (' + url + ') – läuft es und ist der Server gestartet?'; reject(new UserError(this.error)); };
            ws.onerror = fail;
            ws.onclose = () => { if (this.ws === ws) { this.ws = null; this.state = 'getrennt'; this.devices.clear(); } };
            ws.onmessage = ev => this.onMessage(String(ev.data));
            ws.onopen = async () => {
                try {
                    const info = await this.req({ RequestServerInfo: { ClientName: 'VRC Nexus', MessageVersion: 3 } });
                    const si = info.ServerInfo || {};
                    if (si.MaxPingTime) { clearInterval(this.ping); this.ping = setInterval(() => this.req({ Ping: {} }).catch(() => {}), Math.max(500, si.MaxPingTime / 2)); }
                    this.state = 'verbunden · ' + (si.ServerName || 'Intiface');
                    const dl = await this.req({ RequestDeviceList: {} });
                    for (const d of arr((dl.DeviceList || {}).Devices)) this.addDevice(d);
                    resolve(this.status());
                } catch (e) { fail(e); }
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
        this.level.clear(); this.rule = {};
        if (this.ws && this.ws.readyState === 1) await this.req({ StopAllDevices: {} }).catch(() => {});
        return this.status();
    }
    /** Avatar-Parameter → Stärke (Regeln) */
    onOsc(address, args) {
        const c = this.cfg();
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
            case 'toys_connect': return Object.assign(await this.connect(), { msg: 'Mit Intiface verbunden.' });
            case 'toys_disconnect': this.disconnect(); return this.status();
            case 'toys_scan': return Object.assign(await this.scan(), { msg: 'Suche Geräte (10 s) …' });
            case 'toys_set': return await this.set(str(input.device || 'all'), Number(input.level));
            case 'toys_stop': return Object.assign(await this.stopAll(), { msg: '⏹ Alles gestoppt.' });
        }
        throw new UserError('Unbekannte Aktion.');
    }
    stop() { clearInterval(this.timer); this.disconnect(); }
}

module.exports = { Toys };
