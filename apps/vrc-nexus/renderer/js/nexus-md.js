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
    // Spoiler aufdecken
    document.addEventListener('click', e => { const s = e.target.closest('.md-spoiler'); if (s) s.classList.add('open'); });
    window.NexusMD = { render, esc };
})();
