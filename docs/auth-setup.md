# Sign-in setup (Google and GitHub OAuth)

Sign-in is **disabled until the owner registers OAuth apps** and gives the API their credentials. Without credentials, the provider buttons show "not configured". Starting a sign-in returns to `/sign-in?error=provider_not_configured`. No session is ever created. The public demo (`/demo`) needs no credentials at all.

All values below are **placeholders**. Never commit real values: they go in `apps/api/.env` (local) or your host's secret store (deployed).

## How the flow works

```
Browser ── /api/auth/<provider>/start ──▶ Next.js (same origin) ──proxy──▶ API
API: sets a 10-minute HttpOnly flow cookie (state + PKCE verifier + next path) and redirects to the provider
Provider ──▶ <APP_ORIGIN>/api/auth/<provider>/callback ──proxy──▶ API
API: verifies state, exchanges the code server-side, requires a verified email,
     creates/loads the user, rotates the session, sets the session cookie, redirects to the next path
```

- The browser only talks to the website origin. `/api/*` is proxied server-side to the API (ADR-016). Client secrets exist only in the API process.
- Scopes are identity only:
  - Google: `openid email profile`.
  - GitHub: `read:user user:email`. **No repository scopes.**
- New users get a personal workspace with the seeded synthetic **Demo project**.

## Callback URLs

Register exactly these, replacing `<APP_ORIGIN>` with the website origin (scheme + host + port, no trailing slash):

| Provider | Callback (redirect) URL |
|---|---|
| Google | `<APP_ORIGIN>/api/auth/google/callback` |
| GitHub | `<APP_ORIGIN>/api/auth/github/callback` |

Examples:

| Environment | APP_ORIGIN | Google callback |
|---|---|---|
| Local dev | `http://localhost:3000` | `http://localhost:3000/api/auth/google/callback` |
| Production (placeholder) | `https://app.<your-domain>` | `https://app.<your-domain>/api/auth/google/callback` |

`APP_ORIGIN` must match the URL people actually use, including `localhost` vs `127.0.0.1`. It is also the only Origin accepted on state-changing requests (CSRF check). In production it must be `https://`, which also switches cookies to `__Host-` + `Secure`.

## Google

1. In Google Cloud Console, create or select a project, then go to **APIs & Services → OAuth consent screen**.
   - User type: External.
   - App name: `<product name>`. Support email: `<owner email>`.
   - Scopes: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`. These are non-sensitive, so no Google verification is needed for them.
2. **Credentials → Create credentials → OAuth client ID**, type **Web application**.
   - Authorized JavaScript origins: `<APP_ORIGIN>`.
   - Authorized redirect URIs: `<APP_ORIGIN>/api/auth/google/callback`.
3. Put the values in `apps/api/.env`:
   ```
   GOOGLE_CLIENT_ID=<google-client-id>
   GOOGLE_CLIENT_SECRET=<google-client-secret>
   ```
   While the consent screen is in "Testing", only listed test users can sign in.

## GitHub

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App** (an OAuth App, not a GitHub App).
   - Homepage URL: `<APP_ORIGIN>`.
   - Authorization callback URL: `<APP_ORIGIN>/api/auth/github/callback`.
2. Generate a client secret, then:
   ```
   GITHUB_CLIENT_ID=<github-client-id>
   GITHUB_CLIENT_SECRET=<github-client-secret>
   ```
GitHub OAuth Apps allow one callback URL each. Use separate apps for local dev and production.

## Configuration summary

| Variable | Where | Notes |
|---|---|---|
| `APP_ORIGIN` | API | Website origin; default `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | API | Both required to enable Google |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | API | Both required to enable GitHub |
| `DATABASE_URL` | API | Postgres; required in production. Unset in dev → embedded PGlite (`PGLITE_DIR`, default `.data/pglite`) |
| `API_BASE_URL` | Web | Where `/api/*` is proxied. **Baked in at `next build`** for the rewrite. Default `http://127.0.0.1:8787` |

Restart the API after changing `.env`. Its startup log lists which providers are enabled; it never prints the values.

## Account rules
- **Verified email required.** Unverified provider emails are rejected (`email_unverified`).
- **No silent linking.** If a new identity's email already belongs to another account, sign-in is refused (`account_exists`). To use both providers, sign in with the original one, then choose **Account → Sign-in methods → Connect**. That is a same-origin POST to `/api/auth/<provider>/link`, and it requires an active session.
- **Sessions.**
  - Random 256-bit token in an HttpOnly, SameSite=Lax cookie; only its SHA-256 is stored.
  - 30-day expiry, renewed after half-life.
  - Rotated on every sign-in.
  - Listed and revocable on the Account page.
- **Sign-out** is a same-origin POST. It deletes the server session.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `redirect_uri_mismatch` (Google) or "redirect_uri is not associated" (GitHub) | Registered callback ≠ `<APP_ORIGIN>/api/auth/<provider>/callback`, or `localhost` vs `127.0.0.1` mismatch |
| Back on sign-in with "expired or didn't match" | Flow cookie missing: took > 10 min, or a different host than `APP_ORIGIN` |
| Sign-out returns 403 | Browser origin ≠ `APP_ORIGIN` |
| `/api/...` returns 404 or an error page | API not running, or the web build was made with a different `API_BASE_URL` |
