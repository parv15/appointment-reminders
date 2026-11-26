const form = document.getElementById('booking');
const rows = document.getElementById('rows');
const empty = document.getElementById('empty');
const error = document.getElementById('error');
const phonePanel = document.getElementById('phone');
const thread = document.getElementById('thread');
const reply = document.getElementById('reply');
const hint = document.getElementById('phone-hint');

let demo = false;
let selectedPhone = null;

const label = (value) => (value ?? '-').replaceAll('_', ' ');

function cell(text) {
  const td = document.createElement('td');
  td.textContent = text;
  return td;
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
    tr.append(status, cell(label(a.reminderStatus)));

    const action = document.createElement('td');
    if (demo) {
      const view = document.createElement('button');
      view.className = 'link';
      view.textContent = 'Open phone';
      view.addEventListener('click', () => {
        selectedPhone = a.phone;
        loadThread();
      });
      action.append(view, ' ');
    }
    if (a.status !== 'cancelled') {
      const button = document.createElement('button');
      button.className = 'link';
      button.textContent = 'Cancel';
      button.addEventListener('click', async () => {
        await fetch(`/api/appointments/${a.id}/cancel`, { method: 'POST' });
        refresh();
      });
      action.append(button);
    }
    tr.append(action);
    rows.append(tr);
  }
}

function renderThread(messages) {
  thread.replaceChildren();
  const mine = messages.filter((m) => m.phone === selectedPhone);
  hint.textContent = selectedPhone ? `Showing ${selectedPhone}` : 'Book an appointment, then open its phone.';

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
      release.textContent = 'Deliver now';
      release.addEventListener('click', async () => {
        await fetch(`/api/demo/messages/${m.id}/release`, { method: 'POST' });
        refresh();
      });
      bubble.append(release);
    }
    thread.append(bubble);
  }
  thread.scrollTop = thread.scrollHeight;
}

async function loadThread() {
  if (!demo) return;
  renderThread(await (await fetch('/api/demo/messages')).json());
}

async function refresh() {
  const appointments = await (await fetch('/api/appointments')).json();
  if (demo && !selectedPhone && appointments.length > 0) {
    selectedPhone = appointments.at(-1).phone;
  }
  render(appointments);
  await loadThread();
}

async function sendReply(text) {
  if (!selectedPhone) return;
  await fetch('/api/demo/replies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: selectedPhone, text }),
  });
  await refresh();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  error.hidden = true;

  const data = new FormData(form);
  const response = await fetch('/api/appointments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: data.get('name'),
      phone: data.get('phone'),
      startsAt: new Date(data.get('startsAt')).toISOString(),
    }),
  });

  if (!response.ok) {
    const body = await response.json();
    error.textContent = body.detail ?? body.error;
    error.hidden = false;
    return;
  }
  selectedPhone = data.get('phone');
  form.reset();
  setDefaultStart();
  refresh();
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

function setDefaultStart() {
  const start = new Date(Date.now() + 2 * 86_400_000);
  start.setMinutes(0, 0, 0);
  start.setMinutes(start.getMinutes() - start.getTimezoneOffset());
  form.elements.startsAt.value = start.toISOString().slice(0, 16);
}

async function init() {
  demo = (await (await fetch('/api/config')).json()).demo;
  document.getElementById('banner').hidden = !demo;
  phonePanel.hidden = !demo;
  setDefaultStart();
  await refresh();
  setInterval(refresh, 4000);
}

init();
