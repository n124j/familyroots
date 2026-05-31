# FamilyRoots

A multi-tenant genealogy platform for building, exploring, and collaborating on family trees. Built with FastAPI, React, PostgreSQL, and Redis.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Local Deployment](#local-deployment)
  - [1. Clone and configure](#1-clone-and-configure)
  - [2. Start core services](#2-start-core-services)
  - [3. Run database migrations](#3-run-database-migrations)
  - [4. Access the app](#4-access-the-app)
  - [5. Optional: monitoring stack](#5-optional-monitoring-stack)
  - [Running tests](#running-tests)
- [Production Deployment](#production-deployment)
  - [Prerequisites](#prerequisites-1)
  - [1. Configure secrets](#1-configure-secrets)
  - [2. Build and push images](#2-build-and-push-images)
  - [3. Deploy with Helm](#3-deploy-with-helm)
  - [4. Verify the deployment](#4-verify-the-deployment)
  - [CI/CD pipeline](#cicd-pipeline)
- [Port Reference](#port-reference)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend API | FastAPI (Python 3.11), Uvicorn, Celery |
| Frontend | React 18, TypeScript, Vite, TanStack Query, Zustand, ReactFlow, Tailwind CSS |
| Database | PostgreSQL 15 |
| Cache / Queue | Redis 7 |
| Object Storage | MinIO (local) / AWS S3 (production) |
| Migrations | Alembic |
| Monitoring | Prometheus, Grafana, Loki, Promtail |
| Production infra | Kubernetes, Helm, GitHub Actions (blue/green deploy) |

---

## Prerequisites

**Local development**
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (with Docker Compose v2)
- Git

**Running the backend or frontend outside Docker (optional)**
- Python 3.11+
- Node.js 20+

**Production**
- Kubernetes cluster (1.28+)
- Helm 3.14+
- `kubectl` configured for your cluster
- GitHub repository with Actions enabled
- AWS account (S3) or equivalent object storage
- Container registry (the defaults use GitHub Container Registry)

---

## Local Deployment

All services run via Docker Compose. Everything — database, cache, object storage, API, worker, and frontend — starts with a single command.

### 1. Clone and configure

```bash
git clone <repo-url>
cd familyroots
```

Copy the backend environment file and fill in the required values:

```bash
cp backend/.env.example backend/.env
```

Open `backend/.env` and set at minimum:

```env
# Required — generate with: openssl rand -hex 64
JWT_SECRET_KEY=<your-secret-key>

# Pre-filled for local Docker Compose — change only if needed
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:7000/familyroots
REDIS_URL=redis://localhost:7001/0
```

Everything else (MinIO credentials, S3 endpoint, CORS) is already set in `docker-compose.yml` for local use and does not need to be changed.

### 2. Start core services

```bash
docker compose up -d
```

This starts:
- **PostgreSQL** on port 7000
- **Redis** on port 7001
- **MinIO** (S3-compatible storage) on ports 7002 (API) and 7003 (Console)
- **Backend API** on port 7004
- **Celery worker** (no external port — background task processor)
- **Flower** (Celery task monitor) on port 7005
- **Frontend** (Vite dev server) on port 7006

Wait for all services to be healthy:

```bash
docker compose ps
```

All services should show `healthy` or `running` before proceeding.

### 3. Run database migrations

```bash
docker compose run --rm migrate
```

This applies the full Alembic migration history, including the baseline schema (PostgreSQL enums, core tables, row-level security, indexes, and triggers).

> Run this once on first setup, and again after pulling changes that include new migrations.

### 4. Access the app

| Service | URL | Credentials |
|---------|-----|------------|
| Frontend | http://localhost:7006 | Register a new account |
| Backend API | http://localhost:7004 | — |
| API docs (Swagger) | http://localhost:7004/docs | — |
| API docs (ReDoc) | http://localhost:7004/redoc | — |
| Flower (task monitor) | http://localhost:7005 | — |
| MinIO Console | http://localhost:7003 | `minioadmin` / `minioadmin` |

### 5. Optional: monitoring stack

Start Prometheus, Grafana, Loki, and log shipping alongside the core stack:

```bash
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```

| Service | URL | Default credentials |
|---------|-----|-------------------|
| Grafana | http://localhost:7009 | `admin` / `admin` |
| Prometheus | http://localhost:7007 | — |
| Alertmanager | http://localhost:7008 | — |
| Loki | http://localhost:7010 | — |

Grafana dashboards are provisioned automatically on startup. Open Grafana and navigate to **Dashboards → API Overview**.

To set a custom Grafana password:

```bash
GRAFANA_PASSWORD=yourpassword docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```

### Stopping the stack

```bash
# Stop without removing data volumes
docker compose down

# Stop and remove all local data (full reset)
docker compose down -v
```

---

### Running tests

**Backend**

Unit tests (no Docker required):

```bash
cd backend
pip install -r requirements/test.txt
pytest tests/unit -n auto --tb=short
```

Integration tests (requires PostgreSQL and Redis running):

```bash
pytest tests/integration \
  --tb=short \
  -n 2
```

Security tests:

```bash
pytest tests/security -v
```

All backend tests with coverage:

```bash
pytest --cov=src --cov-report=term-missing --cov-fail-under=90
```

**Frontend**

Unit tests:

```bash
cd frontend
npm ci
npm test
```

E2E tests (requires the full stack running via `docker compose up -d`):

```bash
npx playwright install --with-deps chromium
npx playwright test --project=chromium
```

---

## Production Deployment

Production runs on Kubernetes with blue/green deployments managed by GitHub Actions. Images are built by CI and pushed to GitHub Container Registry.

### Prerequisites

- A Kubernetes cluster with an nginx ingress controller and `cert-manager` installed
- `kubectl` pointing at your target cluster
- Helm 3.14+
- A Kubernetes secret named `familyroots-secrets` in the `familyroots` namespace (see step 1)
- DNS records pointing your domain at the ingress controller's external IP

### 1. Configure secrets

Create the namespace and the secrets Kubernetes object. All values must be base64-encoded.

```bash
kubectl create namespace familyroots

kubectl create secret generic familyroots-secrets \
  --namespace familyroots \
  --from-literal=DB_PASSWORD='<postgres-password>' \
  --from-literal=REDIS_PASSWORD='<redis-password>' \
  --from-literal=JWT_SECRET='<64-char-hex-secret>' \
  --from-literal=AWS_ACCESS_KEY_ID='<key-id>' \
  --from-literal=AWS_SECRET_ACCESS_KEY='<secret-key>' \
  --from-literal=SENTRY_DSN='<sentry-dsn>'
```

Generate a strong JWT secret:

```bash
openssl rand -hex 64
```

**GitHub Actions secrets** — add the following in your repository's Settings → Secrets → Actions:

| Secret | Description |
|--------|-------------|
| `KUBE_CONFIG` | Base64-encoded kubeconfig for your cluster |
| `DB_PASSWORD` | PostgreSQL password |
| `REDIS_PASSWORD` | Redis password |
| `JWT_SECRET` | JWT signing key |
| `S3_BUCKET` | S3 bucket name |
| `S3_REGION` | AWS region (e.g. `us-east-1`) |
| `AWS_ACCESS_KEY_ID` | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key |
| `CORS_ORIGINS` | JSON array of allowed origins, e.g. `["https://familyroots.example.com"]` |
| `SENTRY_DSN` | Sentry DSN (optional) |
| `GRAFANA_PASSWORD` | Grafana admin password (optional) |

### 2. Build and push images

CI does this automatically on every push to `main`. To build manually:

```bash
# Set your registry and org
export REGISTRY=ghcr.io
export ORG=your-org
export TAG=$(git rev-parse --short HEAD)

# Log in to the registry
echo $GITHUB_TOKEN | docker login ghcr.io -u $GITHUB_ACTOR --password-stdin

# Build and push API image
docker build --target runtime -t $REGISTRY/$ORG/familyroots/api:$TAG ./backend
docker push $REGISTRY/$ORG/familyroots/api:$TAG

# Build and push frontend image
docker build -t $REGISTRY/$ORG/familyroots/frontend:$TAG ./frontend
docker push $REGISTRY/$ORG/familyroots/frontend:$TAG
```

### 3. Deploy with Helm

Update `helm/familyroots/values.yaml` with your domain and image org, then install:

```bash
helm upgrade --install familyroots ./helm/familyroots \
  --namespace familyroots \
  --set image.org=your-org \
  --set image.tag=$TAG \
  --set ingress.host=familyroots.example.com \
  --set ingress.apiHost=api.familyroots.example.com \
  --wait
```

On first install, run database migrations as a one-off Job:

```bash
kubectl run migrate \
  --image=ghcr.io/your-org/familyroots/api:$TAG \
  --restart=Never \
  --namespace=familyroots \
  --env="DATABASE_URL=<your-database-url>" \
  -- alembic upgrade head

# Wait for it to complete
kubectl wait --for=condition=complete job/migrate -n familyroots --timeout=120s
kubectl delete pod migrate -n familyroots
```

### 4. Verify the deployment

Check that all pods are running:

```bash
kubectl get pods -n familyroots
```

Check the API health endpoint:

```bash
curl https://api.familyroots.example.com/health
# Expected: {"status": "ok"}
```

Check rollout status:

```bash
kubectl rollout status deployment/api-blue -n familyroots
kubectl rollout status deployment/frontend-blue -n familyroots
```

### Rolling back

If a deployment goes wrong, roll back the Helm release:

```bash
helm rollback familyroots -n familyroots
```

Or roll back the Kubernetes deployment directly:

```bash
kubectl rollout undo deployment/api-blue -n familyroots
```

---

### CI/CD pipeline

Pushing to `main` triggers the full pipeline automatically:

1. **Backend unit tests** — pytest, no Docker needed
2. **Backend integration tests** — pytest with live PostgreSQL and Redis
3. **Backend security tests** — pytest + Bandit static analysis
4. **Frontend unit tests** — Vitest with coverage
5. **E2E tests** — Playwright (Chromium) against a live stack
6. **Coverage gate** — fails if backend < 90% or frontend < 85%
7. **Build & push** — Docker images tagged with the commit SHA
8. **Blue/green deploy** — deploys to the inactive slot, runs a smoke test, then switches traffic

Pull requests run steps 1–6 only (no deploy).

---

## Port Reference

| Port | Service | Notes |
|------|---------|-------|
| 7000 | PostgreSQL | |
| 7001 | Redis | |
| 7002 | MinIO S3 API | `http://localhost:7002` |
| 7003 | MinIO Console | Web UI for browsing buckets |
| 7004 | Backend API | REST API + `/docs` |
| 7005 | Flower | Celery task monitor |
| 7006 | Frontend | Vite dev server |
| 7007 | Prometheus | Monitoring stack only |
| 7008 | Alertmanager | Monitoring stack only |
| 7009 | Grafana | Monitoring stack only |
| 7010 | Loki | Monitoring stack only |
| 7011 | Postgres Exporter | Monitoring stack only |
| 7012 | Redis Exporter | Monitoring stack only |
| 7013 | Frontend (prod) | Production docker-compose only |
