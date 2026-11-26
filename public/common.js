const $ = (id) => document.getElementById(id);

const STATUS_LABELS = { processed: 'queued', routed: 'sending' };
const label = (value) => STATUS_LABELS[value] ?? (value ?? 'none').replaceAll('_', ' ');
const initials = (name) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

let toastTimer;
function showError(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.hidden = false;
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
  if (!response.ok) {
    throw new Error(body.error ?? `Request failed (${response.status})`);
  }
  return body;
}

async function attempt(action) {
  try {
    return { ok: true, value: await action() };
  } catch (err) {
    showError(err.message);
    return { ok: false };
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
