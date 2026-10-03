# Yuji Development Guide

## Commands

```cmd
:: Apply formatting, then perform static analysis
bun run check
bun --filter @yuji/client check

:: Perform static analysis, then execute the test suite
bun run test
```

## Guidelines

- Bun serves as both a runtime environment and a package manager.
- Whenever your work touches anything related to styling, check the conventions established in `./packages/client/src/app/styles.css`.
