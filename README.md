# Recruitment_Admin_Portal

This repository contains the backend architecture and API routes for the Admin/Domain Head side of the Recruitment Portal. It operates in accordance with the Candidate Backend, sharing a unified MongoDB database to seamlessly manage fresher applications, multi-stage evaluations, and interview scheduling.

## Tech Stack
- **Runtime:** Node.js
- **Framework:** Express.js
- **ORM:** Prisma
- **Database:** MongoDB
- **Security & Auth:** bcrypt, jsonwebtoken (JWT)
- **Mailing:** Nodemailer (Gmail SMTP with rate limiting and dry-run support)

---

## Current Architecture & Shared Schema
The database architecture is synchronized with the Candidate backend to ensure seamless data flow. Key shared models include:
- **Admin:** Stores Root Admins and Domain Heads with secure password hashing (`password String?`) and role-based access control.
- **Application:** Stores candidate status, review scores, and the new Round 1 decision workflow fields:
  - `round1Decision Round1Decision?` (`SHORTLIST` | `REJECT`)
  - `round1DecisionAt DateTime?`
  - `round1EmailSentAt DateTime?`
  - `review1Marks Int?`, `review1Comments String?`, `review1Passed Boolean`
  - `review2Marks Int?`, `review2Comments String?`, `review2Passed Boolean`
- **Slot & SlotBooking:** Manages interview scheduling blocks, interviewer assignments, meeting links, and candidate reservations.
- **EmailLog:** Tracks dispatched recruitment emails (`SHORTLISTED`, `REJECTED`, etc.), delivery attempts, timestamps, and dry-run notes.

---

## New Shortlist & Email Workflow

### 1. Separate Round 1 Decisions (`PUT /api/admin/applicants/:applicationId/review`)
- Decisions are decoupled from immediate stage changes. Domain Heads/Root Admins mark `round1Decision` as `"SHORTLIST"`, `"REJECT"`, or `null` (undecided).
- Marking `SHORTLIST` sets `review1Passed: true`; `REJECT` or `null` sets `review1Passed: false`.
- Setting a decision is permitted **only** while the application is submitted, currently in `FORM_FILLING`, and `round1EmailSentAt` is null (otherwise returns `409 DECISION_LOCKED`).
- **Direct stage jumps are blocked:** A `PUT` attempting to move `FORM_FILLING` directly to `SHORTLISTED` or `REJECTED` is refused with `409 USE_DECISION_FLOW`. The stage transition occurs solely when decision emails are dispatched.
- Once `round1EmailSentAt` is populated, Round 1 scores, comments, decisions, and answer scores become immutable (`409 DECISION_LOCKED`).

### 2. Decision Summary & Email Templates
- **`GET /api/admin/round1/summary?domain=`**: Returns real-time counts for `undecided`, `pendingShortlist`, `pendingReject`, `sentShortlist`, and `sentReject`.
- **`GET /api/admin/round1/templates?decision=`**: Returns editable default notification copy with merge tags:
  - `{{name}}`: Candidate full name
  - `{{division}}`: Clean division label (e.g. "Research & Development", "Tech")
  - `{{site_url}}`: Configured candidate portal URL (`CANDIDATE_SITE_URL`)

### 3. Batch Email Dispatcher (`POST /api/admin/round1/send`)
- Accepts `{ domain, decision: "SHORTLIST" | "REJECT", subject, body, limit? }`.
- Domain Heads are strictly restricted to their assigned domain (`403 WRONG_DOMAIN`); Root Admins must pass an explicit domain (never `"ALL"`).
- Processes up to `limit` candidates (default 20, max 50) in FIFO order.
- Dispatches emails sequentially with ~1.2s delay between messages.
- **Atomic updates:** On dispatch success, updates application `stage` to `SHORTLISTED` or `REJECTED`, sets `round1EmailSentAt`, and logs an `EmailLog` row marked `SENT`.
- **Idempotent:** Applications with an existing `SENT` log for that decision are automatically skipped.
- **Dry-run mode (`EMAIL_DRY_RUN=true`):** Bypasses SMTP transmission, applies state transitions, and records `"dry run"` in the email log.

### 4. Interview Scoring Guardrails
- `PUT /api/admin/applicants/:applicationId/review` accepts `review2Marks` (0 to 10), `review2Comments`, and `review2Passed` **only** when:
  1. The application is in `INTERVIEW` stage or later.
  2. The candidate's booked interview slot `endTime` has elapsed.
- Any attempt to submit interview marks before the slot ends returns `409 INTERVIEW_NOT_DONE`.

### 5. Form Question Length & Management
- Questions store `maxLength: 100000` (character limits removed).
- `PUT /api/admin/form/question/:id` and `PUT /api/admin/form/subsection/:id` allow in-place editing under domain access checks.
- `DELETE /api/admin/form/question/:id` and `DELETE /api/admin/form/subsection/:id` return `409 QUESTION_HAS_ANSWERS` if candidate answers already reference them.
- One-off migration script: `npx tsx scripts/unlimit-questions.ts` sets `maxLength: 100000` across all existing questions.

---

## Candidate Backend Synchronization Instructions

When deploying this workflow to the candidate backend repository:
1. Copy `backend/prisma/schema.prisma` directly to the candidate backend repo at `prisma/schema.prisma`.
2. In the candidate backend repo, execute:
   ```bash
   npx prisma generate
   npx prisma db push
   ```
Both repositories share the exact same MongoDB collection schemas.

---

## Running Verification Suite

To verify all 5 workflow test cases (marking/updating decisions, stage jump rejection, dry-run batch email dispatch, cross-domain protection, and interview time guardrails):
```bash
npx tsx scripts/run-checks.ts
```
