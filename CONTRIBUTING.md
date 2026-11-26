# Contributing

## Setup

1. Install Node 22.13 or newer.
2. Run `npm install`.
3. Run `cp .env.example .env` and fill in your values.
4. Run `npm run dev`.

## Checks

Run `npm run check` before you open a pull request. It runs the typecheck, the Biome lint, the prose check and `npm audit`. CI runs the same steps and also runs `npm run build`.

The prose check (`npm run lint:prose`) fails on dashes, stock marketing words, "not just X but Y" phrasing, placeholder names and bold-label bullets. It is a local pattern check and not a statistical AI detector, so it catches the habits that make text read as machine-written. Add `lint-prose: ignore` to a line that has to stay as it is.

## Pull requests

- Make one change per pull request.
- Explain why the change is needed, not only what it does.
- Keep the existing style: strict TypeScript, no comments unless they are needed, and plain wording in docs and UI text.

## Reporting security issues

Open a private security advisory on GitHub. Do not file a public issue that contains credentials or phone numbers.
