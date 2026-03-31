# SeedMind Website

This folder is a small Next.js site (landing + legal pages) that you can deploy on Vercel.

## Pages

- `/` Landing
- `/privacy` Privacy Policy
- `/terms` Terms of Service
- `/support` Support (currently: **Email coming soon**)

## Run locally

```bash
cd website
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Deploy to Vercel (recommended)

1. Create a Vercel account (if you don’t have one).
2. In Vercel, click **Add New → Project**.
3. Import your SeedMind repo/folder.
4. Set **Root Directory** to `website`.
5. Framework preset should auto-detect **Next.js**.
6. Click **Deploy**.

After deploy, Vercel will give you a URL like `https://<project>.vercel.app`.

## Hook the URLs into the app

After you have your Vercel URL, set it in your app config:

- Update `expo.extra.websiteBaseUrl` (or add it if missing) in `app.config.js` to your Vercel URL.
- Rebuild your dev client / app build so Settings links point to the correct pages.

