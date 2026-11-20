/* VRC Nexus – 📡 OSC am Handy (3.2.5): eigene OSC-Verbindung direkt zu VRChat (rohes UDP über das native Modul OscBridge).
 *   Verbindung (PC-IP, Ports, Test, Hinweis zur VRChat-Startoption) · Avatar-Parameter als große Schalter/Schieber mit Suche und ⭐ Favoriten
 *   (Favorit → „＋ Knopf“ legt ihn in den Nexus-Knöpfen an) · Szenen · Aufnahme · Chatbox-Module an/aus. */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, api = (a, d) => UI.api(a, d), toast = (m, bad) => UI.toast(m, bad);
    const T = s => (window.t ? window.t(s) : s);
    let box = null, d = null, q = '', timer = null, busy = false;

    const ago = ms => { if (!ms) return T('noch nie'); const s = Math.round((Date.now() - ms) / 1000); return s < 60 ? T('gerade eben') : s < 3600 ? Math.round(s / 60) + ' min' : Math.round(s / 3600) + ' h'; };
    function ctl(p, fav) {
        const v = p.value, n = esc(p.name);
        let c = '';
        if (p.type === 'bool') c = '<button type="button" class="mo-sw' + (v ? ' on' : '') + '" data-mset="' + n + '" data-mtype="bool" data-mval="' + (v ? '0' : '1') + '"><i></i></button>';
        else if (p.type === 'int') c = '<span class="mo-step"><button type="button" data-mset="' + n + '" data-mtype="int" data-mval="' + Math.max(0, (v | 0) - 1) + '">−</button><b>' + (v === undefined ? '–' : v) + '</b><button type="button" data-mset="' + n + '" data-mtype="int" data-mval="' + Math.min(255, (v | 0) + 1) + '">＋</button></span>';
        else c = '<input type="range" min="-1" max="1" step="0.01" value="' + (typeof v === 'number' ? v : 0) + '" data-mrange="' + n + '"><b class="mo-fv">' + (typeof v === 'number' ? v.toFixed(2) : '–') + '</b>';
        return '<div class="mo-p' + (p.type === 'float' ? ' wide' : '') + '"><button type="button" class="mo-star' + (fav ? ' on' : '') + '" data-mfav="' + n + '" data-mtype="' + p.type + '" title="' + esc(T('Favorit')) + '">' + (fav ? '★' : '☆') + '</button>'
            + '<span class="mo-n">' + n + '<small>' + esc(p.type) + '</small></span>' + c
            + (fav ? '<button type="button" class="mo-key" data-mkey="' + n + '" data-mtype="' + p.type + '" title="' + esc(T('Als Nexus-Knopf anlegen')) + '">＋🎛</button>' : '') + '</div>';
    }
    function render() {
        if (!box || !d) return;
        if (box.contains(document.activeElement) && document.activeElement.matches('input[type=text], input[type=number], input[type=search]')) return;
        const c = d.cfg, live = Date.now() - d.last < 120000;
        const byName = Object.fromEntries(d.params.map(p => [p.name, p]));
        const favs = d.favs.map(f => byName[f.name] || { name: f.name, type: f.type, value: undefined });
        const rest = d.params.filter(p => !d.favs.some(f => f.name === p.name) && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
        const ip = d.ips && d.ips[0] ? d.ips[0] : '<Handy-IP>';
        box.innerHTML = '<div class="mo">'
            // Verbindung
            + '<details class="nc-card mo-conn"' + (c.host === '127.0.0.1' || !live ? ' open' : '') + '><summary><span class="mo-dot' + (live ? ' on' : '') + '"></span><b>' + esc(T('Verbindung zu VRChat')) + '</b>'
            + '<small>' + (c.host === '127.0.0.1' ? esc(T('PC-IP fehlt')) : esc(c.host) + ':' + c.send + ' · ' + (live ? esc(T('empfängt')) + ' · ' + d.live + ' ' + esc(T('Parameter')) : esc(T('nichts empfangen')) + ' (' + esc(ago(d.last)) + ')')) + '</small></summary>'
            + '<form class="mo-form"><label>' + esc(T('PC-IP (VRChat)')) + '<input type="text" name="osc_host" inputmode="decimal" placeholder="192.168.1.20" value="' + esc(c.host === '127.0.0.1' ? '' : c.host) + '"></label>'
            + '<div class="mo-row"><label>' + esc(T('Senden an Port')) + '<input type="number" name="osc_send_port" value="' + c.send + '"></label><label>' + esc(T('Empfangen auf Port')) + '<input type="number" name="osc_listen_port" value="' + c.listen_port + '"></label></div>'
            + '<label class="check"><input type="checkbox" name="osc_listen"' + (c.listen ? ' checked' : '') + '> ' + esc(T('Parameter-Werte von VRChat empfangen')) + '</label>'
            + '<div class="mo-row"><button class="btn btn-sm btn-gold">' + esc(T('Speichern')) + '</button><button type="button" class="btn btn-sm" data-mtest="1">📡 ' + esc(T('Verbindung testen')) + '</button></div></form>'
            + (d.listen_error ? '<p class="small bad">⚠ ' + esc(d.listen_error) + '</p>' : '')
            + '<div class="tts-help small">' + esc(T('VRChat nimmt OSC normalerweise nur vom eigenen PC an. Damit das Handy steuern und die Werte sehen kann, VRChat mit dieser Startoption starten (Steam → VRChat → Eigenschaften → Startoptionen):'))
            + '<code class="mo-code">--osc=9000:' + esc(ip) + ':' + c.listen_port + '</code>' + esc(T('Handy und PC müssen im selben WLAN sein. Andere OSC-Programme am PC bekommen dann keine Werte mehr von VRChat.')) + '</div></details>'
            // Parameter
            + '<div class="nc-card"><div class="mo-h"><b>🎚 ' + esc(T('Avatar-Parameter')) + '</b>' + (d.avatar ? '<small>' + esc(d.avatar.slice(0, 18)) + '…</small>' : '') + '</div>'
            + (favs.length ? '<div class="mo-sec">★ ' + esc(T('Favoriten')) + '</div><div class="mo-list">' + favs.map(p => ctl(p, true)).join('') + '</div>' : '')
            + '<div class="mo-sec">' + esc(T('Alle Parameter')) + ' (' + d.params.length + ')</div>'
            + '<input type="search" class="mo-q" placeholder="' + esc(T('Parameter suchen …')) + '" value="' + esc(q) + '">'
            + (rest.length ? '<div class="mo-list">' + rest.map(p => ctl(p, false)).join('') + '</div>' : '<p class="vx-empty small">' + esc(T(d.params.length ? 'Kein Treffer.' : 'Noch keine Werte von VRChat – Verbindung oben einrichten und den Avatar kurz wechseln oder bewegen.')) + '</p>')
            + '<form class="mo-row mo-add"><input type="text" name="name" placeholder="' + esc(T('Parameter von Hand (Name)')) + '"><select name="type"><option value="bool">Bool</option><option value="int">Int</option><option value="float">Float</option></select><button class="btn btn-sm">☆</button></form></div>'
            // Szenen & Aufnahme
            + '<div class="nc-card"><div class="mo-h"><b>🎭 ' + esc(T('Parameter-Szenen')) + '</b><button type="button" class="btn btn-sm" data-mscene="1">＋ ' + esc(T('Jetzt speichern')) + '</button></div>'
            + (d.scenes.length ? '<div class="mo-chips">' + d.scenes.map(s => '<button type="button" class="chip" data-mapply="' + esc(s.id) + '">' + esc(s.name) + ' <small>' + s.n + '</small></button>').join('') + '</div>' : '<p class="small muted">' + esc(T('Speichert die aktuellen Werte deines Avatars – später mit einem Tippen wiederherstellen.')) + '</p>')
            + '<div class="mo-h" style="margin-top:12px"><b>⏺ ' + esc(T('Aufnahme')) + '</b>'
            + (d.recording ? '<button type="button" class="btn btn-sm btn-danger" data-mrec="stop">⏹ ' + esc(T('Stopp')) + ' · ' + d.recording.sec + ' s</button>' : '<button type="button" class="btn btn-sm" data-mrec="start">⏺ ' + esc(T('Aufnehmen')) + '</button>') + '</div>'
            + (d.recs.length ? '<div class="mo-chips">' + d.recs.map(r => '<button type="button" class="chip' + (d.playing && d.playing.id === r.id ? ' on' : '') + '" data-mplay="' + esc(r.id) + '">▶ ' + esc(r.name) + ' <small>' + r.dur + ' s</small></button>').join('') + '</div>' : '') + '</div>'
            // Chatbox-Module
            + (d.chatmods ? '<div class="nc-card mo-h"><b>🧩 ' + esc(T('Chatbox-Module')) + '</b><small>' + esc(T('Uhrzeit, Status, Wetter, Countdown …')) + '</small>'
                + '<button type="button" class="mo-sw' + (d.chatmods.on ? ' on' : '') + '" data-mcm="' + (d.chatmods.on ? '0' : '1') + '"><i></i></button></div>' : '')
            + '</div>';
    }
    function load() {
        if (busy) return;
        return api('mosc_get').then(r => { d = r; render(); }).catch(e => { if (box) box.innerHTML = '<div class="vx-error">⚠ ' + esc(e.message) + '</div>'; });
    }
    function poll() {
        clearTimeout(timer);
        if (!box || !box.offsetParent) return;
        timer = setTimeout(() => { load(); poll(); }, 3000);
    }
    const run = (p, msg) => p.then(r => { if (r && r.msg) toast(r.msg); else if (msg) toast(msg); return load(); }).catch(e => toast('⚠ ' + e.message, true));
    function bind() {
        box.addEventListener('click', e => {
            const t = e.target;
            const set = t.closest('[data-mset]');
            if (set) { const p = d.params.find(x => x.name === set.dataset.mset); if (p) p.value = set.dataset.mtype === 'bool' ? set.dataset.mval === '1' : +set.dataset.mval; render(); return api('mosc_set', { name: set.dataset.mset, type: set.dataset.mtype, value: set.dataset.mval }).catch(x => toast('⚠ ' + x.message, true)); }
            const fav = t.closest('[data-mfav]'); if (fav) return run(api('mosc_fav', { name: fav.dataset.mfav, type: fav.dataset.mtype }));
            const key = t.closest('[data-mkey]');
            if (key) {
                const name = key.dataset.mkey, type = key.dataset.mtype;
                return api('btn_get').then(g => {
                    const pg = g.cfg.pages[0];
                    pg.buttons.push(type === 'float' ? { icon: '🎚', label: name, kind: 'param_step', name, step: '0.1' } : { icon: '🎚', label: name, kind: 'param', name, mode: type === 'bool' ? 'toggle' : 'set', ptype: type, value: '1' });
                    return api('btn_save', { cfg: JSON.stringify(g.cfg), quiet: '1' });
                }).then(() => toast(T('Knopf in den Nexus-Knöpfen angelegt.'))).catch(x => toast('⚠ ' + x.message, true));
            }
            if (t.closest('[data-mtest]')) return api('osct_test').then(r => toast(r.send.ok ? '✔ ' + T('Senden an') + ' ' + r.send.host + ':' + r.send.port + (r.vrchat.active ? ' · ' + T('VRChat antwortet') : ' · ' + T('noch nichts von VRChat empfangen')) : '⚠ ' + r.send.error, !r.send.ok)).catch(x => toast('⚠ ' + x.message, true));
            if (t.closest('[data-mscene]')) { const n = prompt(T('Name der Szene'), ''); if (n === null) return; return run(api('osct_scene_save', { name: n })); }
            const ap = t.closest('[data-mapply]'); if (ap) return run(api('osct_scene_apply', { id: ap.dataset.mapply }));
            const rec = t.closest('[data-mrec]'); if (rec) return run(api(rec.dataset.mrec === 'start' ? 'osct_rec_start' : 'osct_rec_stop', {}));
            const pl = t.closest('[data-mplay]'); if (pl) return run(api(d.playing && d.playing.id === pl.dataset.mplay ? 'osct_rec_stopplay' : 'osct_rec_play', { id: pl.dataset.mplay }));
            const cm = t.closest('[data-mcm]'); if (cm) return run(api('cm_save', { on: cm.dataset.mcm, quiet: '1' }));
        });
        box.addEventListener('input', e => {
            const r = e.target.closest('[data-mrange]');
            if (r) { const v = (+r.value).toFixed(2); r.nextElementSibling.textContent = v; busy = true; clearTimeout(r._t); r._t = setTimeout(() => { busy = false; api('mosc_set', { name: r.dataset.mrange, type: 'float', value: v }).catch(x => toast('⚠ ' + x.message, true)); }, 60); }
            if (e.target.matches('.mo-q')) { q = e.target.value; clearTimeout(box._q); box._q = setTimeout(() => { const pos = e.target.selectionStart; render(); const s = box.querySelector('.mo-q'); if (s) { s.focus(); s.setSelectionRange(pos, pos); } }, 150); }
        });
        box.addEventListener('submit', e => {
            e.preventDefault();
            const f = e.target;
            if (f.matches('.mo-add')) { const n = f.elements.name.value.trim(); if (!n) return; return run(api('mosc_fav', { name: n, type: f.elements.type.value })); }
            if (f.matches('.mo-form')) return run(api('client_cfg_save', { osc_host: f.osc_host.value.trim() || '127.0.0.1', osc_send_port: f.osc_send_port.value, osc_listen_port: f.osc_listen_port.value, osc_listen: f.osc_listen.checked ? '1' : '0' }));
        });
    }
    window.NexusMOsc = {
        open() {
            const el = document.getElementById('moscBox');
            if (!el) return;
            if (box !== el) { box = el; bind(); }
            if (!d) box.innerHTML = '<div class="vx-loading">' + esc(T('Lade …')) + '</div>';
            load(); setTimeout(poll, 50);
        },
    };
})();
