# benj.bid

Personal portfolio site for Benj, live at https://benj.bid.

- **Stack:** Astro 5 (static output), no UI framework. Pinned to Astro 5 because the local Mac runs Node 22.14; newer Astro needs Node >= 22.23.
- **Content:** `src/data/site.ts` holds the name, bio, links and projects. Most edits ("add a project", "update my bio") belong there.
- **Layout/styles:** `src/layouts/Base.astro` (global tokens, light/dark) and `src/pages/index.astro`.
- **Deploy:** pushing to `main` runs `.github/workflows/deploy.yml` and publishes to GitHub Pages. `public/CNAME` sets the custom domain; don't delete it.
- **GitHub account:** personal account `bbidi`, never the work account.
- **Check before pushing:** `npm run build` must pass.
