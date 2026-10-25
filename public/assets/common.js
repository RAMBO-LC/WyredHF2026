/* SharedBrain — shared browser helpers: API client, header, theme, markdown, toasts, icons. */
(function () {
  'use strict';

  const ICONS = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    send: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    upload: '<path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
    edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    message: '<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z"/>',
    graph: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="8" r="2.5"/><circle cx="11" cy="18" r="2.5"/><path d="M8.3 7l7.3.8M7.2 8.2l2.8 7.5M16.6 10l-4 6"/>',
    github: '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
  };

  function icon(name, extra = '') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${ICONS[name] || ''}</svg>`;
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function api(path, options = {}) {
    const opts = { ...options, headers: { ...(options.headers || {}) } };
    if (opts.body && typeof opts.body !== 'string') {
      opts.body = JSON.stringify(opts.body);
      opts.headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(path, opts);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = (data && (data.error?.message || data.error || data.message)) || `${res.status} ${res.statusText}`;
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    return data;
  }

  function toast(message, type = 'info') {
    let host = document.querySelector('.toasts');
    if (!host) {
      host = document.createElement('div');
      host.className = 'toasts';
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = `toast ${type === 'error' ? 'error' : ''}`;
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => el.remove(), type === 'error' ? 6000 : 3200);
  }

  function timeAgo(value) {
    const t = new Date(value).getTime();
    if (!Number.isFinite(t)) return value || '';
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
    return new Date(t).toLocaleDateString();
  }

  function cleanTitle(title) {
    return String(title || '').replace(/\.md$/i, '').replace(/_/g, ' ');
  }

  /* ---------- Markdown (small, safe subset) ---------- */

  function inline(text, opts) {
    const codes = [];
    let s = esc(text).replace(/`([^`]+)`/g, (_, c) => {
      codes.push(`<code>${c}</code>`);
      return `\u0000${codes.length - 1}\u0000`;
    });
    s = s
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) =>
        `<a class="wikilink" href="/knowledge#title=${encodeURIComponent(target.trim())}">${alias || target}</a>`)
      .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2" style="max-width:100%">')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
        const safe = /^(https?:|\/|#|mailto:)/i.test(href.replace(/&amp;/g, '&')) ? href : '#';
        const ext = /^https?:/i.test(safe) ? ' target="_blank" rel="noopener"' : '';
        return `<a href="${safe}"${ext}>${label}</a>`;
      })
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>')
      .replace(/(^|[^_\w])_([^_\s][^_]*?)_(?!\w)/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>');
    if (opts && opts.citations) {
      s = s.replace(/\[(\d{1,2})\](?!\()/g, (m, n) => `<sup class="cite"><a href="#cite-${opts.citeScope || ''}${n}" data-cite="${n}">${n}</a></sup>`);
    }
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)]);
  }

  const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

  function renderList(items, opts) {
    let idx = 0;
    function build(level) {
      const tag = items[idx].ordered ? 'ol' : 'ul';
      let out = `<${tag}>`;
      while (idx < items.length && items[idx].indent >= level) {
        const it = items[idx++];
        let body = inline(it.text, opts);
        if (/^\[[ xX]\]\s/.test(it.text)) {
          const done = /^\[[xX]\]/.test(it.text);
          body = `<input type="checkbox" disabled ${done ? 'checked' : ''}> ${inline(it.text.slice(4), opts)}`;
        }
        out += `<li>${body}`;
        if (idx < items.length && items[idx].indent > it.indent) out += build(items[idx].indent);
        out += '</li>';
      }
      return out + `</${tag}>`;
    }
    let html = '';
    while (idx < items.length) html += build(items[idx].indent);
    return html;
  }

  function md(src, opts = {}) {
    const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
    let html = '';
    let i = 0;
    const isBlockStart = (l) => /^```/.test(l) || /^#{1,6}\s/.test(l) || LIST_RE.test(l) || /^>/.test(l) || /^(-{3,}|\*{3,})\s*$/.test(l) || /^\|/.test(l);

    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }

      const fence = line.match(/^```\s*([\w+-]*)/);
      if (fence) {
        const buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++;
        html += `<pre><code${fence[1] ? ` class="lang-${esc(fence[1])}"` : ''}>${esc(buf.join('\n'))}</code></pre>`;
        continue;
      }

      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        const level = Math.min(h[1].length + (opts.shiftHeadings || 0), 6);
        html += `<h${level}>${inline(h[2], opts)}</h${level}>`;
        i++;
        continue;
      }

      if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { html += '<hr>'; i++; continue; }

      if (/^>/.test(line)) {
        const buf = [];
        while (i < lines.length && /^>/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
        html += `<blockquote>${md(buf.join('\n'), opts)}</blockquote>`;
        continue;
      }

      if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[i + 1])) {
        const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        const head = cells(line);
        i += 2;
        let body = '';
        while (i < lines.length && /^\|/.test(lines[i])) {
          body += `<tr>${cells(lines[i++]).map((c) => `<td>${inline(c, opts)}</td>`).join('')}</tr>`;
        }
        html += `<table><thead><tr>${head.map((c) => `<th>${inline(c, opts)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
        continue;
      }

      if (LIST_RE.test(line)) {
        const items = [];
        while (i < lines.length) {
          const m = lines[i].match(LIST_RE);
          if (m) {
            items.push({ indent: m[1].replace(/\t/g, '  ').length, ordered: /\d/.test(m[2]), text: m[3] });
            i++;
          } else if (lines[i].trim() && /^\s+/.test(lines[i]) && !/^\s*```/.test(lines[i]) && items.length) {
            items[items.length - 1].text += ' ' + lines[i].trim();
            i++;
          } else break;
        }
        html += renderList(items, opts);
        continue;
      }

      const buf = [];
      while (i < lines.length && lines[i].trim() && !(buf.length && isBlockStart(lines[i]))) buf.push(lines[i++]);
      html += `<p>${inline(buf.join('\n'), opts).replace(/\n/g, '<br>')}</p>`;
    }
    return html;
  }

  /* ---------- Theme & header ---------- */

  function currentTheme() {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('sb-theme', theme);
    document.querySelectorAll('[data-theme-toggle]').forEach((b) => {
      b.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
    });
    window.dispatchEvent(new CustomEvent('sb-theme', { detail: theme }));
  }

  let systemInfo = null;
  async function getSystem() {
    if (!systemInfo) systemInfo = api('/api/system').catch(() => null);
    return systemInfo;
  }

  function providerLabel(llm) {
    if (!llm) return 'offline';
    if (llm.provider === 'local') return 'Local · extractive';
    if (llm.provider === 'gemini') return `Gemini · ${llm.model}`;
    const host = (() => { try { return new URL(llm.baseUrl).hostname; } catch { return ''; } })();
    const name = /localhost|127\.0\.0\.1/.test(host) ? 'Local LLM' : host.includes('openai') ? 'OpenAI' : host || 'LLM';
    return `${name} · ${llm.model}`;
  }

  const NAV = [
    ['app', '/app', 'Ask'],
    ['knowledge', '/knowledge', 'Knowledge'],
    ['graph', '/graph', 'Graph'],
    ['console', '/console', 'Console'],
    ['docs', '/docs', 'Docs'],
  ];

  function mountHeader(active) {
    const header = document.createElement('header');
    header.className = 'site-header';
    header.innerHTML = `
      <a class="brand" href="/"><img src="/assets/logo.svg" alt=""> SharedBrain <span class="version" data-version></span></a>
      <nav class="nav">${NAV.map(([key, href, label]) => `<a href="${href}" class="${key === active ? 'active' : ''}">${label}</a>`).join('')}</nav>
      <div class="header-right">
        <span class="status-pill" data-status title="Answer model"><span class="dot"></span><span data-status-text>Connecting…</span></span>
        <button class="icon-btn" data-theme-toggle title="Toggle theme" aria-label="Toggle theme"></button>
      </div>`;
    document.body.prepend(header);
    header.querySelector('[data-theme-toggle]').addEventListener('click', () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'));
    setTheme(currentTheme());

    getSystem().then((sys) => {
      const pill = header.querySelector('[data-status]');
      if (!sys) {
        pill.classList.add('err');
        header.querySelector('[data-status-text]').textContent = 'Server offline';
        return;
      }
      pill.classList.add('ok');
      header.querySelector('[data-status-text]').textContent = providerLabel(sys.llm);
      header.querySelector('[data-version]').textContent = `v${sys.version}`;
    });
  }

  function modal({ title, body, actions = [] }) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
        <div class="modal-body"></div>
        ${actions.length ? '<div class="modal-foot"></div>' : ''}
      </div>`;
    const bodyEl = backdrop.querySelector('.modal-body');
    if (typeof body === 'string') bodyEl.innerHTML = body; else bodyEl.appendChild(body);
    const close = () => { backdrop.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
    backdrop.querySelector('[data-close]').addEventListener('click', close);
    const foot = backdrop.querySelector('.modal-foot');
    for (const a of actions) {
      const b = document.createElement('button');
      b.className = `btn ${a.primary ? 'btn-primary' : ''} ${a.danger ? 'btn-danger' : ''}`;
      b.textContent = a.label;
      b.addEventListener('click', async () => {
        if (a.onClick) {
          b.disabled = true;
          try {
            if ((await a.onClick(backdrop)) !== false) close();
          } catch (err) {
            toast(err.message, 'error');
          } finally {
            b.disabled = false;
          }
        } else close();
      });
      foot.appendChild(b);
    }
    document.body.appendChild(backdrop);
    return { el: backdrop, close };
  }

  function confirmDialog(title, message, confirmLabel = 'Delete') {
    return new Promise((resolve) => {
      let answered = false;
      const m = modal({
        title,
        body: `<p class="muted" style="margin:0">${esc(message)}</p>`,
        actions: [
          { label: 'Cancel', onClick: () => { answered = true; resolve(false); } },
          { label: confirmLabel, danger: true, onClick: () => { answered = true; resolve(true); } },
        ],
      });
      new MutationObserver((_, obs) => {
        if (!document.body.contains(m.el)) { obs.disconnect(); if (!answered) resolve(false); }
      }).observe(document.body, { childList: true });
    });
  }

  function copyText(text) {
    return navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard'));
  }

  window.SB = { api, esc, md, toast, timeAgo, icon, mountHeader, modal, confirmDialog, getSystem, providerLabel, cleanTitle, copyText };
})();
