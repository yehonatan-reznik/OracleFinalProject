# Local Demo (OCI-aligned)

This repo is set up to run fully locally with Docker while keeping the same frontend + backend split used in OCI.

## Quick start

```bash
docker compose up --build
```

## URLs and ports

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:3001`
- Health check: `http://localhost:3001/health`

## Demo users (LOCAL_DEMO=1)

- POS user: `pos@acme.test` / `demo123`
- Warehouse user: `warehouse@acme.test` / `demo123`

You can also register new users from `http://localhost:3000/register.html`.

## API routes (local demo)

Public:
- `GET /health`
- `GET /items`
- `GET /items/:id`
- `GET /api/companies`
- `GET /api/warehouses?company_id=1`

Authenticated (token from `/api/auth/login`):
- `GET /api/inventory?warehouse_id=1`
- `POST /api/sales`
- `POST /api/returns`
- `POST /api/inventory/receive`
- `POST /api/inventory/adjust`
- `GET /api/transfers?warehouse_id=1`
- `POST /api/transfers`
- `POST /api/transfers/:id/approve`
- `POST /api/transfers/:id/reject`
- `GET /api/reports/pos?warehouse_id=1`
- `GET /api/reports/warehouse?warehouse_id=1`

## Demo data

Demo data lives in `backend/data/demo-data.json`.

Example mapping (warehouse ownership + stock):
- Acme Foods
  - Acme Central (warehouse_id 1)
  - Acme East (warehouse_id 2)
- Northwind Market
  - Northwind Hub (warehouse_id 3)
  - Northwind West (warehouse_id 4)

Each warehouse has item stock with low-stock examples (quantity <= 10) to validate report logic.

## How frontend connects to backend

`frontend/config.js` uses:
- local: `http://localhost:3001/api`
- OCI: the deployed public IP

So the browser calls the backend directly via `localhost:3001`.

## OCI mapping

Local (Docker) matches OCI roles:
- Frontend container (nginx) == OCI static hosting (Object Storage + CDN)
- Backend container (Node.js API) == OCI compute or container service
- In-memory/JSON demo data == Oracle Autonomous Database (for demo only)

## Notes

- Local data and demo users reset when containers restart.
- Environment variables are read from `docker-compose.yml`.
