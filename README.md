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

TrainKit prepares individual images or complete image folders without uploading them to a hosted service. Every run is deterministic, cancellable, and collision-aware; resumable manifest files are optional.

## What's new in 1.2.1

- Automatic NCNN input/output blob discovery instead of hard-coded `in0` and `out0` names.
- Individual-image selection for captioning, upscaling, tagging, and renaming.
- Manifests disabled by default, with explicit save, dry-run, and resume options.
- First processing errors remain visible even when no manifest is written.
- A single standard Windows ZIP distribution with no installer.

See the [complete 1.2.1 changelog](CHANGELOG.md#121---2026-07-15) for details.

## Features

- **Captioning:** local standard Transformers multimodal-chat, BLIP, and InstructBLIP models; auto-detection, explicit preload/unload, prompt control, and token-level cancellation.
- **Upscaling:** safe `.safetensors` models through Spandrel, or NCNN `.param` + `.bin` models through the Python bindings with automatic blob discovery, CPU/Vulkan, and tiled inference.
- **Tagging:** local Hugging Face image-classification models with threshold/top-K controls and scored JSON, training-text, or paired sidecars.
- **Renaming:** natural input ordering, configurable zero padding, optional visual-duplicate filtering, and atomic copies.
- **Safe processing:** individual-image or folder input, `fail`/`skip`/`rename`/`overwrite` collision policies, per-file status, atomic output replacement, and optional resumable manifests.
- **Hardened desktop boundary:** sandboxed renderers, narrow IPC, user-granted file capabilities, an authenticated ephemeral loopback backend, and restricted navigation.

Input can be one PNG, JPEG, BMP, or WebP image or a folder containing those formats. Upscaled output can be PNG, JPEG, BMP, or WebP.

## Install a release

TrainKit currently targets 64-bit Windows 10/11. Before the first launch, install:

1. [uv](https://docs.astral.sh/uv/getting-started/installation/)
2. [Microsoft Visual C++ Redistributable x64](https://aka.ms/vs/17/release/vc_redist.x64.exe)

Download the Windows ZIP from [GitHub Releases](https://github.com/LightCyan01/TrainKit/releases), extract the entire archive to a writable folder on the drive where you want TrainKit stored, and run `TrainKit.exe`. The current release is unsigned, so Windows SmartScreen or antivirus software may warn; download only from the GitHub release and verify `SHA256SUMS.txt`. On first launch, TrainKit uses the committed `uv.lock` to install Python 3.12 and the backend dependencies directly under `resources/backend` in the TrainKit folder. Setup downloads and temporary files stay there and are removed after a successful install. This requires a network connection and several gigabytes of free space.

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

`npm run make` creates the standard Windows ZIP. Local packages are unsigned unless the signing environment variables described in [CONTRIBUTING.md](CONTRIBUTING.md) are set.

## Using optional manifests

Normal runs do not write a manifest. Enable **Save resumable manifest** when you want progress saved to:

```text
<output>/.trainkit/manifests/<job-id>.json
```

Dry runs always write a manifest because the plan is their output. A resume uses the same operation and input/output paths, preserves completed and skipped items, retries failed items, and updates the selected manifest. Manifests are treated as untrusted input: paths outside the selected roots are rejected.

See [model support](docs/model-support.md) for model layouts and NCNN assumptions, [architecture](docs/architecture.md) for the desktop/backend trust boundaries, and the [changelog](CHANGELOG.md) for complete release history.

## Project status

Version 1.2.1 completes the original processing roadmap and improves NCNN compatibility, input selection, and output control. New feature proposals and model-compatibility reports are welcome through GitHub issues.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) before sending a change. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

TrainKit is available under the [MIT License](LICENSE).
