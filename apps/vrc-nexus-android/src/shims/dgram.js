// UDP für OSC (3.2.5): in der Android-App über das native Plugin „OscBridge“ (native/java/.../OscBridge.java).
// Im Browser (Tests) gibt es kein UDP – dann melden send/bind einen Fehler wie bisher.
// Das Plugin hat genau einen Empfangs-Port: der zuletzt gebundene Socket bekommt die Pakete.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Buffer } from 'buffer';

let Osc = null;
try { if (Capacitor.isNativePlatform()) Osc = registerPlugin('OscBridge'); } catch (e) { Osc = null; }
// nur für lokale UI-Tests: ein Test-Skript kann ein Schein-VRChat mit gleicher Schnittstelle unterschieben
if (!Osc && typeof window !== 'undefined' && window.__nexusOscFake) Osc = window.__nexusOscFake;
const NA = 'OSC ist in dieser Umgebung nicht verfügbar.';

function createSocket() {
    const ev = {};
    let handle = null, closed = false;
    const emit = (n, ...a) => (ev[n] || []).slice().forEach(f => { try { f(...a); } catch (e) { /* egal */ } });
    const s = {
        on(n, f) { (ev[n] = ev[n] || []).push(f); return s; },
        once(n, f) { const w = (...a) => { s.off(n, w); f(...a); }; return s.on(n, w); },
        off(n, f) { ev[n] = (ev[n] || []).filter(x => x !== f); return s; },
        removeListener(n, f) { return s.off(n, f); },
        send(buf, a, b, c, d) {
            // send(buf, port, host, cb) oder send(buf, offset, length, port, host, cb) – hier nur die kurze Form
            const port = a, host = b, cb = typeof c === 'function' ? c : (typeof d === 'function' ? d : null);
            if (!Osc) { if (cb) cb(new Error(NA)); return; }
            Osc.send({ host: String(host), port: Number(port), data: Buffer.from(buf).toString('base64') }).then(() => cb && cb(null), e => cb && cb(new Error(e && e.message ? e.message : String(e))));
        },
        bind(port, host, cb) {
            if (typeof host === 'function') { cb = host; host = ''; }
            if (!Osc) { setTimeout(() => emit('error', new Error(NA)), 0); return s; }
            Osc.listen({ port: Number(port) || 9001 }).then(async () => {
                if (closed) return;
                handle = await Osc.addListener('packet', p => emit('message', Buffer.from(p.data, 'base64'), { address: p.host, port: p.port, family: 'IPv4' }));
                emit('listening');
                if (cb) cb();
            }, e => emit('error', new Error(e && e.message ? e.message : String(e))));
            return s;
        },
        close() { closed = true; if (handle) { try { handle.remove(); } catch (e) { /* egal */ } handle = null; if (Osc) Osc.stop().catch(() => {}); } },
        unref() { return s; }, ref() { return s; },
        address: () => ({ port: 0, address: '0.0.0.0' }), setBroadcast() {},
    };
    return s;
}
/** eigene WLAN-Adressen (für den Hinweis an VRChat) */
async function localIps() { if (!Osc) return []; try { return (await Osc.info()).ips || []; } catch (e) { return []; } }

export { createSocket, localIps };
export default { createSocket, localIps };
