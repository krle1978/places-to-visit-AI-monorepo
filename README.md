# Places To Visit AI Monorepo

## Structure
- client: Frontend (Vite/React)
- server: Backend (Node/Express)

## Run locally

### Client
cd client
npm install
npm run dev

### Server
cd server
npm install
npm start

## Persisting countries data on Render
- Set `DATABASE_URL` on the backend service (Render Postgres connection string).
- On first boot with `DATABASE_URL`, backend seeds `server/data/countries/*.json` into Postgres table `country_documents`.
- After that, `/api/countries*` reads/writes from Postgres so city additions remain persistent across deploys.
