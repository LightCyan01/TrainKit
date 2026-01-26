<p align="center">
  <img src="https://i.ibb.co/SXZsB2fk/icon.png" alt="TrainKit Logo">
</p>

<h1 align="center">TrainKit</h1>

<p align="center">
  A dataset preparation toolkit for AI image training
</p>

<p align="center">
  <a href="https://github.com/LightCyan01/TrainKit/blob/master/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
  </a>
  <a href="https://github.com/LightCyan01/TrainKit/releases">
    <img src="https://img.shields.io/github/v/release/LightCyan01/TrainKit?include_prereleases" alt="Release">
  </a>
  <img src="https://img.shields.io/badge/platform-Windows-lightgrey" alt="Platform">
  <img src="https://img.shields.io/badge/Electron-39-47848F?logo=electron" alt="Electron">
  <img src="https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/PyTorch-2.7-EE4C2C?logo=pytorch&logoColor=white" alt="PyTorch">
</p>

---

## About

TrainKit streamlines the tedious process of preparing image datasets for AI model training.
It provides GPU-accelerated tools for captioning, upscaling, and organizing your images wrapped in a modern desktop interface.

## Features

- **🖼️ Image Captioning** — Generate captions using local LLaVA-based models (e.g., JoyCaption) with customizable prompts
- **⬆️ Image Upscaling** — Upscale images using [Spandrel](https://github.com/chaiNNer-org/spandrel) supported architectures
- **📁 Batch Renaming** — Rename and organize image files with flexible naming patterns.

## Requirements

- **Windows 10/11**
- **NVIDIA GPU** (8GB+ VRAM recommended for captioning)
- **Python 3.12**
- **Node.js 18+**

## Installation

### From Release

Download the latest release from the [Releases](https://github.com/LightCyan01/TrainKit/releases) page.

### From Source

```bash
# Clone the repository
git clone https://github.com/LightCyan01/TrainKit.git
cd TrainKit

# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
uv sync

# Start the app
npm start
```

## Usage

1. **Launch TrainKit** — The backend server starts automatically
2. **Select a panel** — Choose Caption, Upscale, or Rename from the sidebar
3. **Configure paths** — Set your input folder, output folder, and model path
4. **Start processing** — Click the action button and monitor progress in the logs panel

### Captioning

TrainKit supports LLaVA-based captioning models.

### Upscaling

TrainKit uses [Spandrel](https://github.com/chaiNNer-org/spandrel) for upscaling. See the [full list of supported architectures](https://github.com/chaiNNer-org/spandrel?tab=readme-ov-file#model-architecture-support).

## Development

```bash
# Start in development mode
npm start

# Build for production
npm run make
```

## Roadmap

- [ ] NCNN support
- [ ] Additional captioning model architectures
- [ ] Image tagging

## Contributing

Contributions are welcome! Please open an issue first to discuss what you would like to change.

## License

TrainKit is licensed under the MIT license. See the [LICENSE](LICENSE) file for details.
