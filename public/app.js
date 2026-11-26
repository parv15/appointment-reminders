const $ = (id) => document.getElementById(id);
const form = $('booking');
const list = $('list');
const empty = $('empty');
const toast = $('toast');
const submit = form.querySelector('button[type="submit"]');

let demo = false;
let config = {};
let bookedId = null;
let leadMinutes = 1440;
let selectedPhone = null;
let toastTimer;

const label = (value) => (value ?? 'none').replaceAll('_', ' ');
const initials = (name) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

function showError(message) {
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
    await action();
    return true;
  } catch (err) {
    showError(err.message);
    return false;
  }
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

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderStats(appointments) {
  const live = appointments.filter((a) => a.status !== 'cancelled');
  $('stat-upcoming').textContent = live.filter((a) => a.status === 'scheduled').length;
  $('stat-confirmed').textContent = live.filter((a) => a.status === 'confirmed').length;
  $('stat-reschedule').textContent = live.filter((a) => a.status === 'reschedule_requested').length;
  $('stat-cancelled').textContent = appointments.length - live.length;
}

function renderList(appointments) {
  list.replaceChildren();
  empty.hidden = appointments.length > 0;

  for (const a of appointments) {
    const row = el('li', `row ${a.status}`);
    row.append(el('span', 'avatar', initials(a.name)));

    const who = el('div', 'who');
    who.append(el('strong', '', a.name));
    who.append(el('span', '', `${a.phone}  ·  ${new Date(a.startsAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} (${until(a.startsAt)})`));

    const meta = el('div', 'meta');
    meta.append(el('span', `pill ${a.status}`, label(a.status)));
    meta.append(el('span', `pill ${a.reminderStatus ?? ''}`, `Reminder ${label(a.reminderStatus)}`));
    if (a.lastReply) {
      const reply = el('span', 'reply', `Replied "${a.lastReply}" ${ago(a.lastReplyAt)}`);
      meta.append(reply);
    }
    who.append(meta);
    row.append(who);

    const actions = el('div', 'actions');
    if (demo) {
      const open = el('button', 'ghost', 'Open phone');
      open.type = 'button';
      open.addEventListener('click', () => {
        selectedPhone = a.phone;
        refresh();
      });
      actions.append(open);
    }
    if (a.status !== 'cancelled') {
      const cancel = el('button', 'ghost danger', 'Cancel');
      cancel.type = 'button';
      cancel.addEventListener('click', async () => {
        cancel.disabled = true;
        if (await attempt(() => api(`/api/appointments/${a.id}/cancel`, { method: 'POST' }))) refresh();
        else cancel.disabled = false;
      });
      actions.append(cancel);
    }
    row.append(actions);
    list.append(row);
  }
}

function renderThread(appointments, messages) {
  const thread = $('thread');
  thread.replaceChildren();
  const customer = appointments.find((a) => a.phone === selectedPhone);
  $('phone-avatar').textContent = customer ? initials(customer.name) : '?';
  $('phone-name').textContent = customer ? customer.name : 'Customer phone';
  $('phone-number').textContent = selectedPhone ?? 'Book an appointment to start';

  const mine = messages.filter((m) => m.phone === selectedPhone);
  if (mine.length === 0) {
    thread.append(el('p', 'thread-empty', 'No messages yet'));
    return;
  }

  for (const m of mine) {
    const bubble = el('div', `bubble ${m.direction}`, m.body);
    const info =
      m.status === 'scheduled'
        ? `Scheduled for ${new Date(m.scheduledAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`
        : m.status === 'cancelled'
          ? 'Cancelled before sending'
          : new Date(m.createdAt).toLocaleTimeString([], { timeStyle: 'short' });
    bubble.append(el('small', '', info));

    if (m.status === 'scheduled') {
      const release = el('button', '', 'Deliver now');
      release.type = 'button';
      release.addEventListener('click', async () => {
        if (await attempt(() => api(`/api/demo/messages/${m.id}/release`, { method: 'POST' }))) refresh();
      });
      bubble.append(release);
    }
    thread.append(bubble);
  }
  thread.scrollTop = thread.scrollHeight;
}

async function refresh() {
  try {
    const appointments = await api('/api/appointments');
    if (demo && !selectedPhone && appointments.length > 0) {
      selectedPhone = appointments.at(-1).phone;
    }
    renderStats(appointments);
    renderBooked(appointments);
    renderList(appointments);
    if (demo) renderThread(appointments, await api('/api/demo/messages'));
  } catch (err) {
    showError(err.message);
  }
}

async function sendReply(text) {
  if (!selectedPhone) {
    showError('Book an appointment first, then reply as that customer.');
    return;
  }
  if (await attempt(() => api('/api/demo/replies', { method: 'POST', body: JSON.stringify({ phone: selectedPhone, text }) }))) {
    refresh();
  }
}

const format = (iso, options) => new Intl.DateTimeFormat('en-US', { timeZone: config.timezone, ...options }).format(new Date(iso));
const clean = (text) => text.replace(/[\u202f\u00a0]/g, ' ');

function alertPreview(a) {
  return [
    `Hello ${a.name},`,
    `Thank you for booking with ${config.businessName}.`,
    `Your appointment for ${config.serviceName} on ${clean(format(a.startsAt, { dateStyle: 'medium' }))} at ${clean(format(a.startsAt, { timeStyle: 'short' }))} is confirmed.`,
  ].join('\n\n');
}

function setSteps(step) {
  for (const li of $('steps').children) {
    const n = Number(li.dataset.step);
    li.className = n < step ? 'done' : n === step ? 'current' : '';
  }
}

function renderBooked(appointments) {
  const a = appointments.find((x) => x.id === bookedId);
  $('booked').hidden = !a;
  $('form-card').hidden = Boolean(a);
  if (!a) {
    setSteps(1);
    return;
  }

  const status = a.confirmationStatus;
  const failed = status === 'failed' || status === 'blocked';
  const delivered = status === 'delivered' || status === 'read';
  const rank = delivered ? 3 : status === 'sent' ? 2 : 1;
  setSteps(delivered ? 4 : 2);

  $('booked-sub').textContent = !config.confirmationAlerts
    ? 'Reminder scheduled.'
    : failed
      ? `The booking alert to ${a.phone} could not be delivered.`
      : delivered
        ? `Booking alert delivered to ${a.phone}.`
        : `A booking alert is on its way to ${a.phone}.`;
  $('d-name').textContent = a.name;
  $('d-phone').textContent = a.phone;
  $('d-when').textContent = new Date(a.startsAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const sendAt = new Date(new Date(a.startsAt).getTime() - config.reminderLeadMinutes * 60_000);
  $('d-reminder').textContent = sendAt.getTime() - Date.now() < 120_000 ? 'Sent right away' : sendAt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

  const hasAlert = config.confirmationAlerts && a.confirmationMessageId;
  document.querySelector('.alert-box').hidden = !hasAlert;
  $('alert-text').textContent = alertPreview(a);
  const chip = $('alert-chip');
  chip.className = `pill ${status ?? 'queued'}`;
  chip.textContent = label(status ?? 'queued');
  [...$('track').children].forEach((li, i) => li.classList.toggle('on', !failed && i < rank));
  const error = $('alert-error');
  error.hidden = !failed;
  error.textContent = failed ? `Sent could not deliver this alert (${status}). Check the number and your Sent sender setup.` : '';
}

function setDefaultStart() {
  const start = new Date(Date.now() + 2 * 86_400_000);
  start.setMinutes(0, 0, 0);
  start.setMinutes(start.getMinutes() - start.getTimezoneOffset());
  form.elements.startsAt.value = start.toISOString().slice(0, 16);
  updateLeadHint();
}

function updateLeadHint() {
  const start = new Date(form.elements.startsAt.value);
  const hint = $('lead-hint');
  if (Number.isNaN(start.getTime())) {
    hint.textContent = '';
    return;
  }
  const sendAt = new Date(start.getTime() - leadMinutes * 60_000);
  hint.textContent =
    sendAt.getTime() - Date.now() < 120_000
      ? 'Reminder goes out right away'
      : `Reminder goes out ${sendAt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`;
}

form.elements.startsAt.addEventListener('input', updateLeadHint);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const startsAt = new Date(data.get('startsAt'));
  if (Number.isNaN(startsAt.getTime())) {
    showError('Pick a valid appointment date and time.');
    return;
  }
  const phone = data.get('phone').trim();

  submit.disabled = true;
  submit.textContent = 'Booking...';
  let result = null;
  await attempt(async () => {
    result = await api('/api/appointments', {
      method: 'POST',
      body: JSON.stringify({ name: data.get('name'), phone, startsAt: startsAt.toISOString() }),
    });
  });
  submit.disabled = false;
  submit.textContent = 'Book and schedule reminder';

  if (result) {
    if (result.confirmationError) showError(`Booked, but the alert failed: ${result.confirmationError}`);
    selectedPhone = phone;
    bookedId = result.id;
    form.reset();
    setDefaultStart();
    refresh();
  }
});

$('book-another').addEventListener('click', () => {
  bookedId = null;
  refresh();
});

$('reply').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('reply').elements.text;
  sendReply(input.value);
  input.value = '';
});

for (const button of document.querySelectorAll('.quick button')) {
  button.addEventListener('click', () => sendReply(button.dataset.text));
}

async function init() {
  try {
    config = await api('/api/config');
    demo = config.demo;
    leadMinutes = config.reminderLeadMinutes;
    const mode = $('mode');
    mode.hidden = false;
    mode.className = `mode ${demo ? 'demo' : config.sandbox ? 'sandbox' : 'live'}`;
    mode.textContent = demo ? 'Demo, Sent simulated' : config.sandbox ? 'Sandbox, nothing delivered' : 'Live';
    $('phone').hidden = !demo;
    $('shell').classList.toggle('with-phone', demo);
  } catch (err) {
    showError(err.message);
  }
  setDefaultStart();
  await refresh();
  setInterval(refresh, 4000);
}

init();
