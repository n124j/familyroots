# FamilyRoots — Enterprise Testing Strategy

## Test Pyramid

```
                    ┌─────────────┐
                    │   E2E (Playwright)    │  ~30 tests
                    │  Full user journeys   │
                    └───────┬─────────────┘
                    ┌───────┴──────────────┐
                    │  Integration Tests    │  ~120 tests
                    │  API + DB + Redis     │
                    └───────┬──────────────┘
               ┌────────────┴──────────────────┐
               │         Unit Tests             │  ~400 tests
               │  Domain / Services / Components│
               └───────────────────────────────┘
```

## Coverage Targets

| Layer                    | Tool              | Target | Hard fail below |
|--------------------------|-------------------|--------|-----------------|
| Python domain layer      | pytest-cov        | 95%    | 90%             |
| Python application layer | pytest-cov        | 90%    | 85%             |
| Python API layer         | pytest-cov        | 90%    | 85%             |
| React components         | jest --coverage   | 90%    | 85%             |
| React hooks / stores     | jest --coverage   | 95%    | 90%             |
| Critical paths (E2E)     | Playwright        | 100%   | 100%            |

## Test Types

### Unit Tests (pytest / Jest)
- **Pure domain logic** — no I/O, no network, no DB
- Run in < 5 seconds total
- No mocking of domain objects; mock only infrastructure boundaries

### Integration Tests (pytest-asyncio + testcontainers)
- Real PostgreSQL 15 in Docker (via `testcontainers-python`)
- Real Redis (via `testcontainers-python`)
- FastAPI test client (`httpx.AsyncClient`)
- S3 mocked with `moto` (no real AWS calls)
- Celery tasks run eagerly (`CELERY_TASK_ALWAYS_EAGER=True`)

### E2E Tests (Playwright)
- Against a full local stack (Docker Compose)
- Uses dedicated `test` tenant seeded by fixtures
- Parallel execution across 4 workers
- Screenshots on failure, video on retry

### Performance Tests (Locust)
- Name search: 200 RPS, p99 < 100ms
- Ancestor BFS 10gen: 50 RPS, p99 < 200ms
- Media upload URL: 100 RPS, p99 < 50ms
- Auth token refresh: 500 RPS, p99 < 30ms

### Security Tests (pytest-security)
- SQL injection on all search inputs
- Tenant isolation (cross-tenant data leakage)
- Auth bypass (expired/tampered JWTs)
- IDOR (direct object reference between tenants)
- File upload MIME spoofing
- Rate limiting enforcement

## Tooling

```
Backend:
  pytest 8.x               core runner
  pytest-asyncio            async test support
  pytest-cov                coverage (--cov-fail-under=90)
  pytest-xdist              parallel execution (-n auto)
  factory-boy               test data factories
  faker                     realistic fake data
  testcontainers-python     real DB/Redis in Docker
  moto[s3]                  S3 mock
  httpx                     async HTTP test client
  locust                    performance testing
  bandit                    static security analysis

Frontend:
  jest 29.x + ts-jest       test runner
  @testing-library/react    component tests
  @testing-library/user-event  realistic user interactions
  msw (Mock Service Worker)  API mocking
  jest-axe                  accessibility assertions
  @playwright/test          E2E
```

## File Layout

```
backend/
  tests/
    conftest.py             shared fixtures (DB, client, factories)
    factories.py            factory-boy definitions
    unit/
      domain/
        test_genealogy_calculators.py
        test_rbac_permissions.py
        test_media_entities.py
        test_search_entities.py
      application/
        test_collaboration_service.py
        test_media_service.py
        test_search_service.py
    integration/
      api/
        test_auth_api.py
        test_persons_api.py
        test_media_api.py
        test_search_api.py
        test_collaboration_api.py
      db/
        test_search_repository.py
        test_media_repository.py
    security/
      test_sql_injection.py
      test_tenant_isolation.py
      test_auth_bypass.py
      test_idor.py
    performance/
      locustfile.py

frontend/
  src/
    __tests__/
      stores/
        auth.store.test.ts
        canvas.store.test.ts
      components/
        SearchBar.test.tsx
        MediaUploader.test.tsx
        PermissionGuard.test.tsx
      hooks/
        useMediaUpload.test.ts
        useSearch.test.ts
  e2e/
    fixtures/
      auth.ts
      tree.ts
    specs/
      auth.spec.ts
      tree-management.spec.ts
      person-management.spec.ts
      media-upload.spec.ts
      search.spec.ts
      collaboration.spec.ts
```

## Running Tests

```bash
# Backend — full suite
cd backend
pytest --cov=src --cov-report=html --cov-fail-under=90 -n auto

# Backend — unit only (fast feedback)
pytest tests/unit -n auto

# Backend — integration (requires Docker)
pytest tests/integration --tb=short

# Backend — security
pytest tests/security -v

# Frontend — unit
cd frontend
npm test -- --coverage --watchAll=false

# Frontend — E2E
npx playwright test

# Performance
cd backend && locust -f tests/performance/locustfile.py --headless -u 200 -r 20 --run-time 60s
```

## CI Pipeline

Every PR triggers (in parallel):
1. `backend-unit`      — fast, no Docker, < 60s
2. `backend-integration` — Docker, ~3 min
3. `backend-security`  — bandit + pytest security suite
4. `frontend-unit`     — Jest + coverage gate
5. `e2e`               — Playwright against Docker Compose stack
6. `coverage-gate`     — fails if any layer below threshold
