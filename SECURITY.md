# Security policy

## Reporting a vulnerability

Please report security problems privately through the repository's **Security** tab, using "Report a vulnerability". Do not open a public issue for a security problem. You will get an answer within a few days.

## What is checked automatically

- Dependabot opens pull requests for outdated and vulnerable npm packages, GitHub Actions and the Docker base image every week.
- `npm audit` runs in CI and fails the build on a high or critical advisory.
- A dependency review runs on every pull request and fails it when a new package carries a high severity advisory.
- CodeQL scans the TypeScript and JavaScript code on every push and every week.
- GitHub secret scanning and push protection stop API keys and signing secrets from being committed.
- Biome lints the code for common bugs and unsafe patterns, and a prose check keeps dashes, stock phrases and placeholder names out of the text.

## Secrets

The app reads every secret from environment variables. Never commit `.env`. If a key is exposed, rotate it in the Sent dashboard first and then update the environment.
