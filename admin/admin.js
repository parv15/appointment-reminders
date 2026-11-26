let config = {};
let filter = 'all';
let appointments = [];
let picker = null;
let rescheduleTarget = null;
let rescheduleSelection = null;
const seen = new Set();

function appearIfNew(node, key, n) {
  node.style.setProperty('--n', n);
  if (!seen.has(key)) {
    seen.add(key);
    node.classList.add('appear');
  }
}

const when = (iso) => tidy(formatter(config.timezone, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)));
const relative = (iso) => (new Date(iso) > Date.now() ? until(iso) : ago(iso));
const channelName = (channel) => (channel ? channel.toUpperCase() : null);
const listOf = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`);

const isPast = (a) => new Date(a.startsAt) <= Date.now();
const isFuture = (a) => a.status !== 'cancelled' && !isPast(a);

function renderStats() {
  const future = appointments.filter(isFuture);
  const attention = appointments.filter((a) => a.attention).length;
  $('stat-upcoming').textContent = future.filter((a) => a.status === 'scheduled' && !a.attention).length;
  $('stat-confirmed').textContent = future.filter((a) => a.status === 'confirmed').length;
  $('stat-attention').textContent = attention;
  $('stat-attention-card').classList.toggle('hot', attention > 0);
  $('stat-cancelled').textContent = appointments.filter((a) => a.status === 'cancelled').length;
}

function matchesFilter(a) {
  if (filter === 'all') return true;
  if (filter === 'attention') return Boolean(a.attention);
  if (filter === 'past') return a.status !== 'cancelled' && isPast(a);
  if (filter === 'scheduled') return isFuture(a) && a.status === 'scheduled' && !a.attention;
  if (filter === 'confirmed') return isFuture(a) && a.status === 'confirmed';
  return a.status === filter;
}

function reminderPill(a) {
  if (!a.reminderMessageId) return null;
  const status = a.reminderStatus ?? 'queued';
  if (status === 'scheduled') {
    const lead = a.reminderLeadMinutes ?? config.reminderOptions[0];
    const at = new Date(new Date(a.startsAt).getTime() - lead * 60_000);
    return pill(`Reminder due ${when(at)}`, status);
  }
  const channel = channelName(a.reminderChannel);
  return pill(`Reminder ${label(status)}${channel ? ` via ${channel}` : ''}`, status);
}

function renderList() {
  const list = $('list');
  list.replaceChildren();
  const group = (a) => (a.status === 'cancelled' ? 2 : isPast(a) ? 1 : 0);
  const rows = appointments
    .filter(matchesFilter)
    .sort((a, b) => group(a) - group(b) || (group(a) === 0 ? -1 : 1) * (new Date(b.startsAt) - new Date(a.startsAt)));
  $('empty').hidden = rows.length > 0;

  rows.forEach((a, n) => {
    const row = el('li', `row ${a.status}${a.attention ? ` attention ${a.attention}` : ''}`);
    appearIfNew(row, `row:${a.id}`, n);
    row.append(el('span', 'avatar', initials(a.name)));

    const who = el('div', 'who');
    const name = el('strong', '', a.name);
    name.append(el('span', 'service', a.service));
    who.append(name, el('span', '', `${a.phone}  ·  ${when(a.startsAt)} (${until(a.startsAt)})`));

    const meta = el('div', 'meta');
    meta.append(isPast(a) && a.status !== 'cancelled' ? pill('past', '') : pill(label(a.status), a.status));
    if (a.attention === 'reschedule') meta.append(pill('Asked to reschedule', 'reschedule_requested'));
    if (a.attention === 'no_reply') meta.append(pill('No reply yet', 'failed'));
    if (a.confirmationMessageId) {
      const channel = channelName(a.confirmationChannel);
      meta.append(pill(`Confirmation ${label(a.confirmationStatus)}${channel ? ` via ${channel}` : ''}`, a.confirmationStatus));
    }
    const reminder = reminderPill(a);
    if (reminder) meta.append(reminder);
    if (a.lastReply) meta.append(el('span', 'reply', `Replied "${a.lastReply}" ${ago(a.lastReplyAt)}`));
    who.append(meta);
    row.append(who);

    const actions = el('div', 'actions');
    if (isFuture(a)) {
      const move = el('button', `btn btn-sm ${a.attention === 'reschedule' ? 'btn-primary' : 'btn-ghost'}`, 'Reschedule');
      move.type = 'button';
      move.addEventListener('click', () => openReschedule(a));

      const cancel = el('button', 'btn btn-sm btn-ghost btn-danger', 'Cancel');
      cancel.type = 'button';
      cancel.addEventListener('click', async () => {
        if (!confirm(`Cancel ${a.name}'s appointment? Their scheduled reminder is cancelled too, and they get a text saying so.`)) return;
        cancel.disabled = true;
        const result = await attempt(() => api(`/api/admin/appointments/${a.id}/cancel`, { method: 'POST' }));
        if (result.ok) {
          if (result.value.confirmationError) showError(`Cancelled, but the customer text failed: ${result.value.confirmationError}`);
          refresh();
        } else cancel.disabled = false;
      });
      actions.append(move, cancel);
    }
    row.append(actions);
    list.append(row);
  });
}

const FEED = {
  booked: { icon: '+', text: (i) => `${i.name} booked ${i.service} for ${when(i.startsAt)}` },
  alert: { icon: '!', text: (i) => `Confirmation text sent to ${i.phone}` },
  reminder: {
    icon: 'R',
    text: (i) => (i.status === 'scheduled' ? `Reminder for ${i.phone} is due ${when(i.detail)}` : `Reminder sent to ${i.phone}`),
  },
  reply: { icon: '\u21A9', text: (i) => `${i.name} replied "${i.detail}"` },
};

function renderFeed(items) {
  const feed = $('feed');
  feed.replaceChildren();
  $('feed-empty').hidden = items.length > 0;

  items.forEach((item, n) => {
    const li = el('li', `feed-item ${item.kind}`);
    appearIfNew(li, `feed:${item.kind}:${item.appointmentId}:${item.at}`, n);
    li.append(el('span', 'feed-icon', FEED[item.kind].icon));

    const body = el('div', 'feed-body');
    body.append(el('span', '', FEED[item.kind].text(item)));
    const meta = el('small', '', relative(item.at));
    if (item.status) meta.append(pill(label(item.status), item.status));
    if (item.channel) meta.append(el('span', '', channelName(item.channel)));
    body.append(meta);

    li.append(body);
    feed.append(li);
  });
}

function renderNotice(templates) {
  const stale = templates.filter((t) => t.using !== t.preferred);
  const parts = [];

  if (config.repliesPossible === false) {
    parts.push(
      el('strong', '', 'Customers cannot reply to your texts yet'),
      el('span', '', 'Your Sent account only has a sender ID that sends one way, or no sender at all. Add an SMS number, WhatsApp or RCS in the Sent dashboard before you rely on C and R replies.'),
    );
  }
  if (stale.length > 0) {
    parts.push(
      el('strong', '', 'Your texts do not tell customers how to reply yet'),
      el('span', '', 'Your own templates are waiting for approval from Sent. Until then the standard templates are used, and they leave out "Reply C to confirm or R to reschedule". The app switches over by itself once yours are approved.'),
      ...stale.map((t) => el('span', 'muted', `${t.purpose}: "${t.preferred}" is ${t.preferredStatus.toLowerCase()}, so texts use "${t.using}" for now.`)),
    );
  }
  $('notice').hidden = parts.length === 0;
  $('notice').replaceChildren(...parts);
}

async function refresh() {
  try {
    appointments = await api('/api/admin/appointments');
    renderStats();
    renderList();
    renderFeed(await api('/api/admin/activity'));
  } catch (err) {
    showError(err.message);
  }
}

function openReschedule(appointment) {
  rescheduleTarget = appointment;
  rescheduleSelection = null;
  $('reschedule-title').textContent = `${appointment.name}, ${appointment.service}`;
  $('reschedule-confirm').disabled = true;
  picker = createPicker($('reschedule-picker'), {
    config,
    excludeId: appointment.id,
    onChange: (value) => {
      rescheduleSelection = value;
      $('reschedule-confirm').disabled = value === null;
    },
  });
  $('reschedule').showModal();
}

$('reschedule-close').addEventListener('click', () => $('reschedule').close());

$('reschedule-confirm').addEventListener('click', async () => {
  if (!rescheduleSelection) return;
  const button = $('reschedule-confirm');
  button.disabled = true;
  const result = await attempt(() =>
    api(`/api/admin/appointments/${rescheduleTarget.id}/reschedule`, {
      method: 'POST',
      body: JSON.stringify({ startsAt: rescheduleSelection.startsAt, reminderMinutes: rescheduleSelection.reminderMinutes }),
    }),
  );
  button.disabled = false;
  if (!result.ok) return;

  $('reschedule').close();
  if (result.value.confirmationError) showError(`Moved, but the customer text failed: ${result.value.confirmationError}`);
  refresh();
});

$('tabs').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  filter = button.dataset.filter;
  for (const b of $('tabs').children) b.classList.toggle('on', b === button);
  renderList();
});

$('sign-out').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' }).catch(() => undefined);
  location.href = '/admin/login';
});

async function init() {
  const session = await api('/api/admin/session').catch(() => null);
  $('sign-out').hidden = !session?.required;
  const result = await attempt(() => api('/api/config'));
  if (result.ok) {
    config = result.value;
    $('business').textContent = config.businessName;
    $('tagline').textContent = `Customers choose whether the reminder arrives ${listOf(config.reminderOptions.map(duration))} before the appointment.`;
    document.title = `${config.businessName} admin`;
    const mode = $('mode');
    mode.hidden = false;
    mode.className = `mode ${config.sandbox ? 'sandbox' : 'live'}`;
    mode.textContent = config.sandbox ? 'Sandbox, nothing delivered' : 'Live';
  }
  rollify();
  await refresh();
  api('/api/admin/templates').then(renderNotice).catch(() => undefined);
  setInterval(() => {
    if (!document.hidden && !$('reschedule').open) refresh();
  }, 4000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });
}

init();
