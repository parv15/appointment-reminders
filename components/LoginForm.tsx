'use client';

import { type FormEvent, useRef, useState } from 'react';
import { api } from '@/lib/client/api';
import { cssVars } from '@/lib/client/css';
import { errorMessage } from '@/lib/client/format';
import { useConfig, useDocumentTitle } from '@/lib/client/hooks';
import { ToastProvider } from './Toast';
import { RollButton, RollLink } from './Roll';
import { Topbar } from './Topbar';

export function LoginForm() {
  return (
    <ToastProvider>
      <Login />
    </ToastProvider>
  );
}

function Login() {
  const config = useConfig();
  const [password, setPassword] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  useDocumentTitle(config && `${config.businessName} admin sign in`);

  const fail = (message: string) => {
    setError(message);
    const node = field.current;
    if (!node) return;
    node.classList.remove('shake');
    void node.offsetWidth;
    node.classList.add('shake');
    node.focus();
    node.select();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!password) {
      fail('Enter the admin password.');
      return;
    }
    setPending(true);
    try {
      await api('/api/admin/login', { method: 'POST', body: { password } });
      window.location.href = '/admin';
    } catch (err) {
      fail(errorMessage(err));
      setPending(false);
    }
  };

  return (
    <>
      <Topbar business={config?.businessName ?? 'Appointments'} tag="Admin">
        <RollLink className="btn-ghost btn-sm" text="Booking portal" href="/" />
      </Topbar>

      <main className="frame" style={{ minHeight: 'calc(100vh - 58px)' }}>
        <section className="band pad hero">
          <div className="rise" style={cssVars({ '--d': 0 })}>
            <p className="eyebrow">Admin</p>
            <h1 style={{ marginTop: 14 }}>
              Sign in
              <br />
              to the dashboard.
            </h1>
          </div>
          <p className="lede rise" style={cssVars({ '--d': 2 })}>
            See every booking, whether each text arrived and what customers replied. You can also reschedule or cancel a booking from the same page.
          </p>
        </section>

        <section className="band split">
          <div className="pane rise" style={cssVars({ '--d': 3 })}>
            <form className="form" noValidate onSubmit={submit}>
              <label>
                Password
                <span className="password-field">
                  <input
                    ref={field}
                    name="password"
                    type={revealed ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Admin password"
                    required
                    // biome-ignore lint/a11y/noAutofocus: the sign-in password is the only field on the page
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button type="button" className="reveal" aria-label={revealed ? 'Hide password' : 'Show password'} onClick={() => setRevealed((v) => !v)}>
                    {revealed ? 'Hide' : 'Show'}
                  </button>
                </span>
              </label>
              <p className="alert-error" role="alert" hidden={error === null}>
                {error}
              </p>
              <div className="nav">
                <span className="muted">Sessions last 12 hours.</span>
                <RollButton type="submit" className="btn-primary" text="Sign in" disabled={pending} />
              </div>
            </form>
          </div>

          <aside className="panel">
            <div className="lock-card rise" style={cssVars({ '--d': 4 })}>
              <span className="sphere" aria-hidden="true" />
              <div>
                <strong>Staff only</strong>
                <p className="muted">Only staff should sign in here. The dashboard shows customer names and phone numbers.</p>
              </div>
            </div>
          </aside>
        </section>
      </main>
    </>
  );
}
