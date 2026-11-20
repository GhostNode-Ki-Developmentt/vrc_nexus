/* VRC Nexus – 🎛 Nexus-Knöpfe (Android): lokale Stream-Deck-Alternative – Idee von Natsu.
 * Große, frei belegbare Knöpfe auf Seiten; „Bearbeiten“: Knopf antippen → Symbol, Text, Farbe, Aktion; verschieben, löschen, Seiten, Spalten. */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, api = UI.api, toast = (m, bad) => UI.toast(m, bad);
    const T = s => (window.t ? window.t(s) : s);
    let box = null, d = null, page = 0, edit = false, sel = '';
    const TABS = [['home', '🏠 Start'], ['remote', '🎮 PC-Fernbedienung'], ['community', '🫂 Community'], ['notifs', '🔔 Benachrichtigungen'], ['friends', '👥 Freundesliste'], ['locations', '📍 Freunde-Orte'], ['calendar', '📅 Gruppen-Kalender']];
    const cur = () => d.cfg.pages[Math.min(page, d.cfg.pages.length - 1)];
    const save = (quiet) => api('btn_save', { cfg: JSON.stringify(d.cfg), quiet: quiet ? '1' : '' }).then(r => { d.cfg = r.cfg; if (r.msg) toast(r.msg); render(); }).catch(e => toast('⚠ ' + e.message, true));

    function form(b) {
        const k = d.kinds, opt = (list, v) => list.map(([val, l]) => '<option value="' + esc(val) + '"' + (val === v ? ' selected' : '') + '>' + esc(T(l)) + '</option>').join('');
        let f = '';
        if (b.kind === 'chatbox') f = '<textarea name="text" rows="2" maxlength="500" placeholder="' + esc(T('Text für die Chatbox am PC')) + '">' + esc(b.text || '') + '</textarea>';
        if (b.kind === 'typing') f = '<label class="check"><input type="checkbox" name="on"' + (b.on ? ' checked' : '') + '> ' + esc(T('einschalten (sonst aus)')) + '</label>';
        if (b.kind === 'input') f = '<select name="name">' + opt(d.inputs.map(x => [x, x]), b.name) + '</select>';
        if (b.kind === 'param') f = '<input type="text" name="name" placeholder="' + esc(T('Parameter-Name')) + '" value="' + esc(b.name || '') + '"><div class="nc-row"><select name="mode">' + opt([['toggle', 'umschalten (an/aus)'], ['set', 'Wert setzen']], b.mode) + '</select>'
            + '<select name="ptype">' + opt([['bool', 'Bool'], ['int', 'Int'], ['float', 'Float']], b.ptype) + '</select><input type="text" name="value" placeholder="' + esc(T('Wert')) + '" value="' + esc(b.value || '') + '" style="width:80px"></div>';
        if (b.kind === 'status') f = '<select name="status">' + opt([['join me', '🔵 Join Me'], ['active', '🟢 Online'], ['ask me', '🟠 Ask Me'], ['busy', '🔴 Beschäftigt']], b.status) + '</select><input type="text" name="desc" maxlength="32" placeholder="' + esc(T('Status-Text (optional)')) + '" value="' + esc(b.desc || '') + '">';
        if (b.kind === 'tab') f = '<select name="tab">' + opt(TABS, b.tab) + '</select>';
        return '<form class="nc-card bt-form"><h4>✎ ' + esc(T('Knopf')) + '</h4>'
            + '<div class="nc-row"><input type="text" name="icon" maxlength="4" value="' + esc(b.icon) + '" style="width:64px;text-align:center"><input type="text" name="label" maxlength="30" placeholder="' + esc(T('Beschriftung')) + '" value="' + esc(b.label) + '" style="flex:1"></div>'
            + '<div class="bt-colors">' + d.colors.map(c => '<button type="button" class="bt-c bt-' + (c || 'none') + (c === b.color ? ' on' : '') + '" data-bcol="' + c + '" title="' + esc(c || T('Standard')) + '"></button>').join('') + '</div>'
            + '<select name="kind">' + Object.entries(k).map(([key, v]) => '<option value="' + key + '"' + (key === b.kind ? ' selected' : '') + '>' + v[0] + ' ' + esc(T(v[1])) + ' (' + esc(T(v[2])) + ')</option>').join('') + '</select>' + f
            + '<div class="nc-row"><button type="button" class="btn btn-sm" data-bmv="-1">◀</button><button type="button" class="btn btn-sm" data-bmv="1">▶</button>'
            + (d.cfg.pages.length > 1 ? '<select name="topage" data-bpage="1"><option value="">' + esc(T('auf Seite …')) + '</option>' + d.cfg.pages.map((p, i) => i === page ? '' : '<option value="' + i + '">' + esc(p.name) + '</option>').join('') + '</select>' : '')
            + '<button type="button" class="btn btn-sm btn-danger" data-bdel="1" style="margin-left:auto">🗑</button><button class="btn btn-sm btn-gold">' + esc(T('Fertig')) + '</button></div></form>';
    }
    function render() {
        if (!box || !d) return;
        if (box.contains(document.activeElement) && document.activeElement.matches('input[type=text], textarea')) return;
        const p = cur(), b = sel && p.buttons.find(x => x.id === sel);
        box.innerHTML = '<div class="bt-top nc-row">' + d.cfg.pages.map((x, i) => '<button type="button" class="chip' + (i === page ? ' on' : '') + '" data-bpg="' + i + '">' + esc(x.name) + '</button>').join('')
            + '<button type="button" class="btn btn-sm' + (edit ? ' btn-gold' : '') + '" data-bedit="1" style="margin-left:auto">' + (edit ? '✔ ' + esc(T('Fertig')) : '✎ ' + esc(T('Bearbeiten'))) + '</button></div>'
            + (edit ? '<div class="nc-row bt-tools"><button type="button" class="btn btn-sm" data-badd="1">＋ ' + esc(T('Knopf')) + '</button><button type="button" class="btn btn-sm" data-bpadd="1">＋ ' + esc(T('Seite')) + '</button>'
                + '<button type="button" class="btn btn-sm" data-bpren="1">✎ ' + esc(T('Seite umbenennen')) + '</button>' + (d.cfg.pages.length > 1 ? '<button type="button" class="btn btn-sm btn-danger" data-bpdel="1">🗑 ' + esc(T('Seite')) + '</button>' : '')
                + '<label class="small">' + esc(T('Spalten')) + ' <select data-bcols="1">' + [2, 3, 4, 5, 6].map(n => '<option' + (n === d.cfg.cols ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label>'
                + '<button type="button" class="nc-link" data-breset="1">' + esc(T('Beispiel-Knöpfe')) + '</button></div>' : '')
            + '<div class="bt-grid' + (edit ? ' editing' : '') + '" style="--cols:' + d.cfg.cols + '">' + p.buttons.map(x => '<button type="button" class="bt-key bt-' + (x.color || 'none') + (x.id === sel ? ' sel' : '') + '" data-bid="' + esc(x.id) + '">'
                + '<span class="bt-ic">' + esc(x.icon) + '</span><span class="bt-l">' + esc(x.label || T(d.kinds[x.kind][1])) + '</span>' + (edit ? '<i>✎</i>' : '') + '</button>').join('')
            + (!p.buttons.length ? '<p class="vx-empty">' + esc(T('Noch keine Knöpfe – „Bearbeiten“ → „＋ Knopf“.')) + '</p>' : '') + '</div>'
            + (edit && b ? form(b) : '')
            + '<p class="vx-small">' + esc(T('PC-Knöpfe laufen über die Dashboard-Verbindung (wie die PC-Fernbedienung) – am PC muss VRC Nexus mit dem Dashboard verbunden sein. Kein Stream Deck nötig.')) + ' · ' + esc(T('Idee von Natsu')) + ' 💡</p>';
    }
    function readForm(f, b) {
        const v = n => f.elements[n] ? (f.elements[n].type === 'checkbox' ? f.elements[n].checked : f.elements[n].value) : undefined;
        Object.assign(b, { icon: v('icon'), label: v('label'), kind: v('kind') });
        for (const n of ['text', 'on', 'name', 'mode', 'ptype', 'value', 'status', 'desc', 'tab']) if (v(n) !== undefined) b[n] = v(n);
    }
    function bind() {
        box.addEventListener('click', e => {
            const t = e.target;
            const pg = t.closest('[data-bpg]'); if (pg) { page = +pg.dataset.bpg; sel = ''; return render(); }
            if (t.closest('[data-bedit]')) { edit = !edit; sel = ''; if (!edit) save(true); return render(); }
            const key = t.closest('[data-bid]');
            if (key) {
                if (edit) { sel = sel === key.dataset.bid ? '' : key.dataset.bid; return render(); }
                key.classList.add('run');
                if (navigator.vibrate) try { navigator.vibrate(15); } catch (x) { /* egal */ }
                return api('btn_run', { id: key.dataset.bid }).then(r => { if (r.tab) return UI.tab(r.tab); if (r.msg) toast(r.msg); })
                    .catch(x => toast('⚠ ' + x.message, true)).finally(() => setTimeout(() => key.classList.remove('run'), 250));
            }
            const p = cur();
            if (t.closest('[data-badd]')) { const nb = { id: '', icon: '⭐', label: T('Neu'), color: '', kind: 'chatbox', text: '' }; p.buttons.push(nb); return api('btn_save', { cfg: JSON.stringify(d.cfg), quiet: '1' }).then(r => { d.cfg = r.cfg; sel = cur().buttons[cur().buttons.length - 1].id; render(); }); }
            if (t.closest('[data-bpadd]')) { const n = prompt(T('Name der neuen Seite'), T('Seite') + ' ' + (d.cfg.pages.length + 1)); if (!n) return; d.cfg.pages.push({ name: n, buttons: [] }); page = d.cfg.pages.length - 1; return save(true); }
            if (t.closest('[data-bpren]')) { const n = prompt(T('Neuer Name'), p.name); if (!n) return; p.name = n; return save(true); }
            if (t.closest('[data-bpdel]')) { if (!confirm(T('Seite mit allen Knöpfen löschen?'))) return; d.cfg.pages.splice(page, 1); page = 0; return save(true); }
            if (t.closest('[data-breset]')) { if (!confirm(T('Alle Knöpfe durch die Beispiel-Knöpfe ersetzen?'))) return; return api('btn_reset').then(r => { d.cfg = r.cfg; page = 0; sel = ''; toast(r.msg); render(); }); }
            const b = sel && p.buttons.find(x => x.id === sel);
            if (!b) return;
            const col = t.closest('[data-bcol]'); if (col) { readForm(box.querySelector('.bt-form'), b); b.color = col.dataset.bcol; return render(); }
            const mv = t.closest('[data-bmv]'); if (mv) { readForm(box.querySelector('.bt-form'), b); const i = p.buttons.indexOf(b), j = i + (+mv.dataset.bmv); if (j < 0 || j >= p.buttons.length) return; [p.buttons[i], p.buttons[j]] = [p.buttons[j], p.buttons[i]]; return render(); }
            if (t.closest('[data-bdel]')) { p.buttons.splice(p.buttons.indexOf(b), 1); sel = ''; return save(true); }
        });
        box.addEventListener('change', e => {
            const t = e.target;
            if (t.matches('[data-bcols]')) { d.cfg.cols = +t.value; return save(true); }
            const p = cur(), b = sel && p.buttons.find(x => x.id === sel);
            if (!b) return;
            if (t.matches('[data-bpage]') && t.value !== '') { readForm(t.form, b); p.buttons.splice(p.buttons.indexOf(b), 1); d.cfg.pages[+t.value].buttons.push(b); sel = ''; return save(true); }
            if (t.name === 'kind') { readForm(t.form, b); return render(); }
        });
        box.addEventListener('submit', e => {
            e.preventDefault();
            const b = sel && cur().buttons.find(x => x.id === sel);
            if (!b) return;
            readForm(e.target, b); sel = ''; document.activeElement.blur(); save(true);
        });
    }
    window.NexusButtons = {
        open() {
            const el = document.getElementById('btnBox');
            if (!el) return;
            if (box !== el) { box = el; bind(); }
            if (!d) box.innerHTML = '<div class="vx-loading">' + esc(T('Lade …')) + '</div>';
            api('btn_get').then(r => { d = r; render(); }).catch(e => { box.innerHTML = '<div class="vx-error">⚠ ' + esc(e.message) + '</div>'; });
        },
    };
})();
