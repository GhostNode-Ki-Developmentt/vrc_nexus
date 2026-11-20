/* VRC Nexus – 🪪 Nexus-Konto & 🔞 NSFW-Freigabe (Einstellungen → Erweitert und im gesperrten NSFW-Bereich).
 * Verbinden per Bio-Code, Status „Verified 18+“ (vom Server geprüft), NSFW-Schalter, Geräte. */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    const esc = UI.esc, api = UI.api, toast = (m, bad) => UI.toast(m, bad);
    const T = s => (window.t ? window.t(s) : s);
    const day = ts => ts ? new Date(ts * 1000).toLocaleDateString(window.nxLoc ? nxLoc() : 'de-DE') : '–';
    let st = null;
    const boxes = new Set();

    function html() {
        if (!st) return '<div class="vx-loading">…</div>';
        if (!st.connected) {
            return '<p class="nx-hint">' + esc(T('Ein Konto für Community, Warnliste und NSFW – an deiner VRChat-ID, ohne eigenes Passwort. Online-Dienste sind freiwillig; ohne Konto funktioniert die App wie bisher.')) + '</p>'
                + '<div class="nx-row"><button type="button" class="btn btn-sm btn-gold" data-acct="auto">🪪 ' + esc(T('Nexus-Konto verbinden')) + '</button></div>'
                + (st.pending ? '<div class="nx-row"><code class="ns-url">' + esc(st.pending.code) + '</code><button type="button" class="vx-copy" data-copy="' + esc(st.pending.code) + '">⧉</button><span class="nx-hint">' + esc(T('in deine VRChat-Bio schreiben, dann:')) + '</span><button type="button" class="btn btn-sm btn-gold" data-acct="verify">✔ ' + esc(T('Prüfen')) + '</button></div>' : '')
                + (st.error ? '<p class="nx-hint bad">⚠ ' + esc(T(st.error)) + '</p>' : '');
        }
        const a = st.account, g = st.age;
        return (st.lost && !g.verified ? '<div class="tts-help">⚠ ' + esc(T(st.lost.title)) + '<br>' + esc(T('VRChat meldet für dein Konto keine Altersverifizierung (18+) mehr. NSFW ist gesperrt – in VRChat prüfen und „18+ neu prüfen“.')) + '</div>' : '')
            + '<div class="vx-kpis sm"><div><b>' + esc(a.name || '–') + '</b><span>' + esc(T('Nexus-Konto')) + '</span></div>'
            + '<div><b class="' + (g.verified ? 'acct-ok' : 'bad') + '">' + (g.verified ? '✔ Verified 18+' : '✖ ' + esc(T('nicht verifiziert'))) + '</b><span>' + (g.verified ? esc(T('gültig bis')) + ' ' + day(g.age_until) : esc(T('VRChat-Altersstatus'))) + '</span></div>'
            + '<div><b>' + (g.nsfw_on ? '🔞 ' + esc(T('an')) : esc(T('aus'))) + '</b><span>NSFW</span></div></div>'
            + (!g.verified ? '<p class="nx-hint">' + esc(T('Für NSFW: In VRChat die Altersverifizierung (18+) abschließen, dann „18+ neu prüfen“. Nexus fragt den Status direkt bei VRChat ab (nur für dein eigenes Konto) und prüft regelmäßig neu.')) + '</p>' : '')
            + '<label class="check"><input type="checkbox" data-acct="nsfw"' + (g.nsfw_on ? ' checked' : '') + (g.verified ? '' : ' disabled') + '> 🔞 ' + esc(T('NSFW-Inhalte und -Werkzeuge anzeigen (freiwillig, jederzeit abschaltbar)')) + '</label>'
            + '<div class="nx-row"><button type="button" class="btn btn-sm" data-acct="recheck">⟳ ' + esc(T('18+ neu prüfen')) + '</button><button type="button" class="btn btn-sm" data-acct="logout">' + esc(T('Auf diesem Gerät abmelden')) + '</button></div>'
            + (st.devices && st.devices.length > 1 ? '<details><summary class="small">' + esc(T('Angemeldete Geräte')) + ' (' + st.devices.length + ')</summary>' + st.devices.map(d => '<div class="nx-row"><span class="small">' + esc(d.name) + ' · ' + day(d.last_seen) + '</span><button type="button" class="nc-x" data-acct="dev" data-id="' + esc(d.id) + '" title="' + esc(T('abmelden')) + '">✕</button></div>').join('') + '</details>' : '')
            + (st.error ? '<p class="nx-hint bad">⚠ ' + esc(T(st.error)) + '</p>' : '');
    }
    function paint() { for (const b of [...boxes]) { if (!document.body.contains(b)) { boxes.delete(b); continue; } b.innerHTML = html(); } }
    function load(refresh) { return api('acct_get', refresh ? { refresh: '1' } : {}).then(d => { st = d; paint(); }).catch(e => { st = { connected: false, error: e.message }; paint(); }); }
    const run = (act, data, busyEl) => { if (busyEl) busyEl.disabled = true; return api(act, data || {}).then(d => { st = d; paint(); if (d.msg) toast(d.msg); if (window.NexusNsfw) window.NexusNsfw.refresh(); }).catch(e => { toast('⚠ ' + e.message, true); if (busyEl) busyEl.disabled = false; load(); }); };

    document.addEventListener('click', e => {
        const b = e.target.closest('[data-acct]');
        if (!b || b.type === 'checkbox') return;
        const k = b.dataset.acct;
        if (k === 'auto') { b.textContent = '⏳ ' + T('Prüfe …'); return run('acct_connect', { auto: '1' }, b); }
        if (k === 'manual') return run('acct_connect', {}, b);
        if (k === 'verify') return run('acct_verify', {}, b);
        if (k === 'recheck') return run('acct_recheck', {}, b);
        if (k === 'logout' && confirm(T('Nexus-Konto auf diesem Gerät abmelden? NSFW wird dabei gesperrt.'))) return run('acct_logout', {}, b);
        if (k === 'dev') return run('acct_logout', { device: b.dataset.id }, b);
    });
    document.addEventListener('change', e => {
        const c = e.target.closest('[data-acct="nsfw"]');
        if (!c) return;
        if (c.checked && !confirm(T('NSFW einschalten? Damit bestätigst du, volljährig zu sein. Inhalte bleiben getrennt und lassen sich jederzeit wieder ausschalten.'))) { c.checked = false; return; }
        run('acct_nsfw', { on: c.checked ? '1' : '0' }, c);
    });

    window.NexusAccount = {
        render(el) { if (!el) return; boxes.add(el); el.innerHTML = html(); load(false); },
        refresh: () => load(true),
    };
})();
