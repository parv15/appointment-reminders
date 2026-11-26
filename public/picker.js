const MIN_REMINDER_GAP_MS = 3 * 60_000;

function createPicker(root, { config, excludeId = null, withServices = false, onChange = () => {}, onFirstSlot = () => {} }) {
  const state = { service: config.services[0], date: null, slot: null, lead: null };
  const slotTime = formatter(config.timezone, { timeStyle: 'short' });
  const dayLabel = formatter('UTC', { weekday: 'short', day: 'numeric', month: 'short' });
  const reminderAt = formatter(config.timezone, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  const feasible = (minutes) => state.slot && new Date(state.slot) - minutes * 60_000 - Date.now() >= MIN_REMINDER_GAP_MS;

  root.replaceChildren();
  const parts = {
    services: el('div', 'chips'),
    days: el('div', 'days'),
    slots: el('div', 'slots'),
    none: el('p', 'muted', 'No times left on this day. Try another day.'),
    reminders: el('div', 'chips'),
    preview: el('p', 'reminder-preview'),
  };
  parts.none.hidden = true;

  const group = (title, body, extra = '') => {
    const wrap = el('div', extra);
    wrap.append(el('span', 'eyebrow field-label', title), ...body);
    return wrap;
  };
  if (withServices) root.append(group('Service', [parts.services]));
  root.append(
    group('Day', [parts.days], withServices ? 'field-gap' : ''),
    group(`Time (${config.timezone.replace('_', ' ')})`, [parts.slots, parts.none], 'field-gap'),
    group('Send my reminder', [parts.reminders, parts.preview], 'field-gap'),
  );

  function value() {
    return state.slot && state.lead ? { service: state.service, startsAt: state.slot, reminderMinutes: state.lead } : null;
  }

  function emit() {
    onChange(value());
  }

  function renderServices() {
    parts.services.replaceChildren(
      ...config.services.map((service) => {
        const chip = el('button', `chip${state.service === service ? ' on' : ''}`, service);
        chip.type = 'button';
        chip.addEventListener('click', () => {
          state.service = service;
          renderServices();
          emit();
        });
        return chip;
      }),
    );
  }

  function renderReminders() {
    if (state.slot && !feasible(state.lead ?? 0)) {
      state.lead = config.reminderOptions.find(feasible) ?? null;
    }
    if (!state.lead) state.lead = config.reminderOptions.find((m) => !state.slot || feasible(m)) ?? null;

    parts.reminders.replaceChildren(
      ...config.reminderOptions.map((minutes) => {
        const chip = el('button', `chip${state.lead === minutes ? ' on' : ''}`, `${duration(minutes)} before`);
        chip.type = 'button';
        chip.disabled = Boolean(state.slot) && !feasible(minutes);
        chip.addEventListener('click', () => {
          state.lead = minutes;
          renderReminders();
          emit();
        });
        return chip;
      }),
    );

    parts.preview.replaceChildren();
    if (!state.slot) {
      parts.preview.textContent = 'Pick a time to see when the reminder is sent.';
    } else if (state.lead) {
      const at = tidy(reminderAt.format(new Date(new Date(state.slot).getTime() - state.lead * 60_000)));
      parts.preview.append('The reminder text goes out ', el('b', '', at), '.');
    } else {
      parts.preview.textContent = 'This time is too close for a reminder. Pick a later time.';
    }
  }

  function days() {
    return config.days.map((key) => ({ key, instant: new Date(`${key}T12:00:00Z`) }));
  }

  function renderDays() {
    parts.days.replaceChildren(
      ...days().map(({ key, instant }) => {
        const [weekday, ...rest] = dayLabel.format(instant).replace(',', '').split(' ');
        const button = el('button', `day${state.date === key ? ' on' : ''}`);
        button.type = 'button';
        button.append(el('small', '', weekday), el('strong', '', rest.join(' ')));
        button.addEventListener('click', () => selectDate(key));
        return button;
      }),
    );
  }

  async function loadSlots(key) {
    const query = excludeId ? `&exclude=${encodeURIComponent(excludeId)}` : '';
    return (await attempt(() => api(`/api/slots?date=${key}${query}`))).value?.slots ?? null;
  }

  async function selectDate(key) {
    state.date = key;
    state.slot = null;
    renderDays();
    renderReminders();
    emit();

    const slots = await loadSlots(key);
    if (slots === null || state.date !== key) return;

    parts.none.hidden = slots.length > 0;
    parts.slots.replaceChildren(
      ...slots.map((iso, n) => {
        const button = el('button', 'slot', tidy(slotTime.format(new Date(iso))));
        button.type = 'button';
        button.style.setProperty('--n', n);
        button.addEventListener('click', () => {
          state.slot = iso;
          for (const s of parts.slots.children) s.classList.toggle('on', s === button);
          renderReminders();
          emit();
        });
        return button;
      }),
    );
  }

  let first = null;

  async function selectFirstOpenDay() {
    for (const { key } of days()) {
      const slots = await loadSlots(key);
      if (slots && slots.length > 0) {
        first = { key, iso: slots[0] };
        onFirstSlot(slots[0]);
        await selectDate(key);
        return;
      }
    }
    await selectDate(days()[0].key);
  }

  async function pickFirst() {
    if (!first) return;
    await selectDate(first.key);
    parts.slots.querySelector('.slot')?.click();
  }

  renderServices();
  renderDays();
  renderReminders();
  selectFirstOpenDay();

  return {
    value,
    pickFirst,
    reset() {
      Object.assign(state, { service: config.services[0], date: null, slot: null, lead: null });
      renderServices();
      renderReminders();
      selectFirstOpenDay();
      emit();
    },
  };
}
