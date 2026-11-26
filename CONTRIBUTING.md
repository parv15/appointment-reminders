# Contributing

## Setup

1. Install Node 22.13 or newer.
2. Run `npm install`.
3. Run `cp .env.example .env` and fill in your values.
4. Run `npm run dev`.

## Checks

`npm run typecheck` and `npm run build` must pass before you open a pull request. CI runs the same two commands.

## Pull requests

- Make one change per pull request.
- Explain why the change is needed, not only what it does.
- Keep the existing style: strict TypeScript, no comments unless they are needed, and plain wording in docs and UI text.

## Reporting security issues

Open a private security advisory on GitHub. Do not file a public issue that contains credentials or phone numbers.
