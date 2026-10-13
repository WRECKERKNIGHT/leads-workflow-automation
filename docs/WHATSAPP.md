# WhatsApp outreach — the two routes

Agency OS is **WhatsApp-first**: every real Indian mobile number on a lead becomes
a `wa.me` deep link with the first message already written. From there you have two
ways to actually send messages — one needs nothing, one can be fully automated.

## Route A — free `wa.me` deep links (zero setup, works today)

No API key, no WhatsApp Business account, no approval. Every lead row has:

- **Chat** — opens `https://wa.me/9198xxxxxxxxx?text=<prefilled message>` in a new
  tab, with the message already typed. You press Enter.
- **Copy** — copies the same link/message to the clipboard.

This is the default and it always works. It is manual: one human tap per lead.

How the link is built (`lib/whatsapp.ts` → `lib/phone.ts`):

- the phone is normalized to `91` + local 10-digit number,
- only **real Indian mobile numbers** (starts 6–9, 10 digits) get links — landlines
  and placeholder numbers never produce a `wa.me` link,
- the message is generated per-lead by the message agent and URL-encoded.

## Route B — Meta WhatsApp Cloud API (automated sending + inbound replies)

Use this when you want the engine itself to send and receive WhatsApp messages. It
requires a Meta Business account, a phone number, and a message template — not code
changes in Agency OS yet, so wire it up as a new agent/route following the SMTP
pattern in `agents/sender.ts` and `app/api/leads/[id]/whatsapp/route.ts`.

### 1. Prerequisites

- A **Meta Business account**: https://business.facebook.com
- A **WhatsApp Business Number** you can verify (a normal mobile works — you'll get
  an SMS/voice call with a code). You can trial with the built-in test number in
  the WhatsApp Cloud API docs.
- A phone that can receive an SMS/WhatsApp call for verification.

### 2. Create the app and get credentials

1. Go to https://developers.facebook.com/apps → **Create App** → type **Business**.
2. Add the product **WhatsApp**.
3. Under *Getting Started → API Setup*, copy:
   - **Phone number ID** (the number that sends),
   - **WhatsApp Business Account ID**,
   - **Temporary access token** (lives 24h — generate a long-lived token from the
     Graph API Explorer with scope `whatsapp_business_messaging`).

### 3. Create a message template (required to send)

WhatsApp only lets businesses start a conversation with an **approved template**:

1. In the app → WhatsApp → **Message templates** → **Create template**.
2. Category: select one matching your use (e.g. *Marketing* for the cold outreach
   pitch).
3. Example body (use the `{{1}}` variable for the business name):

   ```
   Hi {{1}}, we build simple, affordable websites and WhatsApp booking shows for
   local schools. Replies on WhatsApp, this chat.
   ```

4. Submit for review (usually a few minutes to a day).

### 4. Send a message (Proof of concept)

Once the template is approved, sending is one HTTP call:

```bash
curl -X POST "https://graph.facebook.com/v21.0/PHONE_NUMBER_ID/messages" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "91XXXXXXXXXX",
    "type": "template",
    "template": {
      "name": "YOUR_TEMPLATE_NAME",
      "language": { "code": "en" },
      "components": [ { "type": "body", "parameters": [ { "type": "text", "text": "Sunrise Public School" } ] } ]
    }
  }'
```

- Replace `PHONE_NUMBER_ID`, `ACCESS_TOKEN`, `to` = the lead's WhatsApp number
  (already normalized to `91XXXXXXXXXX` by `lib/phone.ts`), and the template name.
- A **24-hour window** opens once the business replies; within it you can send free-form
  messages (no template needed).

### 5. Receive replies

1. In the app → WhatsApp → **Configuration → Webhook**, add a webhook URL
   (e.g. `https://your-domain/api/whatsapp/webhook`).
2. Subscribe to the `messages` field and verify the webhook with the token Meta
   sends.
3. Incoming messages arrive as JSON — parse `entry[].changes[].value.messages[]`,
   update the lead's `stage` to `reply`, and feed it to `classifyReply`
   (see `agents/replies.ts`) the same way `agents/mail.ts` handles email replies.

### 6. Cost + tips

- WhatsApp Business API is free to use; Meta charges only for **conversations** and
  only from the template entry message. India per-conversation pricing applies.
- Verifying a real number costs nothing (SMS/call).
- Always send the *first* message as an approved template; anything after the first
  reply is free-form within 24 hours.
- Keep one WhatsApp Business number per niche to keep replies unambiguous.

## Which route should you use?

| | Route A (`wa.me`) | Route B (Cloud API) |
| --- | --- | --- |
| Setup | instant | Meta app + template review |
| Cost | free | free API, per-conversation fees |
| Sends | manual tap | automated by the engine |
| Receives replies | manual | webhook into the reply classifier |
| Right for | starting out, validating outreach | scaling the agency |