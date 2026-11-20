/* VRC Nexus – 📱 Handy-Oberfläche (3.2.4): schlicht und übersichtlich.
 *   - feste Leiste unten: Start · Freunde · Community · Knöpfe · Menü
 *   - Menü als ausklappbare Liste (gleiche Gruppen wie die PC-Seitenleiste, mit Namen statt nur Symbolen)
 *   - kompakte Kopfzeile, Abgleich-Zeile nur als kleine Zeile, Design/Sprache im Menü statt schwebender Knöpfe
 *   - Filter der Freundesliste hinter „Filter“
 * Nur aktiv mit body.mobile (Android-App). Ändert keine Funktionen, nur die Anordnung. */
(function () {
    const UI = window.NexusUI;
    if (!UI || !document.body.classList.contains('mobile')) return;
    const T = s => (window.t ? window.t(s) : s);
    const menu = document.getElementById('tabs');
    if (!menu) return;   // nicht angemeldet
    const body = document.body;
    body.classList.add('m-ui');

    // ---------- Leiste unten ----------
    const ITEMS = [['home', '🏠', 'Start'], ['friends', '👥', 'Freunde'], ['community', '🫂', 'Community'], ['buttons', '🎛', 'Knöpfe'], ['_menu', '☰', 'Menü']];
    const bar = document.createElement('nav');
    bar.className = 'm-bottom';
    bar.innerHTML = ITEMS.map(([t, i, l]) => '<button type="button" data-mb="' + t + '"><span>' + i + '</span><em>' + UI.esc(T(l)) + '</em></button>').join('');
    document.body.appendChild(bar);
    const shade = document.createElement('div');
    shade.className = 'm-shade';
    menu.parentNode.insertBefore(shade, menu);   // gleiche Ebene wie das Menü, damit es darüber liegt

    // Menü-Kopf mit Schließen + Fuß mit Design/Sprache
    const head = document.createElement('div');
    head.className = 'm-mhead';
    head.innerHTML = '<b>VRC <i>Nexus</i></b><button type="button" class="m-close" aria-label="' + UI.esc(T('Schließen')) + '">✕</button>';
    menu.prepend(head);
    const foot = document.createElement('div');
    foot.className = 'm-mfoot';
    menu.appendChild(foot);
    const park = () => { const c = document.querySelector('.i18n-corner'); if (c && c.parentNode !== foot) foot.appendChild(c); };
    park();
    new MutationObserver(park).observe(document.body, { childList: true });
    // Einstellungen im Menü immer zeigen (am PC über den Kopf-Knopf)
    const st = menu.querySelector('[data-tab="settings"]');
    if (st) { st.hidden = false; st.classList.add('m-show'); }

    const open = on => { body.classList.toggle('m-menu', on); if (on) { const a = menu.querySelector('.vx-tabbtn.active'); if (a) a.scrollIntoView({ block: 'center' }); } };
    bar.addEventListener('click', e => {
        const b = e.target.closest('[data-mb]'); if (!b) return;
        const t = b.dataset.mb;
        if (t === '_menu') return open(!body.classList.contains('m-menu'));
        open(false);
        UI.tab(t);
    });
    shade.addEventListener('click', () => open(false));
    head.querySelector('.m-close').addEventListener('click', () => open(false));
    // Auswahl im Menü schließt es (Gruppen-Köpfe klappen nur auf)
    menu.addEventListener('click', e => {
        const top = e.target.closest('.vx-mtop');
        if (top) { e.preventDefault(); e.stopPropagation(); top.parentNode.classList.toggle('m-open'); return; }
        if (e.target.closest('.vx-tabbtn')) setTimeout(() => open(false), 0);
    }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') open(false); });
    window.addEventListener('popstate', () => open(false));

    // aktiven Bereich unten markieren
    const GROUP = { feed: 'community', groups: 'community', netgraph: 'community', moderation: 'community', locations: 'friends', players: 'friends' };
    const mark = () => {
        const a = menu.querySelector('.vx-tabbtn.active');
        let t = a ? a.dataset.tab : 'home';
        t = GROUP[t] || t;
        bar.querySelectorAll('[data-mb]').forEach(b => b.classList.toggle('on', b.dataset.mb === t || (b.dataset.mb === '_menu' && !ITEMS.some(i => i[0] === t))));
    };
    new MutationObserver(mark).observe(menu, { subtree: true, attributes: true, attributeFilter: ['class'] });
    mark();

    // ---------- Freundesliste: Filter einklappen ----------
    const tools = document.querySelector('[data-pane="friends"] .vx-tools');
    if (tools) {
        tools.classList.add('m-fold');
        const fb = document.createElement('button');
        fb.type = 'button'; fb.className = 'btn btn-sm m-filter'; fb.textContent = '⚙ ' + T('Filter');
        const s = tools.querySelector('#friendSearch');
        if (s) { s.placeholder = T('Freunde suchen …'); s.after(fb); }
        fb.addEventListener('click', () => tools.classList.toggle('m-open'));
    }
})();
