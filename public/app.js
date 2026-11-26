const form = document.getElementById('booking');
const rows = document.getElementById('rows');
const empty = document.getElementById('empty');
const toast = document.getElementById('toast');
const phonePanel = document.getElementById('phone');
const thread = document.getElementById('thread');
const reply = document.getElementById('reply');
const hint = document.getElementById('phone-hint');
const submit = form.querySelector('button[type="submit"]');

let demo = false;
let selectedPhone = null;
let toastTimer;

const label = (value) => (value ?? '-').replaceAll('_', ' ');

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

function cell(text) {
  const td = document.createElement('td');
  td.textContent = text;
  return td;
}

function linkButton(text, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'link';
  button.textContent = text;
  button.addEventListener('click', onClick);
  return button;
}

function render(appointments) {
  rows.replaceChildren();
  empty.hidden = appointments.length > 0;

  for (const a of appointments) {
    const tr = document.createElement('tr');
    tr.append(cell(a.name), cell(a.phone), cell(new Date(a.startsAt).toLocaleString()));

    const status = document.createElement('td');
    const pill = document.createElement('span');
    pill.className = `pill ${a.status}`;
    pill.textContent = label(a.status);
    status.append(pill);

    const reminder = document.createElement('td');
    const reminderPill = document.createElement('span');
    reminderPill.className = `pill ${a.reminderStatus ?? ''}`;
    reminderPill.textContent = label(a.reminderStatus);
    reminder.append(reminderPill);
    tr.append(status, reminder);

    const action = document.createElement('td');
    if (demo) {
      action.append(
        linkButton('Open phone', () => {
          selectedPhone = a.phone;
          refresh();
        }),
        ' ',
      );
    }
    if (a.status !== 'cancelled') {
      action.append(
        linkButton('Cancel', async () => {
          if (await attempt(() => api(`/api/appointments/${a.id}/cancel`, { method: 'POST' }))) refresh();
        }),
      );
    }
    tr.append(action);
    rows.append(tr);
  }
}

function renderThread(messages) {
  thread.replaceChildren();
  const mine = messages.filter((m) => m.phone === selectedPhone);
  hint.textContent = selectedPhone ? `Showing ${selectedPhone}` : 'Book an appointment to start.';

  if (mine.length === 0) {
    const none = document.createElement('p');
    none.className = 'thread-empty';
    none.textContent = 'No messages yet.';
    thread.append(none);
    return;
  }

  for (const m of mine) {
    const bubble = document.createElement('div');
    bubble.className = `bubble ${m.direction}`;
    bubble.append(m.body);

    const meta = document.createElement('small');
    meta.textContent =
      m.status === 'scheduled'
        ? `Scheduled for ${new Date(m.scheduledAt).toLocaleString()}`
        : m.status === 'cancelled'
          ? 'Cancelled before sending'
          : m.direction === 'outbound' ? 'Delivered' : 'Received';
    bubble.append(meta);

    if (m.status === 'scheduled') {
      const release = document.createElement('button');
      release.type = 'button';
      release.textContent = 'Deliver now';
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
    render(appointments);
    if (demo) renderThread(await api('/api/demo/messages'));
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

function setDefaultStart() {
  const start = new Date(Date.now() + 2 * 86_400_000);
  start.setMinutes(0, 0, 0);
  start.setMinutes(start.getMinutes() - start.getTimezoneOffset());
  form.elements.startsAt.value = start.toISOString().slice(0, 16);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const startsAt = new Date(data.get('startsAt'));
  if (Number.isNaN(startsAt.getTime())) {
    showError('Pick a valid appointment date and time.');
    return;
  }

  submit.disabled = true;
  submit.textContent = 'Booking...';
  const ok = await attempt(() =>
    api('/api/appointments', {
      method: 'POST',
      body: JSON.stringify({ name: data.get('name'), phone: data.get('phone').trim(), startsAt: startsAt.toISOString() }),
    }),
  );
  submit.disabled = false;
  submit.textContent = 'Book';

  if (ok) {
    selectedPhone = data.get('phone').trim();
    form.reset();
    setDefaultStart();
    refresh();
  }
});

reply.addEventListener('submit', (event) => {
  event.preventDefault();
  const input = reply.elements.text;
  sendReply(input.value);
  input.value = '';
});

for (const button of document.querySelectorAll('.quick button')) {
  button.addEventListener('click', () => sendReply(button.dataset.text));
}

async function init() {
  setDefaultStart();
  try {
    const config = await api('/api/config');
    demo = config.demo;
    document.getElementById('banner').hidden = !demo && !config.sandbox;
    document.getElementById('banner').textContent = demo
      ? 'Demo mode: Sent is simulated locally. Nothing is sent to a real phone.'
      : 'Sandbox mode: requests are validated by Sent but nothing is delivered.';
    phonePanel.hidden = !demo;
  } catch (err) {
    showError(err.message);
  }
  await refresh();
  setInterval(refresh, 4000);
}

init();
