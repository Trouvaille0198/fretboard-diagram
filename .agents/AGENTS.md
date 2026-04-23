# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the Vite + React frontend. Keep UI in `src/components/`, reusable state in `src/hooks/`, event logic in `src/handlers/`, and shared helpers in `src/utils/` and `src/services/`. `src/Fretboard.jsx` is the main workspace. Static assets live in `public/`.

`backend/` contains the FastAPI service. API entrypoints are in `backend/app/main.py`, route modules are in `backend/app/routers/`, and config, auth, database, and models stay under `backend/app/`. Deployment files live at the repo root: `Dockerfile`, `Dockerfile.dev`, `docker-compose.yml`, `nginx.conf`, and `start-dev.sh`.

## Build, Test, and Development Commands
Use `pnpm` for frontend work.

- `pnpm dev`: start the Vite dev server on `localhost:5173`.
- `pnpm build`: create the production frontend bundle in `dist/`.
- `pnpm preview`: serve the built frontend locally.
- `docker-compose up -d`: start the containerized stack, including backend and reverse proxy.
- `docker-compose --profile dev up`: run the Docker-based development setup with hot reload.
- `bash test-integration.sh`: run the repository’s integration smoke check for backend/frontend wiring.

## Coding Style & Naming Conventions
Match the existing style in each area. Frontend files use 2-space indentation, React function components, and `camelCase` for variables and functions. Component and hook filenames use `PascalCase` and `useXxx` patterns, for example `FretboardMenu.jsx` and `useAuth.js`.

Backend Python currently uses 4-space indentation and small module files. Keep route handlers in `routers/` and prefer clear function names over large classes. No formatter or linter is configured in this repo, so keep changes consistent with neighboring code.

## Testing Guidelines
There is no formal unit-test suite yet. Validate frontend changes with `pnpm build` and validate integrated changes with `bash test-integration.sh`. When adding tests, place frontend tests beside the feature or under a dedicated `tests/` directory, and use filenames ending in `.test.*`.

## Commit & Pull Request Guidelines
Recent history uses short conventional prefixes such as `perf:`, `chore:`, and `docs:`. Continue with `type: summary`, keep the subject imperative, and keep it focused on one change.

PRs should include a concise description, affected areas (`src/`, `backend/`, Docker), manual verification steps, and screenshots or GIFs for visible UI changes. Link the related issue when one exists.

## Configuration Tips
Check `backend/app/config.py` before changing API or auth behavior. Keep secrets and local overrides out of Git, and document any new environment variables in `README.md`.
