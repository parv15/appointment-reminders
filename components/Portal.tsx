'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '@/lib/client/api';
import { isDelivered, isFailed, shortWhen } from '@/lib/client/booking';
import { restartAnimation } from '@/lib/client/dom';
import { useConfig, useDocumentTitle } from '@/lib/client/hooks';
import { normalizePhone } from '@/lib/client/phone';
import { usePicker } from '@/lib/client/picker';
import type { AppConfig, BookingRequest, CreatedBooking, PublicBooking } from '@/lib/client/types';
import { BookedView } from './BookedView';
import { Checklist } from './Checklist';
import { DetailsForm, type DetailsValues } from './DetailsForm';
import { Diagram } from './Diagram';
import { Hero } from './Hero';
import { MessagePreview } from './MessagePreview';
import { Picker } from './Picker';
import { RollButton } from './Roll';
import { Steps } from './Steps';
import { ToastProvider, useToast } from './Toast';
import { ModeBadge, Topbar } from './Topbar';

const BOOKING_KEY = 'bookingId';
const SETTLED_LIMIT = 40;
const PENDING_LIMIT = 600;

export function Portal() {
  return (
    <ToastProvider>
      <PortalLoader />
    </ToastProvider>
  );
}

function PortalLoader() {
  const config = useConfig();
  useDocumentTitle(config && `Book with ${config.businessName}`);

  if (!config) {
    return (
      <>
        <Topbar business="Appointments" />
        <main className="frame">
          <Hero nextLabel={null} onNext={() => undefined} />
          <section className="band pad diagram-band" aria-hidden="true">
            <Diagram />
          </section>
          <Steps current={1} finished={false} />
        </main>
      </>
    );
  }
  return <PortalApp config={config} />;
}

function PortalApp({ config }: { config: AppConfig }) {
  const { showError, attempt } = useToast();
  const picker = usePicker(config);
  const [view, setView] = useState<1 | 2>(1);
  const [booking, setBooking] = useState<PublicBooking | null>(null);
  const [details, setDetails] = useState<DetailsValues>({ name: '', code: config.defaultCountryCode, number: '' });
  const [pending, setPending] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const shownStep = useRef<number>(1);

  const step = booking ? 3 : view;
  const selection = picker.value;
  const bookingId = booking?.id;
  const resetPicker = picker.reset;

  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    restartAnimation(stage.current, 'rise 0.6s var(--ease) both');
  }, [step]);

  useEffect(() => {
    const saved = sessionStorage.getItem(BOOKING_KEY);
    if (!saved) return;
    let cancelled = false;
    api<PublicBooking>(`/api/bookings/${encodeURIComponent(saved)}`)
      .then((found) => {
        if (!cancelled) setBooking(found);
      })
      .catch(() => sessionStorage.removeItem(BOOKING_KEY));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async (ticks: number) => {
      let settled = false;
      try {
        const fresh = await api<PublicBooking>(`/api/bookings/${bookingId}`);
        if (cancelled) return;
        setBooking((current) => (current?.id === bookingId ? { ...current, ...fresh } : current));
        settled = fresh.status === 'cancelled' || isDelivered(fresh.alertStatus) || isFailed(fresh.alertStatus);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          sessionStorage.removeItem(BOOKING_KEY);
          setBooking(null);
          resetPicker();
          setView(1);
          showError('That booking no longer exists. You can book a new time.');
          return;
        }
      }
      if (ticks < (settled ? SETTLED_LIMIT : PENDING_LIMIT)) timer = setTimeout(() => poll(ticks + 1), settled ? 15_000 : 3000);
    };

    void poll(0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bookingId, resetPicker, showError]);

  const submit = useCallback(async () => {
    if (!selection) return;
    const request: BookingRequest = { ...selection, name: details.name.trim(), phone: normalizePhone(details.number, details.code) };
    setPending(true);
    const result = await attempt(() => api<CreatedBooking>('/api/bookings', { method: 'POST', body: request }));
    setPending(false);

    if (!result.ok) {
      if (result.error instanceof ApiError && result.error.code === 'slot_unavailable') {
        resetPicker();
        setView(1);
      }
      return;
    }
    sessionStorage.setItem(BOOKING_KEY, result.value.id);
    if (result.value.alertError) showError(`Booked, but the text message failed: ${result.value.alertError}`);
    setBooking(result.value);
  }, [selection, details, attempt, showError, resetPicker]);

  const bookAnother = () => {
    sessionStorage.removeItem(BOOKING_KEY);
    setBooking(null);
    setDetails({ name: '', code: config.defaultCountryCode, number: '' });
    resetPicker();
    setView(1);
  };

  const jumpToFirst = async () => {
    await picker.pickFirst();
    stage.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <Topbar business={config.businessName}>
        <ModeBadge sandbox={config.sandbox} />
      </Topbar>

      <main className="frame">
        <Hero nextLabel={picker.firstSlot && `Next available: ${shortWhen(config.timezone, picker.firstSlot)}`} onNext={jumpToFirst} />

        <section className="band pad diagram-band" aria-hidden="true">
          <Diagram />
        </section>

        <Steps current={step} finished={step === 3 && isDelivered(booking?.alertStatus ?? null)} />

        <section className="band split">
          <div className="pane" ref={stage}>
            <div hidden={step !== 1}>
              <div id="picker">
                <Picker config={config} picker={picker} withServices />
              </div>
              <div className="nav">
                <span className="muted">You can cancel at any time. We only text you about this booking.</span>
                <RollButton className="btn-primary" text="Continue" disabled={selection === null} onClick={() => setView(2)} />
              </div>
            </div>

            <div hidden={step !== 2}>
              <DetailsForm config={config} selection={selection} values={details} pending={pending} onChange={setDetails} onBack={() => setView(1)} onSubmit={submit} />
            </div>

            {booking && <BookedView config={config} booking={booking} onReset={bookAnother} />}
          </div>

          <div className="panel">
            <div>
              <MessagePreview config={config} booking={booking} selection={selection} typedName={details.name} />
              <Checklist booking={booking} timezone={config.timezone} />
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
