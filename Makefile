DATE ?= 2024-05-28

setup:
	uv sync

lint:
	uv run ruff check . && uv run ruff format --check . && uv run pyright

test:
	uv run pytest -q

ingest:
	uv run hailprint ingest $(DATE)

site:
	cd site && npm ci && npm run check

nightly:
	uv run hailprint cloud nightly

.PHONY: setup lint test ingest site nightly
