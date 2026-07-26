# Master Build Prompt: Event Registration & QR Ticketing System

Use this as the system/task prompt for an AI coding agent (Claude Code, Antigravity, Cursor, etc.). It is written to be handed over as-is. Fill in the bracketed `[ ]` values before use.

---

## 0. Role & Objective

You are building a production-grade event registration and ticketing web application for a church event in Egypt, expected to serve **~10,000 registrants**. Users pay via InstaPay (peer-to-peer bank transfer, no merchant gateway available), submit a screenshot of the payment as proof, and receive a QR code ticket. Gate ushers scan the QR code at entry to validate and mark attendance.

The core engineering challenge is **verifying payment without a merchant account**, using AI vision to read payment screenshots and reconcile them against the real bank statement — while keeping the user-facing flow extremely simple for a non-technical, sometimes elderly, Arabic-speaking user base.

Build this end-to-end: database schema, registration flow, AI-assisted verification pipeline, admin review dashboard, QR generation, gate-scanning app, and ticket delivery via WhatsApp.

---

## 1. Tech Stack (fixed — do not substitute without asking)

- **Framework**: Next.js 14+ (App Router), TypeScript
- **Database & Auth**: Firebase — Firestore (NoSQL) for data, Firebase Auth for admin/usher accounts
- **Styling**: Tailwind CSS, mobile-first, RTL-first (Arabic primary language, English secondary)
- **Image storage**: Firebase Storage (direct client-to-storage uploads via the Firebase client SDK with a security-rules-gated upload path — never proxy large files through the Next.js API routes)
- **Vision/OCR**: Claude API (vision-capable model) for reading payment screenshots — NOT classic OCR (Tesseract), because user photos are frequently low-quality "photo of a screenshot taken on a different phone" (screen glare, moiré, skew, blur). Use structured JSON output.
- **QR generation**: `qrcode` npm package (server-side generation) with HMAC-signed payloads
- **Ticket delivery**: WhatsApp Business API (via Twilio or Meta Cloud API — ask user which they have access to) as primary channel; SMS as fallback; email as tertiary. Do not rely on email as the primary channel for this user base.
- **Background jobs**: Cloud Functions for Firebase (scheduled functions for reconciliation batch runs, Firestore-triggered functions for the OCR pipeline on new registrant documents)
- **Deployment**: Vercel for the Next.js app, Firebase (Functions + Firestore + Storage) for backend/data — this is a two-platform setup, which is the main tradeoff versus an all-in-one Supabase project; keep Firebase Admin SDK credentials in Vercel env vars to call Firestore/Storage from API routes.

---

## 2. Database Schema (Firestore)

Firestore has no joins and no server-side `WHERE a = X AND b = Y` across arbitrary fields the way SQL does, so the reconciliation logic needs to be structured around **document IDs as lookup keys** rather than relational matching. Design it like this:

```
/registrants/{registrantId}
  fullName: string
  phoneNumber: string              // primary contact number
  whatsappNumber: string           // number tickets are delivered to (may differ from phoneNumber)
  church: string
  paymentScreenshotUrl: string
  status: "pending_verification" | "auto_approved" | "manual_review" | "approved" | "rejected"
  ocrExtractedReference: string | null
  ocrExtractedAmount: number | null
  ocrExtractedSenderName: string | null
  ocrConfidence: "high" | "low" | "failed"
  adminNotes: string | null
  createdAt: timestamp
  verifiedAt: timestamp | null

/phoneIndex/{phoneNumber}          // exists purely to enforce "one registration per phone number",
  registrantId: string             // since Firestore has no native unique-field constraint.
                                    // Create this doc in the SAME transaction as the registrant write;
                                    // if it already exists, reject the registration as a duplicate.

/bankTransactions/{referenceNumber}  // KEY INSIGHT: use the InstaPay reference number itself as the
  amount: number                     // document ID, not an auto-generated one. This turns reconciliation
  senderName: string | null          // from a "query and filter" operation into a single fast document
  transactionDate: timestamp         // read: getDoc(bankTransactions/{extractedReference}). This is the
  matchedRegistrantId: string | null // Firestore-native equivalent of the SQL unique-index lookup.
  importedAt: timestamp

/tickets/{registrantId}            // 1:1 with an approved registrant — use registrantId as the doc ID
  qrToken: string                  // signed token encoded in the QR
  used: boolean
  usedAt: timestamp | null
  usedByUsherId: string | null
  createdAt: timestamp

/staff/{authUid}                   // authUid = the Firebase Auth UID, so lookup on login is a direct get
  name: string
  role: "admin" | "usher"
```

**Why reference-number-as-document-ID matters**: it's the single biggest structural decision in a Firestore version of this system. It replaces the SQL `UNIQUE` constraint on `bank_transactions.reference_number` (which also gives you free duplicate-detection) with an equally strong guarantee — `setDoc` with `{ merge: false }` on an existing ID fails, and a duplicate-reference-number fraud attempt (reusing someone else's screenshot) becomes a simple "does this document already have a `matchedRegistrantId`" check, not a collection query.

**Security rules** (Firestore Security Rules, not RLS, but same intent): public/anon clients may only `create` documents in `/registrants` (never `update`/`delete`), and only ever write their own `/phoneIndex/{phoneNumber}` doc matching the phone number in the registrant doc they're creating (enforce via a rules function comparing the two in the same request). `/bankTransactions`, `/tickets`, and `/staff` must be written only by Cloud Functions using the Admin SDK (which bypasses security rules) or by authenticated staff with the right `role` custom claim — never directly from the public client.

Set a **custom claim** (`role: "admin"` or `role: "usher"`) on staff Firebase Auth accounts via the Admin SDK, and check `request.auth.token.role` in security rules for staff-only paths.

---

## 3. User-Facing Registration Flow

**Design constraint: assume the user may be elderly, non-technical, and possibly using a low-end Android phone. Every screen must work with zero prior explanation.**

### Screen 1 — Registration form (Arabic, RTL, large touch targets)
Fields (minimal, only these):
1. الاسم الكامل (Full name) — text input
2. الكنيسة (Church) — dropdown of known churches (populate from `[list to be provided by user]`), with "أخرى" (other) free-text fallback
3. رقم الموبايل (Phone number) — tel input, validate Egyptian format (`01[0125]XXXXXXXX`). This is the primary contact number and the one checked against the unique constraint to prevent duplicate registrations.
4. رقم الواتساب (WhatsApp number) — tel input, same validation. **Default this field to auto-fill with whatever was typed in field 3**, plus a small checkbox/toggle above it: "نفس رقم الموبايل" (same as phone number), checked by default. Only if the user unchecks it does a second input appear for a different number. This handles the common case (same number for both) with zero extra typing, while still supporting the case where WhatsApp is on a family member's phone. This is the number tickets get delivered to.
5. صورة إيصال الدفع (Payment screenshot) — `<input type="file" accept="image/*" capture="environment">` so it opens the camera directly on mobile, but also allow gallery selection. Show large "التقط صورة" (take photo) / "اختر من المعرض" (choose from gallery) buttons.

**Field order and grouping matters for smoothness**: keep phone and WhatsApp visually grouped together (one small section, not two separate far-apart fields) so the relationship between them ("is it the same number?") reads instantly instead of confusing the user. Do not label them in a way that requires reading fine print — "same as above" checkbox should be the loudest visual cue.

On submit:
- Upload image directly to Firebase Storage from the client SDK (do not route the binary through your API route); security rules should restrict writes to a path scoped to a freshly-generated registrant ID and reject files above a size limit / non-image types.
- In a single Firestore **transaction**, create the `/registrants/{registrantId}` doc AND the `/phoneIndex/{phoneNumber}` doc together — if the phone index doc already exists, abort the transaction and tell the user this number already registered (this is your duplicate-registration guard, replacing a SQL unique constraint).
- Immediately show a confirmation screen: "تم استلام طلبك، جاري التحقق..." (we received your request, verifying now) — never leave the user on a blank/uncertain state.
- The verification pipeline (Section 4) triggers automatically via a Cloud Function `onCreate` trigger on `/registrants/{registrantId}` — no need to separately "kick it off" from the client.

### Screen 2 — Live verification feedback (optional but recommended)
If feasible, subscribe to the registrant's document with Firestore's `onSnapshot` so the page updates automatically the moment status changes (no polling needed — this is one of Firestore's genuine strengths for this use case):
- If OCR extraction fails or confidence is low → show: "الصورة غير واضحة، برجاء إعادة المحاولة بصورة أوضح" (image unclear, please retry with a clearer photo) with a retry button — catch bad photos at submission time, not days later in a review queue.
- If auto-approved → show ticket immediately + trigger WhatsApp delivery.
- If flagged for manual review → show: "طلبك قيد المراجعة وسيصلك التذكرة قريبًا" (your request is under review, ticket coming soon) with an estimated timeframe and a support contact number.

### Screen 3 — Ticket display
Once approved: show the QR code full-screen, large, with the registrant's name and church beneath it. Also trigger delivery via WhatsApp (Section 6). Provide a "تحميل التذكرة" (download ticket) button that saves the QR as an image, for users who don't have WhatsApp.

---

### Flow-smoothness checklist (apply throughout, not just Screen 1)

- **One question per screen, or one tight group at most.** Do not present all 5 fields plus an image uploader as one long scrolling form if it can be avoided — consider a short multi-step wizard (name → church → phone/WhatsApp → payment photo) with a visible progress indicator ("خطوة ٢ من ٤"), so nothing looks like a wall of admin paperwork. A single-page form is acceptable too if it's short and uncluttered — the point is no scrolling confusion or field-skipping.
- **No dead ends.** Every screen has an obvious, single, large next action. Never leave the user looking at a spinner with no explanation of what's happening or how long it takes.
- **No back-and-forth required.** Auto-fill the WhatsApp field from the phone field (above). Auto-detect image orientation. Don't make the user re-enter anything they already typed.
- **Errors are specific and actionable, never generic.** Not "خطأ" (error) alone — say what's wrong and what to do ("رقم الموبايل غير صحيح، تأكد من كتابة ١١ رقم" — phone number invalid, make sure it's 11 digits).
- **Submit button stays disabled/greyed until the form is genuinely valid**, so users don't tap submit, wait, and get bounced back with errors — validate inline as they type/upload instead.
- **Assume patchy mobile data.** Show upload progress on the image (it's the largest payload), and make the submit button show a clear "جاري الإرسال..." (sending...) state so a slow connection doesn't look like a frozen/broken page.
- **Test the whole flow on an actual low-end Android phone with a throttled connection**, not just on a desktop browser, before the registration window opens.

## 4. Payment Verification Pipeline (the core of this project)

This runs as a Cloud Function triggered `onCreate` for new documents in `/registrants`.

### Step 1 — Vision extraction
Send the uploaded screenshot to the Claude API (vision) with a prompt instructing it to extract structured data from an InstaPay confirmation screen. Request **strict JSON output only**, e.g.:

```json
{
  "reference_number": "string or null",
  "amount": "number or null",
  "sender_name": "string or null",
  "transaction_date": "string or null",
  "confidence": "high | low | failed",
  "notes": "anything unusual, e.g. image is blurry, appears to be a screenshot of a screenshot, etc."
}
```

Prompt guidance to give the model:
- The image may be a direct app screenshot OR a photo taken of one phone's screen by another phone (common when the payer doesn't own a smartphone) — expect glare, moiré patterns, skewed angle, partial blur. Do your best to extract accurately regardless.
- If any field is unreadable, return `null` for that field rather than guessing.
- Set `confidence: "failed"` if the image does not appear to be a payment confirmation screen at all.

Write the extracted fields back onto the `/registrants/{registrantId}` doc.

### Step 2 — Reconciliation against real bank data
- The church's bank account holder periodically exports the incoming InstaPay transaction list (CSV/PDF/manual entry — build an admin import screen for this, see Section 5). The import job writes each row to `/bankTransactions/{referenceNumber}` — **using the reference number as the document ID is what makes this step fast and simple**: reconciliation becomes `const txDoc = await getDoc(doc(db, "bankTransactions", extractedReference))` instead of a filtered collection query.
- Match logic: does `bankTransactions/{ocrExtractedReference}` exist, and does `abs(ocrExtractedAmount - txDoc.data().amount) < tolerance`?
- **Reject duplicate reference numbers**: if `txDoc.data().matchedRegistrantId` is already set to a *different* registrant ID, flag both registrants for manual review (screenshot-reuse fraud pattern) rather than approving the second one.

### Step 3 — Status resolution
- OCR confidence `high` + reconciliation match found + reference number not already matched to someone else → `status = 'auto_approved'`, set `matchedRegistrantId` on the bank transaction doc → generate ticket immediately.
- OCR confidence `failed`, or no bank transaction doc exists yet, or mismatch, or duplicate reference → `status = 'manual_review'` → appears in admin queue with the OCR-extracted fields pre-filled so a reviewer only has to sanity-check, not read the raw image cold.
- Admin approves/rejects manually from the dashboard → `status = 'approved'` or `'rejected'`.

### Important: this pipeline should degrade gracefully
If no bank transaction doc exists yet at submission time (likely, since reconciliation may run daily rather than real-time), the registrant routes to `manual_review` until the next import batch runs. Write a separate reusable Cloud Function (`reconcileAllPending`) that: queries all `/registrants` where `status == "manual_review"`, re-checks each `ocrExtractedReference` against `/bankTransactions`, and re-resolves status. Trigger this both on a **scheduled Cloud Function** (e.g. every few hours, or after each bank statement import) and on-demand from the admin dashboard.

---

## 5. Admin Dashboard

Auth-gated (Firebase Auth, custom claim `role == "admin"`). Build these views:

1. **Pending/manual review queue** — table of registrants needing attention, showing: uploaded image thumbnail, OCR-extracted fields, any reconciliation near-matches, with one-click Approve/Reject buttons. Approve → generates ticket + triggers delivery.
2. **Bank statement import** — a simple CSV upload (or manual paste) screen that writes each row to `/bankTransactions/{referenceNumber}` (use a Cloud Function or admin-SDK batched write, keyed by reference number as described in Section 2), plus a "run reconciliation now" button that calls `reconcileAllPending`.
3. **All registrants** — searchable/filterable table (by phone, name, church, status) for support purposes. Note: Firestore queries need composite indexes for multi-field filters (e.g. filtering by `church` AND `status` together) — define these in `firestore.indexes.json` as query patterns are finalized, or the query will fail at runtime with a console link to auto-create the index.
4. **Stats overview** — total registered, approved, pending, checked-in count (for event-day monitoring). At 10k documents, simple `count()` aggregation queries (Firestore's server-side count) are fine; avoid pulling full collections client-side to compute counts.

---

## 6. Ticket Delivery

After a registrant reaches `status = 'approved'` or `'auto_approved'`:
1. Generate `qr_token = ticketId + "." + HMAC_SHA256(ticketId, TICKET_SECRET)` — base64 or hex encode the whole thing. Store in `/tickets/{registrantId}.qrToken` (use `registrantId` as the ticket doc ID for a direct 1:1 lookup). Encode this string (not raw `ticketId`) in the QR image, so a scanner can validate authenticity without trusting the ticket ID alone.
2. Render QR as a PNG server-side.
3. Send via WhatsApp (preferred — build using Twilio WhatsApp API or Meta Cloud API, ask user which credentials they have) to `registrants.whatsapp_number` (not `phone_number` — these can differ) as an image message with a short caption including name and church. Fall back to SMS on `phone_number` (just a link to view the ticket page) if WhatsApp send fails. Email as a distant third option.
4. Always also make the ticket viewable at a stable URL (`/ticket/[registrantId]`, auth-free but unguessable UUID) so the user can retrieve it themselves if a message is lost.

---

## 7. Gate Scanning (Usher App)

A separate lightweight route (`/scan`), auth-gated for Firebase Auth accounts with custom claim `role == "usher"`, mobile-optimized, using the device camera (via a JS QR-scanning library like `html5-qrcode` or `jsQR`).

On scan:
1. Client sends the raw QR string to a `/api/scan` endpoint.
2. Server splits `ticketId` and the HMAC signature, recomputes the HMAC, and rejects immediately if it doesn't match (tampered/fake QR).
3. If valid, perform an **atomic check via a Firestore transaction** to prevent race conditions from simultaneous scans at multiple gates — this is the one place Firestore requires more care than a single SQL statement, since there's no `UPDATE ... WHERE used = false` equivalent in one call:
   ```javascript
   await runTransaction(db, async (tx) => {
     const ticketRef = doc(db, "tickets", ticketId);
     const snap = await tx.get(ticketRef);
     if (!snap.exists()) throw new Error("invalid_ticket");
     if (snap.data().used) throw new Error("already_used");
     tx.update(ticketRef, { used: true, usedAt: serverTimestamp(), usedByUsherId: usherId });
   });
   ```
   Firestore transactions automatically retry on write conflicts and guarantee the read-then-write is atomic, so two simultaneous scans of the same ticket will always result in exactly one success and one `already_used` — this must run inside a Cloud Function or a trusted server context (Next.js API route with the Admin SDK), never directly from the usher's client, since a client-side transaction could be tampered with.
4. Zero rows updated → ticket was already scanned → return a clear "تم الدخول من قبل" (already used) response, ideally showing when/which gate it was first used at.
5. One row updated → success → show a large green success screen with the registrant's name and church, so the usher can visually confirm identity too.
6. Invalid/unknown token → large red "غير صالح" (invalid) screen.

Build this screen to work with poor venue connectivity in mind: show a clear loading/offline state, and consider a lightweight local cache of ticket IDs (not full validation, just a "have I seen this ID sync from server recently" check) as a degraded fallback if the network drops — flag this as a stretch goal, confirm with the user whether venue wifi is reliable before over-building this.

---

## 8. Build Order (suggested phases)

1. Firebase project setup (Firestore, Storage, Auth) + security rules + custom claims for staff roles + `firestore.indexes.json` for the query patterns you'll need.
2. Registration form (Arabic UI) + direct-to-storage image upload + registrant row creation.
3. Claude vision OCR extraction pipeline (test against a handful of real/sample InstaPay screenshots, including low-quality "photo of a screenshot" examples).
4. Bank statement import + reconciliation matching logic.
5. Admin dashboard (review queue, import screen, stats).
6. QR generation + signed token scheme + ticket display page.
7. WhatsApp/SMS delivery integration.
8. Usher scanning app + atomic check-in logic.
9. End-to-end test with a small pilot batch before the real registration window opens.
10. Load-test the registration and scan endpoints for expected concurrency (registration bursts at opening, scan bursts at gate opening).

---

## 9. Non-negotiable constraints, restated

- No merchant/payment gateway account is available — verification must work off screenshot + bank statement reconciliation.
- The registration UI must require zero technical literacy: minimal fields, camera-first image capture, Arabic-first, large touch targets, immediate and clear feedback at every step.
- OCR must be vision-LLM based (not classic OCR) to handle low-quality "photo of another phone's screen" submissions.
- Every failure mode (unreadable image, no bank match, duplicate reference) must degrade to a manual review queue, never a silent failure or a stuck user.
- QR tokens must be signed (HMAC), and ticket check-in must be atomic to prevent double-entry race conditions.
- Primary ticket delivery channel is WhatsApp, not email.

---

## 10. Open questions to resolve with the user before/while building

- [ ] WhatsApp API access: Twilio or Meta Cloud API — which does the user have credentials for?
- [ ] Church list: get the actual list of churches to populate the dropdown.
- [ ] Bank statement export format: what does the receiving bank actually offer (CSV export? PDF only? manual app viewing only)?
- [ ] Expected registration window: single burst opening, or rolling over days/weeks? (affects whether async job queuing is needed)
- [ ] Number of gates/ushers on event day (affects concurrency testing target for `/scan`).
- [ ] TICKET_SECRET, Claude API key, and Firebase Admin SDK service account credentials — confirm environment variable setup in Vercel.
