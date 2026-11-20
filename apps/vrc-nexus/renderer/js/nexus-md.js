/* VRC Nexus – kleines, sicheres Markdown für Community-Feed und Chat (3.2).
 * Erst wird ALLES escaped, danach werden nur feste Muster in Tags umgewandelt – eigenes HTML ist nie möglich.
 *   **fett**  *kursiv* / _kursiv_  ~~durchgestrichen~~  `Code`  ```Block```  > Zitat  - / * / 1. Listen
 *   [Text](https://…)  nackte https-Links  ||Spoiler||  # Überschrift (nur 1–3)  Zeilenumbrüche */
(function () {
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const safeUrl = u => /^https:\/\/[^\s"'<>]+$/i.test(u) ? u : '';
    // Welt-Links (vrchat.com/home/world/wrld_…) öffnen das Welt-Fenster in der App
    const link = (href, text) => { const w = /vrchat\.com\/home\/world\/(wrld_[0-9a-f-]{36})/i.exec(href); return '<a href="' + href + '" target="_blank" rel="noopener noreferrer nofollow"' + (w ? ' data-world="' + w[1] + '"' : '') + '>' + text + '</a>'; };
    function inline(t) {
        const codes = [];
        t = t.replace(/`([^`\n]+)`/g, (m, c) => { codes.push('<code>' + c + '</code>'); return '\u0000' + (codes.length - 1) + '\u0000'; });
        // [Text](https://…) – Text und URL sind schon escaped
        t = t.replace(/\[([^\]\n]{1,200})\]\((https:\/\/[^\s)]+)\)/g, (m, txt, url) => { const u = safeUrl(url.replace(/&amp;/g, '&')); return u ? link(esc(u), txt) : m; });
        // nackte Links (nicht schon in einem <a>)
        t = t.replace(/(^|[\s(])(https:\/\/[^\s<]+[^\s<.,;:!?)])/g, (m, pre, url) => { const u = safeUrl(url.replace(/&amp;/g, '&')); return u ? pre + link(esc(u), url) : m; });
        t = t.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
            .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<i>$2</i>')
            .replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, '$1<i>$2</i>')
            .replace(/~~([^~\n]+)~~/g, '<s>$1</s>')
            .replace(/\|\|([^|\n]+)\|\|/g, '<span class="md-spoiler" tabindex="0" title="Spoiler">$1</span>');
        return t.replace(/\u0000(\d+)\u0000/g, (m, i) => codes[+i]);
    }
    function render(src) {
        const text = esc(String(src || '').replace(/\r/g, '')).slice(0, 20000);
        const out = [];
        const blocks = text.split(/```/);
        blocks.forEach((b, bi) => {
            if (bi % 2 === 1) { out.push('<pre class="md-pre"><code>' + b.replace(/^\n/, '').replace(/\n$/, '') + '</code></pre>'); return; }
            const lines = b.split('\n');
            let list = null;
            const flush = () => { if (list) { out.push('<' + list.t + '>' + list.items.map(x => '<li>' + inline(x) + '</li>').join('') + '</' + list.t + '>'); list = null; } };
            for (const line of lines) {
                let m;
                if ((m = /^\s*[-*•]\s+(.*)$/.exec(line))) { if (!list || list.t !== 'ul') { flush(); list = { t: 'ul', items: [] }; } list.items.push(m[1]); continue; }
                if ((m = /^\s*\d{1,3}[.)]\s+(.*)$/.exec(line))) { if (!list || list.t !== 'ol') { flush(); list = { t: 'ol', items: [] }; } list.items.push(m[1]); continue; }
                flush();
                if ((m = /^(#{1,3})\s+(.+)$/.exec(line))) { out.push('<div class="md-h md-h' + m[1].length + '">' + inline(m[2]) + '</div>'); continue; }
                if ((m = /^&gt;\s?(.*)$/.exec(line))) { out.push('<blockquote class="md-q">' + inline(m[1]) + '</blockquote>'); continue; }
                out.push(line.trim() === '' ? '<br>' : inline(line) + '<br>');
            }
            flush();
        });
        return out.join('').replace(/^(<br>)+/, '').replace(/(<br>)+$/, '').replace(/(<br>)+(<pre|<ul|<ol|<blockquote|<div class="md-h)/g, '$2').replace(/(<br>){3,}/g, '<br><br>');
    }
    // ---------- Formatierungsleiste für Eingabefelder (Feed, Antworten, Privat-Chat) ----------
    const T = s => (window.t ? window.t(s) : s);
    const TOOLS = [['b', '𝐁', 'Fett (Strg+B)', '**', '**'], ['i', '𝐼', 'Kursiv (Strg+I)', '*', '*'], ['s', 'S̶', 'Durchgestrichen', '~~', '~~'], ['code', '</>', 'Code', '`', '`'],
        ['link', '🔗', 'Link', '[', '](https://)'], ['ul', '•', 'Liste', '- ', ''], ['quote', '❝', 'Zitat', '> ', ''], ['spoiler', '▒', 'Spoiler', '||', '||'], ['block', '{ }', 'Code-Block', '```\n', '\n```']];
    function toolbar() {
        return '<div class="md-bar" role="toolbar">' + TOOLS.map(t => '<button type="button" class="md-tb" data-md="' + t[0] + '" title="' + esc(T(t[2])) + '">' + esc(t[1]) + '</button>').join('')
            + '<button type="button" class="md-tb md-prev-btn" data-md="preview" title="' + esc(T('Vorschau')) + '">👁</button></div>';
    }
    function areaOf(el) { const f = el.closest('form'); return f && f.querySelector('textarea'); }
    function wrap(ta, k) {
        const t = TOOLS.find(x => x[0] === k); if (!t || !ta) return;
        const a = ta.selectionStart, b = ta.selectionEnd, v = ta.value, sel = v.slice(a, b);
        let before = t[3], after = t[4], text = sel;
        if (k === 'ul' || k === 'quote') { text = (sel || '').split('\n').map(l => before + l).join('\n'); before = (a > 0 && v[a - 1] !== '\n') ? '\n' : ''; after = ''; }
        else if (k === 'link') { text = sel || T('Text'); }
        const ins = before + text + after;
        ta.focus();
        ta.setRangeText(ins, a, b, 'end');
        if (!sel && k !== 'ul' && k !== 'quote') { const p = a + before.length; ta.setSelectionRange(p, p + text.length); }
        ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    document.addEventListener('click', e => {
        const b = e.target.closest('.md-tb'); if (!b) return;
        e.preventDefault();
        const ta = areaOf(b);
        if (b.dataset.md === 'preview') {
            const f = b.closest('form'); let pv = f.querySelector('.md-preview');
            if (pv) { pv.remove(); b.classList.remove('on'); return; }
            pv = document.createElement('div'); pv.className = 'md md-preview'; pv.innerHTML = render(ta.value) || '<span class="muted">' + esc(T('Nichts zu zeigen.')) + '</span>';
            ta.after(pv); b.classList.add('on'); return;
        }
        wrap(ta, b.dataset.md);
    });
    // Vorschau beim Tippen mitführen; Strg+B / Strg+I
    document.addEventListener('input', e => { const ta = e.target; if (!ta.matches || !ta.matches('textarea')) return; const pv = ta.parentNode && ta.parentNode.querySelector && ta.parentNode.querySelector('.md-preview'); if (pv) pv.innerHTML = render(ta.value); });
    document.addEventListener('keydown', e => {
        const ta = e.target; if (!(e.ctrlKey || e.metaKey) || e.altKey || !ta.matches || !ta.matches('textarea') || !ta.closest('form') || !ta.closest('form').querySelector('.md-bar')) return;
        const k = e.key.toLowerCase() === 'b' ? 'b' : e.key.toLowerCase() === 'i' ? 'i' : '';
        if (k) { e.preventDefault(); wrap(ta, k); }
    });
    // Spoiler aufdecken
    document.addEventListener('click', e => { const s = e.target.closest('.md-spoiler'); if (s) s.classList.add('open'); });
    window.NexusMD = { render, esc, toolbar };
})();
