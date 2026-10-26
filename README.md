# Planline with a database

Project planner (Gantt, critical path, subtasks, progress, baselines, comments) whose projects are stored on the server in **Netlify Blobs**, behind a Netlify Function at `/api/projects`. No external database account is needed.

```
public/index.html                  the app
netlify/functions/projects.mjs     REST API (create, list, read, update, delete)
netlify.toml, package.json         config and the @netlify/blobs dependency
```

## Deploy

Drag and drop does **not** work for this version, because the function has a dependency that must be installed. Use one of these:

**Git (recommended):** push this folder to GitHub, GitLab or Bitbucket. In Netlify choose *Add new site, Import an existing project*, leave the build command empty and keep the publish directory `public`. Netlify installs the dependency and deploys the function.

**CLI:**
```
npm install
npm i -g netlify-cli
netlify login
netlify deploy --prod
```

## Set the access key (required)

The API refuses every request until you set a secret.

1. In Netlify open *Site configuration, Environment variables*.
2. Add `PLANLINE_KEY` with a long random value (for example the output of `openssl rand -hex 24`).
3. Trigger a new deploy.

Open the site and enter that key when asked. The browser remembers it. Anyone with the key can read and edit every project, so share it only with people you trust. If you need individual accounts, add Netlify Identity or another auth provider in front of the function.

## Run locally

```
npm install
PLANLINE_KEY=test netlify dev
```

## How saving works

- Edits save automatically about a second after you stop. The toolbar shows the last save time, and failed saves retry every few seconds.
- Each project has a revision number. If someone saves it from another device first, your save is refused and a banner lets you reload the latest version or overwrite it.
- **Export**, **Backup all** and **Import** work with `.json` files, so you can also move projects between sites.

## API

All requests need the header `x-planline-key`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/projects` | list projects |
| POST | `/api/projects` | create `{name, tasks}` |
| GET | `/api/projects/:id` | read one |
| PUT | `/api/projects/:id` | update `{name, tasks, rev}` |
| DELETE | `/api/projects/:id` | delete |
