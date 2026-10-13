# SETUP — getting Agency OS running on a fresh PC

Agency OS is a self-contained Next.js app with a local SQLite file. No external
database, no paid services required to start collecting and organizing leads.

## 1. Install prerequisites

- **Node.js 22.5+** (uses the built-in `node:sqlite` module — currently tested on Node 24).
  Download the LTS installer from https://nodejs.org/ and run it.
- **Git** — https://git-scm.com/download/win (used to clone + pull updates).
- A terminal (Windows: PowerShell; macOS/Linux: your shell).

Verify the installs:

```bash
node -v   # v22.5.0 or higher
npm -v
git --version
```

> If `node -v` prints something older than 22.5, the app will fail with
> `module is not defined in ES module scope` / `node:sqlite` errors. Upgrade Node.

## 2. Get the code

```bash
git clone https://github.com/WRECKERKNIGHT/leads-workflow-automation.git
cd leads-workflow-automation
```

Pull latest updates later with:

```bash
git pull
```

## 3. Install dependencies

```bash
npm install
```

## 4. Create the environment file

Copy the template into your local env file (never commit `.env.local`):

- Windows:

  ```bash
  copy .env.example .env.local
  ```

- macOS / Linux:

  ```bash
  cp .env.example .env.local
  ```

Open `.env.local` in a text editor and fill in at minimum:

| Variable | Needed for | Notes |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | message drafting / deep lead research | Create a free key at https://openrouter.ai/keys |
| `SMTP_USER` / `SMTP_PASS` | sending real emails | Gmail address + a 16-char **App Password** (see below) |
| `GOOGLE_PLACES_API_KEY` | finding businesses' own websites | Optional; only active discovery source for `website` |

### Get a Gmail App Password (for SMTP + IMAP)

1. Go to https://myaccount.google.com/apppasswords
2. Create an app password for "Mail" (you must have 2-Step Verification enabled).
3. Paste the 16-char password into `SMTP_PASS` and `MAIL_PASS` (same value).
4. Set `SMTP_USER` / `SMTP_FROM_EMAIL` / `SMTP_FROM_NAME` and `MAIL_USER` to your Gmail address.

> No `SMTP_*` values? The app still runs fine — it stays in draft mode and you
> hand leads off over WhatsApp instead (see `docs/WHATSAPP.md`).

## 5. Create the database

```bash
npm run scaffold-db
```

This creates `data/agencyos.db`. You can safely delete that file any time to
start from scratch; `scaffold-db` recreates it.

There is also a lead cleaner that strips placeholder/flaked phone numbers and
junk websites from an existing database:

```bash
node scripts/clean-leads.mjs --dry-run   # preview only
node scripts/clean-leads.mjs             # apply
```

## 6. Run it

Development server (hot reload, good for testing):

```bash
npm run dev
# open http://localhost:3000
```

Production build + serve:

```bash
npm run build
npm start
```

## 7. First run checklist

1. Open `/` — pick a category (e.g. **School**) and hit **Start category**.
2. The engine discovers leads from OpenStreetMap across India and organizes them.
3. Open `/c/school` and the **Leads** / **Workflow** / **Bots** tabs to watch it work.
4. Use **Chat** / **Copy** on a lead to hand it off to WhatsApp (`wa.me`), or
   **Export CSV / JSON** for the whole set.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `error: module is not defined in ES module scope` | Node < 22.5 — upgrade Node. |
| 500 `Cannot find module './NNN.js'` on every page | Stale `.next` — stop the server, delete the `.next` folder, run `npm run dev` again. |
| `EADDRINUSE ... :3000` | Another process owns port 3000 — kill it, or run `npm run dev -- -p 3001`. |
| No websites found | Expected without `GOOGLE_PLACES_API_KEY`; free web-search routes are bot-blocked. |
| Leads have no phone / WhatsApp column empty | Honest-by-design: OSM placeholder numbers are purged on write, only real Indian mobile numbers produce `wa.me` links. |
| Emails never send | SMTP creds missing or App Password wrong — test with `POST /api/smtp/test`. |

## On another PC (you)

1. `git clone` the repo,
2. `npm install`,
3. create `.env.local` **fresh** (private keys must never travel in git),
4. `npm run scaffold-db`,
5. `npm run dev`.

The database is a local file and not shared; each copy of the app runs its own lead set.