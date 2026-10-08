<p align="center">
  <img src="resources/icon.ico" width="112" alt="TrainKit icon">
</p>

<h1 align="center">TrainKit</h1>

<p align="center">Prepare image datasets for AI training.</p>

<p align="center">
  <a href="https://github.com/LightCyan01/TrainKit/actions/workflows/ci.yml"><img src="https://github.com/LightCyan01/TrainKit/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <a href="https://github.com/LightCyan01/TrainKit/releases/latest"><img src="https://img.shields.io/github/v/release/LightCyan01/TrainKit" alt="Latest release"></a>
  <img src="https://img.shields.io/badge/platform-Windows-lightgrey" alt="Windows">
  <img src="https://img.shields.io/badge/Electron-44-47848F?logo=electron" alt="Electron 44">
  <img src="https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white" alt="Python 3.12">
  <img src="https://img.shields.io/badge/PyTorch-2.11-EE4C2C?logo=pytorch&logoColor=white" alt="PyTorch 2.11">
</p>

<p align="center">
  <a href="https://github.com/LightCyan01/TrainKit/releases">Downloads</a> ·
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="docs/model-support.md">Model support</a> ·
  <a href="docs/architecture.md">Architecture</a>
</p>

TrainKit prepares individual images or image folders with local captioning, upscaling, tagging, and renaming. Claude and OpenAI captioning use your own API keys. You can cancel batches and save progress in a manifest to resume later.

## What's new in 1.3.1

- Image previews fit the image without stretching to the form's height.
- Saved captions and tags appear below the preview and refresh as images finish processing.
- Setup explains that large packages can take several minutes. Existing dependencies are reused when they have not changed.
- Tagging releases images after inference and avoids loading a model when every output is skipped.

See the [complete 1.3.1 changelog](CHANGELOG.md#131---2026-10-08) for details.

## Features

- **Captioning:** local standard Transformers multimodal-chat, BLIP, and InstructBLIP models, or Claude/OpenAI vision APIs. Local models support auto-detection, preload/unload, prompt control, and token-level cancellation.
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

Requirements: Git, Node.js 22.17 or newer, uv, Python 3.12 (uv can install it), and the Visual C++ x64 Redistributable on Windows.

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

To resume, select the manifest and use the same operation and input/output paths. TrainKit preserves completed and skipped items, retries failed items, and updates that manifest. It rejects paths outside the selected folders.

## Cloud captioning

Open **API**, paste an Anthropic or OpenAI API key, choose a vision model available to your account, and save. Keys last for the session unless you select **Remember on this computer** to store them with OS encryption. Remembered keys are tied to your operating-system account. **Test key** checks authentication; it does not verify access to every model. API billing is separate from ChatGPT and Claude subscriptions.

In **Caption**, choose the configured provider, select your images and output folder, enter an instruction, and click **Start captioning**. Images are converted to JPEG, metadata is removed, and the longest edge is capped at 1568 pixels. Cloud captioning sends your instruction and resized images to the selected provider and uses API credits; the provider's data policies apply. OpenAI requests use `store: false`, which does not replace the provider's retention policy. Captions are saved as local UTF-8 text files.

Cloud requests run one at a time and are not automatically retried. The batch stops if the provider rejects your key, refuses a caption, or returns an incomplete response. Connection failures, exhausted quota, and rate limits also stop the batch. Save a manifest if you want to resume pending work. Cancellation stops pending requests and prevents saving their captions, but cannot undo provider work or charges already incurred. Completed resumes and skipped outputs make no provider requests. Local mode remains the default.

See [model support](docs/model-support.md) for model layouts and NCNN assumptions, [architecture](docs/architecture.md) for the desktop/backend trust boundaries, and the [changelog](CHANGELOG.md) for complete release history.

## Project status

Version 1.3.1 improves previews, setup, and tagging. New feature proposals and model-compatibility reports are welcome through GitHub issues.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) before sending a change. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

TrainKit is available under the [MIT License](LICENSE).
