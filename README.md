# Email Sync CLI

**Email Sync** is a CLI tool to fetch emails from an IMAP mailbox, extract leads, and store them in a PostgreSQL database.

---

## Features

* Connect to IMAP email inbox
* Parse emails for leads (name, email, phone, JSON payloads)
* Store leads in PostgreSQL
* Prevent duplicates based on email + phone + received date
* CLI-based, easy to schedule via cron

---

## Requirements

* Node.js >= 18
* PostgreSQL database
* IMAP-enabled email account

---

## Installation

```bash
git clone <repo-url>
cd email-sync
npm install
```

Make the CLI executable:

```bash
chmod +x bin/email-sync.ts
```

---

## Environment Variables

Create a `.env` file at the root:

```env
IMAP_HOST=imap.mailprovider.com
IMAP_PORT=993
IMAP_USER=leads@example.com
IMAP_PASS=secret
IMAP_TLS=true

DATABASE_URL=postgresql://user:password@localhost:5432/leadsdb
```

* `IMAP_HOST`: Your IMAP server host
* `IMAP_PORT`: IMAP port (usually 993 for TLS)
* `IMAP_USER`: Email username
* `IMAP_PASS`: Email password
* `IMAP_TLS`: Use TLS (true/false)
* `DATABASE_URL`: PostgreSQL connection string

---

## Usage

Run the CLI:

```bash
./bin/email-sync.ts sync
```

Output example:

```
Syncing emails...
Saved lead id: 1 from john@example.com "New Lead" john@example.com 1234567890
Saved lead id: 2 from jane@example.com "Contact Request" jane@example.com 9876543210
Email sync complete.
```

---

## Database Schema

The tool automatically creates a `leads` table:

```sql
CREATE TABLE leads (
  id SERIAL PRIMARY KEY,
  email TEXT,
  name TEXT,
  phone TEXT,
  source TEXT,
  raw TEXT,
  received_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(email, phone, received_at)
);
```

---

## Notes

* Only **UNSEEN emails** are processed by default
* Emails are marked as **SEEN** after processing
* Extraction uses regex + JSON payload detection
* Can be scheduled using cron or a task scheduler for periodic syncing

---

## License

GNU AGPLv3 or later – see LICENSE file.
