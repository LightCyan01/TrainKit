<p align="center">
  <img src="resources/icon.ico" width="112" alt="TrainKit icon">
</p>

<h1 align="center">TrainKit</h1>

<p align="center">A local, resumable dataset-preparation desktop app for AI image training.</p>

<p align="center">
  <a href="https://github.com/LightCyan01/TrainKit/actions/workflows/ci.yml"><img src="https://github.com/LightCyan01/TrainKit/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <a href="https://github.com/LightCyan01/TrainKit/releases/latest"><img src="https://img.shields.io/github/v/release/LightCyan01/TrainKit" alt="Latest release"></a>
  <img src="https://img.shields.io/badge/platform-Windows-lightgrey" alt="Windows">
  <img src="https://img.shields.io/badge/Electron-43-47848F?logo=electron" alt="Electron 43">
  <img src="https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white" alt="Python 3.12">
  <img src="https://img.shields.io/badge/PyTorch-2.11-EE4C2C?logo=pytorch&logoColor=white" alt="PyTorch 2.11">
</p>

<p align="center">
  <a href="https://github.com/LightCyan01/TrainKit/releases">Downloads</a> ·
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="docs/model-support.md">Model support</a> ·
  <a href="docs/architecture.md">Architecture</a>
</p>

TrainKit prepares image datasets without uploading them to a hosted service. Every batch is deterministic, cancellable, collision-aware, and recorded in a resumable manifest.

## What's new in 1.2.0

- NCNN `.param` + `.bin` upscaling with CPU/Vulkan and tiled inference.
- Local image tagging with JSON, training-text, and paired outputs.
- Standard multimodal, BLIP, and InstructBLIP caption adapters with auto-detection.
- Dry runs, collision policies, atomic manifests, cancellation, and failed-item resume across every operation.
- A self-contained packaged Python runtime and logs stored beside the application.
- A hardened Electron/backend boundary plus signed-release, checksum, and provenance automation.

See the [complete 1.2.0 changelog](CHANGELOG.md#120---2026-07-14) for fixes, security changes, migration notes, and verification results.

## Features

- **Captioning:** local standard Transformers multimodal-chat, BLIP, and InstructBLIP models; auto-detection, explicit preload/unload, prompt control, and token-level cancellation.
- **Upscaling:** safe `.safetensors` models through Spandrel, or NCNN `.param` + `.bin` models through the Python bindings with CPU/Vulkan and tiled inference.
- **Tagging:** local Hugging Face image-classification models with threshold/top-K controls and scored JSON, training-text, or paired sidecars.
- **Renaming:** natural input ordering, configurable zero padding, optional visual-duplicate filtering, and atomic copies.
- **Safe batch behavior:** dry-run manifests, `fail`/`skip`/`rename`/`overwrite` collision policies, per-file status, atomic output replacement, and failed-item resume.
- **Hardened desktop boundary:** sandboxed renderers, narrow IPC, user-granted file capabilities, an authenticated ephemeral loopback backend, and restricted navigation.

Input images can be PNG, JPEG, BMP, or WebP. Upscaled output can be PNG, JPEG, BMP, or WebP.

## Install a release

TrainKit currently targets 64-bit Windows 10/11. Before the first launch, install:

1. [uv](https://docs.astral.sh/uv/getting-started/installation/)
2. [Microsoft Visual C++ Redistributable x64](https://aka.ms/vs/17/release/vc_redist.x64.exe)

Download the signed installer or portable archive from [GitHub Releases](https://github.com/LightCyan01/TrainKit/releases). On first launch, TrainKit uses the committed `uv.lock` to install Python 3.12 and the backend dependencies directly under `resources/backend` in the TrainKit folder. Setup downloads and temporary files stay there and are removed after a successful install. This requires a network connection and several gigabytes of free space.

Persistent session logs are written to `logs` beside `TrainKit.exe`. The **Logs** panel shows the exact current path and can open either the folder or current log. Older builds used `%APPDATA%\TrainKit\backend-runtime`; a successful self-contained setup removes that obsolete generated runtime.

An NVIDIA GPU is recommended for Transformers and Spandrel workloads. NCNN can run on CPU or use a compatible Vulkan device. CPU-only captioning and tagging are supported but can be slow.

## Build from source

Requirements: Git, Node.js 22.12 or newer, uv, Python 3.12 (uv can install it), and the Visual C++ x64 Redistributable on Windows.

```powershell
git clone https://github.com/LightCyan01/TrainKit.git
cd TrainKit
npm ci
uv sync --project backend --locked
npm start
```

Useful verification commands:

```powershell
npm run verify
npm audit
npm run package
npm run verify:package
```

`npm run make` creates the Squirrel installer and portable ZIP. Local packages are unsigned unless the signing environment variables described in [CONTRIBUTING.md](CONTRIBUTING.md) are set.

## Using batch manifests

Each new job writes a manifest to:

```text
<output>/.trainkit/manifests/<job-id>.json
```

Use **Dry run** to preflight source ordering and destinations without processing. A resume uses the same operation and the same input/output directories, preserves completed and skipped items, and retries failed items. Manifests are treated as untrusted input: paths outside the selected roots are rejected.

See [model support](docs/model-support.md) for model layouts and NCNN assumptions, [architecture](docs/architecture.md) for the desktop/backend trust boundaries, and the [changelog](CHANGELOG.md) for complete release history.

## Project status

Version 1.2.0 completes the original NCNN, additional caption-adapter, and image-tagging roadmap. New feature proposals and model-compatibility reports are welcome through GitHub issues.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) before sending a change. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

TrainKit is available under the [MIT License](LICENSE).
