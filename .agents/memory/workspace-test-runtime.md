---
name: Workspace test runtime
description: Running backend unit tests against workspace TypeScript packages
---
Workspace packages export TypeScript sources that contain extensionless imports. Native Node ESM execution with workspace packages left external may fail before a test starts, even though typechecking passes.

**Why:** Node's ESM resolver does not perform the same extension resolution as the app bundler, and pnpm packages do not inherit other packages' dependencies.

**How to apply:** Bundle test entrypoints with their workspace and runtime dependencies (CJS is suitable for these backend tests), leaving optional native modules external. Do not add incidental transitive dependencies just to make a test bundle start.

Bundled HTTP tests that import the app should avoid development logging transports.

**Why:** Pino's development transport locates its worker relative to the bundled test and can crash asynchronously after all assertions pass. This is a test-runtime packaging failure, not an endpoint failure.

**How to apply:** Use the production JSON logger for these test runs, or externalize and package the logging transport correctly if a test actually needs it.
