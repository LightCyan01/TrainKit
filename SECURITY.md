# Security policy

## Supported versions

Security fixes are provided for the latest published TrainKit release. Users should upgrade rather than remain on older desktop or Python dependency bundles.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use [GitHub's private vulnerability reporting form](https://github.com/LightCyan01/TrainKit/security/advisories/new) and include the affected version, impact, reproduction steps, and any suggested mitigation. Avoid including private datasets, model weights, credentials, or signing material.

## Security model

TrainKit processes datasets locally. The Electron renderer is sandboxed and communicates through a narrow preload API. Filesystem operations require paths granted through a native picker. The Python API binds to an ephemeral loopback port, requires a random per-launch token for HTTP and WebSocket traffic, validates the desktop WebSocket origin, and is proxied by the Electron main process so renderer code never receives the token.

Batch manifests, images, and model files are untrusted input. TrainKit limits image file and decoded-pixel sizes, verifies images before decoding, scopes resumed manifest paths to selected roots, and atomically replaces completed outputs. Spandrel accepts only `.safetensors`; pickle checkpoint formats are deliberately disabled. Transformers remote model code is not enabled.

NCNN, image codecs, PyTorch, Transformers, and GPU/Vulkan drivers are native or complex parsers. Use models and datasets from sources you trust, keep TrainKit and GPU drivers updated, and prefer a low-privilege Windows account for unfamiliar data. TrainKit logs may include local filenames and error messages in the `logs` folder beside `TrainKit.exe`.

Signed releases include SHA-256 checksums and GitHub build-provenance attestations. Verify the Authenticode publisher and checksum when distributing artifacts through mirrors.
