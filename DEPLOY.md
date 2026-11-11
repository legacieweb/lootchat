# Deploying LootChat to Render

This guide deploys LootChat as a Render **Web Service** (Node). The production
build is served with `vite preview`, which also applies the admin-auth
middleware (`server/admin-auth.mjs`) to the `/api/auth/admin/*` routes, so the
admin dashboard stays protected by credentials from Render environment variables.

## 1. Push to a Git repository

Render deploys from a Git repo. Commit everything except `node_modules`, `dist`,
and `.env` (local-only credentials).

```sh
git add -A
git commit -m "Prepare for Render deployment"
```

## 2. Create the Render service

Option A — Render Blueprint (recommended):

```sh
# From the Render dashboard: Blueprints → "Use an existing blueprint"
# Point it at this repository. render.yaml defines the service.
```

Render will read `render.yaml` and create a Node web service with:
- Build command: `npm install && npm run build`
- Start command: `npm run preview` (serves `dist/` on `$PORT`)

Option B — Manual web service:

- Runtime: Node
- Build command: `npm install && npm run build`
- Start command: `npm run preview`

## 3. Set required environment variables

In the Render dashboard (or via `render.yaml`), add these:

| Variable | Required | Notes |
|---|---|---|
| `NODE_VERSION` | No | `20` |
| `PORT` | No | Render sets this automatically; `10000` is a safe default |
| `APP_URL` | Yes | Your Render service URL, e.g. `https://lootchat.onrender.com` |
| `ADMIN_EMAIL` | **Yes** | Admin sign-in email (server-side only) |
| `ADMIN_PASSWORD_HASH` | **Yes** | scrypt hash, e.g. `scrypt:<salt>:<hex>` |
| `ADMIN_SESSION_SECRET` | **Yes** | At least 32 random characters; signs session cookies |

Do **not** use `VITE_` prefixed variables — provider credentials stay server-side.

## 4. Generate admin credentials locally

```sh
# Generate a scrypt password hash
node --input-type=module -e "
import { randomBytes, scryptSync } from 'node:crypto'
const s = randomBytes(16).toString('hex')
console.log('scrypt:' + s + ':' + scryptSync('YOUR_ADMIN_PASSWORD', Buffer.from(s, 'hex'), 64).toString('hex'))
"

# Generate a session secret (32+ random chars)
node --input-type=module -e "
import { createHmac, randomBytes } from 'node:crypto'
console.log(createHmac('sha256', randomBytes(32)).digest('base64url'))
"
```

Paste the outputs into `ADMIN_PASSWORD_HASH` and `ADMIN_SESSION_SECRET`, and set
`ADMIN_EMAIL` to the address you want to sign in with.

## 5. Sign in and open the admin dashboard

1. Open your Render app URL.
2. Go to **Settings → Administrator sign in** (or the admin link in the footer).
3. Enter the admin email and password you configured.
4. On success, `App.tsx:176` sets the tab to `Admin`, opening the shared support inbox.

A valid session cookie (`lootchat_admin_session`) persists access for 12 hours.
Wrong credentials return `401` and are rate-limited after 5 attempts per IP.

## 6. Local development

```sh
npm install
npm run dev
```

Copy `.env.example` to `.env` and fill in `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`,
and `ADMIN_SESSION_SECRET` to test the admin flow locally.

## Notes

- `vite preview` is used to serve production assets because the app has no
  separate Node server; the admin-auth middleware runs inside Vite's preview
  server via `configurePreviewServer` (`vite.config.ts:9`).
- The admin preview uses local sample data and is not for real member data
  (see `README.md`).
- Connect IyonicDB / IyonicPay / IyonicMailer server-side adapters before
  opening to customers; never put provider keys in browser code.
