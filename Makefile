# =============================================================================
# Makefile · atajos para el ciclo de desarrollo y test local
# =============================================================================
# Targets relacionados con FASE 1.A (security/p0-hardening):
#
#   make test-unit         · vitest con DB_DRIVER=memory (rápido, sin docker)
#   make test-postgres     · arranca docker postgres, seed, vitest con DB real
#   make test-postgres-clean · idem + tear down container al final
#   make audit-svg-local   · inventario SVG en backend/data/uploads del checkout
# =============================================================================

# Vars que la suite Postgres necesita. Override desde CLI con make VAR=...
DB_URL ?= postgres://test:test@localhost:5433/contan2_test
SECRET ?= test-secret-base-32-bytes-min-aaaaaaaaaaaaaaaa
ROOT_DOMAIN ?= localhost
PUBLIC_URL ?= http://localhost:3457

# --- Tests rápidos (DB en memoria) --------------------------------------------

.PHONY: test-unit
test-unit:
	cd backend && npm test

# --- Tests con Postgres real (gated) ------------------------------------------

.PHONY: postgres-up
postgres-up:
	docker compose -f docker-compose.test.yml up -d postgres-test
	@echo "[postgres] esperando healthy..."
	@until docker compose -f docker-compose.test.yml exec -T postgres-test pg_isready -U test -d contan2_test >/dev/null 2>&1; do sleep 1; done
	@echo "[postgres] ready"

.PHONY: postgres-down
postgres-down:
	docker compose -f docker-compose.test.yml down

.PHONY: postgres-seed
postgres-seed: postgres-up
	cd backend && \
	  DB_DRIVER=postgres DATABASE_URL=$(DB_URL) SECRET_BASE=$(SECRET) \
	  ROOT_DOMAIN=$(ROOT_DOMAIN) PUBLIC_URL=$(PUBLIC_URL) \
	  node scripts/seed-test-fixtures.mjs

.PHONY: test-postgres
test-postgres: postgres-seed
	cd backend && \
	  DB_DRIVER=postgres DATABASE_URL=$(DB_URL) SECRET_BASE=$(SECRET) \
	  ROOT_DOMAIN=$(ROOT_DOMAIN) PUBLIC_URL=$(PUBLIC_URL) \
	  npm test

# Mismo que test-postgres pero limpia al final. Útil para CI o cuando no
# quieres dejar el container corriendo.
.PHONY: test-postgres-clean
test-postgres-clean:
	$(MAKE) test-postgres
	$(MAKE) postgres-down

# --- Auditoría SVG ------------------------------------------------------------

.PHONY: audit-svg-local
audit-svg-local:
	node backend/scripts/audit-historical-svg.mjs

# --- All checks (lo que CI corre antes de aprobar PR) -------------------------

.PHONY: check
check: test-unit
	$(MAKE) test-postgres-clean
	$(MAKE) audit-svg-local
