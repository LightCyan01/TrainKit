# Contributing to TrainKit

Thanks for improving TrainKit. Keep changes focused, add regression coverage for behavior changes, and avoid weakening the local security boundary for convenience.

## Development setup

Install Node.js 22.12+, uv, Python 3.12, and the Microsoft Visual C++ x64 Redistributable on Windows. Then run:

```powershell
npm ci
uv sync --project backend --locked
npm start
```

The renderer and Electron main process are TypeScript. The authenticated processing backend is Python/FastAPI. See [docs/architecture.md](docs/architecture.md) before changing IPC, process startup, filesystem access, or job state.

## Required checks

Run these from the repository root before opening a pull request:

```powershell
npm run verify
npm audit
npm run package
npm run verify:package
```

`npm run verify` covers ESLint, TypeScript, Vitest, Ruff lint/format checks, and pytest. Add a test that fails before the fix whenever practical. Do not commit `node_modules`, Python environments, models, output datasets, logs, or package artifacts.

## Project invariants

- The renderer never receives the backend token or its port.
- Renderer filesystem access must flow through narrow IPC and a user-selected path grant.
- Backend HTTP and WebSocket access remains authenticated and loopback-only.
- Resume manifests are untrusted and must remain scoped to the requested input/output roots.
- Batch output uses collision preflight and atomic replacement.
- Spandrel model loading remains `.safetensors`-only. Do not re-enable pickle-based `.pt`, `.pth`, or `.ckpt` loading.
- Transformers loaders must not enable `trust_remote_code` without a separate, explicit security design.
- Dependency and workflow changes must keep lockfiles and immutable action pins current.

## Pull requests

Describe the user-visible result, tests performed, model/runtime assumptions, and any migration or security impact. Keep generated lockfile changes in the same commit as their manifest changes.

User-visible changes must update `CHANGELOG.md` under the target version. The release workflow publishes that version's changelog section verbatim as the GitHub release notes, so keep entries complete, user-focused, and accurate.

## Maintainer release setup

Tagged releases are fail-closed and must match `package.json` exactly (for example, version `1.1.0` requires tag `v1.1.0`). Configure these GitHub Actions secrets:

- `WINDOWS_CERTIFICATE_BASE64`: Base64-encoded PFX code-signing certificate.
- `WINDOWS_CERTIFICATE_PASSWORD`: PFX password.

PowerShell can encode a PFX without printing binary data:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\TrainKit.pfx"))
```

The release workflow verifies the application and installer Authenticode signatures, produces SHA-256 checksums, and creates a GitHub build-provenance attestation before publishing.
