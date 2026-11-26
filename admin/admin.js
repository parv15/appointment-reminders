let config = {};
let filter = 'all';
let selectedPhone = null;
let appointments = [];

const when = (iso) => tidy(formatter(config.timezone, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)));
const relative = (iso) => (new Date(iso) > Date.now() ? until(iso) : ago(iso));

function renderStats() {
  const live = appointments.filter((a) => a.status !== 'cancelled');
  $('stat-upcoming').textContent = live.filter((a) => a.status === 'scheduled').length;
  $('stat-confirmed').textContent = live.filter((a) => a.status === 'confirmed').length;
  $('stat-reschedule').textContent = live.filter((a) => a.status === 'reschedule_requested').length;
  $('stat-cancelled').textContent = appointments.length - live.length;
}

function renderList() {
  const list = $('list');
  list.replaceChildren();
  const rows = appointments.filter((a) => filter === 'all' || a.status === filter);
  $('empty').hidden = rows.length > 0;

  for (const a of rows) {
    const row = el('li', `row ${a.status}`);
    row.append(el('span', 'avatar', initials(a.name)));

    const who = el('div', 'who');
    who.append(el('strong', '', `${a.name}  `));
    who.firstChild.append(el('span', 'service', a.service));
    who.append(el('span', '', `${a.phone}  ·  ${when(a.startsAt)} (${until(a.startsAt)})`));

    const meta = el('div', 'meta');
    meta.append(el('span', `pill ${a.status}`, label(a.status)));
    if (a.confirmationMessageId) meta.append(el('span', `pill ${a.confirmationStatus ?? ''}`, `Alert ${label(a.confirmationStatus)}`));
    meta.append(el('span', `pill ${a.reminderStatus ?? ''}`, `Reminder ${label(a.reminderStatus)}`));
    if (a.lastReply) meta.append(el('span', 'reply', `Replied "${a.lastReply}" ${ago(a.lastReplyAt)}`));
    who.append(meta);
    row.append(who);

    const actions = el('div', 'actions');
    if (config.demo) {
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
        if (!confirm(`Cancel ${a.name}'s appointment? Their scheduled reminder is cancelled too.`)) return;
        cancel.disabled = true;
        const result = await attempt(() => api(`/api/admin/appointments/${a.id}/cancel`, { method: 'POST' }));
        if (result.ok) refresh();
        else cancel.disabled = false;
      });
      actions.append(cancel);
    }
    row.append(actions);
    list.append(row);
  }
}

const FEED = {
  booked: { icon: '+', text: (i) => `${i.name} booked ${i.service} for ${when(i.startsAt)}` },
  alert: { icon: '!', text: (i) => `Booking alert to ${i.phone}` },
  reminder: {
    icon: '🔔',
    text: (i) => (new Date(i.at) > Date.now() ? `Reminder to ${i.phone} scheduled for ${when(i.at)}` : `Reminder to ${i.phone}`),
  },
  reply: { icon: '↩', text: (i) => `${i.name} replied "${i.detail}"` },
};

function renderFeed(items) {
  const feed = $('feed');
  feed.replaceChildren();
  $('feed-empty').hidden = items.length > 0;
  for (const item of items) {
    const li = el('li', `feed-item ${item.kind}`);
    li.append(el('span', 'feed-icon', FEED[item.kind].icon));
    const body = el('div', 'feed-body');
    body.append(el('span', '', FEED[item.kind].text(item)));
    const meta = el('small', '', relative(item.at));
    if (item.status) {
      meta.append(' ', el('span', `pill ${item.status}`, label(item.status)));
    }
    body.append(meta);
    li.append(body);
    feed.append(li);
  }
}

function renderThread(messages) {
  const thread = $('thread');
  thread.replaceChildren();
  const customer = appointments.find((a) => a.phone === selectedPhone);
  $('phone-avatar').textContent = customer ? initials(customer.name) : '?';
  $('phone-name').textContent = customer ? customer.name : 'Customer phone';
  $('phone-number').textContent = selectedPhone ?? "Open a booking's phone";

  const mine = messages.filter((m) => m.phone === selectedPhone);
  if (mine.length === 0) {
    thread.append(el('p', 'thread-empty', 'No messages yet'));
    return;
  }
  for (const m of mine) {
    const bubble = el('div', `bubble ${m.direction}`, m.body);
    bubble.append(
      el('small', '', m.status === 'scheduled' ? `Scheduled for ${when(m.scheduledAt)}` : m.status === 'cancelled' ? 'Cancelled before sending' : ago(m.createdAt)),
    );
    if (m.status === 'scheduled') {
      const release = el('button', '', 'Deliver now');
      release.type = 'button';
      release.addEventListener('click', async () => {
        if ((await attempt(() => api(`/api/admin/demo/messages/${m.id}/release`, { method: 'POST' }))).ok) refresh();
      });
      bubble.append(release);
    }
    thread.append(bubble);
  }
  thread.scrollTop = thread.scrollHeight;
}

async function refresh() {
  try {
    appointments = await api('/api/admin/appointments');
    if (config.demo && !selectedPhone && appointments.length > 0) selectedPhone = appointments.at(-1).phone;
    renderStats();
    renderList();
    renderFeed(await api('/api/admin/activity'));
    if (config.demo) renderThread(await api('/api/admin/demo/messages'));
  } catch (err) {
    showError(err.message);
  }
}

async function sendReply(text) {
  if (!selectedPhone) {
    showError('Open a booking first, then reply as that customer.');
    return;
  }
  const result = await attempt(() => api('/api/admin/demo/replies', { method: 'POST', body: JSON.stringify({ phone: selectedPhone, text }) }));
  if (result.ok) refresh();
}

$('tabs').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  filter = button.dataset.filter;
  for (const b of $('tabs').children) b.classList.toggle('on', b === button);
  renderList();
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
  const result = await attempt(() => api('/api/config'));
  if (result.ok) {
    config = result.value;
    $('business').textContent = config.businessName;
    document.title = `${config.businessName} admin`;
    const mode = $('mode');
    mode.hidden = false;
    mode.className = `mode ${config.demo ? 'demo' : config.sandbox ? 'sandbox' : 'live'}`;
    mode.textContent = config.demo ? 'Demo, Sent simulated' : config.sandbox ? 'Sandbox, nothing delivered' : 'Live';
    $('phone').hidden = !config.demo;
  }
  await refresh();
  setInterval(refresh, 4000);
}

init();
