# Admin authentication bootstrap

The admin console has no built-in username or password. A deployment is unavailable until all three secrets below are provisioned. Never put their values in `wrangler.jsonc`, `.dev.vars`, shell history, source files, or issue/PR text.

## Required secret formats

- `ADMIN_USERNAME`: the exact, case-sensitive login name (1–128 characters).
- `ADMIN_PASSWORD_HASH`: `scrypt$32768$8$3$<base64url-16-byte-salt>$<base64url-32-byte-digest>`. The parameters are `N=32768`, `r=8`, and `p=3`; the plaintext password is never deployed. This memory-hard format is used because the Workers Web Crypto PBKDF2 implementation caps iterations at 100,000.
- `ADMIN_AUTH_PEPPER`: an unpadded base64url encoding of at least 32 cryptographically random bytes. It protects stored rate-limit identifiers and must be independent of the password.

For production, keep the default `ADMIN_AUTH_TRANSPORT=cookie`. The cookie is `Secure`, `HttpOnly`, `SameSite=Strict`, host-only, and expires after eight hours. Serve the admin UI from the same Worker origin (for example `/admin`) so browsers do not treat it as a third-party cookie.

An explicit `transport: 'bearer'` option exists only for a cross-origin preview. In that mode the login response returns a short-lived opaque `accessToken`; the UI must keep it in `sessionStorage` (never local storage), send it as `Authorization: Bearer …`, and discard it on logout/tab close. The D1 database stores only the SHA-256 token hash. Production should prefer the same-origin cookie mode.

## First deployment

1. Create the D1 auth tables before routing admin traffic:

   ```sh
   npx wrangler d1 execute m1-ism-micmac-survey-submissions \
     --remote --file=cloudflare/migrations/0002_admin_auth.sql
   ```

2. Generate the password hash locally without writing the plaintext password to disk or command history:

   ```sh
   read -rs 'ADMIN_PASSWORD?Admin password: '; echo
   ADMIN_PASSWORD_HASH_VALUE="$(printf %s "$ADMIN_PASSWORD" | node scripts/hash-admin-password.mjs)"
   unset ADMIN_PASSWORD
   printf %s "$ADMIN_PASSWORD_HASH_VALUE" | npx wrangler secret put ADMIN_PASSWORD_HASH
   unset ADMIN_PASSWORD_HASH_VALUE
   ```

3. Provision the username as a secret. The command prompts for the value:

   ```sh
   npx wrangler secret put ADMIN_USERNAME
   ```

4. Generate and provision an independent 32-byte pepper without printing it:

   ```sh
   ADMIN_AUTH_PEPPER_VALUE="$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')"
   printf %s "$ADMIN_AUTH_PEPPER_VALUE" | npx wrangler secret put ADMIN_AUTH_PEPPER
   unset ADMIN_AUTH_PEPPER_VALUE
   ```

5. Set `ADMIN_ALLOWED_ORIGINS` as a non-secret comma-separated list only if the admin UI needs an additional exact origin. In same-origin production it can be omitted. No wildcards are accepted.

For local Node development, set the same three values in the process environment and use `createNodeAdminAuth()` from `server/admin-auth.mjs`. Its persistent SQLite state defaults to `.wrangler/state/admin-auth.sqlite`; do not use a process-global in-memory store. Local HTTP uses the non-prefixed `m1_admin_session` host-only `HttpOnly; SameSite=Lax` cookie because browsers reject a `__Host-` cookie without `Secure`; production uses `__Host-m1_admin_session` with `Secure`.

## Router contract

- `POST /api/admin/auth/login`: JSON `{ "username": "…", "password": "…" }`. Requires an exact allowed `Origin`. Returns `{ authenticated, csrfToken, expiresAt }` and sets the session cookie. Bearer mode also returns `accessToken`.
- `GET /api/admin/auth/session`: verifies the session, rotates the synchronizer token, and returns `{ authenticated, username, csrfToken, expiresAt }`.
- `POST /api/admin/auth/logout`: requires the session plus `x-csrf-token`; revokes the server-side session and expires the cookie.
- Other admin routes call `requireAdminSession(request, env, { csrf: true })` for state changes, or omit `csrf` for reads. Cookie-mode state changes require both an allowed `Origin` and the current synchronizer token.

Cross-origin preflight, if enabled for preview, must allow `content-type`, `authorization`, and `x-csrf-token`, echo only an exact configured origin, and include `Access-Control-Allow-Credentials: true` for cookie mode.
