# Changelog

All notable TrainKit changes are documented here. TrainKit follows semantic versioning.

## [1.2.0] - 2026-07-14

TrainKit 1.2.0 completes the original processing roadmap, adds resumable and collision-safe batch execution, hardens the Electron/backend boundary, and restores a self-contained portable runtime layout.

### Highlights

- Added native NCNN `.param` + `.bin` upscaling through the official Python bindings, with CPU/Vulkan selection and tiled inference.
- Added local image tagging with threshold, top-K, JSON, training-text, and paired-output modes.
- Added automatic caption-model adapter selection for standard multimodal image-to-text, BLIP, and InstructBLIP models.
- Added deterministic manifests, dry runs, collision policies, cancellation, and failed-item resume to every batch operation.
- Moved TrainKit-managed Python dependencies and persistent logs back beside the packaged application for a self-contained portable layout.

### Added

#### Processing and model support

- NCNN model inspection and inference for paired `.param` and `.bin` files.
- Configurable NCNN input/output blob names, scale, tile size, tile overlap, and Vulkan usage.
- A safe Spandrel loader restricted to `.safetensors`; legacy pickle checkpoints are rejected.
- Image tagging through local Hugging Face image-classification models.
- Multi-label sigmoid and single-label softmax handling derived from model configuration.
- Tag output as scored JSON, training-compatible text, or both as an atomic pair.
- Caption adapters for `AutoModelForImageTextToText`, BLIP, and InstructBLIP.
- Automatic caption architecture detection from local model configuration.
- Correct multimodal chat content containing both the image token and user prompt.
- Token-level caption generation cancellation.
- Runtime capability reporting for operations, formats, adapters, collision policies, and upscaling backends.

#### Batch safety and reliability

- Versioned JSON manifests under `<output>/.trainkit/manifests`.
- Dry-run planning without model loading or output mutation.
- `fail`, `skip`, `rename`, and `overwrite` collision policies.
- Natural source ordering and deterministic output planning.
- Atomic image, text, JSON, and file-copy writes.
- Resume validation for operation type, input/output roots, output formats, backend settings, model scale, and destination suffixes.
- Re-preflight of pending resume items against new filesystem collisions.
- Protection against destination path escapes, manifest path tampering, duplicate planned overwrites, and overwriting any source file.
- Configurable image byte and decoded-pixel limits.

#### Jobs, progress, and API contracts

- A single-active-job manager with stable job IDs and lifecycle states.
- Cooperative cancellation for processing jobs and model operations.
- Structured progress, results, errors, and timestamps.
- Authenticated WebSocket job/log events with reconnect support.
- Typed request models, response envelopes, and validation errors.
- Model preload, unload, inspection, and job cancellation reservations to prevent resource races.
- Shared TypeScript runtime guards for backend events and responses.

#### Desktop experience

- A complete Tagging panel and navigation entry.
- Shared batch options and job-progress components.
- Preserved per-panel state when switching tabs.
- Persistent startup log history in the Logs panel.
- Visible log-file path plus separate **Logs Folder** and **Current Log** actions.
- Dynamic desktop version display.
- Accessible local image previews with stale-request protection.

#### Documentation and project infrastructure

- Architecture, model-support, backend, contributor, security, and license documentation.
- Frontend Vitest and backend pytest suites.
- Package-layout verification for required runtime assets and forbidden development artifacts.
- Windows CI covering lint, type checking, tests, audit, packaging, and package verification.
- A signed release workflow with checksum generation and build-provenance attestation.
- Pinned GitHub Actions revisions and a clean workflow security audit.

### Changed

- Bumped the desktop version to 1.2.0.
- Updated Electron, Forge, React, Vite, TypeScript, Tailwind, FastAPI, Transformers, PyTorch, Pillow, Spandrel, NCNN, and supporting dependencies.
- Replaced the FastAPI development/auto-discovery launcher with direct Uvicorn startup.
- Deferred PyTorch, TorchVision, Transformers, Spandrel, NCNN, and duplicate-detection imports until the related operation is used.
- Increased the bounded backend fallback startup timeout from 60 to 180 seconds.
- Reduced production backend dependencies by removing unused FastAPI CLI and cloud extras.
- Consolidated packaged paths through one desktop runtime-path resolver.
- Installed managed Python under `resources/backend/.python` and packages under `resources/backend/.venv`.
- Stored model caches under `resources/backend/.model-cache`.
- Kept uv setup cache and temporary files beside the backend and removed them after successful setup.
- Stored new session logs under `logs` beside `TrainKit.exe`.
- Removed the obsolete `%APPDATA%\TrainKit\backend-runtime` after a successful self-contained migration.
- Restricted the renderer to a narrow preload bridge with sandboxing, context isolation, and Node integration disabled.
- Moved production logs and runtime diagnostics to paths visible from the application.

### Fixed

- Fixed packaged backends remaining offline when a cold first import exceeded the former 60-second readiness window.
- Fixed the desktop permanently reporting offline even if the backend bound its port shortly after timeout.
- Fixed NCNN native access violations by cloning CHW input data into NCNN-owned memory before extraction.
- Fixed dry-run upscaling unnecessarily loading the selected model.
- Fixed resume jobs accepting incompatible output modes, formats, backends, or model scales.
- Fixed paired tag outputs being planned or resumed independently.
- Fixed cancellation exceptions being converted into ordinary processing failures.
- Fixed caption prompts omitting the image component for multimodal chat models.
- Fixed output extension mismatches and unsafe in-place overwrites.
- Fixed image-preview races when rapidly changing folders or selections.
- Fixed global keyboard preview handlers affecting hidden panels.
- Fixed packaged splash loading and early backend/log status events being lost by the renderer.
- Fixed setup and backend managers resolving different Python environment locations.
- Fixed uv retaining a second multi-gigabyte package cache after first-run installation.
- Fixed remote credits imagery introducing an unnecessary network dependency.

### Security

- Added a random 256-bit per-process backend token and constant-time token comparison.
- Bound the backend to an ephemeral loopback port and removed broad browser CORS access.
- Validated WebSocket tokens and desktop origins.
- Added IPC sender validation and route/method allowlists.
- Required user-granted file and directory capabilities for backend path requests and previews.
- Denied Electron permission requests, device permissions, webviews, and unexpected navigation.
- Restricted external links to an HTTPS host allowlist.
- Added Content Security Policy headers to the main and splash renderers.
- Restricted model file selection to supported safe extensions.
- Added preview byte limits and backend image decode limits.
- Made release signing fail closed when certificate secrets are absent.
- Added SHA-256 release checksums and GitHub build-provenance attestations.
- Resolved all currently reported npm audit vulnerabilities.

### Verification

- 6 frontend tests across API, contract, and packaged-path behavior.
- 19 backend tests covering authentication, validation, jobs, cancellation, manifests, path safety, caption adapters, NCNN, and end-to-end upscaling.
- Real minimal NCNN graph inference test.
- Packaged executable smoke test covering setup, authenticated health, and WebSocket readiness.
- Packaged backend health became ready in approximately 0.85 seconds; the full desktop smoke test reported ready in 14.5 seconds including setup migration.
- ESLint, TypeScript, Ruff lint/format, pytest, Vitest, npm audit, workflow parsing, workflow security audit, package verification, Squirrel installer creation, and portable ZIP creation all pass.

### Migration notes

- TrainKit must be installed or extracted to a folder writable by the current user because its managed runtime is intentionally self-contained.
- The first successful 1.2.0 setup removes only the obsolete generated `%APPDATA%\TrainKit\backend-runtime`. Historical logs and the small Electron profile remain in AppData.
- Existing batch manifests remain data files; resume validation rejects incompatible or out-of-scope manifests instead of mutating them.

## [1.1.0] - 2026-02-26

- Added persistent log-file management and access from the desktop interface.
- Added the Windows installer and portable ZIP release formats.
- Added first-run Python 3.12 environment setup through uv.

## [1.0.0] - 2026-01-26

- Initial TrainKit release with local image captioning, Spandrel upscaling, batch renaming, and an Electron desktop interface.

[1.2.0]: https://github.com/LightCyan01/TrainKit/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/LightCyan01/TrainKit/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/LightCyan01/TrainKit/releases/tag/v1.0.0
