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
  consent: boolean;
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
          <input name="name" placeholder="Emily Carter" required autoComplete="name" value={values.name} onChange={(e) => onChange({ ...values, name: e.target.value })} />
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
              placeholder="415 555 0132"
              required
              autoComplete="tel-national"
              inputMode="tel"
              value={values.number}
              onChange={(e) => onChange({ ...values, number: e.target.value })}
            />
          </span>
          <small>We send the confirmation and the reminder to this number.</small>
        </label>
        <label className="consent">
          <input type="checkbox" name="consent" required checked={values.consent} onChange={(e) => onChange({ ...values, consent: e.target.checked })} />
          <span>
            I agree to receive appointment text messages from {config.businessName} at this number: a confirmation now and a reminder before the visit, plus replies to my messages. Message frequency varies, up to
            three texts per appointment. Msg and data rates may apply. Reply STOP to opt out or HELP for help.
            {(config.privacyUrl || config.termsUrl) && (
              <>
                {' '}
                {config.privacyUrl && (
                  <a href={config.privacyUrl} target="_blank" rel="noopener noreferrer">
                    Privacy Policy
                  </a>
                )}
                {config.privacyUrl && config.termsUrl && ' and '}
                {config.termsUrl && (
                  <a href={config.termsUrl} target="_blank" rel="noopener noreferrer">
                    Terms of Service
                  </a>
                )}
                .
              </>
            )}
          </span>
        </label>
        <div className="nav">
          <RollButton className="btn-ghost" text="Back" onClick={onBack} />
          <RollButton type="submit" className="btn-primary" text="Confirm booking" disabled={pending || !values.consent} />
        </div>
      </form>
    </>
  );
}
