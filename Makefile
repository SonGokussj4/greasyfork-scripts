.DEFAULT_GOAL := help

.PHONY: help bootstrap install build dev test test-hover clean doctor setup login download-pages drift-check

# Python tooling (page snapshots) always goes through uv. The venv differs per platform so a
# checkout shared between Windows and WSL/Linux never mixes interpreters.
ifeq ($(OS),Windows_NT)
VENV_DIR  := scripts/.venv-win
PYTHON    := $(VENV_DIR)/Scripts/python.exe
else
VENV_DIR  := scripts/.venv
PYTHON    := $(VENV_DIR)/bin/python
endif
SITE      ?= cz
export PYTHONUTF8 := 1

help:
	@echo "Usage: make <target>"
	@echo ""
	@echo "Project"
	@echo "  bootstrap       Install npm deps and build dist/ (first-time setup)"
	@echo "  install         Install npm deps (npm ci)"
	@echo "  build           Sync version, generate build meta, bundle into dist/"
	@echo "  dev             Rebuild dist/ on every change (rollup watch)"
	@echo "  test            Run the Jest test suite"
	@echo "  test-hover      Run only the hover preview provider tests"
	@echo "  clean           Remove dist/ and test-results/"
	@echo "  doctor          Check that the required tools are installed"
	@echo ""
	@echo "Test page snapshots (optional, Python + Playwright)"
	@echo "  setup           Install Python venv & Playwright"
	@echo "  login           Log in to ČSFD (saves auth state; SITE=sk for csfd.sk)"
	@echo "  download-pages  Download test pages → tests/snapshots/<today>[-sk]/ (SITE=cz|sk)"
	@echo "  drift-check     Download fresh CZ+SK pages and verify the script's selectors still match"

bootstrap: install build  # First-time setup

install:  # Install exact dependency versions from package-lock.json
	npm ci

build:  # Bundle src/ into dist/csfd-compare.user.js
	npm run build

dev:  # Watch mode
	npm run dev

test:
	npm test

test-hover:
	npm run test:hover-preview

clean:
	rm -rf dist test-results

doctor:  # Report missing tools and project state
	@ok=1; 	check() { if command -v "$$1" >/dev/null 2>&1; then echo "  ok       $$1 ($$($$1 --version 2>&1 | head -n1))"; else echo "  MISSING  $$1 - $$2"; [ "$$3" = optional ] || ok=0; fi; }; 	echo "Required:"; 	check node "install Node.js (https://nodejs.org)"; 	check npm "comes with Node.js"; 	check git "install Git"; 	echo "Optional (test page snapshots):"; 	check uv "install uv (https://docs.astral.sh/uv/)" optional; 	echo "Project:"; 	if [ -d node_modules ]; then echo "  ok       node_modules"; else echo "  MISSING  node_modules - run: make install"; ok=0; fi; 	if [ -f dist/csfd-compare.user.js ]; then echo "  ok       dist/csfd-compare.user.js"; else echo "  MISSING  dist bundle - run: make build"; fi; 	if [ -d $(VENV_DIR) ]; then echo "  ok       $(VENV_DIR)"; else echo "  skipped  $(VENV_DIR) - run: make setup (only for download-pages)"; fi; 	[ $$ok = 1 ] && echo "All required tools present." || { echo "Some required items are missing."; exit 1; }

setup:  # Create venv, install Python deps + Playwright Chromium browser
	uv venv --allow-existing $(VENV_DIR)
	uv pip install --python $(PYTHON) -r scripts/requirements.txt
	$(PYTHON) -m playwright install chromium

login:  # Log in to ČSFD and save browser auth state (SITE=cz|sk, needs CSFD_USERNAME & CSFD_PASSWORD)
	$(PYTHON) scripts/download-test-pages.py login --site $(SITE)

download-pages: # Download all pages from scripts/test-pages.txt into tests/snapshots/<today>/ and update the tests/pages symlink
	$(PYTHON) scripts/download-test-pages.py download --site $(SITE)

drift-check:  # Download fresh CZ + SK pages and check the selectors the script depends on still match (manual, ~15 requests)
	$(PYTHON) scripts/download-test-pages.py download --site cz
	$(PYTHON) scripts/download-test-pages.py download --site sk
	node --experimental-vm-modules ./node_modules/jest/bin/jest.js tests/selectorContract.test.cjs --runInBand
