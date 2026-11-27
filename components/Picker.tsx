import { useMemo } from 'react';
import { cssVars } from '@/lib/client/css';
import { formatter, tidy } from '@/lib/client/format';
import type { Picker as PickerModel } from '@/lib/client/picker';
import type { AppConfig } from '@/lib/client/types';
import { ReminderChoice } from './ReminderChoice';

interface Props {
  config: AppConfig;
  picker: PickerModel;
  withServices?: boolean;
}

export function Picker({ config, picker, withServices = false }: Props) {
  const { state, slots } = picker;
  const slotTime = useMemo(() => formatter(config.timezone, { timeStyle: 'short' }), [config.timezone]);
  const dayLabel = useMemo(() => formatter('UTC', { weekday: 'short', day: 'numeric', month: 'short' }), []);

  return (
    <>
      {withServices && (
        <div>
          <span className="eyebrow field-label">Service</span>
          <div className="chips">
            {config.services.map((service) => (
              <button key={service} type="button" className={`chip${state.service === service ? ' on' : ''}`} onClick={() => picker.selectService(service)}>
                {service}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={withServices ? 'field-gap' : undefined}>
        <span className="eyebrow field-label">Day</span>
        <div className="days">
          {config.days.map((key) => {
            const [weekday = '', ...rest] = dayLabel.format(new Date(`${key}T12:00:00Z`)).replace(',', '').split(' ');
            return (
              <button key={key} type="button" className={`day${state.date === key ? ' on' : ''}`} onClick={() => picker.selectDate(key)}>
                <small>{weekday}</small>
                <strong>{rest.join(' ')}</strong>
              </button>
            );
          })}
        </div>
      </div>

      <div className="field-gap">
        <span className="eyebrow field-label">Time ({config.timezone.replace('_', ' ')})</span>
        <div className="slots">
          {slots?.map((iso, n) => (
            <button key={iso} type="button" className={`slot${state.slot === iso ? ' on' : ''}`} style={cssVars({ '--n': n })} onClick={() => picker.selectSlot(iso)}>
              {tidy(slotTime.format(new Date(iso)))}
            </button>
          ))}
        </div>
        <p className="muted" hidden={slots === null || slots.length > 0}>
          No times left on this day. Try another day.
        </p>
      </div>

      <div className="field-gap">
        <span className="eyebrow field-label">Send my reminder</span>
        <ReminderChoice options={config.reminderOptions} timezone={config.timezone} slot={state.slot} lead={state.lead} onSelect={picker.selectLead} />
      </div>
    </>
  );
}
