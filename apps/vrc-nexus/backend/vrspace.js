'use strict';
/*
 * 🚀 VR-Bewegung (3.3) – Space Flight / Space Turn / Space Walk. Eigene Umsetzung.
 * Die eigentliche Bewegung macht der SteamVR-Helfer (overlay/Program.cs): er verschiebt/dreht den Nullpunkt des
 * Spielbereichs (Chaperone „Standing Zero Pose“) und liest die Controller (SteamVR-Eingabe oder Legacy-Tasten).
 * Hier: Einstellungen (vr.space*, vr.fly*, vr.turn*, vr.walk*), Befehl für den Helfer, Status für Oberfläche und Overlay.
 */
const { str, int, UserError } = require('./util');

const PREFIX = /^vr\.(space|fly|turn|walk)_?/;
/** Tastenbelegung – gleiche Zuordnung wie overlay/input/bindings_*.json (Standard) bzw. Program.cs (Legacy) */
const SCHEMES = {
    standard: {
        knuckles: { fly: ['A', 'beide'], reset: ['A', 'links, doppelt'], gravity: ['A', 'rechts, doppelt'], turn: ['Stick-Klick', 'links'], walk: ['Stick-Klick', 'rechts'] },
        oculus_touch: { fly: ['X / A', 'beide'], reset: ['X', 'doppelt'], gravity: ['A', 'doppelt'], turn: ['Stick-Klick', 'links'], walk: ['Stick-Klick', 'rechts'] },
        vive_controller: { fly: ['Grip', 'beide'], reset: ['Grip', 'links, doppelt'], gravity: ['Grip', 'rechts, doppelt'], turn: ['Trackpad-Klick', 'links'], walk: ['Trackpad-Klick', 'rechts'] },
        holographic_controller: { fly: ['Grip', 'beide'], reset: ['Grip', 'links, doppelt'], gravity: ['Grip', 'rechts, doppelt'], turn: ['Stick-Klick', 'links'], walk: ['Stick-Klick', 'rechts'] },
    },
    legacy: { fly: ['Grip', 'gedrückt halten'], reset: ['Stick/Trackpad + Menü', 'links'], gravity: ['Stick/Trackpad + Menü', 'rechts'], turn: ['A / X', 'links'], walk: ['A', 'rechts'] },
};
/** Grafik: welche Taste am Controller leuchtet (fly/turn/walk/reset/gravity) */
const KEY = { standard: { fly: 'a', reset: 'a', gravity: 'a', turn: 'stick', walk: 'stick' }, legacy: { fly: 'grip', reset: 'stick', gravity: 'stick', turn: 'a', walk: 'a' } };

class VrSpace {
    constructor(app) { this.app = app; }
    get host() { return (this.app.tools && this.app.tools.host) || {}; }
    cfg() {
        const s = this.app.settings.all(), o = {};
        for (const k of Object.keys(s)) if (PREFIX.test(k) && k !== 'vr.space_orig') o[k] = s[k];
        return o;
    }
    /** Befehl für den Helfer (Zahlen für den einfachen Parser in Program.cs) */
    static command(s) {
        const b = k => (s[k] ? 1 : 0), n = (k, f, d) => Math.round((Number(s[k]) || d) * f * 1000) / 1000;
        return { cmd: 'space', on: s['vr.space'] ? 1 : 0, legacy: s['vr.space_input'] === 'legacy' ? 1 : 0,
            fly: b('vr.fly_on'), hand: ['left', 'right'].includes(s['vr.fly_hand']) ? s['vr.fly_hand'] : 'both', flymul: n('vr.fly_mul', 0.01, 100), grav: b('vr.fly_gravity'), g: n('vr.fly_g', 0.1, 98),
            lx: b('vr.fly_lock_x'), ly: b('vr.fly_lock_y'), lz: b('vr.fly_lock_z'),
            turn: b('vr.turn_on'), tmul: n('vr.turn_mul', 0.01, 100), tsmooth: n('vr.turn_smooth', 0.01, 0.0001), tstep: int(s['vr.turn_comfort']) || 0, tinv: b('vr.turn_invert'),
            walk: b('vr.walk_on'), wmul: n('vr.walk_mul', 0.01, 100), wsmooth: n('vr.walk_smooth', 0.01, 0.0001), wmom: b('vr.walk_momentum'), winv: b('vr.walk_invert'),
            lp: b('vr.walk_lock_pitch'), lr: b('vr.walk_lock_roll'), lyaw: b('vr.walk_lock_yaw'), orig: str(s['vr.space_orig']) };
    }
    state() {
        const ov = this.host.overlayState ? this.host.overlayState() : null;
        return ov && ov.space ? ov.space : { available: !!this.host.overlayState, running: false, status: this.host.overlayState ? 'aus' : 'nur in der Windows-App' };
    }
    get() {
        const c = this.cfg(), mode = c['vr.space_input'] === 'legacy' ? 'legacy' : 'standard';
        return { cfg: c, state: this.state(), windows: !!this.host.overlayState, schemes: SCHEMES, keys: KEY[mode], mode };
    }
    async action(act, input) {
        switch (act) {
            case 'space_get': return this.get();
            case 'space_save': {
                const upd = {};
                for (const [k, v] of Object.entries(input || {})) if (PREFIX.test(k) && k !== 'vr.space_orig') upd[k] = v;
                this.app.settings.save(upd);
                return Object.assign(this.get(), { msg: input.quiet ? '' : 'Gespeichert.' });
            }
            case 'space_reset': {
                if (!this.host.spaceCmd) throw new UserError('VR-Bewegung gibt es nur in der Windows-App mit SteamVR.');
                const st = this.state();
                if (!st.running) throw new UserError('Der SteamVR-Helfer läuft nicht (' + (st.status || 'aus') + ').');
                this.host.spaceCmd('reset');
                return Object.assign(this.get(), { msg: 'Spielbereich zurückgesetzt.' });
            }
        }
        throw new UserError('Unbekannte Aktion.');
    }
}

module.exports = { VrSpace, SCHEMES, KEY };
