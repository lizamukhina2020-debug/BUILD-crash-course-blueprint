# BUILD blueprint — standalone site

This is **not** the SeedMind marketing app. It is a **separate** static site for the **BUILD** crash-course document only.

Source of truth for copy/layout: **`../docs/BUILD_BLUEPRINT.html`** and **`../docs/blueprint-media/`**.  
`npm run build` copies them here so Vercel can deploy static HTML at `/`.

**Git-connected deploy** (Root Directory `build-site`): Vercel clones the full repo, so `../docs` exists and the build refreshes from source every time.

**`vercel` CLI from this folder** only uploads `build-site/`, so **`../docs` is missing** on the server. For that path, **`index.html` and `blueprint-media/` are committed** as a snapshot. The build script skips sync when docs are absent but that snapshot exists. After you change the blueprint in `docs/`, run `npm run build` here and commit the updated `index.html` + `blueprint-media/`.

## Deploy on Vercel (second project)

1. **Add New → Project** and import the same GitHub repo again (or create a new project).
2. **Project name** (e.g. `seedmind-build` or `build-blueprint`) — different from your main `seedmind` app.
3. **Root Directory:** **`build-site`** (required).
4. **Framework Preset:** **Other** (or leave auto; `vercel.json` sets `framework: null`).
5. **Build Command:** leave empty (uses `vercel.json` → `npm run build`).
6. **Output Directory:** leave empty or **`.`** — must match `vercel.json`.
7. Deploy.

You’ll get a **new** URL, e.g. `https://seedmind-build.vercel.app` — share **that** link for people who message you **BUILD**. It shows only the blueprint at `/`, not the app landing page.

## Local preview

```bash
cd build-site
npm run build
npx serve .
```

Then open the URL `serve` prints (usually `http://localhost:3000`).
