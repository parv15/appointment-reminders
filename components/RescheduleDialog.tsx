import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client/api';
import { usePicker } from '@/lib/client/picker';
import type { AppConfig, Appointment, AppointmentChange } from '@/lib/client/types';
import { Picker } from './Picker';
import { RollButton } from './Roll';
import { useToast } from './Toast';

interface Props {
  config: AppConfig;
  appointment: Appointment | null;
  onClose: () => void;
  onMoved: (change: AppointmentChange) => void;
}

export function RescheduleDialog({ config, appointment, onClose, onMoved }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (appointment && !node.open) node.showModal();
    if (!appointment && node.open) node.close();
  }, [appointment]);

  return (
    <dialog ref={dialog} onClose={onClose}>
      {appointment && <RescheduleForm key={appointment.id} config={config} appointment={appointment} onClose={onClose} onMoved={onMoved} />}
    </dialog>
  );
}

function RescheduleForm({ config, appointment, onClose, onMoved }: Props & { appointment: Appointment }) {
  const { attempt } = useToast();
  const picker = usePicker(config, appointment.id);
  const [pending, setPending] = useState(false);
  const { value } = picker;

  const confirm = async () => {
    if (!value) return;
    setPending(true);
    const result = await attempt(() =>
      api<AppointmentChange>(`/api/admin/appointments/${appointment.id}/reschedule`, {
        method: 'POST',
        body: { startsAt: value.startsAt, reminderMinutes: value.reminderMinutes },
      }),
    );
    setPending(false);
    if (result.ok) onMoved(result.value);
  };

  return (
    <>
      <div className="dialog-head">
        <div>
          <p className="eyebrow">Reschedule</p>
          <h2>
            {appointment.name}, {appointment.service}
          </h2>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="dialog-body">
        <div>
          <Picker config={config} picker={picker} />
        </div>
      </div>
      <div className="dialog-foot">
        <RollButton className="btn-primary" text="Move appointment" disabled={value === null || pending} onClick={confirm} />
      </div>
    </>
  );
}
