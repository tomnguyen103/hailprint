DATE ?= 2024-05-28

setup:
	uv sync

lint:
	uv run ruff check . && uv run ruff format --check .

test:
	uv run pytest -q

spike:
	uv run python -m hailprint spike $(DATE)

.PHONY: setup lint test spike
