# Yuji Development Guide

## Guidelines

- Bun is the server runtime; pnpm is the package manager and workspace root.
- You SHALL respect `packages/client/src/app/styles.css` if you dealing with styles related.

## Commands

```cmd
:: Format, then static check all packages
pnpm run check

:: Scope a command to one package with a filter
pnpm --filter @yuji/client run check
```
