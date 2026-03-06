# ✨ Cosmic WebApp Backend — Getting Started Guide

Welcome! This guide will help you run the **Cosmic WebApp API Backend** on your local machine.  
Even if you’re not a developer — just follow the steps carefully 👇

## Documentation

The backend domain is rooted in **Space**, the primary aggregate representing a digital environment and anchoring related entities, permissions, and integrations.

- [Domain model (`Space` and related entities)](docs/domain-model.md)
- [Architecture overview](docs/architecture.md)
- [ER model v1 diagram](docs/diagrams/er-model-v1.md)
- [Architecture context diagram](docs/diagrams/architecture-context.md)

---

## 🚀 How to Start the API Backend (Development Mode)

### 1️⃣ Before You Start

Make sure you have these tools installed:

- [✅ Node.js](https://nodejs.org/en)
- [✅ Yarn](https://classic.yarnpkg.com/en/docs/install/#mac-stable)

---

### 2️⃣ Open Your Terminal

A terminal is a program where you can type commands.

- **Windows**: Press `Win + S`, type **Command Prompt** or **PowerShell**, and open it
- **Mac**: Press `Cmd + Space`, type **Terminal**, and press Enter

> 📌 Keep this terminal open for the next steps.

---

### 3️⃣ Navigate to the Project Folder

In the terminal, type the command below:

cd path-to-your-project-folderb

### 4️⃣ Create and Configure the `.env` File

Copy the example configuration file into a working one:

- On **macOS / Linux**:

cp .env.example .env

- On **Windows**:

copy .env.example .env

This creates a config file that the app needs.

- `SUPABASE_URL` — URL to Supabase database. Example: `https://example.supabase.co`
- `SUPABASE_KEY` — Secret key from Supabase.
- `COOKIE_SECRET` — Random string for cookie security.
- `PORT` — Port for the backend (e.g. if 4000, URL will be `http://localhost:4000/`)
- `API_LOGIN` — Random login string for basic API security.
- `API_PASS` — Random password string for basic API security.
- `ACCESS_TOKEN_SECRET` — Random string for JWT signing ([jwt.io](https://jwt.io/)).
- `REFRESH_TOKEN_SECRET` — Random string for JWT refresh tokens.
- `MATTERPORT_MODEL_ID` — ID of Matterport model.
- `MATTERPORT_API_KEY` — API key for Matterport.
- `MATTERPORT_API_SECRET` — Secret key for Matterport.

Type in terminal: `yarn install`

After this type: `yarn dev`

You will see:

App running at `http://localhost:3000`

Your backend will be at this URL:

Documentation for API will be at this URL: `http://localhost:3000/api-docs/`

# Info for developer

1. Copy `.env.example` to `.env` file
2. `Yarn install` for install packages
3. `Yarn dev` for up project localy

For build

1. Copy `.env.example` to `.env` file
2. `Yarn install` for install packages
3. Use `Yarn build` command for create build
4. Use `Yarn start` for start app
