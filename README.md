# Places To Visit AI Monorepo

## Structure
- client: Frontend (Vite/React)
- server: Backend (Node/Express)

## UI element index
- Frontend element locator (IDs/classes + logic/style hooks): [client/ELEMENT_INDEX.md](client/ELEMENT_INDEX.md)

## Run locally

### Client
cd client
npm install
npm run dev

### Server
cd server
npm install
npm start

## Persisting backend data on Render
- Set `DATABASE_URL` on the backend service (Render Postgres connection string).
- On first boot with `DATABASE_URL`, backend seeds `server/data/countries/*.json` into Postgres table `country_documents`.
- On first boot with `DATABASE_URL`, backend also seeds `server/data/users.json` and `server/data/pending_users.json` into Postgres tables `app_users` and `pending_user_signups`.
- After that, `/api/countries*` and auth flows (`signup/login/confirm/me`, token updates) read/write from Postgres so changes remain persistent across deploys.
