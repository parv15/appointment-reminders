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
const dateOnly = (iso) => tidy(formatter(config.timezone, { dateStyle: 'medium' }).format(new Date(iso)));
const timeOnly = (iso) => tidy(formatter(config.timezone, { timeStyle: 'short' }).format(new Date(iso)));

function show(step) {
  for (const n of [1, 2, 3]) $(`step-${n}`).hidden = n !== step;
  for (const li of $('steps').children) {
    const n = Number(li.dataset.step);
    li.className = n < step ? 'done' : n === step ? 'current' : '';
  }
  const stage = $('stage');
  stage.style.animation = 'none';
  void stage.offsetWidth;
  stage.style.animation = 'rise 0.6s var(--ease) both';
}

function reminderTime(startsAt, lead) {
  return tidy(shortWhen().format(new Date(new Date(startsAt).getTime() - lead * 60_000)));
}

function withVars(parts) {
  const fragment = document.createDocumentFragment();
  for (const part of parts) {
    fragment.append(typeof part === 'string' ? part : el('span', 'var', part.v));
  }
  return fragment;
}

function bubble(parts, footer, className = '') {
  const node = el('div', `bubble ${className}`.trim());
  node.append(withVars(parts));
  if (footer) node.append(el('small', '', footer));
  return node;
}

function confirmationParts(name, service, startsAt) {
  return [
    'Hello ', { v: name }, ',\n\nThank you for booking with ', { v: config.businessName },
    '.\n\nYour appointment for ', { v: service }, ' on ', { v: dateOnly(startsAt) }, ' at ', { v: timeOnly(startsAt) },
    config.repliesInText ? ' is confirmed.\n\nReply C to confirm you will attend or R to reschedule.' : ' is confirmed.',
  ];
}

function reminderParts(name, startsAt) {
  return [
    'Hello ', { v: name }, ',\n\nThis is a reminder about your upcoming appointment with ', { v: config.businessName },
    ' on ', { v: dateOnly(startsAt) }, ' at ', { v: timeOnly(startsAt) },
    config.repliesInText ? '.\n\nReply C to confirm or R to reschedule.' : '.\n\nWe look forward to seeing you!',
  ];
}

function renderPreview() {
  const thread = $('thread');
  thread.replaceChildren();
  $('phone-title').textContent = config.businessName;

  const source = booking ?? selection;
  if (!source) {
    thread.append(bubble(['Pick a time to preview the texts you will get.'], null, 'ghost'));
    return;
  }

  const name = booking?.name ?? ($('details').elements.name.value.trim() || 'Your name');
  const lead = booking?.reminderMinutes ?? selection.reminderMinutes;
  const status = booking?.alertStatus;
  const channel = booking?.alertChannel ? ` via ${booking.alertChannel.toUpperCase()}` : '';
  const reminderReached = ['sent', 'delivered', 'read'].includes(booking?.reminderStatus);

  thread.append(
    bubble(
      confirmationParts(name, source.service, source.startsAt),
      booking ? (status ? `${label(status)}${channel}` : 'Sent') : 'Sent right away',
    ),
    bubble(
      reminderParts(name, source.startsAt),
      reminderReached ? `Delivered${channel}` : `Due ${reminderTime(source.startsAt, lead)}`,
      reminderReached ? '' : 'ghost',
    ),
  );
}

function renderChecks(b) {
  const status = b.alertStatus;
  const failed = ['failed', 'blocked'].includes(status);
  const reached = ['sent', 'routed', 'delivered', 'read'].includes(status);
  const delivered = ['delivered', 'read'].includes(status);
  const reminderReached = ['sent', 'delivered', 'read'].includes(b.reminderStatus);

  const items = [
    ['Time slot reserved', 'done'],
    [`Reminder scheduled for ${reminderTime(b.startsAt, b.reminderMinutes)}`, 'done'],
  ];
  if (status) {
    items.push([failed ? 'Confirmation text failed' : reached ? 'Confirmation text sent' : 'Confirmation text is queued', failed ? 'bad' : reached ? 'done' : 'active']);
    items.push([delivered ? 'Confirmation text delivered' : 'Waiting for delivery', failed ? 'bad' : delivered ? 'done' : 'active']);
  }
  items.push([reminderReached ? 'Reminder text delivered' : 'Reminder text not due yet', reminderReached ? 'done' : '']);

  $('check-list').replaceChildren(
    ...items.map(([text, state]) => {
      const li = el('li', state);
      li.append(el('span', 'box', state === 'done' ? '\u2713' : state === 'bad' ? '\u00d7' : ''), el('span', '', text));
      return li;
    }),
  );
  $('checks').hidden = false;
}

function renderSummary() {
  $('summary').replaceChildren(
    el('strong', '', selection.service),
    el('span', '', tidy(whenFormat().format(new Date(selection.startsAt)))),
    el('span', '', `Reminder text on ${reminderTime(selection.startsAt, selection.reminderMinutes)}, ${duration(selection.reminderMinutes)} before`),
  );
}

const BOOKED_TITLES = {
  scheduled: 'You are booked',
  confirmed: 'You confirmed your appointment',
  reschedule_requested: 'We got your request to reschedule',
  cancelled: 'This appointment was cancelled',
};

function renderBooked(b) {
  const status = b.alertStatus;
  const failed = ['failed', 'blocked'].includes(status);
  const delivered = ['delivered', 'read'].includes(status);
  const cancelled = b.status === 'cancelled';

  $('booked-title').textContent = BOOKED_TITLES[b.status] ?? BOOKED_TITLES.scheduled;
  $('booked-check').classList.toggle('off', cancelled);
  $('reply-guide').hidden = cancelled || config.repliesPossible === false;
  $('booked-sub').textContent = cancelled
    ? 'The clinic cancelled this appointment. You can book another time below.'
    : b.status === 'reschedule_requested'
      ? 'We will contact you soon to find a new time.'
      : !status
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
  $('alert-error').hidden = !failed;
  $('alert-error').textContent = failed ? `Delivery status: ${status}. Check the number, then book again.` : '';
  $('reminder-note').textContent = `We will text you a reminder on ${reminderTime(b.startsAt, b.reminderMinutes)}, ${duration(b.reminderMinutes)} before your appointment.${config.repliesPossible === false ? '' : ' You can reply to that message to confirm or to reschedule.'}`;

  renderPreview();
  renderChecks(b);
  if ($('step-3').hidden) show(3);
  else for (const li of $('steps').children) if (Number(li.dataset.step) === 3 && delivered) li.className = 'done';
  return cancelled || delivered || failed;
}

function forgetBooking() {
  clearTimeout(pollTimer);
  sessionStorage.removeItem('bookingId');
  booking = null;
}

async function poll(ticks = 0) {
  clearTimeout(pollTimer);
  const id = booking?.id;
  if (!id) return;
  let settled = false;
  try {
    booking = { ...booking, ...(await api(`/api/bookings/${id}`)) };
    settled = renderBooked(booking);
  } catch (err) {
    if (err.status === 404) {
      forgetBooking();
      selection = null;
      picker.reset();
      show(1);
      showError('That booking no longer exists. You can book a new time.');
      return;
    }
  }
  if (ticks < (settled ? 40 : 600)) pollTimer = setTimeout(() => poll(ticks + 1), settled ? 15_000 : 3000);
}

$('to-details').addEventListener('click', () => {
  renderSummary();
  show(2);
  renderPreview();
});

$('back').addEventListener('click', () => show(1));
$('details').elements.name.addEventListener('input', renderPreview);

$('details').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData($('details'));
  const typed = String(data.get('number')).trim();
  const digits = typed.replace(/\D/g, '');
  const phone = typed.startsWith('+')
    ? `+${digits}`
    : digits.startsWith('00')
      ? `+${digits.slice(2)}`
      : `${data.get('code')}${digits.replace(/^0+/, '')}`;
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
    if (result.error.code === 'slot_unavailable') {
      picker.reset();
      show(1);
    }
    return;
  }
  booking = result.value;
  sessionStorage.setItem('bookingId', booking.id);
  if (booking.alertError) showError(`Booked, but the text message failed: ${booking.alertError}`);
  renderBooked(booking);
  poll();
});

$('book-another').addEventListener('click', () => {
  forgetBooking();
  selection = null;
  $('details').reset();
  $('to-details').disabled = true;
  $('checks').hidden = true;
  picker.reset();
  show(1);
  renderPreview();
});

$('next-pill').addEventListener('click', async () => {
  await picker.pickFirst();
  $('stage').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

async function init() {
  const result = await attempt(() => api('/api/config'));
  if (!result.ok) return;
  config = result.value;

  $('business').textContent = config.businessName;
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
      if (!booking) renderPreview();
    },
    onFirstSlot: (iso) => {
      $('next-label').textContent = `Next available: ${tidy(shortWhen().format(new Date(iso)))}`;
      $('next-pill').hidden = false;
    },
  });
  rollify();
  renderPreview();

  const savedId = sessionStorage.getItem('bookingId');
  const saved = savedId ? await api(`/api/bookings/${encodeURIComponent(savedId)}`).catch(() => null) : null;
  if (saved) {
    booking = saved;
    renderBooked(saved);
    poll();
  } else {
    sessionStorage.removeItem('bookingId');
  }
}

init();
