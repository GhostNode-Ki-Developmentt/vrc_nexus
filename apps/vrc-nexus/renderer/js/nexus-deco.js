/* VRC Nexus – 🎀 Profil-Dekorationen (3.1): überall, wo ein Profilbild mit Benutzer-ID steht (Freundeskarten, Leiste, Profil, Spielerliste,
 * Start, Orte, Gruppen …). Rahmen-Bild über dem Profilbild (sonst Farbring), Banner-Farbe/-Bild als Karten-Hintergrund, Namens-Effekt als Farbverlauf.
 * Läuft zentral über einen MutationObserver – neue Ansichten bekommen die Dekoration automatisch. Abschaltbar: Einstellungen → Aussehen. */
(function () {
    const UI = window.NexusUI;
    if (!UI) return;
    let map = {}, at = 0, on = (((window.VRCX || {}).ui || {})['ui.decorations']) !== false, busy = false, queued = false;
    const AV = 'img.vx-av, span.vx-av, img.fs-img, span.fs-img, img.vx-u-img, span.vx-u-img, img.hm-fav, img.vx-me-img';
    const NAME = '.fc-name b, .fs-txt b > span, .vx-u-head h2, .pl-name b, .pl-name a, .fs-txt b';
    const hex = /^#[0-9a-f]{6}$/i;
    const rgba = (c, a) => { const n = parseInt(c.slice(1), 16); return 'rgba(' + (n >> 16 & 255) + ', ' + (n >> 8 & 255) + ', ' + (n & 255) + ', ' + a + ')'; };
    const src = u => { const s = UI.pic ? UI.pic(u) : u; return s ? 'url("' + String(s).replace(/["\\\n]/g, '') + '")' : ''; };

    function decorate(el, d) {
        const key = JSON.stringify(d || null);
        if (el.dataset.dc === key) return;
        el.dataset.dc = key;
        el.classList.remove('dc-card', 'dc-has-bg');
        ['--dc-c', '--dc-img'].forEach(k => el.style.removeProperty(k));
        el.querySelectorAll(':scope .dc-av').forEach(w => { if (w.closest('[data-user], .vx-u-head') === el) { const i = w.querySelector(AV); if (i) w.replaceWith(i); else w.remove(); } });
        el.querySelectorAll('.dc-name').forEach(n => { n.classList.remove('dc-name'); n.style.removeProperty('--dc-n1'); n.style.removeProperty('--dc-n2'); });
        if (!d || !on) return;
        // Karte: Banner-Farbe als Verlauf von rechts, Banner-Bild dezent dahinter
        if ((d.color && hex.test(d.color)) || d.banner) {
            el.classList.add('dc-card');
            if (d.color && hex.test(d.color)) el.style.setProperty('--dc-c', rgba(d.color, 0.55));
            if (d.banner && src(d.banner)) { el.style.setProperty('--dc-img', src(d.banner)); el.classList.add('dc-has-bg'); }
        }
        // Profilbild: Rahmen-Bild oder Farbring
        const av = [...el.querySelectorAll(AV)].find(x => x.closest('[data-user], .vx-u-head') === el);
        if (av && (d.frame || d.ring)) {
            const w = document.createElement('span');
            w.className = 'dc-av' + (d.frame ? ' dc-framed' : ' dc-ring');
            if (d.ring) { w.style.setProperty('--dc-r1', d.ring[0]); w.style.setProperty('--dc-r2', d.ring[1]); }
            av.replaceWith(w); w.appendChild(av);
            if (d.frame && src(d.frame)) { const f = document.createElement('i'); f.className = 'dc-frame'; f.style.backgroundImage = src(d.frame); if (d.frame_name) w.title = d.frame_name; w.appendChild(f); }
        }
        // Name: Verlauf des Namens-Effekts
        const nm = d.name_grad && [...el.querySelectorAll(NAME)].find(x => x.closest('[data-user], .vx-u-head') === el);
        if (nm) { nm.classList.add('dc-name'); nm.style.setProperty('--dc-n1', d.name_grad[0]); nm.style.setProperty('--dc-n2', d.name_grad[1]); }
    }
    function apply(root) {
        root = root || document.body;
        const els = root.matches && root.matches('[data-user], .vx-u-head[data-uid]') ? [root] : [];
        els.push(...root.querySelectorAll('[data-user], .vx-u-head[data-uid]'));
        for (const el of els) {
            const id = el.dataset.user || el.dataset.uid;
            if (!id || el.closest('.dc-skip')) continue;
            if (!el.querySelector(AV) && !el.matches('.vx-friend, .fs-row, .vx-u-head')) continue;   // reine Links ohne Bild
            decorate(el, map[id] || null);
        }
    }
    function schedule() {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => { queued = false; busy = true; try { apply(document.body); } finally { busy = false; } });
    }
    new MutationObserver(ms => { if (busy) return; if (ms.some(m => m.addedNodes.length)) schedule(); }).observe(document.body, { childList: true, subtree: true });
    function load(force) {
        if (!force && Date.now() - at < 60000) return Promise.resolve();
        at = Date.now();
        return UI.api('deco_map').then(r => { map = r.deco || {}; document.querySelectorAll('[data-dc]').forEach(x => delete x.dataset.dc); schedule(); }).catch(() => {});
    }
    window.NexusDeco = {
        reload: load,
        set(id, d) { if (!id) return; if (d) map[id] = d; else delete map[id]; schedule(); },
        enable(v) { on = v !== false; document.querySelectorAll('[data-dc]').forEach(x => delete x.dataset.dc); schedule(); },
        get: id => map[id] || null,
    };
    setTimeout(() => load(true), 1200);
})();
