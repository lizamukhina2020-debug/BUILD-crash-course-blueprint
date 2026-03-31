# SeedMind Cloud Run API (DeepSeek proxy)

This service proxies DeepSeek chat completions so the mobile app can stream token-by-token **without shipping the DeepSeek API key** inside the IPA.

## Endpoints

- `GET /health` → `{ ok: true }`
- `POST /v1/chat/completions` → DeepSeek-compatible JSON response
  - If request body has `"stream": true`, the response is **SSE** and bytes are forwarded as-is.

## Auth

The app must send a Firebase Auth ID token:

`Authorization: Bearer <firebase_id_token>`

The server verifies it with Firebase Admin and uses the decoded `uid` for rate limiting.

## Environment variables

- `DEEPSEEK_API_KEY` (**required**) – stored in Secret Manager for Cloud Run
- `DEEPSEEK_UPSTREAM_URL` (optional) – defaults to `https://api.deepseek.com/v1/chat/completions`
- `RATE_PER_MINUTE` (optional) – default `25`
- `RATE_PER_DAY` (optional) – default `250`

## Local dev (optional)

1) Install deps:

```bash
cd backend/cloudrun
npm i
```

2) Run:

```bash
DEEPSEEK_API_KEY="..." npm run dev
```

For Firebase token verification, local dev needs Google credentials. Easiest is to deploy first and test on Cloud Run.

