const $ = (id) => document.getElementById(id);

const STATUS_LABELS = { processed: 'queued', routed: 'sending' };
const label = (value) => STATUS_LABELS[value] ?? (value ?? 'none').replaceAll('_', ' ');
const DIAL_FORMATS = [
  ['+971', [2, 3, 4]],
  ['+44', [4, 6]],
  ['+91', [5, 5]],
  ['+61', [3, 3, 3]],
  ['+65', [4, 4]],
  ['+49', [4, 7]],
  ['+33', [1, 2, 2, 2, 2]],
  ['+1', [3, 3, 4]],
];

function formatPhone(e164) {
  const match = DIAL_FORMATS.find(([code]) => e164.startsWith(code));
  if (!match) return e164;
  const [code, sizes] = match;
  const digits = e164.slice(code.length);
  const groups = [];
  let at = 0;
  for (const size of sizes) {
    if (at >= digits.length) break;
    groups.push(digits.slice(at, at + size));
    at += size;
  }
  if (at < digits.length) groups.push(digits.slice(at));
  return `${code} ${groups.join(' ')}`;
}

const AVATAR = {
  backgrounds: ['#dbe7ff', '#ffe3d4', '#dff3e4', '#f3e1f5', '#fff0c9', '#d9f0f4'],
  skins: ['#f2c9a5', '#e0a97d', '#c68863', '#a46a47', '#7a4c33'],
  hair: ['#1d1512', '#4a2f1d', '#8a5a2b', '#c9a24b', '#9a3b2a', '#6b6b70'],
  shirts: ['#266df0', '#130f0c', '#2f8f5b', '#c4561c', '#7a4bc2', '#4b5563'],
};

function avatarFor(name) {
  let seed = 7;
  for (const char of name) seed = (seed * 31 + char.codePointAt(0)) % 100003;
  const pick = (list, shift) => list[Math.floor(seed / shift) % list.length];
  const style = Math.floor(seed / 11) % 4;

  const svgNS = 'http://www.w3.org/2000/svg';
  const make = (tag, attrs) => {
    const node = document.createElementNS(svgNS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };
  const skin = pick(AVATAR.skins, 3);
  const hair = pick(AVATAR.hair, 5);

  const svg = make('svg', { viewBox: '0 0 40 40', width: '40', height: '40', role: 'img', 'aria-label': name });
  svg.append(make('rect', { width: 40, height: 40, fill: pick(AVATAR.backgrounds, 1) }));
  if (style === 1) svg.append(make('path', { d: 'M9 34c-1-14 4-22 11-22s12 8 11 22z', fill: hair }));
  svg.append(make('path', { d: 'M5 41c1-8 7-12 15-12s14 4 15 12z', fill: pick(AVATAR.shirts, 7) }));
  svg.append(make('rect', { x: 17, y: 22, width: 6, height: 8, rx: 2, fill: skin }));
  svg.append(make('ellipse', { cx: 20, cy: 17, rx: 7, ry: 8, fill: skin }));
  if (style === 0) svg.append(make('path', { d: 'M12.5 16c0-6 3.5-8.5 7.5-8.5s7.5 2.5 7.5 8.500c-2-2.5-5-3.500-7.5-3.500S14.5 13.5 12.5 16z', fill: hair }));
  if (style === 1) svg.append(make('path', { d: 'M12.5 17c0-6 3-9 7.5-9s7.5 3 7.5 9c-1.500-3-4-5-7.5-5s-6 2-7.5 5z', fill: hair }));
  if (style === 2) {
    svg.append(make('path', { d: 'M12.8 15c.5-5 3.500-7 7.2-7s6.7 2 7.2 7c-2-1.8-4.5-2.5-7.2-2.5S14.8 13.2 12.8 15z', fill: hair }));
    svg.append(make('circle', { cx: 20, cy: 6.5, r: 3.2, fill: hair }));
  }
  if (style === 3) svg.append(make('path', { d: 'M13 14.5c1-4.5 4-6.5 7-6.5s6 2 7 6.5c-3-1-5-1.8-7-1.8s-4 .8-7 1.8z', fill: hair }));
  svg.append(make('circle', { cx: 17.2, cy: 17.5, r: 0.9, fill: '#130f0c' }), make('circle', { cx: 22.8, cy: 17.5, r: 0.9, fill: '#130f0c' }));
  svg.append(make('path', { d: 'M17.5 21c1.500 1.200 3.500 1.200 5 0', fill: 'none', stroke: '#130f0c', 'stroke-width': 0.9, 'stroke-linecap': 'round' }));

  const holder = el('span', 'avatar');
  holder.append(svg);
  return holder;
}


function statusTone(status) {
  if (['confirmed', 'delivered', 'read', 'sent'].includes(status)) return 'good';
  if (['reschedule_requested'].includes(status)) return 'warn';
  if (['failed', 'blocked', 'cancelled'].includes(status)) return 'bad';
  if (['queued', 'scheduled', 'processed', 'routed'].includes(status)) return 'info';
  return '';
}

function pill(text, status, extra = '') {
  return el('span', `pill ${statusTone(status)} ${extra}`.trim(), text);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function rollify(root = document) {
  for (const btn of root.querySelectorAll('.btn[data-roll]:not([data-rolled])')) {
    const text = btn.textContent.trim();
    const roll = el('span', 'roll');
    roll.setAttribute('aria-hidden', 'true');
    [...text].forEach((char, i) => {
      const c = el('span', 'c', char);
      c.dataset.c = char;
      c.style.setProperty('--i', i);
      roll.append(c);
    });
    btn.setAttribute('aria-label', text);
    btn.replaceChildren(roll);
    btn.dataset.rolled = 'true';
  }
}

function restartRise(root) {
  for (const node of root.querySelectorAll('.rise')) {
    node.style.animation = 'none';
    void node.offsetWidth;
    node.style.animation = '';
  }
}

let toastTimer;
function showError(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.hidden = false;
  toast.style.animation = 'none';
  void toast.offsetWidth;
  toast.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), 8000);
}

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    });
  } catch {
    throw new Error('Cannot reach the server. Is it still running?');
  }
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && path.startsWith('/api/admin/') && path !== '/api/admin/login') {
    location.href = '/admin/login';
  }
  if (!response.ok) {
    throw Object.assign(new Error(body.error ?? `Request failed (${response.status})`), { status: response.status, code: body.code });
  }
  return body;
}

async function attempt(action) {
  try {
    return { ok: true, value: await action() };
  } catch (err) {
    showError(err.message);
    return { ok: false, error: err };
  }
}

function formatter(timeZone, options) {
  return new Intl.DateTimeFormat('en-US', { timeZone, ...options });
}

const tidy = (text) => text.replace(/[\u202f\u00a0]/g, ' ');

function duration(minutes) {
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  return [
    days && `${days} day${days > 1 ? 's' : ''}`,
    hours && `${hours} hour${hours > 1 ? 's' : ''}`,
    mins && `${mins} min`,
  ].filter(Boolean).join(' ');
}

function ago(iso) {
  const seconds = Math.round((Date.now() - new Date(iso)) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
}

function until(iso) {
  const minutes = Math.round((new Date(iso) - Date.now()) / 60000);
  if (minutes < 0) return 'past';
  if (minutes < 60) return `in ${minutes} min`;
  if (minutes < 1440) return `in ${Math.round(minutes / 60)} h`;
  return `in ${Math.round(minutes / 1440)} d`;
}
