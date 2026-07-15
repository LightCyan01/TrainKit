# TrainKit backend

This is the authenticated local FastAPI processing backend embedded by the TrainKit Electron application. It is not designed to be exposed as a network service.

From the repository root, install with `uv sync --project backend --locked` and verify with `npm run lint:backend` plus `npm run test:backend`. Architecture, security, and model contracts are documented in the repository's `docs` directory.
