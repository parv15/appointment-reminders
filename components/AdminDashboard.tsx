'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { type Filter, FILTERS, stats, visibleRows } from '@/lib/client/admin';
import { api } from '@/lib/client/api';
import { cssVars } from '@/lib/client/css';
import { duration, errorMessage, listOf } from '@/lib/client/format';
import { useConfig, useDocumentTitle, useFreshKeys } from '@/lib/client/hooks';
import type { ActivityItem, Appointment, AppointmentChange, TemplateReport } from '@/lib/client/types';
import { ActivityFeed, feedKey } from './ActivityFeed';
import { BookingRow } from './BookingRow';
import { RescheduleDialog } from './RescheduleDialog';
import { RollButton, RollLink } from './Roll';
import { TemplateNotice } from './TemplateNotice';
import { ToastProvider, useToast } from './Toast';
import { ModeBadge, Topbar } from './Topbar';

const REFRESH_MS = 4000;

export function AdminDashboard({ signOutAvailable }: { signOutAvailable: boolean }) {
  return (
    <ToastProvider>
      <Dashboard signOutAvailable={signOutAvailable} />
    </ToastProvider>
  );
}

function Dashboard({ signOutAvailable }: { signOutAvailable: boolean }) {
  const { showError, attempt } = useToast();
  const config = useConfig();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [templates, setTemplates] = useState<TemplateReport[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [target, setTarget] = useState<Appointment | null>(null);
  const requests = useRef(0);

  useDocumentTitle(config && `${config.businessName} admin`);

  const refresh = useCallback(async () => {
    const id = ++requests.current;
    try {
      const [rows, feed] = await Promise.all([api<Appointment[]>('/api/admin/appointments'), api<ActivityItem[]>('/api/admin/activity')]);
      if (id !== requests.current) return;
      setAppointments(rows);
      setActivity(feed);
    } catch (err) {
      showError(errorMessage(err));
    }
  }, [showError]);

  useEffect(() => {
    void refresh();
    api<TemplateReport[]>('/api/admin/templates').then(setTemplates, () => undefined);
  }, [refresh]);

  useEffect(() => {
    if (target) return;
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh, target]);

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const rows = config ? visibleRows(appointments, filter) : [];
  const freshRows = useFreshKeys(rows.map((a) => a.id));
  const freshFeed = useFreshKeys(config ? activity.map(feedKey) : []);
  const counts = stats(appointments);

  const cancel = async (appointment: Appointment) => {
    const result = await attempt(() => api<AppointmentChange>(`/api/admin/appointments/${appointment.id}/cancel`, { method: 'POST' }));
    if (!result.ok) return false;
    if (result.value.confirmationError) showError(`Cancelled, but the customer text failed: ${result.value.confirmationError}`);
    await refresh();
    return true;
  };

  const moved = (change: AppointmentChange) => {
    setTarget(null);
    if (change.confirmationError) showError(`Moved, but the customer text failed: ${change.confirmationError}`);
    void refresh();
  };

  const signOut = async () => {
    await api('/api/admin/logout', { method: 'POST' }).catch(() => undefined);
    window.location.href = '/admin/login';
  };

  return (
    <>
      <Topbar business={config?.businessName ?? 'Appointments'} tag="Admin">
        <div className="top-actions">
          {config && <ModeBadge sandbox={config.sandbox} showLive />}
          <RollLink className="btn-ghost btn-sm" text="Open booking portal" href="/" target="_blank" rel="noopener" />
          {signOutAvailable && <RollButton className="btn-ghost btn-sm" text="Sign out" onClick={signOut} />}
        </div>
      </Topbar>

      <main className="frame">
        <section className="band pad hero">
          <div className="rise" style={cssVars({ '--d': 0 })}>
            <p className="eyebrow">Dashboard</p>
            <h1 style={{ marginTop: 14 }}>
              Bookings
              <br />
              and messages
            </h1>
          </div>
          <p className="lede rise" style={cssVars({ '--d': 2 })}>
            {config
              ? `Customers choose whether the reminder arrives ${listOf(config.reminderOptions.map(duration))} before the appointment.`
              : 'See every booking, whether each text arrived, and what customers replied.'}
          </p>
        </section>

        <section className="band tight">
          {config && <TemplateNotice config={config} templates={templates} />}
          <section className="stats rise" style={cssVars({ '--d': 3 })} aria-label="Summary">
            <div className="stat">
              <span>{counts.upcoming}</span>
              <small>Upcoming</small>
            </div>
            <div className="stat good">
              <span>{counts.confirmed}</span>
              <small>Confirmed</small>
            </div>
            <div className={`stat warn${counts.attention > 0 ? ' hot' : ''}`}>
              <span>{counts.attention}</span>
              <small>Needs attention</small>
            </div>
            <div className="stat muted">
              <span>{counts.cancelled}</span>
              <small>Cancelled</small>
            </div>
          </section>
        </section>

        <section className="band split wide">
          <div className="pane rise" style={cssVars({ '--d': 4 })}>
            <div className="section-title">
              <h2>Bookings</h2>
              <div className="tabs" role="tablist">
                {FILTERS.map((item) => (
                  <button key={item.key} type="button" role="tab" aria-selected={filter === item.key} className={filter === item.key ? 'on' : undefined} onClick={() => setFilter(item.key)}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <ul className="list">
              {config &&
                rows.map((a, n) => <BookingRow key={a.id} appointment={a} config={config} index={n} isNew={freshRows.has(a.id)} onReschedule={setTarget} onCancel={cancel} />)}
            </ul>
            {config && rows.length === 0 && (
              <div className="empty">
                <strong>No bookings here</strong>
                <span>
                  Bookings made on the{' '}
                  <a href="/" target="_blank" rel="noopener">
                    booking portal
                  </a>{' '}
                  show up here.
                </span>
              </div>
            )}
          </div>

          <aside className="panel">{config && <ActivityFeed items={activity} config={config} fresh={freshFeed} />}</aside>
        </section>
      </main>

      {config && <RescheduleDialog config={config} appointment={target} onClose={() => setTarget(null)} onMoved={moved} />}
    </>
  );
}
