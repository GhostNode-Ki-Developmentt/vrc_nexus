/* Text-Plugin – example for the VRC Nexus plugin system (see docs/PLUGINS.md).
 * Uses only the `nexus` API: chatbox.send, storage, ui. */
let texts = [], sent = 0, rotate = false, seconds = 30, next = 0, timer = null;

async function save() { await nexus.storage.set('texts', texts); await nexus.storage.set('rotate', { on: rotate, seconds }); }

function draw(note) {
    const items = [
        { type: 'heading', text: '📝 Text-Plugin' },
        { type: 'text', text: 'Send a text to the VRChat chatbox or save it for later. Saved texts can rotate automatically.' },
        { type: 'input', id: 'text', label: 'Text', placeholder: 'Hello VRChat! 👋', multiline: true },
        { type: 'button', id: 'send', label: '💬 Send to chatbox', style: 'gold' },
        { type: 'button', id: 'save', label: '＋ Save text' },
        { type: 'divider' },
        { type: 'heading', text: 'Saved texts (' + texts.length + ')' },
    ];
    texts.forEach((t, i) => items.push({ type: 'button', id: 'send_' + i, label: '▶ ' + (t.length > 60 ? t.slice(0, 60) + '…' : t) }));
    if (texts.length) items.push({ type: 'button', id: 'del_last', label: '🗑 Remove last', style: 'danger' });
    items.push({ type: 'divider' },
        { type: 'toggle', id: 'rotate', label: 'Rotate saved texts', value: rotate },
        { type: 'input', id: 'seconds', label: 'Every … seconds (min. 10)', value: String(seconds) },
        { type: 'button', id: 'apply', label: 'Apply' },
        { type: 'stat', label: 'Sent this session', value: String(sent) });
    if (note) items.push({ type: 'text', text: note });
    return nexus.ui.set(items);
}

async function send(text) {
    text = String(text || '').trim();
    if (!text) return draw('⚠ Please enter a text.');
    try { await nexus.chatbox.send(text); sent++; await draw('✔ Sent: ' + text.slice(0, 80)); }
    catch (e) { await draw('⚠ ' + e.message); }
}

function schedule() {
    clearInterval(timer);
    if (!rotate || !texts.length) return;
    timer = setInterval(() => { if (texts.length) send(texts[next++ % texts.length]); }, Math.max(10, seconds) * 1000);
}

nexus.on('start', async () => {
    texts = await nexus.storage.get('texts', []);
    const r = await nexus.storage.get('rotate', { on: false, seconds: 30 });
    rotate = !!r.on; seconds = Math.max(10, Number(r.seconds) || 30);
    schedule();
    await draw();
    nexus.log('Text-Plugin started with', texts.length, 'saved texts');
});

nexus.on('ui', async ev => {
    const v = ev.values || {};
    if (ev.id === 'send') return send(v.text);
    if (ev.id === 'save') { const t = String(v.text || '').trim(); if (!t) return draw('⚠ Please enter a text.'); texts.push(t.slice(0, 400)); texts = texts.slice(-30); await save(); return draw('✔ Saved.'); }
    if (/^send_\d+$/.test(ev.id)) return send(texts[Number(ev.id.slice(5))]);
    if (ev.id === 'del_last') { texts.pop(); await save(); schedule(); return draw(); }
    if (ev.id === 'rotate') { rotate = !!ev.value; await save(); schedule(); return draw(rotate ? '🔁 Rotation on.' : 'Rotation off.'); }
    if (ev.id === 'apply') { seconds = Math.max(10, Number(v.seconds) || 30); rotate = !!v.rotate; await save(); schedule(); return draw('✔ Every ' + seconds + ' s.'); }
});

nexus.on('stop', () => clearInterval(timer));
