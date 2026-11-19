<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` - verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## UI copy rule: plain hyphen only, never an em dash
In all user-facing UI text in this repo, use a plain hyphen "-" (U+002D), never an em dash (U+2014). The same applies to docs shown to users. En dashes are only for genuine ranges (e.g. grade ranges 60-69, Mon-Fri); use a hyphen there too where it reads naturally. This was swept repo-wide on 2026-11-20 (389 em dashes replaced); keep it at zero in `src/`.
