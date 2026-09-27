This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Syncing specs with Notion

`specs/` is kept in two-way sync with Notion pages under **Projects → Essence Specs**. Each folder maps to a page, and each `.md` file maps to a page whose body is the file's markdown.

### One-time setup

1. Create an internal integration at [notion.so/profile/integrations](https://www.notion.so/profile/integrations) with read, insert and update content capabilities, then copy its token.
2. In Notion, open the Essence Specs page, go to ••• → Connections and add the integration.
3. Add the token to `.env.local`:

   ```bash
   NOTION_TOKEN=...
   # Optional: sync under a different parent page
   # NOTION_SPECS_PARENT_ID=...
   ```

### Usage

```bash
npm run sync-notion                     # sync both ways
npm run sync-notion -- --dry-run        # preview the changes without writing anything
npm run sync-notion -- --prefer=local   # resolve conflicts using the repo version
npm run sync-notion -- --prefer=notion  # resolve conflicts using the Notion version
```

Each run compares both sides against the last sync, which is recorded in `.notion-sync.json` along with a snapshot of each page's Notion markdown. Commit that file so the sync works from any machine.

- **Changed only in the repo:** pushed to Notion.
- **Changed only in Notion:** only the lines that changed in Notion are applied to the file in `specs/`, and the rest of the file stays exactly as written. Review the result with `git diff` before committing.
- **Changed on both sides:** reported as a conflict and skipped. Re-run with `--prefer` to settle it. When there are conflicts, the command exits with a non-zero code.
- **New on either side:** created on the other side. A new Notion page that has child pages becomes a folder.
- **Deleted on either side:** reported but never propagated. The script never deletes anything.

Notes:

- Notion stores markdown in its own style. It drops the blank lines between blocks, drops the page's leading `#` heading, and changes emphasis and escaping. The repo files keep their own style, but lines edited or added in Notion come back in Notion's style (for example `*em*` rather than `_em_`).
- `--prefer=notion` replaces the whole file with Notion's version, so the entire file comes back in Notion's style.
- Relative links between spec files stay as plain markdown links in Notion.
- The `[Feature Name] Spec` template page is ignored. To ignore other pages, add them to `IGNORED_TITLES` in `scripts/sync-notion.mjs`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
