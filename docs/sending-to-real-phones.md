# Why a text may not send, and the compliance you need to apply for

A booking always works. A text only reaches a phone when your Sent account is allowed to send to that country, and many countries make you register before they allow business texts. This is the usual reason a booking shows "failed" or "blocked" while the app itself is fine. This page explains each cause, which registration fixes it and how to apply.

## The short version

| What you see | Why it happens | What to apply for |
| --- | --- | --- |
| Only your own number receives texts, others are `blocked` with `BUSINESS_035` | The Sent account is not onboarded yet. | Finish identity and business verification (KYC) in the Sent dashboard. |
| A text to a country fails with `DELIVERY_003` | The account has no sender set up for that country. | Add a sender for the country. Some countries need a registration or documents first. |
| Texts to US phones fail with `DELIVERY_003` | US carriers only accept business texts from registered numbers. | Register for 10DLC, the US business texting registration. |
| Customers get texts but their reply goes nowhere | The text came from a sender name, which cannot receive replies. | Add a real number in that country, or connect WhatsApp. |
| The text has no "Reply C or R" sentence | Your reply templates are not approved yet. | Wait for Sent to approve them. Replies still work without them. |
| Texts stop with a balance error | The account is out of credit. | Add credit in Billing. |

## Compliance checklist

Work down this list once, in this order.

1. **Onboarding (KYC).** In the Sent dashboard, complete the verification flow and add a payment method. Check the result with the status tool in the last section. It must read `ONBOARDED`. Until then Sent only lets the account text its verified number.
2. **A sender for each country you text.** In **Channels**, add the country. Sender names (alphanumeric senders) are the simplest, they need 3 to 11 letters and they send only. Some countries need documents uploaded in the dashboard. A few countries accept a sender name through the API with no documents, and Sent's `compliance.setup_plan` tool tells you which.
3. **US registration (10DLC).** Needed before any text reaches a US phone. See the United States section.
4. **A way to receive replies.** A real number in the customer's country, or WhatsApp. See Replies stay on one number.
5. **Templates.** Run `npm run setup:templates`. Your own templates add the reply instruction and need approval. Sent's standard templates work in the meantime.
6. **A webhook.** Run `npm run setup:webhook -- https://your-address` so that delivery updates and replies reach the app.

## Error codes

When a text fails, the dashboard shows Sent's code and a hint under the booking.

| Code | What Sent says | Cause | Fix |
| --- | --- | --- | --- |
| `BUSINESS_035` | Until the account is onboarded, messages can only be sent to its verified phone number. | The account has not finished onboarding. | Finish KYC, wait for `ONBOARDED`, or ask Sent support. Test with the verified number meanwhile. |
| `DELIVERY_003` | The account has no sender set up for this destination on this channel. | No sender covers the country, or the country needs a registered sender. | Add the market for the country in **Channels** or with `POST /v3/channels/sms`. For the United States, complete 10DLC. |
| `BUSINESS_029` | A number the text was pinned to is not an active sender. | The chosen number is not active on the account. | Wait until the number shows `ACTIVE` under **Channels**. |

For any other code, search the [Sent error catalog](https://docs.sent.dm/reference/api/error-catalog).

## Adding a country

A sender is added per country, in the dashboard under **Channels** or with `client.channels.sms.create({ country, number_type, sender_value })`. Sender names send only. A real number can also receive replies.

| Country group | What to expect |
| --- | --- |
| Many countries in Europe, the Middle East, Africa and Latin America, plus Japan, South Korea and Hong Kong | A sender name was added through the API without documents. These send only. |
| Countries such as the United Kingdom, Australia, Singapore, France and Italy | Documents must be uploaded in the Sent dashboard. The API refuses them. |
| United States | A plain local number is not enough. Register for 10DLC. |

A number from one country cannot send to another country. A US number sending to a phone elsewhere fails with `DELIVERY_003`, so each country you serve needs its own sender.

## United States: why it is rejected, and how to fix it

A text to a US phone fails with `DELIVERY_003` ("the account has no sender set up for this destination on this channel") until your account has a registered US sender. US carriers only accept business texts from numbers registered with The Campaign Registry. This is called 10DLC. A plain local US number cannot send to US phones, so the app does not count a US or Canada local number as able to send.

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

## Replies stay on one number

A customer must answer the number the text came from. The app sends each text from a number that can receive replies in the customer's country. When the customer replies, the app answers from the number they texted. If your account has no such number for a country, the customer still gets the text, the booking page hides the reply instructions and the dashboard says the number cannot reply.

To let customers reply in a country, add a real number in that country, or connect WhatsApp under **Channels**, which works for customers anywhere. If Sent leaves a number in `PROVISIONING` for a long time, email support@sent.dm with the market's status code and ask what it is waiting for.

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
