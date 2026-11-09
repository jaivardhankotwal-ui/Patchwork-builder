---
name: Workspace test runtime
description: Running backend unit tests against workspace TypeScript packages
---
Workspace packages export TypeScript sources that contain extensionless imports. Native Node ESM execution with workspace packages left external may fail before a test starts, even though typechecking passes.

**Why:** Node's ESM resolver does not perform the same extension resolution as the app bundler, and pnpm packages do not inherit other packages' dependencies.

**How to apply:** Bundle test entrypoints with their workspace and runtime dependencies (CJS is suitable for these backend tests), leaving optional native modules external. Do not add incidental transitive dependencies just to make a test bundle start.
