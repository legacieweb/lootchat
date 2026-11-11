# LootChat

LootChat is a people-first learning marketplace where curious learners connect with local guides for language practice, cultural knowledge, career mentoring, wellness and more. Conversations start in free text chat; audio and video calls use plan-based credits.

## Run locally

```sh
npm install
npm run dev
```

The responsive prototype includes a public homepage, guide discovery, sample conversations, an admin inbox preview, learner and local-guide plan views, wallet states and onboarding surfaces. Interactions use local sample data and reset on refresh. The sample community includes 12 curated guides plus 400 generated preview profiles across 80 cities and multiple topics. The generated profiles, ratings, availability, photos and admin inbox conversations are demonstration content, not registered members. The admin preview is not protected by server-side permissions and must not be used for real member data.

## Plans and credit rules

The UI presents Basic, Premium and Gold for both account kinds. Learners pay a monthly subscription for call credits; local guides have lower membership pricing and a lower platform fee. Basic supports free text chat and cannot start calls. The sample interface charges one credit for each minute of an audio or video call. Final prices, payout rules, taxes, refunds and credit accounting must be configured and enforced by the backend before launch.

## Iyonic service integration

`src/services/platform.ts` defines the typed browser-to-server contract. Provider secrets are intentionally server-side; `.env.example` contains placeholders for the requested Iyonic services. The workspace did not include Iyonic SDK packages, credentials, endpoints or documentation for `iyonicdb`, `iyonicmailer` or `iyonicpay`, so the UI does not make undocumented provider calls.

The server implementation should connect these API routes to the provider accounts:

- `/api/auth/*`, `/api/conversations/*`, `/api/guides/*`, `/api/media/*`, `/api/analytics/*` persist accounts, access-controlled chat/media and audit/usage events through IyonicDB.
- `/api/billing/*` creates subscriptions and payment checkout sessions through IyonicPay. Verify signed payment webhooks server-side before granting a tier or credits.
- `/api/calls/*` checks the member's active tier and available credits, creates audio/video sessions, and records usage atomically. Never trust a client-submitted credit balance.
- IyonicMailer sends verification, sign-in/security, subscription, payment and conversation update emails from server-side events.

Use provider-specific official API documentation to implement those server adapters. Do not put provider keys in browser code. Add rate limits, session protection, consent/safety workflows, mentor vetting and financial reconciliation before opening this to customers.
