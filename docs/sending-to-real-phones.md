# Sending to real phones

The app can book and schedule without any of this. A text only reaches a phone when your Sent account allows it. This page lists what the account needs, why Sent rejects or blocks a text, and how to fix each case. Every error code below is the one Sent reports, and the dashboard shows it under the booking with a short hint.

## What a real text needs

| Requirement | What it means | Where you set it |
| --- | --- | --- |
| An onboarded account | A new account can only text its own verified number until Sent finishes onboarding. | Sent dashboard, KYC, then wait for the status to change to `ONBOARDED`. |
| A sender for each country | Sent sends from a sender you own in the customer's country. | Sent dashboard, Channels, or the API call shown under Countries. |
| A sender that can receive replies | Replies only work when the text came from a real number, WhatsApp or RCS. A sender name cannot receive replies. | Sent dashboard, Channels. |
| Approved templates | Sent only sends approved templates. Your own reply templates can stay pending, because the app falls back to Sent's standard templates. | `npm run setup:templates`, then wait for approval. |
| Credit balance | Messages are blocked when the balance runs out. | Sent dashboard, Billing. |
| A webhook | Replies and delivery updates reach the app through the webhook. | `npm run setup:webhook -- https://your-address`. |

## Why Sent rejects or blocks a text

The booking is always saved. When a text fails, the dashboard shows Sent's code and a hint under the booking.

| Code | What Sent says | Why it happens | How to fix it |
| --- | --- | --- | --- |
| `BUSINESS_035` | Until the account is onboarded, messages can only be sent to its verified phone number. | The account has not finished onboarding, so every other number is blocked. | Finish KYC in the Sent dashboard. Check `onboarding.status` until it says `ONBOARDED`, or ask Sent support. Test with your verified number meanwhile. |
| `DELIVERY_003` | The account has no sender set up for this destination on this channel. | You have no sender that can reach this country, or the country needs a registered sender. | Add the market for the country with `POST /v3/channels/sms` or in the dashboard. For the United States this means a registered 10DLC sender, which is explained below. |
| `BUSINESS_029` | A number the text was pinned to is not an active sender. | The app picked a number that is not active on the account. | Check the numbers under Channels and wait until the number is `ACTIVE`. |

If a code is not in this table, search the [Sent error catalog](https://docs.sent.dm/reference/api/error-catalog) for it.

## Countries

A sender is added per country. Sender names (alphanumeric senders) send only. A real number can also receive replies.

| Country group | What worked when this was tested | What it needs |
| --- | --- | --- |
| Germany, Netherlands, Austria, Switzerland, Denmark, Poland, Portugal, Greece, Hungary, Bahrain, Israel, South Africa, Mexico, Argentina, Chile, Colombia, Japan, South Korea, Hong Kong, Spain, Belgium, UAE, Saudi Arabia, Peru, Malaysia, Philippines, New Zealand, Canada | A sender name was added through the API with no documents. | A sender name of 3 to 11 letters. These senders send only. |
| United Kingdom, Australia, Singapore, France, Italy, Sweden, Norway, Finland, Ireland and others | Not possible through the API. | Documents uploaded in the Sent dashboard. |
| United States | A plain local number was created, but Sent failed every text to US phones with `DELIVERY_003`. | A registered 10DLC sender, which takes 1 to 3 business days after you apply. See the United States section. |

Adding a sender uses `client.channels.sms.create({ country, number_type, sender_value })`, and the same can be done in the dashboard. Sent's `compliance.setup_plan` tool says whether a country can be completed through the API.

## United States: why it is rejected, and how to fix it

A text to a US phone fails with `DELIVERY_003` ("the account has no sender set up for this destination on this channel") until your account has a registered US sender. US carriers only accept business texts from numbers registered with The Campaign Registry. This is called 10DLC. A plain local US number cannot send to US phones, so the app does not count a US or Canada local number as able to send. Sent's error catalog gives the fix as "add the market", and for the United States that means completing the registration below.

### Register in the Sent dashboard

1. Open **Compliance** in the sidebar and select **Apply** on the US 10DLC notice, or go straight to https://app.sent.dm/dashboard/brand-registration.
2. Fill in the form. The sections below say what to enter.
3. Sent's compliance team reviews it and gives feedback, then submits it to the registry. Most registrations are approved within 1 to 3 business days. Support at support@sent.dm usually answers within one business day.
4. When it is approved, open **Channels**, then the SMS tab, and check that the United States shows `ACTIVE`. New texts to US phones then deliver, and nothing in the app changes.

Fees: the registry's pass-through fees are waived for the first 12 months (low-volume mixed is $1.50 a month and standard is $10 a month afterwards). Sent charges its own campaign fee as well. The dashboard shows the exact amount before you confirm.

### What to enter

| Field | What to enter for this app |
| --- | --- |
| Brand name | The name customers know, for example `Maple Street Dental`. Do not use a legal entity suffix if your website and receipts do not. |
| Business details | Legal business name, business type, tax ID (EIN), address, website, and a contact name, email and phone. These come from your KYC form. |
| Campaign type | Appointment reminders. For a small business pick low-volume mixed, which allows up to 2,000 messages a day. |
| Campaign description | One or two sentences: `Maple Street Dental sends appointment confirmations and reminders to patients who book online, and answers their replies.` |
| Opt-in method | Web form. Give the address of your booking page. |
| Privacy and terms | Links to your privacy policy and terms of service. Set `PRIVACY_URL` and `TERMS_URL` so the booking page shows them next to the consent box. |

Sent's guide says a web form is rejected when any of these is missing before the customer submits: the program name, the message frequency, "Msg and data rates may apply", how to opt out, links to the privacy policy and terms, an explicit consent box that is not pre-checked. The booking page in this repo shows all of them in the consent box above the Confirm button, and the Confirm button stays disabled until the box is ticked. Add your privacy and terms links before you submit.

### Autoresponses and sample messages

Every campaign needs three documented autoresponses. Replace the brand name with yours.

| Autoresponse | Text |
| --- | --- |
| Opt-in confirmation | `Maple Street Dental: Welcome! Reply HELP for help. Message frequency varies. Msg and data rates may apply. Reply STOP to opt out.` |
| Opt-out confirmation | `Maple Street Dental: You have been unsubscribed and will not receive more messages.` |
| Help response | `Maple Street Dental: For help, email help@yourdomain.com or call 555 0100.` |

Appointment reminders need at least one sample message with the brand name. Use texts like the ones the app sends:

- `Maple Street Dental: Hello Emily, your appointment on Nov 28, 2026 at 10:00 AM is confirmed.`
- `Maple Street Dental: This is a reminder about your appointment on Nov 28, 2026 at 10:00 AM. Reply C to confirm or R to reschedule.`

The `STOP`, `START` and `HELP` keywords are answered by Sent. You can only send what your registered use case covers, so do not use this number for marketing.

### If it is rejected

Sent's compliance team tells you what to correct and how to resubmit. The most common cause is the opt-in form, so check that every element listed above is visible on your booking page.

## India: why customers there cannot reply, and how to fix it

What was observed on a real account:

- A sender name worked for sending. A text to an Indian phone was delivered by SMS from the sender name.
- A sender name cannot receive replies. A customer who answers `C` has nowhere to send it.
- A real Indian local number was requested through `POST /v3/channels/sms` with `country: 'IN'` and `number_type: 'LOCAL'`. It stayed in `PROVISIONING` with reason `CHANNEL_011` ("Sent is setting this market up") for more than a day. Sent's requirements tool publishes no steps for India, so nothing could be submitted from the account side.
- A number from another country cannot stand in. A US number sending to an Indian phone fails with `DELIVERY_003`.

India also regulates business SMS. The telecom regulator (TRAI) requires senders to register with the operators' DLT system, usually the business, the sender header and each message template, and sender-name delivery depends on that. Sent does not publish India requirements in its API, so confirm with Sent whether it handles this registration for you.

### How to get it fixed

| Option | Replies work | What to do |
| --- | --- | --- |
| Ask Sent about the Indian number | Yes, once the number is `ACTIVE` | Email support@sent.dm with the message below and ask what is blocking `CHANNEL_011` and whether India needs DLT details from you. |
| WhatsApp | Yes, for customers in any country | Open **Channels**, then the WhatsApp tab, and connect a WhatsApp Business account through Meta. The app then answers on the same channel the customer used. |
| Keep the sender name | No, outgoing only | Customers get the confirmation and reminder but cannot answer. The booking page and the dashboard say so for Indian numbers. |

Message to send to support:

> Subject: India LOCAL number stuck in PROVISIONING (CHANNEL_011)
>
> Customer ID: your customer ID from the Sent dashboard
>
> I requested an India LOCAL SMS number through POST /v3/channels/sms more than a day ago. The market still shows PROVISIONING with CHANNEL_011 and no number assigned. Please tell me what is blocking it, and whether I need to give you DLT registration details (entity, sender header, message templates) for India. I want customers in India to be able to reply to my appointment texts. If a local number is not possible, please tell me the supported way to receive replies from Indian phones, for example WhatsApp.

When the Indian number turns `ACTIVE`, nothing in the app changes. The next text to an Indian phone goes out from that number, and replies are answered from it.

## Replies stay on one number

A customer must answer the number the text came from. The app sends each text from a number that can receive replies in the customer's country. When the customer replies, the app answers from the number they texted. If your account has no such number for a country, the customer still gets the text, the booking page hides the reply instructions and the dashboard says the number cannot reply.

A plain-text reply is only allowed after the customer has texted you first. That is why the app answers replies in free text but sends the booking and reminder as templates.

## Test in this order

1. Run with `SENT_SANDBOX=true`. Sent validates every request and sends nothing, so you can try numbers from any country.
2. Switch sandbox off and book with your verified number. Check that the confirmation arrives and the dashboard shows `delivered`.
3. Book with a number in a country where you added a sender. Check the dashboard for a code if it fails.
4. Reply `C` or `R` from a phone that can text your reply-capable number. Check that the booking changes to `confirmed` or `reschedule_requested`.

## Look at the account from the command line

The Sent MCP server accepts your API key and answers the questions above without opening the dashboard:

```bash
curl -s https://mcp.sent.dm/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -H "x-api-key: $SENT_DM_API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"onboarding.status","arguments":{}}}'
```

Use `numbers.list` for your senders, `balance.get` for credit and `compliance.setup_plan` with a country and a sender type for the steps a country needs.
