const CODES = [
  ['+91', 'India'], ['+1', 'US / Canada'], ['+44', 'United Kingdom'], ['+61', 'Australia'],
  ['+971', 'UAE'], ['+65', 'Singapore'], ['+49', 'Germany'], ['+33', 'France'],
];

let config = {};
let state = { service: null, date: null, slot: null, booking: null };
let pollTimer;

const dayFormat = () => formatter(config.timezone, { weekday: 'short', day: 'numeric', month: 'short' });
const slotFormat = () => formatter(config.timezone, { timeStyle: 'short' });
const whenFormat = () => formatter(config.timezone, { dateStyle: 'full', timeStyle: 'short' });

function show(step) {
  for (const n of [1, 2, 3]) $(`step-${n}`).hidden = n !== step;
  for (const li of $('steps').children) {
    const n = Number(li.dataset.step);
    li.className = n < step || (step === 3 && n === 3 && state.booking?.alertStatus === 'delivered') ? 'done' : n === step ? 'current' : '';
  }
}

function businessDays() {
  const days = [];
  const keys = new Set();
  for (let i = 0; i <= config.maxAdvanceDays + 1; i++) {
    const instant = new Date(Date.now() + i * 86_400_000);
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
    if (!keys.has(key) && days.length <= config.maxAdvanceDays) {
      keys.add(key);
      days.push({ key, instant });
    }
  }
  return days;
}

function renderServices() {
  const box = $('services');
  box.replaceChildren();
  for (const service of config.services) {
    const chip = el('button', `chip${state.service === service ? ' on' : ''}`, service);
    chip.type = 'button';
    chip.setAttribute('role', 'radio');
    chip.setAttribute('aria-checked', String(state.service === service));
    chip.addEventListener('click', () => {
      state.service = service;
      renderServices();
      updateContinue();
    });
    box.append(chip);
  }
}

function renderDays() {
  const box = $('days');
  box.replaceChildren();
  for (const { key, instant } of businessDays()) {
    const [weekday, ...rest] = dayFormat().format(instant).replace(',', '').split(' ');
    const button = el('button', `day${state.date === key ? ' on' : ''}`);
    button.type = 'button';
    button.append(el('small', '', weekday), el('strong', '', rest.join(' ')));
    button.addEventListener('click', () => selectDate(key));
    box.append(button);
  }
}

async function selectDate(key) {
  state.date = key;
  state.slot = null;
  renderDays();
  updateContinue();
  const result = await attempt(() => api(`/api/slots?date=${key}`));
  if (!result.ok || state.date !== key) return;

  const box = $('slots');
  box.replaceChildren();
  $('no-slots').hidden = result.value.slots.length > 0;
  for (const iso of result.value.slots) {
    const button = el('button', 'slot', tidy(slotFormat().format(new Date(iso))));
    button.type = 'button';
    button.addEventListener('click', () => {
      state.slot = iso;
      for (const s of box.children) s.classList.toggle('on', s === button);
      updateContinue();
    });
    box.append(button);
  }
}

function updateContinue() {
  $('to-details').disabled = !(state.service && state.slot);
}

function renderSummary() {
  const box = $('summary');
  box.replaceChildren(
    el('strong', '', state.service),
    el('span', '', tidy(whenFormat().format(new Date(state.slot)))),
  );
}

function alertPreview(b) {
  const date = tidy(formatter(config.timezone, { dateStyle: 'medium' }).format(new Date(b.startsAt)));
  const time = tidy(slotFormat().format(new Date(b.startsAt)));
  return `Hello ${b.name},\n\nThank you for booking with ${config.businessName}.\n\nYour appointment for ${b.service} on ${date} at ${time} is confirmed.`;
}

function renderBooked(b) {
  const status = b.alertStatus;
  const failed = status === 'failed' || status === 'blocked';
  const delivered = status === 'delivered' || status === 'read';
  const rank = delivered ? 3 : status === 'sent' ? 2 : 1;

  $('booked-sub').textContent = !b.alertStatus
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
  $('alert-box').hidden = !b.alertStatus;
  $('alert-text').textContent = alertPreview(b);
  $('alert-chip').className = `pill ${status ?? 'queued'}`;
  $('alert-chip').textContent = label(status ?? 'queued');
  [...$('track').children].forEach((li, i) => li.classList.toggle('on', !failed && i < rank));
  $('alert-error').hidden = !failed;
  $('alert-error').textContent = failed ? `Delivery status: ${status}. Check the number and try again from the admin dashboard.` : '';
  $('reminder-note').textContent = `We will also text you a reminder ${config.reminderLeadMinutes >= 1440 ? `${Math.round(config.reminderLeadMinutes / 1440)} day before` : `${Math.round(config.reminderLeadMinutes / 60)} hours before`}.`;
  show(3);
  return delivered || failed;
}

async function poll() {
  clearTimeout(pollTimer);
  try {
    state.booking = { ...state.booking, ...(await api(`/api/bookings/${state.booking.id}`)) };
    if (renderBooked(state.booking)) return;
  } catch {
    // keep showing the last known state and retry
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
  submit.textContent = 'Booking...';
  const result = await attempt(() =>
    api('/api/bookings', {
      method: 'POST',
      body: JSON.stringify({ service: state.service, name: String(data.get('name')).trim(), phone, startsAt: state.slot }),
    }),
  );
  submit.disabled = false;
  submit.textContent = 'Confirm booking';

  if (!result.ok) {
    if (/no longer available|just taken/.test(document.getElementById('toast').textContent)) {
      show(1);
      selectDate(state.date);
    }
    return;
  }
  state.booking = result.value;
  if (result.value.alertError) showError(`Booked, but the text message failed: ${result.value.alertError}`);
  renderBooked(state.booking);
  poll();
});

$('book-another').addEventListener('click', () => {
  clearTimeout(pollTimer);
  $('details').reset();
  state = { service: config.services[0], date: state.date, slot: null, booking: null };
  renderServices();
  show(1);
  selectDate(state.date);
  updateContinue();
});

async function init() {
  const result = await attempt(() => api('/api/config'));
  if (!result.ok) return;
  config = result.value;

  $('business').textContent = config.businessName;
  document.title = `Book with ${config.businessName}`;
  $('tz-note').textContent = `(${config.timezone.replace('_', ' ')})`;
  const mode = $('mode');
  if (config.demo || config.sandbox) {
    mode.hidden = false;
    mode.className = `mode ${config.demo ? 'demo' : 'sandbox'}`;
    mode.textContent = config.demo ? 'Demo, Sent simulated' : 'Sandbox, nothing delivered';
  }

  const select = $('details').elements.code;
  for (const [code, country] of CODES) {
    select.append(new Option(`${code} ${country}`, code, false, code === config.defaultCountryCode));
  }

  state.service = config.services[0];
  renderServices();
  renderDays();
  show(1);
  for (const { key } of businessDays()) {
    const open = await attempt(() => api(`/api/slots?date=${key}`));
    if (open.ok && open.value.slots.length > 0) {
      await selectDate(key);
      return;
    }
  }
  await selectDate(businessDays()[0].key);
}

init();
