import type { FormEvent } from 'react';
import { reminderTime, fullWhen } from '@/lib/client/booking';
import { duration } from '@/lib/client/format';
import { countryOptions } from '@/lib/client/phone';
import type { AppConfig, PickerValue } from '@/lib/client/types';
import { RollButton } from './Roll';

export interface DetailsValues {
  name: string;
  code: string;
  number: string;
}

interface Props {
  config: AppConfig;
  selection: PickerValue | null;
  values: DetailsValues;
  pending: boolean;
  onChange: (values: DetailsValues) => void;
  onBack: () => void;
  onSubmit: () => void;
}

export function DetailsForm({ config, selection, values, pending, onChange, onBack, onSubmit }: Props) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <>
      {selection && (
        <div className="summary">
          <strong>{selection.service}</strong>
          <span>{fullWhen(config.timezone, selection.startsAt)}</span>
          <span>
            Reminder text on {reminderTime(config.timezone, selection.startsAt, selection.reminderMinutes)}, {duration(selection.reminderMinutes)} before
          </span>
        </div>
      )}
      <form className="form" onSubmit={submit}>
        <label>
          Full name
          <input name="name" placeholder="Ada Lovelace" required autoComplete="name" value={values.name} onChange={(e) => onChange({ ...values, name: e.target.value })} />
        </label>
        <label>
          Mobile number
          <span className="phone-field">
            <select name="code" aria-label="Country code" value={values.code} onChange={(e) => onChange({ ...values, code: e.target.value })}>
              {countryOptions(config.defaultCountryCode).map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              name="number"
              placeholder="98765 43210"
              required
              autoComplete="tel-national"
              inputMode="tel"
              value={values.number}
              onChange={(e) => onChange({ ...values, number: e.target.value })}
            />
          </span>
          <small>We send the confirmation and the reminder to this number.</small>
        </label>
        <div className="nav">
          <RollButton className="btn-ghost" text="Back" onClick={onBack} />
          <RollButton type="submit" className="btn-primary" text="Confirm booking" disabled={pending} />
        </div>
      </form>
    </>
  );
}
