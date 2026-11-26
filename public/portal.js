const CODES = [
  ['+91', 'India'], ['+1', 'US / Canada'], ['+44', 'United Kingdom'], ['+61', 'Australia'],
  ['+971', 'UAE'], ['+65', 'Singapore'], ['+49', 'Germany'], ['+33', 'France'],
];

let config = {};
let picker;
let selection = null;
let booking = null;
let pollTimer;

const whenFormat = () => formatter(config.timezone, { dateStyle: 'full', timeStyle: 'short' });
const shortWhen = () => formatter(config.timezone, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function show(step) {
  for (const n of [1, 2, 3]) $(`step-${n}`).hidden = n !== step;
  for (const li of $('steps').children) {
    const n = Number(li.dataset.step);
    const finished = step === 3 && booking?.alertStatus === 'delivered';
    li.className = n < step || (finished && n === 3) ? 'done' : n === step ? 'current' : '';
  }
  const stage = $('stage');
  stage.style.animation = 'none';
  void stage.offsetWidth;
  stage.style.animation = 'rise 0.6s var(--ease) both';
}

function reminderTime(startsAt, lead) {
  return tidy(shortWhen().format(new Date(new Date(startsAt).getTime() - lead * 60_000)));
}

function renderSummary() {
  $('summary').replaceChildren(
    el('strong', '', selection.service),
    el('span', '', tidy(whenFormat().format(new Date(selection.startsAt)))),
    el('span', '', `Reminder text: ${reminderTime(selection.startsAt, selection.reminderMinutes)} (${duration(selection.reminderMinutes)} before)`),
  );
}

function alertPreview(b) {
  const date = tidy(formatter(config.timezone, { dateStyle: 'medium' }).format(new Date(b.startsAt)));
  const time = tidy(formatter(config.timezone, { timeStyle: 'short' }).format(new Date(b.startsAt)));
  return `Hello ${b.name},\n\nThank you for booking with ${config.businessName}.\n\nYour appointment for ${b.service} on ${date} at ${time} is confirmed.`;
}

function node(title, sub, state) {
  const n = el('div', `node ${state}`.trim());
  n.append(el('strong', '', title), el('small', '', sub));
  return n;
}

function renderFlow(b) {
  const failed = ['failed', 'blocked'].includes(b.alertStatus);
  const alertReached = ['sent', 'routed', 'delivered', 'read'].includes(b.alertStatus);
  const reminderReached = ['sent', 'delivered', 'read'].includes(b.reminderStatus);
  const channel = b.alertChannel ? ` via ${b.alertChannel.toUpperCase()}` : '';

  const nodes = [node('Booked', 'Saved just now', 'on')];
  if (b.alertStatus) {
    nodes.push(node('Confirmation text', `${label(b.alertStatus)}${channel}`, failed ? 'bad' : alertReached ? 'on' : ''));
  }
  nodes.push(
    node('Reminder text', reminderReached ? 'Delivered' : `Due ${reminderTime(b.startsAt, b.reminderMinutes)}`, reminderReached ? 'on' : ''),
    node('Your appointment', tidy(shortWhen().format(new Date(b.startsAt))), new Date(b.startsAt) < Date.now() ? 'on' : ''),
  );
  $('flow').style.gridTemplateColumns = `repeat(${nodes.length}, minmax(0, 1fr))`;
  $('flow').replaceChildren(...nodes);
}

function renderBooked(b) {
  const status = b.alertStatus;
  const failed = ['failed', 'blocked'].includes(status);
  const delivered = ['delivered', 'read'].includes(status);

  $('booked-sub').textContent = !status
    ? 'Your appointment is confirmed.'
    : failed
      ? `We could not text ${b.phone}. Your appointment is still booked.`
      : delivered
        ? `Confirmation texted to ${b.phone}.`
        : `Sending a confirmation text to ${b.phone}.`;
  $('d-service').textContent = b.service;
  $('d-name').textContent = b.name;
  $('d-when').textContent = tidy(whenFormat().format(new Date(b.startsAt)));
  $('d-phone').textContent = b.phone;

  renderFlow(b);
  $('alert-box').hidden = !status;
  $('alert-text').textContent = alertPreview(b);
  $('alert-chip').replaceChildren(pill(label(status ?? 'queued'), status ?? 'queued', delivered || failed ? '' : 'live'));
  $('alert-error').hidden = !failed;
  $('alert-error').textContent = failed ? `Delivery status: ${status}. Check the number, then book again.` : '';
  $('reminder-note').textContent = `We will text you a reminder on ${reminderTime(b.startsAt, b.reminderMinutes)}, ${duration(b.reminderMinutes)} before your appointment. Just reply to that message.`;

  const wasHidden = $('step-3').hidden;
  if (wasHidden) show(3);
  else for (const li of $('steps').children) if (Number(li.dataset.step) === 3 && delivered) li.className = 'done';
  return delivered || failed;
}

async function poll() {
  clearTimeout(pollTimer);
  const latest = await api(`/api/bookings/${booking.id}`).catch(() => null);
  if (latest) {
    booking = { ...booking, ...latest };
    if (renderBooked(booking)) return;
  }
  pollTimer = setTimeout(poll, 3000);
}

$('to-details').addEventListener('click', () => {
  renderSummary();
  show(2);
});

$('back').addEventListener('click', () => show(1));

$('details').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData($('details'));
  const digits = String(data.get('number')).replace(/\D/g, '').replace(/^0+/, '');
  const phone = `${data.get('code')}${digits}`;
  const submit = $('details').querySelector('button[type="submit"]');

  submit.disabled = true;
  const result = await attempt(() =>
    api('/api/bookings', {
      method: 'POST',
      body: JSON.stringify({ ...selection, name: String(data.get('name')).trim(), phone }),
    }),
  );
  submit.disabled = false;

  if (!result.ok) {
    picker.reset();
    show(1);
    return;
  }
  booking = result.value;
  sessionStorage.setItem('bookingId', booking.id);
  if (booking.alertError) showError(`Booked, but the text message failed: ${booking.alertError}`);
  renderBooked(booking);
  poll();
});

$('book-another').addEventListener('click', () => {
  clearTimeout(pollTimer);
  sessionStorage.removeItem('bookingId');
  booking = null;
  selection = null;
  $('details').reset();
  $('to-details').disabled = true;
  picker.reset();
  show(1);
});

async function init() {
  const result = await attempt(() => api('/api/config'));
  if (!result.ok) return;
  config = result.value;

  $('business').textContent = config.businessName;
  $('eyebrow').textContent = `${config.businessName} · Online booking`;
  document.title = `Book with ${config.businessName}`;
  if (config.sandbox) {
    $('mode').hidden = false;
    $('mode').className = 'mode sandbox';
    $('mode').textContent = 'Sandbox, nothing delivered';
  }

  const select = $('details').elements.code;
  for (const [code, country] of CODES) {
    select.append(new Option(`${code} ${country}`, code, false, code === config.defaultCountryCode));
  }

  picker = createPicker($('picker'), {
    config,
    withServices: true,
    onChange: (value) => {
      selection = value;
      $('to-details').disabled = value === null;
    },
  });
  rollify();

  const savedId = sessionStorage.getItem('bookingId');
  const saved = savedId ? await api(`/api/bookings/${savedId}`).catch(() => null) : null;
  if (saved) {
    booking = saved;
    renderBooked(saved);
    poll();
  } else {
    sessionStorage.removeItem('bookingId');
  }
}

init();
