<p align="center">
  <img src="docs/banner.svg" alt="Appointment reminders with reply handling, built on the Sent API" width="100%">
</p>

# Appointment Reminders with Reply Handling

This project is a booking portal and an admin dashboard for businesses that take appointments, built on the [Sent](https://sent.dm) messaging API. A customer picks a time online and receives a confirmation text straight away. Sent holds a reminder and delivers it before the appointment, on whichever channel suits the customer. The customer can answer the reminder with `C` to confirm or `R` to ask for a new time, and the booking updates itself. You can use it as a starting point for a clinic, a salon or a repair shop, or read it as a worked example of a Sent integration with scheduled sends, delivery tracking, signed webhooks and safe retries.

<p>
  <a href="https://github.com/parv15/sent-appointment-reminders/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/parv15/sent-appointment-reminders/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Node 22.13 or later" src="https://img.shields.io/badge/node-%E2%89%A522.13-339933?logo=node.js&logoColor=white">
  <img alt="TypeScript strict" src="https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white">
  <img alt="Sent SDK 0.55" src="https://img.shields.io/badge/%40sentdm%2Fsentdm-0.55-000000">
  <img alt="License MIT" src="https://img.shields.io/badge/license-MIT-green.svg">
</p>

<p>
  <a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fparv15%2Fsent-appointment-reminders&project-name=sent-appointment-reminders&repository-name=sent-appointment-reminders&env=SENT_DM_API_KEY,BUSINESS_NAME,ADMIN_PASSWORD,DATABASE_URL&envDescription=Your%20Sent%20API%20key%2C%20your%20business%20name%2C%20an%20admin%20password%20and%20a%20Postgres%20connection%20string&envLink=https%3A%2F%2Fgithub.com%2Fparv15%2Fsent-appointment-reminders%23one-click-deploy"><img alt="Deploy with Vercel" src="https://vercel.com/button"></a>
  <a href="https://render.com/deploy?repo=https://github.com/parv15/sent-appointment-reminders"><img alt="Deploy to Render" src="https://render.com/images/deploy-to-render-button.svg"></a>
</p>

Both buttons deploy the app with your own Postgres database, because neither Vercel nor Render keeps files between restarts on a free plan. The steps are listed under [One-click deploy](#one-click-deploy).

## The problem

A missed appointment costs a business the time slot and the income. A reminder text helps, but a reminder that only travels one way leaves the staff guessing who is coming. Most examples also stop at sending an SMS. They poll the database every minute to decide what to send, they never find out whether the message arrived, and they have no answer for a customer who writes back.

## What this repo solves

| Problem | How this repo handles it |
| --- | --- |
| Staff cannot tell who is coming | Customers reply `C` to confirm or `R` to reschedule. The dashboard flags bookings that asked for a new time, and bookings that have not replied as the appointment gets close. |
| A job that polls every minute | There is no job. The reminder is created at booking time with Sent's `scheduled_at` field, and Sent sends it. |
| A confirmation and a reminder arriving together | The customer chooses when the reminder goes out, for example 1 day or 2 hours before. A choice that would already be in the past is switched off. |
| No idea whether a text arrived | Every text shows its status and the channel it travelled on, from webhooks and from polling Sent. |
| A customer who needs a different time | Staff reschedule from one dialog. The old reminder is cancelled, a new one is scheduled and the customer is told. |
| Duplicate texts after a retry | Confirmations and reminders carry idempotency keys built from the booking. |
| Waiting for template approval | The app uses Sent's approved templates until yours are approved, then switches to yours by itself. |
| Fake or replayed webhooks | Signatures are checked in constant time, requests older than five minutes are refused and each event is processed once. |

**Contents:** [Demo](#demo) · [How it works](#how-it-works) · [Features](#features) · [Stack](#stack) · [Prerequisites](#prerequisites) · [Quick start](#quick-start) · [Screenshots](#screenshots) · [When the reminder is sent](#when-the-reminder-is-sent) · [Replies and status](#replies-and-status) · [Key integration points](#key-integration-points) · [Failure behavior](#failure-behavior) · [Security design](#security-design) · [Configuration](#configuration) · [API](#api) · [Project layout](#project-layout) · [Deploying](#deploying) · [One-click deploy](#one-click-deploy) · [FAQ](#faq) · [Contributing](#contributing)

## Demo

<p align="center">
  <img src="docs/demo.gif" alt="A scroll through the booking portal and the admin dashboard: the page explains the flow, a time and reminder are chosen, details are entered, the booking is confirmed, and the dashboard lists every booking" width="800">
</p>

The recording scrolls through the booking portal and then the admin dashboard. It was assembled from screenshots of a real run against a Sent account, and the phone numbers are masked.

## How it works

One Node process serves the booking portal, the admin dashboard and the webhook endpoint. Bookings are stored in a local SQLite file or in Postgres, and everything that reaches a phone goes through Sent.

```mermaid
flowchart TB
    customer([Customer]) -->|books a slot| app["This app<br/>portal, admin, webhook"]
    staff([Staff]) -->|reschedules or cancels| app
    app <--> db[("SQLite or Postgres")]
    app -->|"confirmation now,<br/>reminder with scheduled_at"| sent["Sent API"]
    sent -->|"SMS, WhatsApp or RCS"| phone([Customer phone])
    phone -->|"C or R"| sent
    sent -->|"signed webhook"| app
```

| Part | What it does | Where |
| --- | --- | --- |
| Portal | Lets the customer choose a service, day, time and reminder, enter details and watch the confirmation arrive | `public/` |
| Admin | Shows stats, bookings, the needs-attention flags and the activity feed, and opens the reschedule dialog | `admin/` |
| Booking logic | Handles reminder timing, booking, rescheduling, cancelling, replies and status updates | `src/reminders.ts` |
| Messenger | Is the only code that calls the Sent SDK, and falls back between templates | `src/messenger.ts` |
| Webhook | Verifies signatures and applies message events | `src/app.ts`, `src/signature.ts` |
| Slots | Works out open slots from business hours in the right timezone | `src/slots.ts` |
| Sign-in | Keeps the dashboard private behind a password | `src/auth.ts` |
| Storage | Keeps bookings and the webhook events already processed | `src/store.ts` |

<p align="center">
  <img src="docs/flow.svg" alt="Sequence of a booking: the customer books, the app saves it and sends the confirmation, schedules the reminder with scheduled_at, Sent delivers both texts, the customer replies, Sent posts a signed webhook and the app updates the booking and answers" width="100%">
</p>

1. The customer picks a service, a day, a time and a reminder time on the portal, then enters a name and a mobile number.
2. `POST /api/bookings` checks that the slot is still free and that the reminder is still in the future, then saves the booking.
3. The app asks Sent to send the reminder template at the reminder time, using `scheduled_at`, and keeps the message id that Sent returns.
4. The app sends the confirmation template straight away. The portal shows it moving from queued to delivered.
5. Sent releases the reminder at the reminder time and delivers it on the best channel for that phone.
6. The customer replies `C` or `R`, and Sent posts a `message.received` webhook.
7. The app verifies the signature, updates the booking and answers on the same channel.
8. Staff see the new status on the dashboard. A booking that asked for a new time is flagged, and the Reschedule button moves it.

## Features

The booking portal lets a customer choose a service, a day and a time slot in the business timezone, enter a mobile number with a country code, and then watch the confirmation text move through queued, sent and delivered. The page keeps the confirmation on screen after a refresh, and it previews the exact texts the customer will receive while they fill in the form.

Customers choose when the reminder is sent, from options such as 1 day, 2 hours or 1 hour before. Options that would already be in the past are disabled, and the page shows the exact time the reminder will go out.

Replies are handled automatically. `C` confirms the booking, `R` asks for a new time, and anything else gets a text explaining the options. `STOP` and the other compliance keywords stay with Sent.

The admin dashboard counts bookings that asked to reschedule and bookings that have not replied as the appointment gets close, and it highlights them. A dialog moves a booking to a new slot, cancels the old reminder, schedules a new one and tells the customer. Cancelling a booking stops its reminder and sends the customer a cancellation text. Every confirmation and reminder shows its status and the channel that carried it.

The dashboard sits behind a sign-in page with a password. Two setup scripts create the templates and register the webhook, so the first run needs few manual steps.

## Stack

| | |
| --- | --- |
| Runtime | Node.js 22.13 or later, TypeScript in strict mode |
| Server | Express 5 |
| Data | SQLite through `node:sqlite` by default, or Postgres through `pg` when `DATABASE_URL` is set |
| Messaging | [`@sentdm/sentdm`](https://www.npmjs.com/package/@sentdm/sentdm) 0.55, the official TypeScript SDK |
| Frontend | Plain HTML, CSS and JavaScript, with the Inter variable font bundled |
| Tooling | GitHub Actions for typecheck and build, Dependabot and Docker |

## Prerequisites

You need Node.js 22.13 or later and a [Sent](https://app.sent.dm) account with an API key. To receive customer replies, the account also needs a channel that can receive messages, which means an SMS number, WhatsApp or RCS, set up in the Sent dashboard. An alphanumeric sender ID, which shows a brand name instead of a number, only sends and cannot receive. Light onboarding is enough to start, because its approved templates are what the app uses until yours are approved. Replies need a public HTTPS address for the webhook, and a tunnel such as [ngrok](https://ngrok.com) provides one while you develop.

## Quick start

```bash
git clone https://github.com/parv15/sent-appointment-reminders.git
cd sent-appointment-reminders
npm install
cp .env.example .env
```

Open `.env` and set `SENT_DM_API_KEY`, `BUSINESS_NAME` and `ADMIN_PASSWORD`. It is a good idea to begin with `SENT_SANDBOX=true`. In sandbox mode Sent checks every request but sends nothing, so a bad phone number, a missing template or a wrong key shows up without any cost.

```bash
npm run setup:templates
npm run dev
```

The booking portal is at <http://localhost:3000> and the admin dashboard is at <http://localhost:3000/admin/>, which asks you to sign in with `ADMIN_PASSWORD`.

To receive replies, expose the app and register the webhook:

```bash
ngrok http 3000
npm run setup:webhook -- https://YOUR-TUNNEL.ngrok-free.app
```

`setup:webhook` registers `/webhooks/sent` for message events and writes the signing secret into `.env`. Restart the app afterwards so that it picks the secret up.

### What you will see in the terminal

Starting the app while your own templates are still waiting for approval:

```text
Warning: Using "sent_Appointment_Reminder_2" for reminder until "appointment_reminder_reply" is approved (it is PENDING).
Warning: Using "sent_Appointment_Confirmation_1" for booking confirmation until "appointment_confirmation_reply" is approved (it is PENDING).
Appointment reminders listening on http://localhost:3000
```

Creating the templates. A second run skips the ones that already exist:

```text
$ npm run setup:templates
appointment_confirmation_reply: already exists, skipped
appointment_reminder_reply: already exists, skipped
```

Registering the webhook:

```text
$ npm run setup:webhook -- https://YOUR-TUNNEL.ngrok-free.app
Webhook registered: https://YOUR-TUNNEL.ngrok-free.app/webhooks/sent
Signing secret saved to .env as SENT_DM_WEBHOOK_SECRET
```

## Screenshots

The screenshots come from a real run against a Sent account. Phone numbers are masked.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/portal-overview.png" alt="Booking portal with a flow diagram of the confirmation, the reminder and the reply"></td>
    <td width="50%"><img src="docs/screenshots/portal-pick-time.png" alt="Booking portal with the service, day, time and reminder choice, next to a preview of the texts"></td>
  </tr>
  <tr>
    <td align="center">The portal explains what happens after booking.</td>
    <td align="center">The customer chooses a time and a reminder and previews the texts.</td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/portal-booked.png" alt="Booking confirmed, with the delivered confirmation text and a checklist of what has happened"></td>
    <td width="50%"><img src="docs/screenshots/admin-login.png" alt="Admin sign-in page with a password field"></td>
  </tr>
  <tr>
    <td align="center">The confirmation page tracks each text until it is delivered.</td>
    <td align="center">The dashboard sits behind a sign-in page.</td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/admin-dashboard.png" alt="Admin dashboard with stats, bookings and the activity feed"></td>
    <td width="50%"><img src="docs/screenshots/admin-reschedule.png" alt="Reschedule dialog with a day, a time and a reminder choice"></td>
  </tr>
  <tr>
    <td align="center">Staff see every booking, text and reply.</td>
    <td align="center">Rescheduling moves the booking and its reminder.</td>
  </tr>
</table>

## When the reminder is sent

Each customer chooses a reminder time from `REMINDER_OPTIONS`, which defaults to `1440,120,60` minutes, so 1 day, 2 hours or 1 hour before the appointment. The portal selects the longest option that still fits and disables the ones that do not.

| The appointment is | Options the customer sees | What happens |
| --- | --- | --- |
| 3 days away | 1 day, 2 hours and 1 hour before | The reminder is scheduled for the chosen time, which is 1 day before by default. |
| About 20 hours away | 2 hours and 1 hour before | The time 1 day before has already passed, so that option is disabled and 2 hours before becomes the default. |
| 70 minutes away | 1 hour before only | The reminder goes out 10 minutes after booking, as its own scheduled message and not together with the confirmation. |

The confirmation is sent at booking time and the reminder is always a separate scheduled message. Sent accepts `scheduled_at` from one minute to 30 days ahead. The app asks for at least two minutes, and the portal offers the next 14 days, so every choice fits. Slots that are closer than the shortest option plus five minutes are not offered at all. The customer sees the exact reminder time on the booking page, and the dashboard shows it for every booking.

## Replies and status

| The customer sends | What happens |
| --- | --- |
| `C`, `confirm` or `confirmed` | The booking becomes `confirmed` and a confirmation text is sent back. |
| `R` or `reschedule` | The booking becomes `reschedule_requested`, it is flagged for staff and an acknowledgement is sent back. |
| `STOP`, `HELP` or another compliance keyword | Sent handles it and the app does nothing. |
| Anything else | A text asks them to reply `C` or `R`. |

Matching ignores capital letters and surrounding spaces. A reply applies to the customer's next upcoming appointment, which the app finds by phone number. The answer can only be sent once a conversation window is open, and the customer's reply opens it. On SMS and RCS that happens as soon as they reply, and on WhatsApp the window lasts 24 hours after their last message.

```mermaid
stateDiagram-v2
    [*] --> scheduled: booked
    scheduled --> confirmed: customer replies C
    scheduled --> reschedule_requested: customer replies R
    confirmed --> reschedule_requested: customer replies R
    reschedule_requested --> confirmed: customer replies C
    reschedule_requested --> scheduled: staff reschedule
    confirmed --> scheduled: staff reschedule
    scheduled --> cancelled: staff cancel
    confirmed --> cancelled: staff cancel
    reschedule_requested --> cancelled: staff cancel
```

A booking needs attention when the customer asked to reschedule, or when the reminder was delivered, there is no reply and the appointment is less than `NO_REPLY_WARNING_HOURS` away, which is 3 hours by default.

Each text is `queued`, `scheduled`, `sent`, `delivered`, `failed` or `blocked`, and the dashboard shows the channel Sent used. The app learns the status from the webhook when `SENT_DM_WEBHOOK_SECRET` is set. It also asks Sent about any message that has not finished, so status tracking works before you have set up a webhook.

## Key integration points

The reminder is a single scheduled call. Sent keeps the message and releases it at `scheduled_at`, and the idempotency key makes a retried booking safe ([`src/reminders.ts`](src/reminders.ts), [`src/messenger.ts`](src/messenger.ts)):

```ts
messenger.send({
  to: appointment.phone,
  template: { name: config.templateName, parameters: textParameters(appointment) },
  scheduledAt: new Date(new Date(appointment.startsAt).getTime() - lead * 60_000),
  idempotencyKey: key,
});
```

Templates fall back until yours are approved. `SENT_TEMPLATE_NAME` is a comma-separated list, the first `APPROVED` template wins, and the approval status is checked again every five minutes ([`src/messenger.ts`](src/messenger.ts)):

```ts
const known = await templateStatuses();
return candidates.find((n) => known.get(n) === 'APPROVED') ?? candidates[0]!;
```

Webhooks are verified before anything else happens. The signature is an HMAC-SHA256 over `id.timestamp.body`, compared in constant time ([`src/signature.ts`](src/signature.ts)):

```ts
const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
const signed = `${headers.id}.${headers.timestamp}.${rawBody.toString('utf8')}`;
const expected = Buffer.from('v1,' + createHmac('sha256', key).update(signed).digest('base64'));
```

Rescheduling cannot lose the reminder. The new reminder is scheduled first, the old one is cancelled second, and the database changes last. If the cancel fails, the new reminder is cancelled again and the booking stays as it was ([`src/reminders.ts`](src/reminders.ts)):

```ts
const newReminderId = await scheduleReminder(moved, lead, `reminder-${id}-${start.getTime()}`);
try {
  if (current.reminderMessageId) await messenger.cancel(current.reminderMessageId);
} catch (err) {
  await messenger.cancel(newReminderId).catch(() => undefined);
  throw err;
}
```

## Failure behavior

| What goes wrong | What the app does |
| --- | --- |
| The reminder cannot be scheduled | The booking is not kept, and the customer sees a plain error. |
| The confirmation text fails | The booking and the reminder stay, and both the portal and the dashboard report the failure. |
| Your own templates are not approved | Sent's approved templates are used, and the dashboard says so. |
| No template is approved at all | Startup warns you and Sent blocks the text, but the booking is not affected. |
| Sent rejects the API key | The app refuses to start and names the variable to fix. |
| The Sent account has no channel that can receive replies, such as only an alphanumeric sender ID | Texts still go out, but they are one way and customers cannot reply. The app warns at startup, shows a notice on the dashboard and hides the reply instructions on the booking page. |
| The webhook secret is missing | The webhook answers 503 and replies are ignored. Texts still go out and their status is polled. |
| The same webhook arrives twice | The event id is stored, so the event is processed once. |
| A customer replies after the appointment | The reply is ignored, because replies only apply to upcoming appointments. |
| Two people pick the same slot | The second booking is refused and the portal reloads the slots. The database also allows only one active booking per slot, so two requests at the same instant cannot both win. |
| The same person submits the form twice | The second request returns the first booking and sends nothing more. |
| Saving a booking fails after Sent accepted the reminder | The reminder is cancelled again and the booking is removed, so nobody receives a reminder for a booking that does not exist. |
| Processing a webhook fails | The event is released and the app answers 500, so Sent delivers it again. An event that finished is never processed twice. |
| The reply text fails to send | The booking still updates, the error is logged and the webhook is acknowledged. |
| A customer replies from a number without a plus sign, or on an unknown channel | The number is normalised and the reply goes out on the default channel. |
| An appointment is cancelled, rescheduled or answered after the booking page loaded | The page keeps checking and shows the new state. It says plainly when the appointment was cancelled. |
| The reminder to cancel was already sent or no longer exists | Cancelling still succeeds, because there is nothing left to cancel at Sent. |
| A time that does not exist or occurs twice because of daylight saving | The slot list skips it, so every offered time is a real local time exactly once. |
| The cancellation or reschedule text fails | The cancel or move still happens, and the dashboard shows that the customer text failed. |
| Staff reschedule to the time the booking already has | Nothing changes and no new texts are sent. |
| An appointment time has passed | It moves to the Past tab and stops counting as upcoming or as needing attention. |
| Cancelling the old reminder fails during a reschedule | The new reminder is cancelled again and nothing changes. |

## Security design

Webhook signatures are verified in constant time. Requests older than five minutes are refused, and each event id is processed once.

The dashboard and every admin API sit behind a sign-in page when `ADMIN_PASSWORD` is set. A correct password sets an `HttpOnly` session cookie with `SameSite=Lax` that is valid for 12 hours, and the cookie is marked `Secure` when the request arrives over HTTPS. After five wrong passwords from one address the login endpoint refuses further attempts for five minutes. The cookie holds a signed expiry time and no personal data.

The public booking endpoints only return the booking you made, found by its random id, and they never list other bookings. One connection can make 10 booking requests per hour and one phone number can hold 3 upcoming appointments, which stops the form from being used to send texts to strangers. Phone numbers are validated as E.164 and names are validated against the pattern the Sent templates accept before anything is sent. A number typed with a plus sign or a leading 00 is used as written, and otherwise the selected country code is added.

Secrets come only from environment variables, and `.env`, the database and build output are in `.gitignore`. Dependabot, `npm audit`, CodeQL and GitHub secret scanning watch the repository, and [SECURITY.md](SECURITY.md) says how to report a problem. The app has no analytics and loads no third-party script. The only font is bundled together with its licence.

## Configuration

All settings are environment variables, usually kept in `.env`. [`.env.example`](.env.example) is a good starting point.

| Variable | Default | Description |
| --- | --- | --- |
| `SENT_DM_API_KEY` | required | API key from the Sent dashboard. |
| `BUSINESS_NAME` | required | Business name used in the texts, for example `Maple Street Dental`. |
| `ADMIN_PASSWORD` | empty | Password for the admin sign-in page. When it is empty the dashboard is open to anyone who can reach the server. |
| `SENT_DM_WEBHOOK_SECRET` | empty | Webhook signing secret, written by `setup:webhook`. Without it, customer replies are ignored. |
| `SENT_TEMPLATE_NAME` | `appointment_reminder_reply,sent_Appointment_Reminder_2` | Reminder template list. The first `APPROVED` one is used. |
| `SENT_CONFIRMATION_TEMPLATE` | `appointment_confirmation_reply,sent_Appointment_Confirmation_1` | Booking confirmation template list. Leave it empty to turn the confirmation off. |
| `SENT_RESCHEDULE_TEMPLATE` | `sent_Appointment_Reschedule_1` | Text sent when staff reschedule. Leave it empty to turn it off. |
| `SENT_CANCEL_TEMPLATE` | `sent_Appointment_Cancelled` | Text sent when staff cancel. Leave it empty to turn it off. |
| `REMINDER_OPTIONS` | `1440,120,60` | Reminder times customers can choose, in minutes before the appointment. |
| `NO_REPLY_WARNING_HOURS` | `3` | How long before the appointment a booking without a reply is flagged. |
| `SERVICES` | `Appointment` | Comma-separated list of services customers can book. |
| `BUSINESS_TIMEZONE` | `UTC` | IANA timezone for business hours and for the dates in texts, for example `America/New_York`. |
| `BOOKING_START_HOUR` | `9` | First bookable hour. |
| `BOOKING_END_HOUR` | `17` | End of the last slot. |
| `SLOT_MINUTES` | `30` | Slot length: 10, 15, 20, 30, 45 or 60. |
| `DEFAULT_COUNTRY_CODE` | `+1` | Country code preselected on the portal. |
| `BOOKINGS_PER_HOUR_PER_IP` | `10` | How many booking requests one address may make per hour. |
| `TRUST_PROXY` | empty | Set to the number of proxies in front of the app, for example `1`, so that rate limits use the real visitor address. Leave it empty when the app is exposed directly. |
| `SENT_SANDBOX` | `false` | Validates requests without sending anything. |
| `PORT` | `3000` | HTTP port. |
| `DATABASE_URL` | empty | Postgres connection string. When it is set the app uses Postgres, and the `POSTGRES_URL` that Vercel sets works too. |
| `DATABASE_PATH` | `./data/appointments.db` | SQLite file, used when `DATABASE_URL` is empty. |

## API

These endpoints are open and are used by the booking portal:

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/config` | Business name, services, timezone, bookable days, reminder options and mode. |
| `GET` | `/api/slots?date=YYYY-MM-DD` | Open slots for a day, as UTC instants. |
| `POST` | `/api/bookings` | Books a slot. The body has `service`, `name`, `phone` in E.164 format and `startsAt` from `/api/slots`, plus an optional `reminderMinutes`. |
| `GET` | `/api/bookings/:id` | One booking, with the delivery status and channel of its confirmation text. |
| `POST` | `/webhooks/sent` | Receives Sent webhooks. |
| `GET` | `/healthz` | Liveness check. |

These endpoints belong to the admin dashboard. Everything except the three sign-in endpoints needs a valid session when `ADMIN_PASSWORD` is set:

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/admin/login` | The sign-in page. |
| `POST` | `/api/admin/login` | Signs in with `{ "password": "..." }` and sets the session cookie. |
| `POST` | `/api/admin/logout` | Clears the session cookie. |
| `GET` | `/api/admin/session` | Says whether sign-in is required and whether the caller is signed in. |
| `GET` | `/admin/` | The dashboard. |
| `GET` | `/api/admin/appointments` | All bookings, each with an `attention` field. |
| `GET` | `/api/admin/activity` | The alerts and activity feed. |
| `GET` | `/api/admin/templates` | Which templates are preferred and which are in use. |
| `POST` | `/api/admin/appointments/:id/reschedule` | Moves a booking. The body has `startsAt` and an optional `reminderMinutes`. |
| `POST` | `/api/admin/appointments/:id/cancel` | Cancels a booking and its scheduled reminder, and texts the customer. |

```bash
curl "http://localhost:3000/api/slots?date=2026-12-03"

curl -X POST http://localhost:3000/api/bookings \
  -H "Content-Type: application/json" \
  -d '{"service": "Dental checkup", "name": "Sana Mehta", "phone": "+14155551234", "startsAt": "2026-12-03T14:30:00.000Z", "reminderMinutes": 120}'
```

## Project layout

```text
src/
  server.ts            Entry point: starts the server and handles shutdown
  bootstrap.ts         Builds the app from the environment, for the server and for Vercel
  vercel.ts            Serverless entry used by api/index.js
  app.ts               Portal, admin and webhook routes
  reminders.ts         Booking, rescheduling, cancelling, replies and status updates
  messenger.ts         The Sent SDK wrapper, with template fallback
  slots.ts             Business hours and open slots, timezone aware
  attention.ts         Which bookings need staff attention
  activity.ts          The alerts and activity feed
  auth.ts              Admin sign-in, session cookie and login rate limit
  rate-limit.ts        Booking rate limit
  signature.ts         Webhook signature verification
  replies.ts           Reply classification
  errors.ts            Turns Sent API errors into readable messages
  config.ts            Environment validation
  store.ts             The storage interface and shared types
  sqlite-store.ts      SQLite storage
  postgres-store.ts    Postgres storage
api/index.js           Vercel function entry
vercel.json            Vercel build and routing settings
render.yaml            Render blueprint
public/                Booking portal, admin sign-in page, shared styles, slot picker and font
admin/                 Admin dashboard
scripts/               setup:templates, setup:webhook and the prose check
docs/                  Template definitions, diagrams, screenshots and the demo recording
```

## Deploying

The app runs as one Node process. It keeps bookings in a SQLite file by default, which fits any host that can run a container or Node.js with a persistent disk. Set `DATABASE_URL` to a Postgres connection string and it keeps them in Postgres instead, which fits hosts without a disk, such as Vercel and the free Render plan.

```bash
docker build -t appointment-reminders .
docker run -p 3000:3000 --env-file .env -v reminders-data:/app/data appointment-reminders
```

The image reports its health through `/healthz`, and it fixes the permissions of `/app/data` itself, so a named volume, a host folder or a cloud disk all work. The container starts as root only to make that folder writable, and then runs the app as the unprivileged `node` user. Leave the volume out and add `-e DATABASE_URL=postgres://...` to use Postgres instead.

Without Docker, run `npm run build` and then `npm start`.

Before you go live, set `ADMIN_PASSWORD` and serve the app over HTTPS. Keep the database on a persistent volume or in Postgres. With SQLite run a single instance. The login and booking rate limits live in memory, so with several instances each one counts on its own. Register the webhook for your real domain with `npm run setup:webhook -- https://your-domain`. Messages to US numbers need 10DLC registration with Sent before they are delivered. If you ever pasted your API key somewhere it should not be, rotate it first.

## One-click deploy

The two buttons at the top of this page need a Postgres database, because neither platform keeps files between restarts on a free plan. [Neon](https://neon.tech) has a free Postgres plan, and its connection string looks like `postgres://user:password@host/dbname`. Create the database first and keep the connection string ready. Connections use SSL unless the host is `localhost` or the string contains `sslmode=disable`.

### Deploy with Vercel

1. Click **Deploy with Vercel** and sign in. Vercel clones the repository into your GitHub account.
2. Enter `SENT_DM_API_KEY`, `BUSINESS_NAME`, `ADMIN_PASSWORD` and `DATABASE_URL` when Vercel asks. You can instead add a Postgres database from the **Storage** tab of the project, and the app reads the `POSTGRES_URL` that Vercel sets.
3. Add `BUSINESS_TIMEZONE`, `SERVICES` and `DEFAULT_COUNTRY_CODE` under **Settings, Environment Variables** if the defaults do not suit you, then redeploy.
4. Open the project address. The booking page is at `/` and the dashboard is at `/admin/`.

Vercel runs the app as a serverless function from [`api/index.js`](api/index.js), with [`vercel.json`](vercel.json) sending the API, the dashboard and the webhook to it. The tables are created on the first request. A function can run for up to 30 seconds, which is enough for a booking and its two Sent calls.

### Deploy to Render

1. Click **Deploy to Render** and sign in. Render reads [`render.yaml`](render.yaml) and builds the Docker image.
2. Enter `SENT_DM_API_KEY`, `BUSINESS_NAME`, `ADMIN_PASSWORD` and `DATABASE_URL` when Render asks.
3. Wait for the first deploy and open the service address.

The blueprint uses Render's free plan, which puts the service to sleep after a quiet period, so the first request after a pause is slow. Change `plan` in `render.yaml` to `starter` for an always-on service. If you would rather keep SQLite, add a disk under `disk` in the same file and leave `DATABASE_URL` empty. The button works for a public repository. If you forked this repository privately, connect it from the Render dashboard with **New, Blueprint**.

### After either deploy

Register the webhook for the new address from your own machine, then copy the signing secret it prints into the `SENT_DM_WEBHOOK_SECRET` setting on the platform:

```bash
npm run setup:webhook -- https://your-project.vercel.app
```

`setup:webhook` writes the secret into your local `.env`, so open that file and paste the value into the platform's settings and redeploy. Replies start working once a Sent channel can receive them.

## FAQ

**Why do the texts leave out "Reply C to confirm or R to reschedule"?**

The reply wording lives in the templates, and Sent has to approve a template before it can be used. Until yours are approved, the app uses Sent's standard templates, which do not include that line. The booking page tells customers how to reply in the meantime, and the dashboard shows a notice. When your templates become `APPROVED`, the app switches to them within five minutes.

**Can I change the reminder wording?**

Yes. Edit the JSON files in [`docs/templates`](docs/templates), create new templates with `npm run setup:templates`, and put their names first in `SENT_TEMPLATE_NAME` and `SENT_CONFIRMATION_TEMPLATE`. The variable names must match the ones used in [`src/reminders.ts`](src/reminders.ts).

**Why can the customer not reply to the text?**

A sender ID that shows a brand name, or the shared route that accounts without a channel use, can only send. Replies need an SMS number, WhatsApp or RCS, which you add in the Sent dashboard. The app checks this on startup, and the dashboard shows a notice until a channel exists.

**Does it work without a webhook?**

Bookings, confirmations, reminders and delivery status all work. Customer replies need the webhook, because that is how Sent hands them to the app.

**What does sandbox mode do?**

Sent validates each request and sends nothing. Its responses are sample data, so reading a sandbox message back returns 404, and the app skips status polling. If you leave sandbox mode on in production, Sent still answers 202 but never delivers anything, so check the mode badge at the top of the page.

**Can I run more than one instance?**

Yes, with Postgres. Bookings, the one-booking-per-slot rule and the webhook event ids all live in the database. The login and booking rate limits are kept in memory, so each instance counts on its own. With SQLite, run a single instance, because a SQLite file cannot be shared safely over a network disk.

**Can a customer have several appointments?**

Yes. A reply applies to the customer's next upcoming appointment, which the app finds by phone number.

## Contributing

Issues and pull requests are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) lists the checks to run first.

## License

[MIT](LICENSE)
