<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
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
Every task ends with: `npx tsc --noEmit` clean, `npx next build` succeeds, and the task's stated acceptance criteria met.ه ىثثي