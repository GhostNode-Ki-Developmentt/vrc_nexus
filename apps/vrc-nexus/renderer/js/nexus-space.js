/* VRC Nexus – 🚀 VR-Bewegung (3.3, Spiel & OSC → VR-Bewegung): Space Flight · Space Turn · Space Walk – eigene Umsetzung.
 * Die Bewegung macht der SteamVR-Helfer (Spielbereich verschieben/drehen), hier nur Einstellungen, Status und Tastenbelegung mit Controller-Grafik. */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, api = (a, d) => UI.api(a, d), toast = (m, bad) => UI.toast(m, bad);
    const T = s => (window.t ? window.t(s) : s);
    let box = null, d = null, timer = null, ctrl = 'knuckles';
    try { ctrl = localStorage.getItem('nx_space_ctrl') || 'knuckles'; } catch (e) { /* egal */ }
    const CTRL = [['knuckles', 'Valve Index'], ['oculus_touch', 'Quest / Rift (Touch)'], ['vive_controller', 'Vive (Zauberstab)'], ['holographic_controller', 'Windows MR']];

    /** schematischer Controller (Draufsicht) – die belegte Taste leuchtet */
    function pad(key, hand) {
        const on = k => key === k ? ' class="on"' : '';
        const m = hand === 'right' ? ' transform="translate(64,0) scale(-1,1)"' : '';
        return '<svg class="sp-ctl" viewBox="0 0 64 96" aria-hidden="true"><g' + m + '>'
            + '<path d="M18 6 h28 a10 10 0 0 1 10 10 v30 a12 12 0 0 1 -6 10 l-4 34 a6 6 0 0 1 -6 5 h-16 a6 6 0 0 1 -6 -5 l-4 -34 a12 12 0 0 1 -6 -10 v-30 a10 10 0 0 1 10 -10 z" class="body"/>'
            + '<rect x="6" y="40" width="6" height="30" rx="3"' + on('grip') + '/>'
            + '<rect x="24" y="0" width="16" height="7" rx="3"' + on('trigger') + '/>'
            + '<circle cx="32" cy="22" r="8"' + on('stick') + '/>'
            + '<circle cx="40" cy="40" r="4.5"' + on('b') + '/>'
            + '<circle cx="28" cy="44" r="4.5"' + on('a') + '/>'
            + '<circle cx="32" cy="58" r="2.5"' + on('menu') + '/>'
            + '</g></svg>';
    }
    function scheme(what, label) {
        const leg = d.mode === 'legacy', m = leg ? d.schemes.legacy : (d.schemes.standard[ctrl] || d.schemes.standard.knuckles);
        const b = m[what] || ['–', ''];
        let key = d.keys[what];
        if (!leg && (ctrl === 'vive_controller' || ctrl === 'holographic_controller') && what !== 'turn' && what !== 'walk') key = 'grip';
        const hand = /rechts|right/.test(b[1]) || what === 'walk' || what === 'gravity' ? 'right' : 'left';
        return '<div class="sp-map">' + pad(key, hand) + '<div><b>' + esc(T(label)) + '</b><small>' + esc(b[0]) + ' · ' + esc(T(b[1])) + '</small></div></div>';
    }
    const C = k => d.cfg[k];
    const tog = (k, label) => '<label class="sp-tog"><input type="checkbox" data-k="' + k + '"' + (C(k) ? ' checked' : '') + '><span>' + esc(T(label)) + '</span></label>';
    const lock = (k, label) => '<button type="button" class="chip' + (C(k) ? ' on' : '') + '" data-lock="' + k + '">' + (C(k) ? '🔒 ' : '🔓 ') + esc(label) + '</button>';
    const slider = (k, label, min, max, unit, f) => '<label class="sp-sl"><span>' + esc(T(label)) + '</span><input type="range" min="' + min + '" max="' + max + '" value="' + C(k) + '" data-k="' + k + '"><b>' + (f ? f(C(k)) : C(k) + (unit || '')) + '</b></label>';
    const sel = (k, label, opts) => '<label class="sp-sl"><span>' + esc(T(label)) + '</span><select data-k="' + k + '">' + opts.map(([v, l]) => '<option value="' + v + '"' + (String(C(k)) === v ? ' selected' : '') + '>' + esc(T(l)) + '</option>').join('') + '</select></label>';
    const mul = v => (v / 100).toFixed(1) + '×';

    function render() {
        if (!box || !d) return;
        if (box.contains(document.activeElement) && document.activeElement.matches('input[type=range]')) return;
        const s = Object.assign({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 }, d.state || {}), live = !!s.on;
        const card = (k, ic, title, body) => '<section class="nc-card sp-card' + (C(k) ? '' : ' off') + '"><header><h4>' + ic + ' ' + esc(title) + '</h4>'
            + '<label class="sp-sw"><input type="checkbox" data-k="' + k + '"' + (C(k) ? ' checked' : '') + '><i></i></label></header>' + body + '</section>';
        box.innerHTML = '<div class="sp">'
            + '<section class="nc-card sp-head"><div class="sp-st"><span class="sp-dot' + (live ? ' on' : '') + '"></span><div><b>' + esc(T(live ? 'Verbunden' : 'Nicht verbunden')) + '</b><small>' + esc(T(s.status || '')) + (s.auto ? ' · ' + esc(T('automatisch mit VRChat')) : '') + '</small></div>'
            + (d.windows ? '<button type="button" class="btn btn-sm' + (C('vr.space') ? '' : ' btn-gold') + '" data-conn="1">' + esc(T(C('vr.space') ? 'Trennen' : 'Verbinden')) + '</button>' : '') + '</div>'
            + (d.windows ? '' : '<p class="small bad">⚠ ' + esc(T('VR-Bewegung gibt es nur in der Windows-App mit SteamVR.')) + '</p>')
            + '<div class="sp-row">' + tog('vr.space_autostart', 'Beim Start von VRChat in VR starten')
            + sel('vr.space_input', 'Tastenbelegung', [['standard', 'Standard (SteamVR-Eingabe, änderbar)'], ['legacy', 'Legacy (feste Tasten)']])
            + (d.mode === 'standard' ? '<label class="sp-sl"><span>' + esc(T('Controller')) + '</span><select data-ctrl="1">' + CTRL.map(([v, l]) => '<option value="' + v + '"' + (v === ctrl ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label>' : '') + '</div>'
            + '<div class="sp-pos"><span>X <b>' + s.x.toFixed(2) + '</b></span><span>Y <b>' + s.y.toFixed(2) + '</b></span><span>Z <b>' + s.z.toFixed(2) + '</b> m</span><span>Yaw <b>' + s.yaw + '°</b></span><span>Pitch <b>' + s.pitch + '°</b></span><span>Roll <b>' + s.roll + '°</b></span>'
            + (s.drag ? '<span class="sp-drag">✋ ' + esc(T('greift')) + '</span>' : '') + '<button type="button" class="btn btn-sm" data-reset="1">↺ ' + esc(T('Alles zurücksetzen')) + '</button></div>'
            + '<p class="nx-hint">' + esc(T(d.mode === 'standard' ? 'Die Tasten lassen sich in SteamVR ändern: Einstellungen → Controller → Belegung verwalten → VRC Nexus. Sie gelten zusätzlich zu VRChat – doppelt belegte Tasten lösen beides aus.' : 'Legacy liest die Tasten direkt vom Controller (ohne SteamVR-Belegung). Grip greift dabei auch in VRChat.')) + '</p></section>'
            // 🚀 Space Flight
            + card('vr.fly_on', '🚀', 'Space Flight', '<p class="sp-desc">' + esc(T('Spielbereich verschieben: Taste halten und die Welt greifen – Hand ziehen bewegt dich.')) + '</p>'
                + '<div class="sp-grid">' + sel('vr.fly_hand', 'Greifen mit', [['both', 'beiden Händen'], ['left', 'linker Hand'], ['right', 'rechter Hand']])
                + slider('vr.fly_mul', 'Drag-Multiplikator', 10, 500, '', mul) + tog('vr.fly_gravity', 'Gravitation') + slider('vr.fly_g', 'Stärke', 10, 300, '', v => (v / 10).toFixed(1) + ' m/s²') + '</div>'
                + '<div class="sp-locks"><span>' + esc(T('Achsensperre')) + '</span>' + lock('vr.fly_lock_x', 'X') + lock('vr.fly_lock_y', 'Y') + lock('vr.fly_lock_z', 'Z') + '</div>'
                + '<div class="sp-maps">' + scheme('reset', 'Position zurücksetzen') + scheme('fly', 'Drag-Steuerung') + scheme('gravity', 'Gravitations-Steuerung') + '</div>')
            // 🔄 Space Turn
            + card('vr.turn_on', '🔄', 'Space Turn', '<p class="sp-desc">' + esc(T('Spielbereich drehen: Taste halten und die Hand um dich herum bewegen.')) + '</p>'
                + '<div class="sp-grid">' + slider('vr.turn_mul', 'Turn-Multiplikator', 10, 400, '', mul) + slider('vr.turn_smooth', 'Glättung', 0, 95, ' %')
                + sel('vr.turn_comfort', 'Komfortmodus', [['0', 'fließend'], ['15', 'Stufen 15°'], ['30', 'Stufen 30°'], ['45', 'Stufen 45°']]) + tog('vr.turn_invert', 'Richtung umkehren') + '</div>'
                + '<div class="sp-maps">' + scheme('turn', 'Dreh-Steuerung') + scheme('reset', 'Drehung zurücksetzen') + '</div>')
            // 🧭 Space Walk
            + card('vr.walk_on', '🧭', 'Space Walk', '<p class="sp-desc">' + esc(T('Ausrichtung ändern (Pitch / Roll / Yaw): Taste halten und die Hand drehen – z. B. an Wänden oder Decken laufen.')) + '</p>'
                + '<div class="sp-grid">' + slider('vr.walk_mul', 'Rotations-Multiplikator', 10, 400, '', mul) + slider('vr.walk_smooth', 'Glättung', 0, 95, ' %')
                + tog('vr.walk_momentum', 'Nachrollen') + tog('vr.walk_invert', 'Richtung umkehren') + '</div>'
                + '<div class="sp-locks"><span>' + esc(T('Ausrichtung sperren')) + '</span>' + lock('vr.walk_lock_pitch', 'Pitch') + lock('vr.walk_lock_roll', 'Roll') + lock('vr.walk_lock_yaw', 'Yaw') + '</div>'
                + '<div class="sp-maps">' + scheme('walk', 'Walk-Steuerung') + scheme('reset', 'Ausrichtung zurücksetzen') + '</div>')
            + '</div>';
    }
    const save = (k, v) => api('space_save', { [k]: v, quiet: '1' }).then(r => { d = r; render(); }).catch(e => toast('⚠ ' + e.message, true));
    function bind() {
        box.addEventListener('change', e => {
            const el = e.target;
            if (el.dataset.ctrl) { ctrl = el.value; try { localStorage.setItem('nx_space_ctrl', ctrl); } catch (x) { /* egal */ } return render(); }
            const k = el.dataset.k; if (!k) return;
            save(k, el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value);
        });
        box.addEventListener('input', e => { const el = e.target; if (el.type === 'range' && el.nextElementSibling) { const v = +el.value, k = el.dataset.k; el.nextElementSibling.textContent = /_mul$/.test(k) ? (v / 100).toFixed(1) + '×' : k === 'vr.fly_g' ? (v / 10).toFixed(1) + ' m/s²' : v + ' %'; } });
        box.addEventListener('click', e => {
            const l = e.target.closest('[data-lock]'); if (l) return save(l.dataset.lock, C(l.dataset.lock) ? '0' : '1');
            if (e.target.closest('[data-conn]')) return save('vr.space', C('vr.space') ? '0' : '1');
            if (e.target.closest('[data-reset]')) return api('space_reset').then(r => { d = r; toast(r.msg); render(); }).catch(x => toast('⚠ ' + x.message, true));
        });
    }
    function poll() {
        clearTimeout(timer);
        if (!box || !box.offsetParent) return;
        timer = setTimeout(() => api('space_get').then(r => { d = r; render(); }).catch(() => {}).finally(poll), 1000);
    }
    window.NexusSpace = {
        open(el) {
            if (!el) return;
            if (box !== el) { box = el; bind(); }
            if (!d) box.innerHTML = '<div class="vx-loading">' + esc(T('Lade …')) + '</div>';
            api('space_get').then(r => { d = r; render(); poll(); }).catch(e => { box.innerHTML = '<div class="vx-error">⚠ ' + esc(e.message) + '</div>'; });
        },
    };
})();
