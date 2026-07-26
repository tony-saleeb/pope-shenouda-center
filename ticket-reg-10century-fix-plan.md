# `ticket-reg-10century` — Remediation Prompt Plan

**Target:** Antigravity IDE · **Models:** Gemini 3.6 Flash (high) + Opus 4.6 (effort high)
**Source:** the full technical review of commit `a47b72d`
**Format:** 36 tasks across 3 phases. Every task = one agent prompt + one verification gate. **Do not start the next task until the current gate passes.**

---

## ⚠️ Read this before you start

### Ordering is not the same as the review's

The review listed findings by severity. **This plan orders them by dependency**, because three of the P0 fixes will brick the app if applied in severity order:

| Trap | Why |
|---|---|
| Locking `firestore.rules` read first | `/status`, `/ticket`, `/ticket/lookup` all read Firestore directly from the browser. Lock reads before the server routes exist → those pages 500 for every user. **P0-9 must come after P0-7 and P0-8.** |
| Setting `allow create: if false` on `registrants` | Registration is a direct client→Firestore write. Kill it before `/api/register` exists → nobody can register. **That lockdown is P1-1, not P0.** |
| Role-based rules before claims exist | The primary admin is admin *by hardcoded email*, likely with **no `role` custom claim**. Deploy `request.auth.token.role == 'admin'` rules and the primary admin loses dashboard access instantly. **P0-9 has a mandatory pre-step for this.** |

### Model routing

| Use | Model | Why |
|---|---|---|
| Auth, crypto, Firestore rules, API design, data migrations, architecture | **Opus 4.6 (effort high)** | A subtle mistake here *is* the vulnerability. Worth the latency. |
| Asset optimisation, lint fixes, style extraction, docs, dependency moves, aria attributes, config | **Gemini 3.6 Flash (high)** | High-volume mechanical edits with clear specs. Fast and cheap. |

Rule of thumb: **if getting it wrong creates a security hole, use Opus.** 14 of 36 tasks are Opus.

### Branching

One branch per phase, one commit per task:

```bash
git checkout -b fix/p0-security
# ...after each task gate passes:
git add -A && git commit -m "P0-3: enforce HMAC signature in scan route"
```

Never squash the phase into one commit — you'll want to bisect if the event-day scanner misbehaves.

---

## Pre-flight (human tasks — agents cannot do these)

Do these **before P0-0**. Everything else stalls without them.

- [ ] **Firebase Console → App Check** — register the web app, create a reCAPTCHA v3 site key. Do **not** enable enforcement yet (that's P0-12).
- [ ] **Generate a new `TICKET_SECRET`**: `openssl rand -hex 32`. Keep it out of chat and out of the repo.
- [ ] **Generate a new `USHER_PASSCODE`** (≥8 chars, not numeric-only) and a **`WHATSAPP_BOT_TOKEN`**: `openssl rand -hex 24`.
- [ ] **Upstash Redis** (or equivalent) — free tier is fine. You need `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` for rate limiting. In-memory limiters do not work on serverless: every cold start resets the counter.
- [ ] **Confirm whether tickets are already in circulation.** If any attendee already has a QR code, rotating `TICKET_SECRET` invalidates it — P0-2 includes a reissue script, but you need to know the answer first.
- [ ] **Check `firebase auth:export`** — does `tonysaleeb23@gmail.com` have a `role` custom claim? This determines whether P0-9 locks you out.

---

## Project rules file (do this once)

The repo already has an `AGENTS.md` (currently just a Next.js 16 warning). **Append the block below to it.** Every agent session picks this up automatically, so you don't repeat it in every prompt.

````markdown
# Project rules — ticket-reg-10century

## Non-negotiables
- **Never weaken `firestore.rules` or `storage.rules`.** If a change requires looser rules, stop and say so instead.
- **Never introduce a fallback secret, default password, or default passcode.** Missing env var = throw, never degrade.
- **Never log or return raw exception text to a client.** Log server-side, return a generic message + correlation ID.
- **All user-facing strings are Arabic.** Preserve existing Arabic copy exactly; new strings must be Arabic and RTL-safe.
- **`tsc --noEmit` must stay at zero errors.** `strict: true` is not negotiable.
- This is Next.js **16** with Turbopack — APIs differ from Next 14/15. Check `node_modules/next/dist/docs/` before using an App Router API you're unsure about.

## Conventions
- Path alias `@/*` → `./src/*`
- Server-only Firebase access via `@/lib/firebase/admin` (lazy singleton). Client via `@/lib/firebase/client`.
- API routes return `NextResponse.json`. Auth via `requireAdmin` / `requireUsher` from `@/lib/auth/guards`.
- Domain types live in `@/lib/types` — extend there, don't redeclare inline.

## Scope discipline
- Change only the files named in the task. If a fix requires touching an unnamed file, list it and ask first.
- Do not "improve" adjacent code, reformat untouched lines, or add dependencies not named in the task.
- Do not add comments explaining what you changed — the commit message does that.

## Definition of done
Every task ends with: `npx tsc --noEmit` clean, `npx next build` succeeds, and the task's stated acceptance criteria met.
````

---

# PHASE P0 — Launch Blockers

**15 tasks · ~1.5–2 days · branch `fix/p0-security`**
Nothing ships until all 15 gates are green.

---

## P0-0 · Baseline, env validation, `.env.example`

**Model:** Gemini 3.6 Flash · **Depends on:** pre-flight

```
Set up the safety scaffolding for a security remediation pass. Three deliverables.

1. Create `.env.example` in the repo root. The app currently reads these — document
   every one with a comment and a placeholder value (never a real value):
   NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
   NEXT_PUBLIC_FIREBASE_PROJECT_ID, NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, NEXT_PUBLIC_FIREBASE_APP_ID,
   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY,
   GEMINI_API_KEY, GEMINI_MODEL, TICKET_SECRET, USHER_PASSCODE, CRON_SECRET,
   GREENAPI_INSTANCE_ID, GREENAPI_API_TOKEN, ULTRAMSG_INSTANCE_ID, ULTRAMSG_TOKEN,
   WHATSAPP_WEBHOOK_URL
   Search the codebase for `process.env.` to confirm you have not missed any.
   Mark each as REQUIRED or OPTIONAL based on how the code actually uses it.

2. Create `src/lib/env.ts` exporting typed getters for SERVER-ONLY vars:
   getTicketSecret(), getUsherPasscode(), getCronSecret(), getGeminiApiKey().
   CRITICAL: validate LAZILY inside each function, not at module top level.
   Top-level throws break `next build`, which evaluates modules during static
   generation. Each getter throws `new Error('<VAR> is required')` when missing.
   Do not add a fallback value to any of them.

3. Add a `typecheck` script to package.json: "typecheck": "tsc --noEmit"

Do not modify any other file. Do not wire env.ts into consumers yet — later tasks do that.
```

**GATE P0-0**
```bash
npx tsc --noEmit && npx next build   # both must succeed
grep -c "=" .env.example              # expect >= 19
grep -rn "process.env" src/ | grep -v "env.ts" | wc -l   # note this number as a baseline
```
✅ Pass when: build succeeds with `.env` absent (proves lazy validation works).

---

## P0-1 · Fix the HMAC verification bypass 🔴

**Model:** Opus 4.6 (effort high) · **Depends on:** P0-0
*This is the single most important task in the plan.*

```
`src/lib/qr/hmac.ts` contains a critical authentication bypass. Fix it and prove
the fix with tests.

THE BUG (verifyTicket, line ~43):
    const expectedSignature = createHmac('sha256', TICKET_SECRET)
      .update(ticketId).digest('hex')
      .substring(0, providedSignature.length);   // truncated to ATTACKER's length
    if (providedSignature.length > 0 && providedSignature === expectedSignature)

The expected signature is truncated to whatever length the caller supplies. Submitting
`<anyTicketId>.a` requires matching one hex character — a 1-in-16 forgery. Signatures
are also only 8 hex chars (32 bits) even when used correctly, and the comparison is
not constant-time.

SECOND BUG (same file, line ~54): after the signature check fails, the function falls
through to `if (/^[a-zA-Z0-9_-]+$/.test(cleaned)) return { valid: true, isSigned: false }`
— any bare alphanumeric string is treated as a valid ticket. This makes the HMAC
entirely decorative.

REQUIRED CHANGES to src/lib/qr/hmac.ts:
1. Import getTicketSecret from '@/lib/env'. Remove the module-level
   `const TICKET_SECRET = process.env.TICKET_SECRET || 'dev-secret-change-in-production'`
   entirely — read the secret inside the functions.
2. Add `const SIG_LEN = 16;` (64 bits). signTicket truncates to exactly SIG_LEN.
3. In verifyTicket: reject immediately unless the signature is exactly SIG_LEN chars.
   Never derive the expected length from input.
4. Compare with `crypto.timingSafeEqual` on equal-length Buffers. Guard the length
   check before timingSafeEqual (it throws on mismatched lengths).
5. DELETE the raw-ID fallback branch. An unsigned input is invalid, full stop.
6. Keep the existing URL-unwrapping logic (`https://.../ticket/<token>`) — the
   scanner relies on it. Unwrap first, then verify.
7. Keep the return shape `{ valid, ticketId, isSigned }` so callers don't break,
   but `valid: true` must now imply `isSigned: true`.

THEN add test infrastructure:
8. `npm i -D vitest` and add "test": "vitest run" to package.json scripts.
9. Create `src/lib/qr/hmac.test.ts` with these cases, setting
   process.env.TICKET_SECRET in a beforeAll:
   - a token from signTicket() round-trips and returns valid:true with the right ticketId
   - `<id>.a`                     → valid:false   (the 1-char forgery)
   - `<id>.`                      → valid:false
   - `<id>`  (no signature)       → valid:false   (the raw-ID fallback)
   - `<id>.<15 correct chars>`    → valid:false   (truncated signature)
   - `<id>.<16 wrong chars>`      → valid:false
   - a signature valid for ticket A used with ticket B → valid:false
   - `https://host/ticket/<validToken>` → valid:true
   - verifyTicket('') and verifyTicket('....') do not throw

Do not modify any other source file in this task.
```

**GATE P0-1**
```bash
npx vitest run src/lib/qr/hmac.test.ts   # ALL must pass — no exceptions
grep -n "dev-secret-change-in-production" src/lib/qr/hmac.ts   # must return nothing
grep -n "substring(0, providedSignature.length)" src/lib/qr/hmac.ts  # must return nothing
grep -n "timingSafeEqual" src/lib/qr/hmac.ts  # must find it
npx tsc --noEmit
```
✅ Pass when: all 9 tests green. **If any forgery test passes, stop — the fix is wrong.**

---

## P0-2 · Require `TICKET_SECRET` + reissue existing tickets 🔴

**Model:** Opus 4.6 · **Depends on:** P0-1

```
P0-1 removed the hardcoded secret fallback. Any ticket signed with the old default
('dev-secret-change-in-production') or with an 8-char signature is now invalid, so
existing tickets must be reissued.

1. Audit every remaining `process.env.TICKET_SECRET` reference in the codebase and
   route it through getTicketSecret() from '@/lib/env'.

2. Create `scripts/reissue-tickets.js` (CommonJS, matching the other scripts):
   - Usage: `node --env-file=.env scripts/reissue-tickets.js [--dry-run]`
   - Init firebase-admin from FIREBASE_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY,
     same pattern as scripts/set-admin-role.js
   - Iterate the `tickets` collection in pages of 200 (use startAfter, not offset)
   - For each doc: recompute qrToken with the CURRENT secret and 16-char signature,
     regenerate the QR data URL using the same options as src/lib/qr/generator.ts
     (width 600, margin 1, errorCorrectionLevel 'L')
   - PRESERVE `used`, `usedAt`, `usedByUsherId`, `createdAt` — only qrToken and
     qrImageUrl change. Use update(), never set().
   - --dry-run prints a per-ticket before/after summary and writes nothing. Default
     to dry-run and require an explicit --commit flag to write.
   - Print a final count: scanned / updated / skipped / failed
   - Handle failures per-document; one bad doc must not abort the run.

3. Note in the script header that reissued tickets must be re-delivered to attendees,
   since the QR image changes.

Do not change generator.ts, and do not touch approve/reconcile in this task.
```

**GATE P0-2**
```bash
node --env-file=.env scripts/reissue-tickets.js            # dry-run by default
# Inspect output. Confirm signature length is 16 and doc count matches your expectation.
node --env-file=.env scripts/reissue-tickets.js --commit
grep -rn "process.env.TICKET_SECRET" src/   # must return nothing
```
✅ Pass when: dry-run output is sane, commit run reports 0 failures, and a spot-checked ticket doc has a 16-char signature after the `.`

---

## P0-3 · Enforce the signature in the scan route 🔴

**Model:** Opus 4.6 · **Depends on:** P0-1

```
`src/app/api/scan/route.ts` calls verifyTicket but destructures only `{ valid, ticketId }`
— `isSigned` is never checked. Combined with the (now removed) fallback, this let a
bare registrant UUID scan through as a valid ticket. Harden the route.

1. Destructure and require isSigned:
       const { valid, ticketId, isSigned } = verifyTicket(qrToken);
       if (!valid || !ticketId || !isSigned) → return the existing 'tampered' response
   Keep the Arabic message strings exactly as they are.

2. Add an input guard before verification: reject qrToken longer than 512 chars with
   the same 'tampered' response. Do not let unbounded strings reach the HMAC path.

3. The fallback lookup `db.collection('tickets').where('registrantId','==',ticketId)`
   currently runs before the transaction. Keep it, but it must only be reachable AFTER
   signature verification has passed. Confirm the ordering.

4. Replace the passcode comparison
       if (passcodeHeader.trim() === validPasscode.trim())
   with a constant-time compare. Length-guard first, then crypto.timingSafeEqual on
   Buffers. If lengths differ, return false without calling timingSafeEqual.

5. Remove the hardcoded `userEmail === 'tonysaleeb23@gmail.com'` check on line ~26.
   Import PRIMARY_ADMIN_EMAIL from '@/lib/auth/guards' instead — it must not be
   duplicated in a third file.

6. Add a `usherId` improvement: when authorised by passcode, set usherId to
   `usher-passcode` as today, but log a warning server-side noting the scan has no
   individual attribution. (P0-5 addresses the root cause.)

Do not change the transaction logic, the response shapes, or any Arabic string.
```

**GATE P0-3**
```bash
npx next build
# With the dev server running and a valid usher passcode:
curl -s -X POST localhost:3000/api/scan -H 'x-usher-passcode: <PASSCODE>' \
  -H 'Content-Type: application/json' -d '{"qrToken":"550e8400-e29b-41d4-a716-446655440000"}'
# EXPECT: {"type":"tampered",...}  ← a raw UUID must be rejected

curl -s -X POST localhost:3000/api/scan -H 'x-usher-passcode: <PASSCODE>' \
  -H 'Content-Type: application/json' -d '{"qrToken":"<REAL_TOKEN_FROM_A_TICKET_DOC>"}'
# EXPECT: {"type":"success",...} or {"type":"already_used",...}
```
✅ Pass when: raw UUID → `tampered`, real signed token → `success`. **Test on a throwaway ticket — a successful scan marks it used.**

---

## P0-4 · Delete the unauthenticated upload endpoint 🟠

**Model:** Gemini 3.6 Flash · **Depends on:** none

```
`src/app/api/upload/route.ts` is an unauthenticated public file host: no auth check,
caller-controlled destination path, caller-controlled Content-Type, and it calls
makePublic() on the result. It appears to be dead code — registration uses the
base64 path in src/lib/firebase/storage.ts instead.

1. Search the entire repo for references to '/api/upload' — src/, scripts/, and any
   config. Report every hit before changing anything.
2. If and only if there are zero runtime callers, delete
   src/app/api/upload/route.ts and its now-empty directory.
3. If there IS a caller, do not delete. Stop and report the caller instead.

Do not delete src/lib/firebase/storage.ts — a later task migrates it properly.
```

**GATE P0-4**
```bash
grep -rn "api/upload" src/ scripts/ *.json *.ts 2>/dev/null   # must return nothing
test ! -d src/app/api/upload && echo "REMOVED"
npx next build   # route list must no longer contain ƒ /api/upload
```
✅ Pass when: build output shows 23 routes instead of 24, and `/api/upload` is gone.

---

## P0-5 · Usher passcode hardening + rate limiting 🟠

**Model:** Opus 4.6 · **Depends on:** P0-0, P0-3

```
The usher passcode currently defaults to the literal '102030' (public in this repo),
has no rate limiting on a 6-digit numeric space, and is a single shared credential.

Install: npm i @upstash/ratelimit @upstash/redis

1. Create `src/lib/ratelimit.ts`:
   - Export a factory `getLimiter(name: string, requests: number, window: string)`
     returning an @upstash/ratelimit instance backed by Redis.fromEnv(), using a
     sliding window and prefix `rl:${name}`.
   - Export `async function limitByIp(request: NextRequest, limiter): Promise<Response|null>`
     that derives the client IP from the `x-forwarded-for` header (first entry) and
     falls back to 'unknown'. Returns a 429 NextResponse with an Arabic message
     ('محاولات كثيرة، برجاء المحاولة بعد قليل') when the limit is exceeded, or null when allowed.
   - Include `Retry-After` on the 429.
   - IMPORTANT: if UPSTASH_REDIS_REST_URL is missing, FAIL CLOSED — throw at call time.
     Never silently allow the request through.

2. `src/app/api/scan/verify-passcode/route.ts`:
   - Remove `|| '102030'`. getValidPasscode() reads settings/config, then falls back
     to getUsherPasscode() from '@/lib/env', which throws if unset.
   - Remove the empty `catch {}` that currently swallows Firestore errors and silently
     falls back to the default — log the error and rethrow.
   - Apply limitByIp with 5 requests / 15 minutes before doing any comparison.
   - Use constant-time comparison (same helper approach as P0-3).
   - Keep `DEFAULT_USHER_PASSCODE` removed entirely — check for other importers first.

3. `src/app/api/scan/route.ts`: apply a separate, looser limiter (60 req / minute per IP)
   so a real check-in desk isn't throttled but a brute-forcer is.

4. Add USHER_PASSCODE, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN to .env.example.

5. Add a short block to the top of `src/app/api/scan/verify-passcode/route.ts`
   documenting that the passcode is a shared fallback credential and that per-usher
   Firebase accounts (role: 'usher' custom claim, already supported by requireUsher)
   are the preferred path.
```

**GATE P0-5**
```bash
grep -rn "102030" src/   # must return nothing
# 6 rapid wrong attempts:
for i in $(seq 1 6); do
  curl -s -o /dev/null -w "%{http_code} " -X POST localhost:3000/api/scan/verify-passcode \
    -H 'Content-Type: application/json' -d '{"passcode":"000000"}'
done; echo
# EXPECT: 401 401 401 401 401 429
```
✅ Pass when: the 6th attempt returns **429**, and unsetting `USHER_PASSCODE` produces a 500 rather than a working `102030` login.

---

## P0-6 · Require `CRON_SECRET` 🟠

**Model:** Gemini 3.6 Flash · **Depends on:** P0-0

```
`src/app/api/cron/ocr/route.ts` line ~18:
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) { ... }
The whole auth check is skipped when CRON_SECRET is unset — a missing env var makes
this route world-callable, letting anyone drain the Gemini quota. It also accepts the
secret as a `?key=` query param, which lands in access logs and Referer headers.

1. Replace the check with:
   - Read the secret via getCronSecret() from '@/lib/env' (throws when unset).
   - Require the `Authorization: Bearer <secret>` header. Compare constant-time.
   - DELETE the `url.searchParams.get('key')` fallback entirely.
   - Return 401 with a generic body on failure.
2. Add `export const maxDuration = 60;` at the top of the file. The handler currently
   sleeps 12s plus 5 image downloads and 5 Gemini calls, and has no duration override.
3. Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when CRON_SECRET
   is set as an env var — add a comment noting this so nobody "fixes" it later.
4. Leave the OCR batching logic alone; P1-3 redesigns it.
```

**GATE P0-6**
```bash
grep -n "searchParams.get('key')" src/app/api/cron/ocr/route.ts   # must return nothing
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/api/cron/ocr                      # 401
curl -s -o /dev/null -w "%{http_code}\n" "localhost:3000/api/cron/ocr?key=$CRON_SECRET"   # 401
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/api/cron/ocr -H "Authorization: Bearer $CRON_SECRET"  # 200
```
✅ Pass when: only the header form works.

---

## P0-7 · Server read routes for the public status & ticket pages 🔴

**Model:** Opus 4.6 · **Depends on:** P0-0
*Prerequisite for the rules lockdown. Nothing about the UI should change.*

```
`/status/[registrantId]` and `/ticket/[registrantId]` currently read Firestore directly
from the browser, which is why `registrants` has `allow read: if true`. That rule leaks
every registrant's name, phone, WhatsApp number, church, admin notes, OCR-extracted
bank data, and the base64 payment receipt to anyone on the internet.

Move these reads server-side so the rule can be locked in P0-9.

1. Create `src/app/api/public/status/[registrantId]/route.ts` (GET):
   - Read the registrant via the Admin SDK.
   - 404 if absent.
   - Return ONLY: { status, fullName, church, createdAt }.
     Never return phoneNumber, whatsappNumber, paymentScreenshotUrl, adminNotes,
     ocrExtractedReference, ocrExtractedAmount, or ocrExtractedSenderName.
   - Apply limitByIp (30 req / min) from '@/lib/ratelimit'.
   - Set `Cache-Control: no-store`.

2. Create `src/app/api/public/ticket/[registrantId]/route.ts` (GET):
   - Read the registrant. If status is not 'approved' or 'auto_approved', return 403
     with the existing Arabic message from the ticket page
     ('التسجيل غير مقبول بعد — التذكرة تظهر فقط للطلبات المقبولة').
   - Otherwise read tickets/{registrantId} and return
     { fullName, church, qrImageUrl, used, usedAt }.
   - Never return qrToken. The image is enough to display and scan; exposing the raw
     signed token in JSON hands out a forgeable-format string unnecessarily.
   - Same rate limiting and no-store.

3. Rewrite the data fetching in `src/app/status/[registrantId]/page.tsx`:
   - Replace the `onSnapshot` listener with a fetch to the new route, polled every
     15 seconds via setInterval, cleared on unmount.
   - Remove the `firebase/firestore` import from this file.
   - Preserve every existing UI state, Arabic string, and the copy-link behaviour.

4. Rewrite data fetching in `src/app/ticket/[registrantId]/page.tsx`:
   - Single fetch to the new ticket route on mount.
   - Remove the `firebase/firestore` import.
   - The canvas ticket-download logic reads from the same state object — keep it
     working unchanged.

CRITICAL: do not change any layout, styling, Arabic copy, or the download-ticket
canvas rendering. This task is purely a data-access swap.
```

**GATE P0-7**
```bash
grep -n "firebase/firestore" src/app/status/*/page.tsx src/app/ticket/*/page.tsx  # nothing
npx next build
curl -s localhost:3000/api/public/status/<REAL_ID> | python3 -m json.tool
# EXPECT keys: status, fullName, church, createdAt — and NOTHING else
curl -s localhost:3000/api/public/ticket/<UNAPPROVED_ID> -o /dev/null -w "%{http_code}\n"  # 403
```
Then **manually open** `/status/<id>` and `/ticket/<id>` in a browser and confirm they render identically to before, and that ticket download still produces the gold card.

✅ Pass when: no `paymentScreenshotUrl` or phone number appears anywhere in either API response.

---

## P0-8 · Stop `/ticket/lookup` from handing out other people's tickets 🔴

**Model:** Opus 4.6 · **Depends on:** P0-7

```
`src/app/ticket/lookup/page.tsx` accepts any Egyptian phone number, reads
phoneIndex/{phone} straight from the browser, and redirects to /status/{registrantId}
— which displays that person's name, church, and downloadable QR ticket. No OTP, no
ownership proof, no rate limit. Knowing someone's phone number is enough to steal
their ticket, and the endpoint doubles as a bulk enumeration oracle.

Replace redirect-on-lookup with send-link-to-the-registered-number.

1. Create `src/app/api/public/lookup/route.ts` (POST, body { phone }):
   - Validate the phone with isValidEgyptianPhone / normalizePhone from '@/lib/validation'.
     Invalid format → 400 with the existing Arabic message.
   - Rate limit HARD: 3 requests / 15 min per IP AND 3 / hour per normalized phone
     number. Use two limiters from '@/lib/ratelimit'.
   - Look up phoneIndex via the Admin SDK.
   - If found: send the ticket link to that WhatsApp number using
     sendAutomatedWhatsAppTicket from '@/lib/whatsapp/api'.
   - CRITICAL — anti-enumeration: return an IDENTICAL 200 response whether or not the
     number exists. Same body, same status. Message:
     'لو الرقم مسجّل عندنا، هيوصلك رابط التذكرة على الواتساب خلال دقائق.'
     Never confirm or deny registration. Do not vary the response on the WhatsApp
     send result either.
   - Log the found/not-found outcome server-side only.

2. Rewrite the client in `src/app/ticket/lookup/page.tsx`:
   - Replace the direct getDoc(phoneIndex) call with a POST to the new route.
   - Remove the `firebase/firestore` import and the router.push redirect.
   - On success show the confirmation message inline. Keep the existing card layout,
     Header, and styling untouched.
   - Keep client-side format validation for UX.

3. Note in a comment that OTP verification is the stronger long-term control; this
   change removes the direct leak by requiring possession of the phone.
```

**GATE P0-8**
```bash
grep -n "firebase/firestore\|router.push" src/app/ticket/lookup/page.tsx   # nothing
# Registered vs unregistered must be indistinguishable:
curl -s -X POST localhost:3000/api/public/lookup -H 'Content-Type: application/json' \
  -d '{"phone":"<REGISTERED_NUMBER>"}'
curl -s -X POST localhost:3000/api/public/lookup -H 'Content-Type: application/json' \
  -d '{"phone":"01000000000"}'
# Both responses must be byte-for-byte identical.
# 4th attempt within 15 min:
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3000/api/public/lookup \
  -H 'Content-Type: application/json' -d '{"phone":"01000000001"}'   # expect 429 by the 4th
```
✅ Pass when: the two lookups are indistinguishable **and** the WhatsApp message actually arrives for the registered number.

---

## P0-9 · Lock down Firestore & Storage rules 🔴

**Model:** Opus 4.6 · **Depends on:** P0-7, P0-8
*The highest-blast-radius task in the plan. Do the pre-step first.*

> **MANDATORY PRE-STEP — do this before running the prompt.**
> The primary admin is admin *by hardcoded email* and may have no `role` custom claim.
> Role-based rules would lock him out of the dashboard immediately.
> ```bash
> node --env-file=.env scripts/set-admin-role.js tonysaleeb23@gmail.com admin
> # repeat for every other admin email, and for each usher:
> node --env-file=.env scripts/set-admin-role.js <usher-email> usher
> ```
> Then **sign out and back in** in the admin UI — custom claims only refresh on a new ID token.
> Verify in the browser console: `await firebase.auth().currentUser.getIdTokenResult()` shows `claims.role === 'admin'`.

```
Rewrite firestore.rules and storage.rules to remove public read access. All public
read paths now go through server routes (P0-7, P0-8), so nothing legitimate depends
on client reads of registrants/tickets/phoneIndex any more.

firestore.rules:

  registrants/{id}
    - read: ONLY authenticated users with request.auth.token.role in ['admin','usher'].
      Remove `allow read: if true`.
    - create: KEEP allowed for now (the browser still writes registrations until P1-1),
      but TIGHTEN the validation. Add to the existing hasAll() check:
        * fullName is string && size() >= 2 && size() <= 100
        * phoneNumber matches('^01[0125][0-9]{8}$')
        * whatsappNumber matches('^01[0125][0-9]{8}$')
        * church is string && size() >= 2 && size() <= 120
        * paymentScreenshotUrl is string && size() <= 900000
        * adminNotes == null
        * verifiedAt == null
        * ocrExtractedReference == null && ocrExtractedAmount == null
          && ocrExtractedSenderName == null && ocrConfidence == null
      Leave a comment: "// TODO(P1-1): set to `if false` once /api/register lands"
    - update, delete: false (unchanged)

  phoneIndex/{phone}
    - read: false  (was `if true` — this was a phone-number enumeration oracle)
    - create: keep, but require the doc key to match ^01[0125][0-9]{8}$ and the body
      to contain only registrantId as a string. Same TODO(P1-1) comment.
    - update, delete: false

  tickets/{id}
    - read: ONLY role in ['admin','usher'].  Remove `allow read: if true` — the
      "unguessable UUID" comment is not an access control, and P0-7 removed the need.
    - write: false (unchanged)

  bankTransactions, staff: unchanged.

  admins/{email}
    - There is currently NO rule for this collection, so it defaults to deny — but
      src/lib/auth/context.tsx getUserRole() tries getDoc(db,'admins',email) from the
      client, which therefore ALWAYS fails for non-primary admins. Add:
        allow read: if request.auth != null
                    && request.auth.token.email.lower() == email;
        allow write: if false;
      This fixes a real latent bug where secondary admins could never resolve a role.

storage.rules:
  screenshots/{registrantId}/{fileName}
    - read: role in ['admin','usher'] only. Remove `allow read: if true` — these are
      payment receipts.
    - create: keep the 5MB + image/* constraints, add `request.auth == null` is fine
      for now, TODO(P1-2).
  tickets/{registrantId}/{fileName}
    - read: role in ['admin','usher']. write: false.
  Catch-all deny: unchanged.

THEN add rules tests:
  npm i -D @firebase/rules-unit-testing
  Create `tests/firestore.rules.test.ts` run under vitest, using the Firestore emulator:
    - anonymous LIST of registrants  → DENIED   (the headline vulnerability)
    - anonymous GET of a registrant  → DENIED
    - anonymous GET of phoneIndex/<phone> → DENIED
    - anonymous GET of tickets/<id>  → DENIED
    - admin-claim LIST of registrants → ALLOWED
    - usher-claim GET of tickets/<id> → ALLOWED
    - anonymous CREATE with a valid registrant payload → ALLOWED (still open pre-P1-1)
    - anonymous CREATE with phoneNumber '123' → DENIED
    - anonymous CREATE with status 'approved' → DENIED
    - anonymous UPDATE of a registrant → DENIED
  Add "test:rules": "firebase emulators:exec --only firestore 'vitest run tests/'"
  to package.json.
```

**GATE P0-9**
```bash
npm run test:rules       # every case must pass, especially the anonymous LIST denial
firebase deploy --only firestore:rules,storage:rules
```
Then, **in a logged-out incognito window**, open the browser console on the deployed site and run a raw collection read against `registrants`. It must fail with `permission-denied`.

Then walk the full app as a real user and as an admin:
- [ ] `/` loads
- [ ] `/register` completes end-to-end
- [ ] `/status/<id>` shows status
- [ ] `/ticket/<id>` shows the QR + download works
- [ ] `/ticket/lookup` sends the WhatsApp link
- [ ] `/admin` dashboard counts render ← **this is where a missing custom claim shows up**
- [ ] `/admin/review` lists and shows receipts
- [ ] `/admin/registrants` lists and paginates
- [ ] `/scan` scans a real ticket successfully

✅ Pass when: all 9 flows work **and** the anonymous read is denied. If the admin dashboard is empty, the custom claim pre-step wasn't done — go back and redo it, don't loosen the rule.

---

## P0-10 · Fix the admin privilege-escalation path 🟠

**Model:** Opus 4.6 · **Depends on:** P0-0

```
`src/app/api/admin/admins/route.ts` POST lets any admin overwrite the password of an
EXISTING Firebase Auth user, including the primary admin:
    const existingUser = await auth.getUserByEmail(normalizedEmail);
    await auth.setCustomUserClaims(uid, { role: 'admin' });
    if (password && password.length >= 6) await auth.updateUser(uid, { password });
The DELETE handler protects PRIMARY_ADMIN_EMAIL; POST does not.

1. POST — never set a password on a pre-existing account:
   - If getUserByEmail succeeds, set the custom claim ONLY. If a password was supplied,
     ignore it and instead generate a password-reset link via
     auth.generatePasswordResetLink(email); return it in the response for the admin
     to forward. Do NOT call updateUser with a password on an existing user, ever.
   - Keep the create-new-user path (createUser + password) for accounts that don't
     exist yet, but raise the minimum password length to 12.
   - Reject any POST where normalizedEmail === PRIMARY_ADMIN_EMAIL with 403 and the
     Arabic message 'لا يمكن تعديل حساب الأدمن الرئيسي من هنا'.
   - Reject self-targeting (normalizedEmail === authResult.email) with 403.

2. DELETE — after clearing claims, call auth.revokeRefreshTokens(user.uid). Without
   this, a removed admin's existing ID token stays valid for up to an hour.

3. Move PRIMARY_ADMIN_EMAIL out of source. Read it from
   process.env.PRIMARY_ADMIN_EMAIL in src/lib/auth/guards.ts (throw if unset), and
   remove the duplicated literal from src/lib/auth/context.tsx — the client should
   read it from NEXT_PUBLIC_PRIMARY_ADMIN_EMAIL. Add both to .env.example.
   (P0-3 already removed the third copy from the scan route.)

4. Replace the empty `catch {}` in isEmailAdmin (guards.ts) so Firestore failures are
   logged rather than silently returning false.
```

**GATE P0-10**
```bash
grep -rn "tonysaleeb23@gmail.com" src/   # must return NOTHING
TOKEN=<a secondary admin's ID token>
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3000/api/admin/admins \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"email":"tonysaleeb23@gmail.com","password":"hijacked12345"}'   # EXPECT 403
```
✅ Pass when: the escalation returns 403, and adding a genuinely new admin still works.

---

## P0-11 · Authenticate the WhatsApp bot endpoint 🟠

**Model:** Gemini 3.6 Flash · **Depends on:** P0-0

```
`scripts/whatsapp-bot.js` exposes POST /send-ticket with no authentication, no CORS
policy, and no rate limit, bound to 0.0.0.0. Anyone who can reach the host can send
arbitrary WhatsApp messages from the church's own account.

1. In scripts/whatsapp-bot.js:
   - Require `Authorization: Bearer ${process.env.WHATSAPP_BOT_TOKEN}` on /send-ticket.
     Exit at startup with a clear error if WHATSAPP_BOT_TOKEN is unset — do not
     start an unprotected server.
   - Compare with crypto.timingSafeEqual (length-guard first).
   - Bind to process.env.BIND_HOST || '127.0.0.1' instead of all interfaces, so the
     default posture is loopback-only behind a tunnel.
   - Add a simple in-memory rate limiter: max 20 sends/minute globally and 3/hour per
     destination phone number. In-memory is acceptable here because this is a single
     long-lived process, unlike the serverless routes.
   - Validate `phone` matches ^20[0-9]{10}$ after normalisation; reject otherwise.
   - Cap `message` length at 1000 chars.

2. In src/lib/whatsapp/api.ts, the generic webhook branch must send the bearer token:
   headers: { 'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.WHATSAPP_BOT_TOKEN}` }

3. Add a 10-second timeout (AbortController) to ALL THREE fetch calls in
   src/lib/whatsapp/api.ts — Green API, UltraMsg, and the webhook. An unreachable
   provider currently hangs the approve request indefinitely.

4. Add WHATSAPP_BOT_TOKEN and BIND_HOST to .env.example.
```

**GATE P0-11**
```bash
node scripts/whatsapp-bot.js   # unset token → must refuse to start
# with the token set, in another shell:
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3001/send-ticket \
  -H 'Content-Type: application/json' -d '{"phone":"201000000000","message":"test"}'   # 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3001/send-ticket \
  -H "Authorization: Bearer $WHATSAPP_BOT_TOKEN" \
  -H 'Content-Type: application/json' -d '{"phone":"<YOUR_NUMBER>","message":"test"}'  # 200
```
✅ Pass when: unauthenticated → 401, authenticated → message actually arrives.

---

## P0-12 · Enable Firebase App Check 🟠

**Model:** Opus 4.6 · **Depends on:** P0-9

```
There is no bot protection anywhere. The registration path writes directly from the
browser to Firestore, so a middleware rate limiter cannot reach it — App Check is the
only control that covers that path until P1-1 moves the write server-side.

1. In src/lib/firebase/client.ts, after initializeApp and INSIDE the
   isFirebaseConfigured branch, initialise App Check with ReCaptchaV3Provider using
   NEXT_PUBLIC_RECAPTCHA_SITE_KEY, with isTokenAutoRefreshEnabled: true.
   - Guard with `typeof window !== 'undefined'` — App Check must not run during SSR
     or the build's static generation pass.
   - If NEXT_PUBLIC_RECAPTCHA_SITE_KEY is missing, log a clear console warning and
     skip initialisation rather than throwing (so local dev without a key still runs).
   - Support the debug token: when NEXT_PUBLIC_APPCHECK_DEBUG === 'true', set
     self.FIREBASE_APPCHECK_DEBUG_TOKEN = true before initialisation.

2. Add NEXT_PUBLIC_RECAPTCHA_SITE_KEY and NEXT_PUBLIC_APPCHECK_DEBUG to .env.example.

3. Add a short section to AGENTS.md noting that App Check enforcement is toggled in
   the Firebase Console, not in code, and that enabling enforcement before deploying
   this client change will break all client Firestore access.
```

**GATE P0-12**
```bash
npx next build   # must not fail during static generation — proves the window guard works
```
Then, in the Firebase Console:
1. Deploy this change to production **first**.
2. Confirm App Check metrics show verified requests arriving (leave it in monitoring mode ~24h if you have time).
3. **Only then** switch Firestore + Storage to *Enforced*.
4. Re-run the 9-flow walkthrough from P0-9.

✅ Pass when: enforcement is on and all 9 flows still work. **If you enforce before the client change is live, the whole app breaks — order matters.**

---

## P0-13 · Compress the 5.9 MB of static assets 🔴

**Model:** Gemini 3.6 Flash · **Depends on:** none *(can run in parallel with any Opus task)*

```
public/ contains ~5.9 MB of unoptimised PNGs, all on the critical path:
  bg.png              1536x1024   2,088 KB  ← CSS background on EVERY page
  favicon.ico                     1,499 KB  ← a 1.5 MB favicon
  icon.png            1024x1024   1,499 KB  ← same file, also apple-touch-icon
  logo-cultural.png    604x413      258 KB  ┐
  logo-coptic.png     1254x1254     219 KB  │ all four render in the homepage header
  logo-aristotle.png   625x399      175 KB  │
  logo-shenouda.png    500x500      159 KB  ┘

Target: under 300 KB total, with no visible quality loss.

1. npm i -D sharp
2. Create `scripts/optimize-assets.js`:
   - bg.png    → public/bg.webp,   resize to 1600px wide, quality 72
   - Each logo → public/<name>.webp, resized to 2x its largest rendered size
     (inspect src/components/Header.tsx for the actual width/height props), quality 82
   - icon.png  → public/icon.png regenerated at 512x512 (this is the apple-touch-icon
     and PWA icon; 1024 is unnecessary)
   - favicon   → public/favicon.ico regenerated at 32x32 only
   - Print a before/after table with per-file and total savings.
   - Keep the originals under public/_originals/ (add that dir to .gitignore) so the
     step is reversible.
3. Run it.
4. Update `src/app/globals.css`: body background-image url('/bg.png') → url('/bg.webp').
5. Update `src/components/Header.tsx`: the four logos already use next/image — point
   them at the .webp files and confirm width/height props are explicit (they prevent CLS).
6. Update the `src/app/page.tsx` <img> at line ~27 to next/image with explicit
   width/height, and the `alt` text preserved exactly.
7. Delete the unused create-next-app leftovers: public/next.svg, public/vercel.svg,
   public/file.svg, public/globe.svg, public/window.svg — verify with grep first.
8. Do NOT touch src/app/icon.png or src/app/favicon.ico (App Router metadata files)
   without checking how layout.tsx references them.
```

**GATE P0-13**
```bash
du -sh public/                          # target: < 300 KB (from 5.9 MB)
ls -la public/*.webp
npx next build
```
Then **open the site and look at it**: homepage background renders, all four header logos render sharp on a retina display, favicon appears in the tab, no layout shift on load.

✅ Pass when: `du -sh public/` is under ~300 KB and nothing looks degraded. This is the single biggest UX win in the plan — on Egyptian mobile data it's the difference between a ~15s and a ~2s load.

---

## P0-14 · Security headers + URL-sink validation 🟡

**Model:** Gemini 3.6 Flash · **Depends on:** none

```
Two related hardening items.

A. Security headers — next.config.ts currently sets only serverExternalPackages.
   Add an async headers() returning, for source '/(.*)':
     - Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
     - X-Frame-Options: DENY
     - X-Content-Type-Options: nosniff
     - Referrer-Policy: strict-origin-when-cross-origin
     - Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=()
       ← camera=(self) is REQUIRED, the /scan page uses getUserMedia. Do not omit it.
     - Content-Security-Policy: start in Report-Only mode. It must allow:
         fonts.googleapis.com + fonts.gstatic.com (the CSS @import)
         *.googleapis.com, *.firebaseio.com, *.google.com, *.gstatic.com
           (Firestore, Auth, App Check/reCAPTCHA)
         'self' data: blob: for img-src — QR codes and receipts are data: URIs
         www.google.com + www.gstatic.com in frame-src for reCAPTCHA
       Use Content-Security-Policy-Report-Only so a mistake cannot break production.

B. URL-sink validation — paymentScreenshotUrl is a user-supplied string (the Firestore
   rule only checks `is string`) that flows into <img src> and, at
   src/app/admin/review/page.tsx line ~631, into <a href target="_blank">. An anchor
   href accepts javascript: and data: schemes; an admin clicking a poisoned link is the
   highest-value target in this system.
   - Add `export function safeImageSrc(url: unknown): string | null` to src/lib/validation.ts.
     Return the url ONLY if it matches ^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$
     or ^https:\/\/firebasestorage\.googleapis\.com\/. Otherwise return null.
   - Apply it at all four sinks: admin/review/page.tsx lines ~451, ~631, ~686 and
     admin/registrants/page.tsx line ~603.
   - When it returns null, render an Arabic placeholder ('صورة غير صالحة') instead of
     the image/link.
   - Add rel="noopener noreferrer" to all four target="_blank" anchors
     (registrants ~426, ~549; review ~482, ~631).
```

**GATE P0-14**
```bash
npx next build && npx next start &
curl -sI localhost:3000 | grep -iE "strict-transport|x-frame|x-content-type|referrer-policy|permissions-policy|content-security"
grep -rn 'target="_blank"' src/ | grep -v "noopener"   # must return nothing
```
Then open `/scan` and confirm **the camera still works** (Permissions-Policy is easy to get wrong), and open the browser console on `/admin/review` to check for CSP report-only violations. Fix the policy, don't remove it.

✅ Pass when: all six headers present, camera works, no unexpected CSP reports.

---

## 🚦 P0 EXIT GATE — do not proceed to P1 until every line is green

```bash
npx tsc --noEmit                 # 0 errors
npx vitest run                   # all tests pass
npm run test:rules               # rules tests pass
npx next build                   # succeeds
du -sh public/                   # < 300 KB
grep -rn "tonysaleeb23@gmail.com\|102030\|dev-secret-change-in-production" src/   # NOTHING
grep -rn "allow read: if true" firestore.rules storage.rules                      # NOTHING
```

**Adversarial checks — try to break it yourself:**

| # | Attack | Expected |
|---|---|---|
| 1 | Logged out, raw client-SDK read of `registrants` | `permission-denied` |
| 2 | Scan a QR containing a bare registrant UUID | `tampered` |
| 3 | Scan a QR with a 1-character signature (`<id>.a`) | `tampered` |
| 4 | `POST /api/upload` | 404 |
| 5 | 6 wrong usher passcodes | 429 |
| 6 | `GET /api/cron/ocr` with no header | 401 |
| 7 | Lookup a registered vs unregistered phone | identical responses |
| 8 | Secondary admin POSTs the primary admin's email | 403 |
| 9 | `POST /send-ticket` with no bearer token | 401 |

**And confirm the app still works** — the full 9-flow walkthrough from P0-9.

Tag it: `git tag p0-complete && git push --tags`

---

# PHASE P1 — Correctness, Architecture & Performance

**12 tasks · ~1.5–2 days · branch `fix/p1-architecture`**
The app is now safe. This phase makes it correct and fast.

---

## P1-1 · Move registration server-side 🔴

**Model:** Opus 4.6 · **Depends on:** P0 complete
*The structural fix. Everything in the review's §1.1 traces back to this.*

```
Registration currently writes straight from the browser to Firestore. All validation
(isValidEgyptianPhone, isValidName, file checks) runs only in the browser, so anyone
with the public Firebase config — which necessarily ships in every bundle — can POST
arbitrary registrant documents, bypassing every UI check. Each one also enqueues a
paid Gemini OCR job.

Move the write behind a validated, rate-limited API route.

1. npm i zod

2. Create `src/lib/schemas/registration.ts`:
   - registrationSchema with: fullName (2–100, trimmed), church (2–120, trimmed),
     phoneNumber + whatsappNumber (both refined with isValidEgyptianPhone after
     normalizePhone), and a screenshot handled separately as multipart.
   - Export the inferred type and reuse it on the client for parity.

3. Create `src/app/api/register/route.ts` (POST, multipart/form-data):
   - Verify the App Check token from the X-Firebase-AppCheck header via
     getAppCheck().verifyToken() from firebase-admin/app-check. Reject 401 on failure.
   - Rate limit: 3 registrations / hour per IP (limitByIp from '@/lib/ratelimit').
   - Parse and validate the body with registrationSchema. Return 400 with the Arabic
     message from VALIDATION_MESSAGES on failure — reuse the existing constants, do
     not invent new copy.
   - Validate the uploaded file: max 5 MB, and sniff the magic bytes to confirm it is
     a real JPEG/PNG/WebP. NEVER trust the client-supplied Content-Type.
   - Generate the registrantId server-side with crypto.randomUUID(). Ignore any
     client-supplied id.
   - Run the registrant + phoneIndex write in a single Admin SDK transaction, exactly
     mirroring the current duplicate-phone semantics (throw DUPLICATE_PHONE → 409 with
     VALIDATION_MESSAGES.duplicatePhone).
   - Force status:'pending_verification', ocrStatus:'queued', all OCR fields null,
     adminNotes null, verifiedAt null, createdAt serverTimestamp. Never accept these
     from the client.
   - Return { registrantId } on success.

4. Rewrite handleSubmit in `src/app/register/page.tsx`:
   - Build FormData and POST to /api/register. Attach the App Check token.
   - Remove the runTransaction / doc / serverTimestamp imports and the uuid import.
   - Keep uploadProgress UX working (use XMLHttpRequest's upload.onprogress, or show
     an indeterminate state — do not silently drop the progress bar).
   - Preserve every Arabic string, the 4-step wizard, and the DUPLICATE_PHONE →
     "jump back to step 2" behaviour.

5. Update firestore.rules — remove the TODO(P1-1) comments and set:
     registrants: allow create: if false;
     phoneIndex:  allow create: if false;
   Both collections are now server-write-only. This also closes the
   denial-of-registration hole where anyone could pre-create phoneIndex/{number} to
   permanently block a specific person from registering.

6. Update tests/firestore.rules.test.ts: anonymous create must now be DENIED.
```

**GATE P1-1**
```bash
npm run test:rules   # anonymous create now denied
npx next build
```
Manual: complete a full registration in the browser → succeeds. Then attempt a direct client-SDK write to `registrants` from the console → `permission-denied`. Then `curl` `/api/register` with `phoneNumber: "123"` → 400 with the Arabic message.

✅ Pass when: the UI still registers, and nothing else can write.

---

## P1-2 · Move payment receipts out of Firestore documents 🟠

**Model:** Opus 4.6 · **Depends on:** P1-1

```
src/lib/firebase/storage.ts compresses the receipt client-side and returns a base64
data URI which is stored INSIDE the registrant document as paymentScreenshotUrl.
Costs: +33% payload from base64, a hard 1 MiB Firestore document ceiling (the
getContext-null fallback resolves the RAW uncompressed file and blows straight past
it), ~6 MB per admin list page load, and Firestore billing for blob storage.

1. In `src/app/api/register/route.ts`, upload the validated image buffer to Firebase
   Storage at `screenshots/{registrantId}/{timestamp}.{ext}` via the Admin SDK.
   Store only the storage PATH in the registrant doc, in a new field
   `paymentScreenshotPath`. Do NOT call makePublic().

2. Keep the client-side compression in storage.ts — it saves bandwidth — but change it
   to return a Blob/File instead of a data URL, and FIX the fallback: if
   canvas.getContext('2d') returns null, reject with the Arabic error rather than
   resolving the raw uncompressed file.

3. Create `src/app/api/admin/receipt/[registrantId]/route.ts` (GET, requireAdmin):
   returns a 15-minute signed URL for the object via getSignedUrl.

4. Update the three admin render sites (review ~451/~686, registrants ~603) to fetch
   the signed URL from that route. Keep safeImageSrc from P0-14 applied.

5. Update src/lib/ocr/processor.ts: read the image from Storage by path via the Admin
   SDK instead of fetching a URL. Keep the legacy `data:` and http branches so
   pre-migration documents still process.

6. Create `scripts/migrate-receipts.js` (--dry-run default, --commit to write):
   - Page through registrants where paymentScreenshotUrl starts with 'data:'
   - Decode, upload to Storage, set paymentScreenshotPath, and null out
     paymentScreenshotUrl
   - Per-document error isolation; print scanned/migrated/failed
   - Keep it re-runnable (idempotent)

7. Update Registrant in src/lib/types.ts: add paymentScreenshotPath: string | null and
   mark paymentScreenshotUrl as deprecated-legacy.
```

**GATE P1-2**
```bash
node --env-file=.env scripts/migrate-receipts.js            # dry run, review output
node --env-file=.env scripts/migrate-receipts.js --commit
npx next build
```
Manual: register with a new receipt → the new Firestore doc has `paymentScreenshotPath` and **no `data:` blob**. Admin review still displays both a migrated and a new receipt. OCR still processes a new registrant.

✅ Pass when: no new document contains base64, and admin viewing works for old and new.

---

## P1-3 · Fix the OCR pipeline (currently 5 registrants/day) 🟠

**Model:** Opus 4.6 · **Depends on:** P1-1

```
vercel.json schedules /api/cron/ocr at "0 0 * * *" (daily) and the handler has
BATCH_SIZE = 5, so the OCR pipeline processes FIVE receipts per day. A 300-person
conference would take two months. Everything else falls through to manual_review,
meaning the most sophisticated part of the system effectively never runs.
Separately, processor.ts sets ocrStatus:'processing' as a lock but nothing ever
reclaims a document if the function dies mid-Gemini-call — those are stranded forever.

1. Make OCR event-driven. At the end of a successful /api/register write, kick off
   processRegistrantOcr(registrantId) WITHOUT awaiting it — the user must not wait on
   Gemini. Wrap in try/catch so a failure never affects the registration response.
   (If Vercel's runtime cancels background work on your plan, use `waitUntil` from
   'next/server' instead — check the Next 16 docs in node_modules/next/dist/docs/.)

2. Keep the cron as a SWEEPER for anything the inline trigger missed:
   - vercel.json schedule → "*/10 * * * *"
   - BATCH_SIZE 5 → 10, THROTTLE_DELAY 3000 → 1000
   - keep `export const maxDuration = 60` from P0-6

3. Add stale-lock reclaim in the cron handler, before the queued query:
   - Add `ocrStartedAt` (serverTimestamp) when processor.ts sets status 'processing'
   - The sweeper queries ocrStatus == 'processing' AND ocrStartedAt < now-10min and
     resets those to 'queued', incrementing an `ocrAttempts` counter
   - After 3 attempts, set ocrStatus 'failed' + status 'manual_review' with an Arabic
     admin note, so a poison document cannot loop forever

4. Add the composite index this requires to firestore.indexes.json:
   registrants (ocrStatus ASC, ocrStartedAt ASC). Deploy with
   `firebase deploy --only firestore:indexes`.

5. Extract the shared reconciliation logic. src/app/api/admin/reconcile/route.ts and
   src/lib/ocr/processor.ts contain two near-identical copies (duplicate-reference
   check → amount tolerance → batch write → ticket creation). Move it to
   `src/lib/reconciliation.ts` exporting reconcileRegistrant(...) and call it from
   both. AMOUNT_TOLERANCE must be defined once.
```

**GATE P1-3**
```bash
firebase deploy --only firestore:indexes
npx next build
```
Manual: register a new person with a clear InstaPay screenshot. Within ~60 seconds their document should move `ocrStatus: queued → done` with populated `ocrExtractedReference` / `ocrExtractedAmount`. Then manually set a document to `processing` with an old `ocrStartedAt`, wait for the sweeper, and confirm it returns to `queued`.

✅ Pass when: end-to-end OCR latency drops from ~1 day to under a minute.

---

## P1-4 · Make approval atomic and non-blocking 🟠

**Model:** Opus 4.6 · **Depends on:** P1-3

```
src/app/api/admin/approve/route.ts performs three sequential un-batched operations:
    await registrantRef.update({ status:'approved', ... });   // ①
    await ticketRef.set({ qrToken, qrImageUrl, ... });        // ②
    const whatsappResult = await sendAutomatedWhatsAppTicket(); // ③
If ② throws, the registrant is 'approved' with NO ticket, and the admin sees a 500 and
retries an already-approved record. If ③ hangs, the whole request blocks.

1. Extract `src/lib/services/ticket-service.ts` exporting
   `issueTicket(registrantId): Promise<{ qrToken, qrImageUrl }>` which signs, generates
   the QR, and writes the ticket doc.

2. In approve/route.ts, combine ① and ② into a single db.batch() so status and ticket
   commit together or not at all.

3. Make ③ non-blocking: fire the WhatsApp send without awaiting it (or with
   Promise.allSettled + the 10s timeout added in P0-11), and return success as soon as
   the batch commits. A failed notification must never fail an approval. Return
   whatsappSent: 'pending' rather than a boolean the admin might misread.

4. Make approval idempotent: if the registrant is already 'approved' AND a ticket
   exists, return 200 with the existing ticket rather than regenerating. Re-approving
   currently mints a fresh QR and silently invalidates the one already in the
   attendee's WhatsApp.

5. Refactor reconcile/route.ts and lib/reconciliation.ts to call issueTicket() too, so
   ticket creation exists in exactly one place.
```

**GATE P1-4**
```bash
npx next build
```
Manual: approve a registrant → status + ticket both appear, WhatsApp arrives. Approve the **same** registrant again → 200, and the `qrToken` in Firestore is **unchanged**. Then temporarily point `WHATSAPP_WEBHOOK_URL` at an unreachable host and approve → approval still succeeds within a few seconds.

✅ Pass when: approval never leaves a registrant ticketless, and a dead WhatsApp provider cannot block it.

---

## P1-5 · Move `AuthProvider` out of the root layout 🟠

**Model:** Opus 4.6 · **Depends on:** none

```
src/app/layout.tsx wraps everything in <AuthProvider>, which imports firebase/auth and
firebase/firestore. Measured from the production build, the shared chunk is 672 KB raw
/ ~198 KB gzipped and contains @firebase/auth, @firebase/firestore, @firebase/app-check,
@firebase/analytics, @firebase/ai and @firebase/data-connect. A visitor landing on '/'
— a static page with a button — downloads and parses ~200 KB of auth and database code
it will never call.

Only the /admin subtree needs auth context.

1. Remove <AuthProvider> from src/app/layout.tsx. Keep the ConfigWarning branch, but it
   must no longer pull the Firebase client SDK into the root chunk — check what
   isFirebaseConfigured actually imports and, if necessary, replace it with a plain
   `!!process.env.NEXT_PUBLIC_FIREBASE_API_KEY` check inlined in the layout.

2. Add <AuthProvider> to src/app/admin/layout.tsx, wrapping its existing content. It is
   already a client component, so this is a straight move.

3. /scan uses the passcode path AND optionally a Firebase token. Check
   src/app/scan/page.tsx: if it calls useAuth(), wrap only that page in its own
   AuthProvider; if it only uses the passcode, leave it outside entirely.

4. Verify no remaining public page (/, /register, /ticket/*, /status/*, /ticket/lookup)
   calls useAuth(). Report any that do before changing them.

5. After P0-7 and P0-8, /status, /ticket, and /ticket/lookup should have no
   firebase/firestore import at all. Confirm, and remove any leftovers.

Do not change any UI.
```

**GATE P1-5**
```bash
rm -rf .next && npx next build
find .next/static/chunks -name "*.js" -size +100k -exec sh -c \
  'echo "$(gzip -c "$1" | wc -c | awk "{printf \"%.0f KB gz\", \$1/1024}")  $1"' _ {} \;
# The ~198 KB gz Firebase chunk must no longer be in the shared/root chunk.
grep -rn "useAuth" src/app/page.tsx src/app/register src/app/ticket src/app/status  # nothing
```
Then load `/` with DevTools → Network → JS, hard refresh, and compare total JS transferred against your pre-task baseline. Expect roughly a 200 KB gzip drop.

✅ Pass when: public pages no longer download the Firebase SDK, and `/admin` still authenticates.

---

## P1-6 · Convert public pages to server components 🟡

**Model:** Opus 4.6 · **Depends on:** P1-5

```
All 13 pages carry 'use client', including the static homepage. This forgoes server
rendering and streaming, ships more JS, and hurts LCP and SEO.

1. src/app/page.tsx — remove 'use client' entirely. It is a static marketing page; if
   anything interactive remains, extract it into a small client island component.

2. src/app/ticket/lookup/page.tsx — make the page a server component that renders a
   <LookupForm /> client island containing the form state and the P0-8 fetch.

3. src/app/status/[registrantId]/page.tsx — server component that does the initial
   status fetch server-side (call the Admin SDK directly, not the public API route),
   passing initialData into a small client island that handles the 15s polling.
   First paint then needs no client round-trip.

4. src/app/ticket/[registrantId]/page.tsx — same pattern: server fetch for the initial
   ticket, client island for the canvas download button.

5. src/components/Header.tsx — check whether it needs 'use client' at all. If it is
   pure presentation (logos + next/image), make it a server component.

Preserve every Arabic string, style, and behaviour. Do not restructure the visual
layout. Verify the ticket-download canvas still produces the identical gold card.
```

**GATE P1-6**
```bash
npx next build
# In the route table, /, /ticket/lookup, /status/[id], /ticket/[id] should now be
# server-rendered rather than fully client-side.
```
Then: `curl -s localhost:3000/ | grep -c "مؤتمر"` → the Arabic content must appear in the **raw HTML** (proves SSR). Manually confirm ticket download still works.

✅ Pass when: homepage content is in the server-rendered HTML and every page behaves identically.

---

## P1-7 · Chunk the CSV import batch 🟡

**Model:** Gemini 3.6 Flash · **Depends on:** none

```
src/app/api/admin/import/route.ts builds a single db.batch() over every CSV row.
Firestore's hard limit is 500 operations per batch, so a bank statement with 501 rows
throws and imports NOTHING. Both the csvText and the entries branch have this bug.

1. Add a helper that commits in chunks of 450, awaiting each commit in sequence.
2. Apply it to both branches.
3. Track and return per-chunk results: { importedCount, failedCount, totalRows,
   errors: [{ row, reason }] } so a partial failure is visible rather than silent.
4. Cap total rows at 5000 with a clear Arabic error above that.
5. Fix the obvious dead branch at line ~55:
     transactionDate: transactionDate ? FieldValue.serverTimestamp()
                                      : FieldValue.serverTimestamp()
   Both arms are identical, so the parsed CSV date is thrown away and every
   transaction gets the import time instead. Parse the date string into a real
   Timestamp (handle DD/MM/YYYY and YYYY-MM-DD; fall back to serverTimestamp with a
   warning in the response when unparseable).
6. Update src/app/admin/import/page.tsx to surface failedCount and the error list.
```

**GATE P1-7**
```bash
python3 -c "
print('reference,amount,sender,date')
for i in range(600): print(f'REF{i:06d},150,Test Sender,2026-07-01')
" > /tmp/big.csv
```
Import `/tmp/big.csv` through the admin UI → all **600** rows import. Then check a `bankTransactions` document: `transactionDate` should be 2026-07-01, **not** today.

✅ Pass when: 600 rows import and dates are preserved.

---

## P1-8 · Paginate the reconciliation route 🟡

**Model:** Gemini 3.6 Flash · **Depends on:** P1-3

```
src/app/api/admin/reconcile/route.ts runs an unbounded .get() over every
manual_review + high-confidence registrant, then processes them sequentially with
awaits inside the loop (a Firestore get plus a batch commit per iteration). With a
few hundred registrants this exceeds the function timeout and half the work is lost.

1. Add `export const maxDuration = 60;`
2. Page the query with .limit(100) + startAfter(lastDoc) in a loop.
3. Process each page with a bounded-concurrency map (5 at a time) rather than a
   sequential for-loop. Do not fire all of them at once.
4. Track elapsed time; stop cleanly at 50 seconds and return
   { done: false, cursor: <lastDocId>, matched, duplicates, reviewed } so the admin UI
   can resume.
5. Update src/app/admin/page.tsx (or wherever reconcile is triggered) to loop until
   done:true, showing progress.
6. Use reconcileRegistrant from src/lib/reconciliation.ts (created in P1-3) — do not
   keep a second copy of the matching logic here.
```

**GATE P1-8**
```bash
npx next build
```
Manual: trigger reconciliation with >100 pending registrants → completes across multiple calls without a timeout, and the counts add up correctly.

✅ Pass when: no 504s and the totals are right.

---

## P1-9 · Remove the redundant Firestore read on every API call 🔵

**Model:** Gemini 3.6 Flash · **Depends on:** none

```
src/lib/auth/guards.ts requireRole() computes isAdminByEmail BEFORE checking whether
the custom claim already answers the question:
    const isAdminByEmail = userEmail ? await isEmailAdmin(userEmail) : false;
    const userRole = (decodedToken.role) || (isAdminByEmail ? 'admin' : undefined);
That is a Firestore read on every single authenticated API request, even when the
claim is present.

1. Reorder: if decodedToken.role is set and satisfies the required role, return
   immediately. Only fall back to the isEmailAdmin lookup when the claim is absent.
2. Add a 60-second in-process memo for isEmailAdmin results (a Map with timestamps).
   Note in a comment that this is per-instance and best-effort on serverless.
3. Keep behaviour identical — this is purely a short-circuit.
```

**GATE P1-9**
```bash
npx vitest run && npx next build
```
Manual: an admin with a custom claim and an admin whose access comes only from the `admins` collection must **both** still work. (Test both — the memo is easy to get subtly wrong.)

✅ Pass when: both admin types authenticate and admin API calls are measurably faster.

---

## P1-10 · Fix all ESLint errors + add CI 🟡

**Model:** Gemini 3.6 Flash · **Depends on:** none

```
`npx eslint .` currently reports 29 problems: 19 errors, 10 warnings. `npm run lint`
therefore exits non-zero, so CI would fail on day one.

Breakdown:
  11 errors  @typescript-eslint/no-require-imports   scripts/*.js (CommonJS)
   5 errors  react-hooks/set-state-in-effect         auth/context.tsx and others
   2 errors  prefer-const
   1 error   react-hooks/immutability
   6 warns   @next/next/no-img-element
   4 warns   @typescript-eslint/no-unused-vars

1. scripts/*.js — these are legitimately CommonJS Node scripts. Add a scoped override
   in eslint.config.mjs disabling no-require-imports for 'scripts/**/*.js' rather than
   rewriting them to ESM.
2. react-hooks/set-state-in-effect — fix properly, do not disable. In
   src/lib/auth/context.tsx the `if (!isFirebaseConfigured) setLoading(false)` should
   be lazy initial state, not an effect. Review each of the 5 individually.
3. prefer-const and no-unused-vars — apply `npx eslint . --fix`, then review the diff.
4. no-img-element — the remaining <img> tags are data-URI receipts and QR codes that
   next/image cannot optimise. Add a targeted eslint-disable-next-line with a comment
   explaining why, at each site. Do not blanket-disable the rule.
5. react-hooks/immutability — fix at source.
6. Create `.github/workflows/ci.yml`: on push and pull_request, Node 20, npm ci, then
   `npm run typecheck`, `npm run lint`, `npm run test`, `npx next build`.
   No secrets needed — the build already tolerates missing env vars.
```

**GATE P1-10**
```bash
npx eslint .            # 0 errors, 0 warnings
npx tsc --noEmit
npx vitest run
npx next build
```
Push the branch and confirm the GitHub Actions run goes green.

✅ Pass when: `npm run lint` exits 0 and CI passes on a real push.

---

## P1-11 · Restore pinch-zoom and fix text contrast 🟡

**Model:** Gemini 3.6 Flash · **Depends on:** P0-13

```
Two WCAG issues.

A. src/app/layout.tsx viewport sets maximumScale: 1, which disables pinch-zoom on iOS
   — a WCAG 2.1 SC 1.4.4 (Resize Text) failure. It matters concretely: this app serves
   a conference audience including older attendees and displays QR codes and small
   Arabic text. Inputs are already 17px so the usual justification does not apply.
   → Delete maximumScale entirely (or set it to 5).

B. Text contrast is both low and NON-DETERMINISTIC. Body text sits over a photographic
   background dimmed by only 38%:
     linear-gradient(rgba(19,12,5,0.38), rgba(19,12,5,0.38)), url('/bg.webp')
   so contrast varies with the photo and cannot be guaranteed. On top of that, muted
   text uses low-alpha white heavily: rgba(255,255,255,0.45) appears 8 times, 0.5 five
   times, 0.4 four times, 0.3 twice — often at 0.8125rem (13px). Approximating the
   glass-card backdrop, 0.45 computes to roughly 3.9:1, below the 4.5:1 AA minimum.

   1. Raise the body overlay to rgba(19,12,5,0.70).
   2. Add design tokens to the @theme block in globals.css:
        --color-text-primary:   #f7f0e4;
        --color-text-secondary: rgba(255,255,255,0.78);
        --color-text-muted:     rgba(255,255,255,0.70);   /* AA floor */
   3. Replace every inline rgba(255,255,255,0.3|0.4|0.45|0.5|0.6) used for TEXT with
      var(--color-text-muted) or --color-text-secondary. Leave borders, dividers, and
      background fills alone — this is a text-only change.
   4. Raise .form-input::placeholder from rgba(247,240,228,0.4) to 0.65.
   5. Add a prefers-reduced-motion block disabling the .bg-orb animations and the
      .fade-in / .page-enter transitions.

Search src/ for the rgba patterns — many are in inline style objects, not just CSS.
```

**GATE P1-11**
```bash
grep -rn "maximumScale" src/                                  # nothing
grep -rn "rgba(255,255,255,0\.[34]" src/ | grep -iv "border\|shadow\|background"   # nothing
npx next build
```
Then run **Lighthouse → Accessibility** on `/` and `/register`, and confirm zero contrast failures. On a real iPhone, pinch-zoom must work.

✅ Pass when: Lighthouse a11y contrast checks pass and zoom is restored.

---

## P1-12 · Stop leaking internal errors to clients 🟡

**Model:** Gemini 3.6 Flash · **Depends on:** none

```
Five routes return raw exception text to the caller, e.g.:
    return NextResponse.json({ error: `خطأ في تنفيذ الموافقة: ${errorMessage}` }, { status: 500 });
Firestore and Firebase Admin exceptions leak project IDs, collection paths, and index
creation URLs. Affected: api/admin/approve, api/admin/reject, api/admin/delete,
api/admin/admins, api/cron/ocr (which also returns `details: error.message`).

1. Create `src/lib/api-error.ts` exporting
   `serverError(error: unknown, arabicMessage: string): NextResponse`:
   - generate a short correlation id (crypto.randomUUID().slice(0,8))
   - console.error the id, the message, and the stack — server-side only
   - return { error: arabicMessage, ref: <id> } with status 500
2. Apply it at all five sites. Keep the existing Arabic user-facing text; drop the
   interpolated ${errorMessage}.
3. Also fix the empty `catch {}` blocks that silently swallow errors in
   src/lib/auth/guards.ts, src/app/api/scan/verify-passcode/route.ts, and
   src/app/api/admin/admins/route.ts — log at minimum.
4. Replace the two alert() calls in src/app/admin/registrants/page.tsx with the toast
   notification pattern already implemented in src/app/admin/review/page.tsx.
```

**GATE P1-12**
```bash
grep -rn '\${errorMessage}\|error.message' src/app/api/ | grep -v "console.error"   # nothing
grep -rn "alert(" src/app/admin/    # nothing
npx next build
```
Manual: trigger a failure (approve a non-existent id) → the response contains a generic Arabic message plus a `ref`, and the server log contains the same `ref` with the real stack.

✅ Pass when: no stack traces or Firestore internals reach the client.

---

## 🚦 P1 EXIT GATE

```bash
npx tsc --noEmit && npx eslint . && npx vitest run && npm run test:rules && npx next build
grep -rn "allow create: if true" firestore.rules     # NOTHING — server-write-only now
```

**Verify the improvements are real, not assumed:**

| Check | Target |
|---|---|
| Total JS on `/` (DevTools, hard refresh) | ~200 KB gz lower than baseline |
| `du -sh public/` | < 300 KB |
| OCR latency: register → `ocrStatus: done` | < 60 seconds |
| 600-row CSV import | all rows, correct dates |
| Lighthouse mobile Performance on `/` | 80+ |
| Lighthouse Accessibility on `/register` | 90+ |
| Direct client write to `registrants` | `permission-denied` |

Re-run the 9-flow walkthrough. Tag: `git tag p1-complete && git push --tags`

---

# PHASE P2 — Quality & Maintainability

**9 tasks · ongoing · branch `fix/p2-quality`**
Nothing here blocks the event. Do it before the codebase grows.

---

## P2-1 · Expand the test suite

**Model:** Opus 4.6 (test design) → Gemini 3.6 Flash (bulk cases)

```
Vitest exists from P0-1 and covers hmac.ts plus the Firestore rules. Extend to the
rest of the pure logic — these functions handle money and access control and are all
trivially testable.

1. src/lib/validation.test.ts
   - isValidEgyptianPhone: 010/011/012/015 valid; 013/014 invalid; 10 and 12 digits
     invalid; spaces/dashes/parens stripped; +20 and 0020 prefixes (document the
     current behaviour, then decide whether it is correct)
   - isValidName: 1 char invalid, 2 valid, whitespace-only invalid, Arabic names valid
   - isAmountWithinTolerance: exactly ±5 (boundary), ±5.01, negatives, zero
   - normalizePhone and formatPhoneDisplay round-trips
2. src/lib/reconciliation.test.ts (the module from P1-3) — mock Firestore:
   - reference not found → no match
   - reference already matched to a DIFFERENT registrant → duplicate flagged, both
     annotated
   - amount outside tolerance → mismatch note, no approval
   - amount at exactly the tolerance boundary → matches
   - happy path → auto_approved + ticket created
3. src/lib/schemas/registration.test.ts — every field's boundary conditions
4. src/lib/phone.test.ts once P2-4 extracts it — including the 20-prefix edge cases
   the three current copies disagree on
5. Add a coverage script and target 70%+ on src/lib/. Do not chase coverage on
   src/app/**/page.tsx — component tests are not worth it here.
```

**GATE P2-1**
```bash
npx vitest run --coverage   # all pass; src/lib/ coverage >= 70%
```
✅ Pass when: a deliberately reintroduced bug (e.g. change the tolerance to 50) makes a test fail.

---

## P2-2 · Resolve the Tailwind-vs-inline-styles split

**Model:** Gemini 3.6 Flash (bulk) with Opus 4.6 for the first file

```
Tailwind v4 is installed, globals.css defines a full @theme token set — and ZERO
responsive utility prefixes appear anywhere in the codebase. A search for sm:, md:,
lg:, xl: across src/ returns nothing. Essentially the entire UI is inline style={{}}
objects; admin/layout.tsx alone is 322 lines, mostly inline styling. Consequences:
no responsive variants without hand-written media queries (there are only 2 in a
721-line stylesheet), inline styles are unreachable by media queries so breakpoint
values get duplicated in CSS with !important (9 of them), new object literals on every
render, and the design tokens are bypassed for hardcoded values.

DECIDE FIRST, then execute. Recommended: commit to Tailwind, since it is already
installed and the tokens are already defined as @theme.

Convert in this order, one file per commit, verifying visually after each:
  1. src/components/Header.tsx        (smallest — establishes the pattern)
  2. src/app/admin/layout.tsx         (322 lines, mostly styling)
  3. src/app/page.tsx
  4. src/app/register/page.tsx
  5. src/app/admin/review/page.tsx
  6. src/app/admin/registrants/page.tsx
  7. src/app/scan/page.tsx
  8. src/app/ticket/[registrantId]/page.tsx  (careful: canvas rendering reads colours)

Rules for the conversion:
  - Map inline values to existing @theme tokens (bg-surface-900, text-accent-400, ...).
    If no token exists, ADD one rather than hardcoding.
  - Keep .glass-card, .form-input, .btn-* etc. as CSS component classes — they are
    genuinely reusable. Convert only the one-off layout styling.
  - Add responsive prefixes where the @media (max-width:640px) block currently uses
    !important, then DELETE those !important rules.
  - RTL: prefer logical utilities (ms-/me-/ps-/pe-) over left/right so dir="rtl" works.
  - Preserve every Arabic string and the exact visual result. Screenshot before and
    after each file.
```

**GATE P2-2 (per file)**
```bash
npx next build
grep -c "style={{" <converted-file>   # should trend toward 0
```
Screenshot the page at 375px, 768px, and 1440px before and after — they must be visually identical. Then verify the `!important` count in globals.css drops.

✅ Pass when: no visual regression at any of the three widths.

---

## P2-3 · Migrate fonts to `next/font`

**Model:** Gemini 3.6 Flash

```
globals.css line 1 does:
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap');
A CSS @import inside the main stylesheet serialises the request — the CSS must
download before the font CSS is even discovered, then the font files load. It also
requests SEVEN Cairo weights and FIVE Inter weights; the app visibly uses about four.
This is a direct FOIT/CLS and LCP cost. next/font is in the project's own README but
unused.

1. Audit which weights are actually referenced (grep for fontWeight and font-*).
2. In src/app/layout.tsx use next/font/google:
     const cairo = Cairo({ subsets: ['arabic','latin'], weight: [<only what is used>],
                           display: 'swap', variable: '--font-cairo' });
   Apply cairo.variable to the <html> className.
3. Inter appears only as a fallback behind Cairo in both font stacks
   (--font-sans and --font-display). Drop it entirely unless you find a real usage.
4. Update --font-sans / --font-display in @theme to reference var(--font-cairo).
5. Delete the @import line from globals.css.
6. Remove fonts.googleapis.com / fonts.gstatic.com from the CSP added in P0-14 — they
   are self-hosted now, which also tightens the policy.
```

**GATE P2-3**
```bash
grep -n "fonts.googleapis" src/app/globals.css   # nothing
npx next build
```
DevTools → Network → Font: no requests to `fonts.googleapis.com`. Arabic text renders in Cairo with no flash of fallback font. Lighthouse LCP should improve.

✅ Pass when: zero external font requests and no visual change.

---

## P2-4 · De-duplicate shared logic

**Model:** Gemini 3.6 Flash

```
Three separate implementations of Egyptian phone → international formatting, with
subtly different logic:
  - src/lib/whatsapp/api.ts (~line 14)
  - src/app/admin/registrants/page.tsx getWhatsAppUrl()
  - scripts/whatsapp-bot.js
The WhatsApp message template is written out FOUR times (whatsapp/api.ts,
admin/registrants, admin/review, whatsapp-bot.js).

1. Create src/lib/phone.ts:
   - toInternational(phone): normalises 01X… → 201X…, handles existing 20/+20/0020
     prefixes, returns null on anything invalid.
   - Reconcile the three implementations first: document where they disagree, pick the
     correct behaviour, and write tests for it (P2-1 item 4).
2. Create src/lib/whatsapp/templates.ts exporting ticketApprovedMessage(ticketUrl) with
   the exact Arabic copy currently in use — including the ✓ checkmark chosen in commit
   a47b72d specifically to avoid the WhatsApp symbol-corruption issue. Do not
   "improve" that character.
3. Replace all call sites. scripts/whatsapp-bot.js is CommonJS and cannot import the TS
   module — duplicate the minimal normalisation there with a comment pointing at
   src/lib/phone.ts as the source of truth, or convert the script to ESM.
4. Confirm src/lib/reconciliation.ts (P1-3) and src/lib/services/ticket-service.ts
   (P1-4) landed and that no duplicate copies of that logic remain.
```

**GATE P2-4**
```bash
grep -rn "cleanPhone.startsWith('0')" src/ scripts/ | wc -l   # expect 1 (bot only)
grep -rn "تم قبول تسجيلك" src/ | wc -l                        # expect 1 (templates.ts)
npx vitest run && npx next build
```
Manual: approve a registrant → the WhatsApp message is character-for-character identical to before, checkmark included.

✅ Pass when: one phone formatter, one message template, message unchanged.

---

## P2-5 · Write real documentation

**Model:** Gemini 3.6 Flash

```
README.md is still unmodified create-next-app boilerplate. For a system with a two-tier
deployment (Vercel + a separate always-on WhatsApp bot host), ~20 env vars, Firestore
rules and indexes that deploy separately, and a set-admin-role.js bootstrap step, this
is the most consequential documentation gap in the project — the entire operational
model currently lives only in the author's head.

Rewrite README.md with:
  1. What the system does, in three sentences.
  2. Architecture diagram (ASCII or Mermaid): browser → Next.js on Vercel → Firestore /
     Storage / Gemini, plus the separate WhatsApp bot host and the cron sweeper.
  3. The registration → OCR → reconciliation → approval → ticket → scan lifecycle,
     with the status enum transitions from src/lib/types.ts.
  4. Full env var table: name, required/optional, purpose, how to obtain it.
  5. Local setup: clone → npm i → cp .env.example .env → firebase emulators → npm run dev.
  6. Firebase project setup: enable Auth (email/password), Firestore, Storage,
     App Check; deploy rules and indexes; create the first admin with
     `node --env-file=.env scripts/set-admin-role.js <email> admin`.
  7. WhatsApp bot: where it runs, why it cannot run on Vercel, how to authenticate it,
     how to scan the QR on first boot.
  8. Deployment checklist, including the ordering trap: deploy the App Check client
     change BEFORE enabling enforcement, or the app breaks.
  9. Operations runbook: what to do when OCR is stuck, when a ticket will not scan,
     when an attendee lost their ticket link.
 10. Script reference: set-admin-role, reissue-tickets, migrate-receipts,
     optimize-assets, push-env-to-vercel.

Also: src/lib/types.ts line ~119 still has
  // TODO: Replace with actual church list from the user
above 10 placeholder church names. Either get the real list or move it to a Firestore
`settings/churches` document so it is editable without a deploy. Flag this — do not
silently invent church names.
```

**GATE P2-5**
Hand the README to someone who has never seen the repo and have them get it running locally without asking you anything. That is the only gate that means anything here.

✅ Pass when: a fresh developer reaches a working local environment unaided.

---

## P2-6 · Accessibility pass

**Model:** Gemini 3.6 Flash

```
The foundations are good — 40 real <button> elements (no clickable <div>s anywhere,
a common failure this project avoids), 10 htmlFor label associations, alt text on all
7 content images, sensible <h1> usage, aria-hidden on the decorative orbs. But there
are only 3 aria-* attributes and 0 role attributes across ~7,300 lines.

1. Validation errors (register/page.tsx and elsewhere) are plain <p>. Add
   role="alert" so screen reader users get feedback on a failed step.
2. Link inputs to their errors: aria-invalid={!!errors.x} and
   aria-describedby={errors.x ? 'x-error' : undefined}, with a matching id on the <p>.
3. Wizard focus management: on goNext()/goBack(), move focus to the new step's heading
   (tabIndex={-1} + ref.focus()). Focus currently stays on the button and only step 1
   has autoFocus.
4. Scanner results (scan/page.tsx): wrap the result panel in
   aria-live="assertive" aria-atomic="true" so ushers using assistive tech hear
   success / already-used / invalid outcomes.
5. Admin toasts: aria-live="polite".
6. Add a skip-to-content link in layout.tsx (visible on focus only).
7. Add a MANUAL CODE ENTRY fallback to /scan — a text input that submits the same
   token to /api/scan. Needed for anyone who cannot operate the camera, and a genuinely
   useful failure path when camera permission is denied at the door.
8. Keyboard-test the whole flow: registration wizard, admin nav, the review modal
   (which must trap focus and close on Escape).
```

**GATE P2-6**
```bash
npx next build
```
- Lighthouse Accessibility ≥ 95 on `/`, `/register`, `/admin/review`
- Full keyboard-only pass through registration and admin review
- VoiceOver or TalkBack: trigger a validation error and confirm it is announced
- axe DevTools: 0 critical issues

✅ Pass when: registration is completable by keyboard alone with errors announced.

---

## P2-7 · Remove dead and misplaced dependencies

**Model:** Gemini 3.6 Flash

```
1. html5-qrcode (~2 MB) is a dependency but is NEVER IMPORTED ANYWHERE. The scanner
   uses jsQR plus the native BarcodeDetector. Verify with
   `grep -rn "html5-qrcode" src/ scripts/` then `npm uninstall html5-qrcode`.
2. globals.css has orphaned rules targeting #qr-reader and #qr-reader video inside the
   @media (max-width: 640px) block — that DOM id is html5-qrcode's and no component
   renders it. Confirm with grep, then delete those rules.
3. whatsapp-web.js, express, and qrcode-terminal are only used by scripts/whatsapp-bot.js,
   which cannot run on Vercel — but they sit in `dependencies`, so Vercel installs
   Puppeteer on every production build for code that never executes there. Move all
   three to devDependencies. Verify the Vercel build still succeeds afterwards.
4. Run `npm audit` and resolve what is resolvable with `npm audit fix`. The remaining
   findings (26 total: 20 high, 6 moderate) are almost entirely transitive within the
   eslint and firebase-admin trees — minimatch/brace-expansion ReDoS, glob, rimraf,
   retry-request — so runtime exposure is limited. Document anything that cannot be
   fixed without a breaking major bump, with the reasoning.
5. fluent-ffmpeg is deprecated and arrives via whatsapp-web.js — note it, do not chase it.
```

**GATE P2-7**
```bash
npm uninstall html5-qrcode
grep -rn "qr-reader" src/    # nothing
npm audit                    # note remaining count + justification
npx next build
```
Then deploy to a Vercel preview and confirm the build succeeds **and gets faster** (Puppeteer no longer installs).

✅ Pass when: the scanner still works and the production install is lighter.

---

## P2-8 · Add a tablet breakpoint

**Model:** Gemini 3.6 Flash · **Depends on:** P2-2

```
There are exactly two breakpoints: @media (min-width: 768px) sets a container
max-width, and @media (max-width: 640px) swaps the admin nav. Between 641px and 767px
— a real range covering small tablets and landscape phones — the admin UI shows the
DESKTOP tab nav inside a mobile-width container.

This matters practically: a tablet is a plausible check-in desk device.

1. Test every admin page at 768x1024 and 1024x768. Document what breaks.
2. Align the nav swap breakpoint with the container breakpoint (both at 768px) so
   there is no dead zone.
3. Add md: variants (from P2-2) for the admin registrants table and the review queue
   so they use a two-column layout on tablet rather than either the cramped mobile
   card stack or the overflowing desktop table.
4. Verify /scan at tablet size — the camera box currently has a max-width of 22rem
   only inside the 640px query, so it is unconstrained on tablet.
5. Test at 375px (iPhone SE), 390px, 768px, 1024px, 1440px.
```

**GATE P2-8**
Screenshot every page at all five widths. No horizontal scroll, no overflowing tables, no overlapping nav at any width.

✅ Pass when: the 641–767px dead zone is gone and the scanner is usable on a tablet.

---

## P2-9 · Rendering performance polish

**Model:** Gemini 3.6 Flash

```
1. body { background-attachment: fixed } in globals.css is a well-known scroll-jank
   source on mobile Safari and is effectively ignored on iOS. Scope it to
   @media (min-width: 768px) and (hover: hover), or remove it.
2. .glass-card uses backdrop-filter: blur(16px). That forces a GPU pass per card per
   frame; the admin registrants list stacks dozens of them and mid-range Android
   devices drop frames. Reduce to blur(8px), and add a @media (max-width: 640px)
   override that drops backdrop-filter entirely in favour of a slightly more opaque
   solid background.
3. The three .bg-orb elements animate continuously. Pause them under
   prefers-reduced-motion (added in P1-11) and consider pausing them on the admin
   list pages where dozens of glass cards already tax the compositor.
4. src/app/admin/page.tsx polls 7 getCountFromServer aggregations every 30 seconds —
   840 queries/hour per open tab. getCountFromServer is the right, cheap primitive
   (good call), but raise the interval to 120s and pause polling when
   document.visibilityState !== 'visible'.
5. src/app/admin/registrants/page.tsx filters the full items array on every keystroke.
   Debounce the search input by 250ms.
6. Profile /admin/registrants with 200+ records in Chrome DevTools Performance before
   and after. Report the frame-rate difference.
```

**GATE P2-9**
```bash
npx next build
```
- Chrome DevTools Performance on `/admin/registrants` with 200+ records: scrolling holds ~60fps
- Lighthouse mobile Performance ≥ 90 on `/`
- Firestore usage in the console drops measurably after the polling change

✅ Pass when: scrolling is smooth on a mid-range Android device.

---

# Progress Tracker

| # | Task | Model | Depends | Done | Gate ✅ |
|---|---|---|---|---|---|
| **P0-0** | Baseline, env validation, `.env.example` | Flash | — | ☐ | ☐ |
| **P0-1** | 🔴 Fix HMAC verification bypass | **Opus** | P0-0 | ☐ | ☐ |
| **P0-2** | 🔴 Require TICKET_SECRET + reissue tickets | **Opus** | P0-1 | ☐ | ☐ |
| **P0-3** | 🔴 Enforce signature in scan route | **Opus** | P0-1 | ☐ | ☐ |
| **P0-4** | 🟠 Delete `/api/upload` | Flash | — | ☐ | ☐ |
| **P0-5** | 🟠 Usher passcode + rate limiting | **Opus** | P0-0,3 | ☐ | ☐ |
| **P0-6** | 🟠 Require CRON_SECRET | Flash | P0-0 | ☐ | ☐ |
| **P0-7** | 🔴 Server read routes (status/ticket) | **Opus** | P0-0 | ☐ | ☐ |
| **P0-8** | 🔴 Fix ticket lookup leak | **Opus** | P0-7 | ☐ | ☐ |
| **P0-9** | 🔴 Lock Firestore + Storage rules | **Opus** | P0-7,8 | ☐ | ☐ |
| **P0-10** | 🟠 Admin privilege escalation | **Opus** | P0-0 | ☐ | ☐ |
| **P0-11** | 🟠 WhatsApp bot auth | Flash | P0-0 | ☐ | ☐ |
| **P0-12** | 🟠 Firebase App Check | **Opus** | P0-9 | ☐ | ☐ |
| **P0-13** | 🔴 Compress 5.9 MB of assets | Flash | — | ☐ | ☐ |
| **P0-14** | 🟡 Security headers + URL sinks | Flash | — | ☐ | ☐ |
| | **🚦 P0 EXIT GATE** | | | ☐ | ☐ |
| **P1-1** | 🔴 Server-side registration | **Opus** | P0 | ☐ | ☐ |
| **P1-2** | 🟠 Receipts → Storage | **Opus** | P1-1 | ☐ | ☐ |
| **P1-3** | 🟠 Fix OCR pipeline throughput | **Opus** | P1-1 | ☐ | ☐ |
| **P1-4** | 🟠 Atomic + non-blocking approval | **Opus** | P1-3 | ☐ | ☐ |
| **P1-5** | 🟠 AuthProvider out of root layout | **Opus** | — | ☐ | ☐ |
| **P1-6** | 🟡 Server components for public pages | **Opus** | P1-5 | ☐ | ☐ |
| **P1-7** | 🟡 Chunk CSV import batches | Flash | — | ☐ | ☐ |
| **P1-8** | 🟡 Paginate reconciliation | Flash | P1-3 | ☐ | ☐ |
| **P1-9** | 🔵 Remove redundant Firestore read | Flash | — | ☐ | ☐ |
| **P1-10** | 🟡 Fix ESLint errors + CI | Flash | — | ☐ | ☐ |
| **P1-11** | 🟡 Restore zoom + fix contrast | Flash | P0-13 | ☐ | ☐ |
| **P1-12** | 🟡 Stop leaking internal errors | Flash | — | ☐ | ☐ |
| | **🚦 P1 EXIT GATE** | | | ☐ | ☐ |
| **P2-1** | Expand test suite | Opus→Flash | P1 | ☐ | ☐ |
| **P2-2** | Resolve styling strategy | Flash | — | ☐ | ☐ |
| **P2-3** | Migrate to next/font | Flash | — | ☐ | ☐ |
| **P2-4** | De-duplicate shared logic | Flash | P1-3,4 | ☐ | ☐ |
| **P2-5** | Write real documentation | Flash | — | ☐ | ☐ |
| **P2-6** | Accessibility pass | Flash | — | ☐ | ☐ |
| **P2-7** | Remove dead dependencies | Flash | — | ☐ | ☐ |
| **P2-8** | Tablet breakpoint | Flash | P2-2 | ☐ | ☐ |
| **P2-9** | Rendering performance polish | Flash | — | ☐ | ☐ |

---

# Working notes

**When a gate fails.** Do not prompt the agent to "fix the test." Read the failure yourself first — in P0-1 and P0-9 especially, a failing gate usually means the agent misunderstood the threat model, and asking it to make the test pass is exactly how you get a test weakened instead of a bug fixed.

**When an agent wants to touch files outside the task.** Say no and open a new task. Scope creep across security fixes is how one broken thing becomes three.

**Context per task.** Give the agent only the files named in the prompt plus `AGENTS.md`. A whole-repo context on a 7,300-line project makes the model likelier to "helpfully" refactor something you didn't ask about.

**The three tasks most likely to go wrong:**
- **P0-9** (rules lockdown) — blast radius is the entire app. The custom-claim pre-step is not optional.
- **P0-12** (App Check) — enabling enforcement before the client change is deployed breaks everything, and the failure looks like a Firestore outage.
- **P1-1** (server-side registration) — touches the one flow that must never break, on the busiest path.

Do those three when you have time to test properly, not at 11pm the night before the event.

**If the event is imminent** and you can only do part of this: P0-1, P0-3, P0-9, and P0-13 are the four that matter most — forged tickets, leaked personal data, and a site nobody can load. P0-9 still requires P0-7 and P0-8 first.
