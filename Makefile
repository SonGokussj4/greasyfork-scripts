
.DEFAULT_GOAL := help

.PHONY: setup-scripts login download-pages

VENV_DIR  := scripts/.venv
PYTHON    := $(VENV_DIR)/bin/python
PIP       := $(VENV_DIR)/bin/pip

help:
	@echo "Usage: make <target>"
	@echo ""
	@echo "  setup           Install Python venv & Playwright"
	@echo "  login           Log in to ČSFD (saves auth state)"
	@echo "  download-pages  Download test pages → tests/snapshots/<today>/"

setup:  # Create venv, install Python deps + Playwright Chromium browser
	python3 -m venv $(VENV_DIR)
	$(PIP) install -r scripts/requirements.txt
	$(PYTHON) -m playwright install chromium

login:  # Log in to ČSFD and save browser auth state (needs CSFD_USERNAME & CSFD_PASSWORD)
	$(PYTHON) scripts/download-test-pages.py login

download-pages: # Download all pages from scripts/test-pages.txt into tests/snapshots/<today>/ and update the tests/pages symlink
	$(PYTHON) scripts/download-test-pages.py download
