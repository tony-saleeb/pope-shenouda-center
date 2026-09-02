# Pre-Flight — Step by Step

Do these **before P0-0**. Total time: **45–70 minutes**, most of it waiting on consoles.

Do them in this order — task 6 is an audit that answers tasks 5 and 6 in one run, and its output changes what you do in tasks 2 and 3.

| # | Task | Time | Blocks |
|---|---|---|---|
| 1 | Secrets: `TICKET_SECRET`, `USHER_PASSCODE`, `WHATSAPP_BOT_TOKEN`, `CRON_SECRET` | 5 min | P0-1, P0-5, P0-6, P0-11 |
| 2 | Upstash Redis | 10 min | P0-5, P0-7, P0-8, P1-1 |
| 3 | reCAPTCHA v3 site key | 10 min | P0-12 |
| 4 | Firebase App Check registration | 10 min | P0-12 |
| 5 | Wire env vars into `.env` + Vercel | 10 min | everything |
| 6 | **Run the audit script** | 5 min | P0-2, P0-9 |

> ### 🔒 Before you touch anything
> You're running coding agents with filesystem access on this repo. **Agents read `.env`.**
> - Confirm `.env` is gitignored: `git check-ignore -v .env` → must print a match.
> - If Antigravity has a file-exclusion setting, add `.env` and `.env.*` to it.
> - **Never paste a secret value into an agent prompt or chat.** Every prompt in the plan refers to env vars by *name* for this reason.

---

## 1 · Generate secrets (5 min)

You need four. Run these and paste the output into a password manager **now** — you'll need them in step 5.

```bash
echo "TICKET_SECRET=$(openssl rand -hex 32)"
echo "WHATSAPP_BOT_TOKEN=$(openssl rand -hex 24)"
echo "CRON_SECRET=$(openssl rand -hex 24)"
```

No `openssl` (Windows without Git Bash)? Use Node — you already have it:

```bash
node -e "console.log('TICKET_SECRET='+require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('WHATSAPP_BOT_TOKEN='+require('crypto').randomBytes(24).toString('hex'))"
node -e "console.log('CRON_SECRET='+require('crypto').randomBytes(24).toString('hex'))"
```

### The usher passcode is different — don't use hex

An usher types this **on a phone, at a door, in a queue, possibly in low light**. A 48-character hex string is unusable there, and an usher who can't type it will just write it on a sticky note taped to the desk — which is worse than a short passcode.

The real defence is the rate limiting added in P0-5 (5 attempts / 15 min / IP). That makes a 10-character alphanumeric passcode entirely adequate, where without rate limiting even 12 digits wouldn't be.

Generate a typeable one with no ambiguous characters (no `0/O`, `1/l/I`):

```bash
node -e "
const a='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
let s='';for(let i=0;i<10;i++)s+=a[Math.floor(Math.random()*a.length)];
console.log('USHER_PASSCODE='+s.slice(0,5)+'-'+s.slice(5));
"
# e.g. USHER_PASSCODE=K7RQP-M3XTD
```

The hyphen is just for legibility — it's part of the passcode. Requirements met: 11 chars, not numeric-only, no ambiguous glyphs, typeable in about four seconds.

**Record which ushers get it, and plan to rotate it after the event.** It's a shared credential with no individual attribution until you do P0-5's per-usher accounts.

---

## 2 · Upstash Redis (10 min)

Rate limiting needs shared state. In-memory counters don't work on Vercel — every cold start resets them, so an attacker just waits for a new container.

1. Go to **[console.upstash.com](https://console.upstash.com)** → sign in with GitHub.
2. **Create Database** → **Redis**.
3. Name: `ticket-reg-ratelimit`
4. **Type: Regional** (not Global — cheaper and lower latency for a single-region app).
5. **Region: match your Vercel function region, not your users' location.** The rate limiter is called *from* the Vercel function, so that round-trip is what matters. Check your region at Vercel → Project → Settings → Functions. Default is `iad1` (Washington DC) → pick `us-east-1`. If you moved it to `fra1` for Egyptian latency → pick `eu-central-1`.
6. Open the database → scroll to **REST API** → copy both:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

   Take the **REST** values, not the `redis://` connection string — `@upstash/redis` uses the REST API because raw TCP doesn't work from edge runtimes.

7. Free tier is comfortably enough for an event of this size (each rate-limited request is a handful of commands). Check current limits on their pricing page and set a usage alert if you're unsure.

**Alternative:** Vercel Marketplace → Upstash integration provisions the same thing and injects the env vars into Vercel automatically. Slightly faster, but you still need the values in your local `.env`.

---

## 3 · reCAPTCHA v3 site key (10 min)

Do this **before** App Check — App Check asks for the secret key this step produces.

1. Go to **[google.com/recaptcha/admin/create](https://www.google.com/recaptcha/admin/create)** (use the Google account that owns the Firebase project).
2. **Label:** `pope-shenouda-center`
3. **Type: reCAPTCHA v3** — the "score-based" option. Not v2, not checkbox.
4. **Domains** — add every one, one per line:
   ```
   pope-shenouda-center.vercel.app
   <your-custom-domain-if-any>
   localhost
   ```
   Vercel *preview* deployments get random subdomains that won't match. Either add your Vercel team's preview wildcard domain, or plan to use App Check debug tokens on previews (see step 4).
5. Accept the terms → **Submit**.
6. You now have **two** keys. They are not interchangeable:

   | Key | Goes where | Public? |
   |---|---|---|
   | **Site key** | `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` in your env | Yes — ships in the browser bundle, by design |
   | **Secret key** | Pasted into the Firebase App Check console in step 4 | **No** — never in your repo or `.env` |

   Mixing these up is the most common failure in this setup. The site key is *meant* to be public.

---

## 4 · Register App Check (10 min)

1. Firebase Console → your project → left sidebar → **App Check**.
   Can't find it? Direct URL: `https://console.firebase.google.com/project/<YOUR_PROJECT_ID>/appcheck`
2. **Apps** tab → find your Web app (the one matching `NEXT_PUBLIC_FIREBASE_APP_ID`) → click it.
3. Choose the **reCAPTCHA v3** provider.
   - The console may also offer **reCAPTCHA Enterprise**. v3 classic is simpler and free; Enterprise needs GCP billing configured. Stick with v3 unless you already use Enterprise. Console options shift over time — if the layout differs from this, follow the on-screen provider list.
4. Paste the **secret key** from step 3. Save.
5. **Token TTL:** leave the default (1 hour).

### ⛔ Do NOT click "Enforce" yet

The **APIs** tab lists Firestore, Storage, Authentication with Unenforced / Enforced toggles. **Leave every one Unenforced.**

Enforcement is P0-12, and the order is load-bearing: the client-side App Check initialisation must be **deployed to production first**. Enforce before that ships and every Firestore call from every browser fails instantly — and it presents as a total outage, not an obvious config error.

Right now you're only registering the provider so the key exists.

### Debug token for local dev (optional, do it now while you're here)

`localhost` won't produce valid App Check tokens once enforcement is on. To keep local dev working later:

1. Run the app locally after P0-12 lands.
2. In the browser console, look for a line like `App Check debug token: <uuid>`.
3. Firebase Console → App Check → your app → ⋮ menu → **Manage debug tokens** → add it.

Note this for later — you can't generate the token until the client code exists.

---

## 5 · Wire the variables in (10 min)

### Local `.env`

Append to your existing `.env` (create it from your current Vercel vars if you don't have one locally):

```bash
# --- P0 additions ---
TICKET_SECRET=<from step 1>
USHER_PASSCODE=<from step 1>
CRON_SECRET=<from step 1>
WHATSAPP_BOT_TOKEN=<from step 1>
UPSTASH_REDIS_REST_URL=<from step 2>
UPSTASH_REDIS_REST_TOKEN=<from step 2>
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=<site key from step 3>
PRIMARY_ADMIN_EMAIL=tonysaleeb23@gmail.com
NEXT_PUBLIC_PRIMARY_ADMIN_EMAIL=tonysaleeb23@gmail.com
BIND_HOST=127.0.0.1
```

Then verify it's ignored:
```bash
git check-ignore -v .env    # must print a .gitignore match
git status --short          # .env must NOT appear
```

### Vercel

The repo has `scripts/push-env-to-vercel.js`, which pushes **everything** in `.env` to production. Convenient, but read it before you run it — it's indiscriminate, and if your local `.env` has stale or dev-only values they'll go to production too.

```bash
node scripts/push-env-to-vercel.js
```

Safer for a first pass — add them individually so you control the scope:
```bash
vercel env add TICKET_SECRET production
vercel env add UPSTASH_REDIS_REST_URL production
# ...etc
```

Either way, afterwards confirm:
```bash
vercel env ls
```

**`CRON_SECRET` note:** when it's set as a Vercel env var, Vercel automatically sends `Authorization: Bearer $CRON_SECRET` on scheduled cron invocations. That's exactly what P0-6 expects — you don't wire anything else up.

**`NEXT_PUBLIC_*` note:** these are inlined at build time. After adding them you must **redeploy**, not just save. Changing them in the dashboard alone does nothing to an existing deployment.

---

## 6 · Run the audit (5 min)

This answers the two open questions — *are tickets in circulation?* and *does the primary admin have a role claim?* — plus three others worth knowing before you start. **It writes nothing** and is safe against production.

```bash
cp <path>/preflight-audit.js scripts/preflight-audit.js
node --env-file=.env scripts/preflight-audit.js
```

### Reading the output

**Section 2 — tickets in circulation**

| Result | What to do |
|---|---|
| `✓ No tickets exist` | Rotating `TICKET_SECRET` is free. In P0-2 you still build the reissue script, but you can skip `--commit`. |
| `✗ N ticket(s) exist` | Every one dies when you rotate. Run the P0-2 reissue script **and re-send the links** — attendees' saved QR images stop working. Plan that communication now. |
| Signature lengths show `8 chars` | Confirms they're legacy 32-bit signatures. Expected — P0-1 moves to 16. |

**Section 3 — custom claims. This is the one that can lock you out.**

| Result | What to do |
|---|---|
| `✓ PRIMARY ADMIN has role=admin` | Clear for P0-9. Still sign out/in after deploying rules. |
| `✗ PRIMARY ADMIN has NO role claim` | **Fix before P0-9** (see below). This is the default state — the code grants admin by hardcoded email, so the claim was probably never set. |
| `✗ PRIMARY ADMIN has NO Firebase Auth account` | He signs in some other way, or hasn't yet. Create the account first, then set the claim. |
| Any `admins` collection entry marked `✗ NO CLAIM` | Same fix, for each of them. They'd otherwise silently lose access. |

Fix, for every admin and usher listed:
```bash
node --env-file=.env scripts/set-admin-role.js tonysaleeb23@gmail.com admin
node --env-file=.env scripts/set-admin-role.js <other-admin> admin
node --env-file=.env scripts/set-admin-role.js <usher-email> usher
```

Then **each of them must sign out and sign back in.** Custom claims are baked into the ID token at issue time; an existing session keeps the old token for up to an hour. Re-run the audit to confirm.

**Section 4 — the passcode trap.** If it reports `settings/config.usherPasscode EXISTS`, that Firestore value **overrides** the env var. Changing `USHER_PASSCODE` in Vercel would do nothing and you'd think P0-5 worked when it hadn't. Update the Firestore document too — or delete the field so the env var is the single source.

**Section 5 — receipt sizes.** Tells you how big the P1-2 migration is. If it warns that documents are near the 1 MiB ceiling, some registrations may already be failing silently — worth checking your rejection rate.

**Section 6 — env presence.** Prints names and ✓/✗ only, never values. Every P0 variable should now show ✓. If not, go back to step 5.

---

## Done when

- [ ] Four secrets generated and in a password manager
- [ ] `.env` confirmed gitignored and excluded from agent file access
- [ ] Upstash Redis created, region matches Vercel's function region, REST URL + token copied
- [ ] reCAPTCHA v3 created; **site** key in env, **secret** key in Firebase only
- [ ] App Check provider registered, **all APIs still Unenforced**
- [ ] All variables in local `.env` and in Vercel; redeployed for the `NEXT_PUBLIC_*` ones
- [ ] Audit run; **primary admin has `role=admin`** and has re-logged in
- [ ] You know whether tickets need reissuing, and have a plan to re-send if so
- [ ] `settings/config.usherPasscode` checked

Then:
```bash
git checkout -b fix/p0-security
```
and start **P0-0**.
