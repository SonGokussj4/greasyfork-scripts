#!/usr/bin/env python3
"""Download ČSFD test pages as a logged-in user using Playwright.

Subcommands
-----------
login    - Log in to ČSFD and save browser auth state for later reuse.
download - Fetch every URL listed in test-pages.txt and save the HTML
           into a dated snapshot folder under tests/snapshots/.

Environment variables
---------------------
CSFD_USERNAME  - ČSFD login (e-mail or username).
CSFD_PASSWORD  - ČSFD password.

Both are required for the `login` subcommand.
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import json
import os
import re
import shutil
import sys
import time
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright
from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth

# ── paths ────────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
CREDENTIALS_FILE = SCRIPT_DIR / ".credentials.json"
SNAPSHOTS_DIR = PROJECT_ROOT / "tests" / "snapshots"
PAGES_SYMLINK = PROJECT_ROOT / "tests" / "pages"

# Per-locale settings. ČSFD logins are per domain, so each site has its own auth state.
SITES = {
    "cz": {
        "origin": "https://www.csfd.cz",
        "login_path": "/prihlaseni/",
        "locale": "cs-CZ",
        "languages": ("cs", "cs-CZ", "en"),
        "auth_file": SCRIPT_DIR / ".auth-state.json",
        "url_list": SCRIPT_DIR / "test-pages.txt",
        "dir_suffix": "",
        "submit_text": "Přihlásit",
    },
    "sk": {
        "origin": "https://www.csfd.sk",
        "login_path": "/prihlasenie/",
        "locale": "sk-SK",
        "languages": ("sk", "sk-SK", "en"),
        "auth_file": SCRIPT_DIR / ".auth-state-sk.json",
        "url_list": SCRIPT_DIR / "test-pages-sk.txt",
        "dir_suffix": "-sk",
        "submit_text": "Prihlásiť",
    },
}


# ── helpers ──────────────────────────────────────────────────────────────


def url_to_filename(url: str) -> str:
    """Convert a ČSFD URL to a flat, filesystem-safe filename.

    Example:
        https://www.csfd.cz/film/9499-matrix/recenze/
        → film_9499-matrix_recenze.html
    """
    parsed = urlparse(url)
    # Strip leading/trailing slashes, then replace remaining slashes with '_'
    path = parsed.path.strip("/")
    name = re.sub(r"/+", "_", path)
    # Safety: remove anything that isn't alphanumeric, dash, underscore, or dot
    name = re.sub(r"[^\w\-.]", "_", name)
    # Collapse repeated underscores
    name = re.sub(r"_+", "_", name)
    return f"{name}.html"


def read_urls(path: Path) -> list[str]:
    """Read non-empty, non-comment lines from a text file."""
    lines: list[str] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line and not line.startswith("#"):
            lines.append(line)
    return lines


def update_symlink(target: Path) -> None:
    """Point tests/pages → target (relative symlink)."""
    if PAGES_SYMLINK.is_symlink():
        PAGES_SYMLINK.unlink()
    elif PAGES_SYMLINK.is_dir():
        # First run: tests/pages is a real directory — back it up, then replace
        backup = PAGES_SYMLINK.with_name("pages.bak")
        if backup.exists():
            shutil.rmtree(backup)
        PAGES_SYMLINK.rename(backup)
        print(f"  ⚠ Existing tests/pages/ moved to tests/pages.bak/")
    elif PAGES_SYMLINK.exists():
        PAGES_SYMLINK.unlink()
    # Build a relative path so the symlink works regardless of checkout location
    rel = os.path.relpath(target, PAGES_SYMLINK.parent)
    try:
        PAGES_SYMLINK.symlink_to(rel)
        print(f"  ✔ symlink tests/pages → {rel}")
    except OSError:
        # Windows without symlink privilege: fall back to a plain copy
        shutil.copytree(target, PAGES_SYMLINK)
        print(f"  ✔ copied snapshot to tests/pages (symlinks not permitted)")


# ── subcommands ──────────────────────────────────────────────────────────


def _load_credentials() -> tuple[str, str]:
    """Resolve credentials from env vars, saved file, or interactive prompt.

    Priority: env vars > saved file > ask interactively.
    When prompted, the credentials are saved to CREDENTIALS_FILE for next time.
    """
    username = os.environ.get("CSFD_USERNAME", "").strip()
    password = os.environ.get("CSFD_PASSWORD", "").strip()

    if username and password:
        return username, password

    # Try the saved credentials file
    if CREDENTIALS_FILE.exists():
        try:
            data = json.loads(CREDENTIALS_FILE.read_text(encoding="utf-8"))
            saved_user = data.get("username", "").strip()
            saved_pass = data.get("password", "").strip()
            if saved_user and saved_pass:
                print(f"  Using saved credentials for {saved_user}")
                return saved_user, saved_pass
        except (json.JSONDecodeError, KeyError):
            pass  # fall through to prompt

    # Interactive prompt
    print("No credentials found. Please enter your ČSFD login:")
    username = input("  Username / e-mail: ").strip()
    password = getpass.getpass("  Password: ").strip()

    if not username or not password:
        sys.exit("Error: username and password are required.")

    # Offer to save
    save = input("  Save credentials for next time? [Y/n] ").strip().lower()
    if save in ("", "y", "yes", "a", "ano"):
        CREDENTIALS_FILE.write_text(
            json.dumps({"username": username, "password": password}, indent=2),
            encoding="utf-8",
        )
        CREDENTIALS_FILE.chmod(0o600)
        print(f"  ✔ Credentials saved to {CREDENTIALS_FILE.relative_to(PROJECT_ROOT)}")

    return username, password


def cmd_login(args: argparse.Namespace) -> None:
    """Open a browser, log in to ČSFD, and persist the auth state."""
    site = SITES[args.site]
    auth_file = site["auth_file"]
    username, password = _load_credentials()

    print(f"Logging in to ČSFD ({args.site}) …")
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()

        page.goto(site["origin"] + site["login_path"], wait_until="networkidle")

        # Dismiss cookie consent banner if present (common CMP buttons)
        for cookie_sel in [
            'text=zůstat a už nenabízet',
            'button:has-text("Souhlasím")',
            'button:has-text("Přijmout")',
            'button:has-text("Accept")',
            'button[id*="agree"]',
            'button[class*="agree"]',
            '.cmp-button-accept',
            '#cmp-btn-accept',
            'button:has-text("OK")',
        ]:
            try:
                btn = page.locator(cookie_sel).first
                if btn.is_visible(timeout=2_000):
                    btn.click()
                    print("  ✔ Cookie consent dismissed")
                    page.wait_for_timeout(500)
                    break
            except Exception:
                continue

        # Fill the login form (try multiple selector strategies)
        login_form_selectors = [
            ('input[name="username"]', 'input[name="password"]'),
            ('#username', '#password'),
            ('input[type="email"]', 'input[type="password"]'),
            ('input[type="text"]', 'input[type="password"]'),
        ]

        filled = False
        for user_sel, pass_sel in login_form_selectors:
            try:
                user_input = page.locator(user_sel).first
                pass_input = page.locator(pass_sel).first
                if user_input.is_visible(timeout=2_000) and pass_input.is_visible(timeout=1_000):
                    user_input.click()
                    user_input.fill(username)
                    pass_input.click()
                    pass_input.fill(password)
                    filled = True
                    print(f"  ✔ Credentials filled (selector: {user_sel})")
                    break
            except Exception:
                continue

        if not filled:
            sys.exit("Error: could not find the login form fields on the page.")

        # Submit. Scope to the form that holds the password field: the header search box has
        # its own visible submit button that an unscoped selector would click instead.
        submitted = False
        login_form = page.locator("form").filter(has=pass_input).first
        for submit_sel in [
            'button[type="submit"]',
            'input[type="submit"]',
            'button:has-text("' + site["submit_text"] + '")',
        ]:
            try:
                submit_btn = login_form.locator(submit_sel).first
                if submit_btn.is_visible(timeout=2_000):
                    submit_btn.click()
                    submitted = True
                    break
            except Exception:
                continue
        if not submitted:
            pass_input.press("Enter")

        # Wait for successful login: either the URL leaves the login page
        # or a known logged-in element appears in the header.
        try:
            page.wait_for_url(
                lambda url: "/prihlasen" not in url,
                timeout=30_000,
            )
        except Exception:
            # URL didn't change — try waiting for any profile-ish element
            pass

        # Double-check: if we're still on the login page, something failed
        if "/prihlasen" in page.url:
            sys.exit(
                "Login failed - still on the login page after submit. "
                "Check your credentials or complete any CAPTCHA manually."
            )

        # Save auth state
        context.storage_state(path=str(auth_file))
        browser.close()

    print(f"  ✔ Auth state saved to {auth_file.relative_to(PROJECT_ROOT)}")


def cmd_download(args: argparse.Namespace) -> None:
    """Download every URL from the text-file list using saved auth state."""
    asyncio.run(_async_download(args.site, headed=getattr(args, "headed", False)))


async def _wait_for_anubis(page, timeout_ms: int = 30_000) -> bool:
    """Detect an Anubis/BotStopper challenge and wait for it to resolve.

    Returns True if the page is ready (no challenge or challenge passed).
    Returns False if still blocked after *timeout_ms*.
    """
    start = time.monotonic()
    while (time.monotonic() - start) * 1_000 < timeout_ms:
        title = await page.title()
        # "Oh noes!" is the Anubis challenge / blocked page title
        if "oh noes" not in title.lower():
            return True
        # Still on the challenge page - wait and hope the PoW resolves
        await page.wait_for_timeout(1_000)
    return False


async def _async_download(site_key: str, *, headed: bool = False) -> None:
    site = SITES[site_key]
    auth_file = site["auth_file"]
    if not auth_file.exists():
        sys.exit(
            f"Error: auth state not found at {auth_file.relative_to(PROJECT_ROOT)}.\n"
            f"Run 'make login SITE={site_key}' first."
        )

    urls = read_urls(site["url_list"])
    if not urls:
        sys.exit(f"Error: no URLs found in {site['url_list'].relative_to(PROJECT_ROOT)}")

    today = date.today().isoformat()  # e.g. 2026-03-31
    out_dir = SNAPSHOTS_DIR / f"{today}{site['dir_suffix']}"
    out_dir.mkdir(parents=True, exist_ok=True)

    concurrency = min(6, len(urls))  # up to 6 parallel tabs
    print(f"Downloading {len(urls)} pages ({concurrency} workers) → {out_dir.relative_to(PROJECT_ROOT)}/")

    failed: list[str] = []
    semaphore = asyncio.Semaphore(concurrency)

    stealth = Stealth(
        navigator_languages_override=site["languages"],
        navigator_platform_override="Linux x86_64",
        navigator_user_agent_override=(
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        ),
    )

    async with stealth.use_async(async_playwright()) as pw:
        launch_args = [
            "--disable-blink-features=AutomationControlled",
        ]
        browser = await pw.chromium.launch(
            headless=not headed,
            args=launch_args,
        )

        async def _download(idx: int, url: str) -> None:
            fname = url_to_filename(url)
            dest = out_dir / fname
            async with semaphore:
                context = await browser.new_context(
                    storage_state=str(auth_file),
                    viewport={"width": 1920, "height": 1080},
                    locale=site["locale"],
                )
                page = await context.new_page()
                try:
                    print(f"  [{idx}/{len(urls)}] {url}")
                    await page.goto(url, wait_until="domcontentloaded", timeout=60_000)
                    # Wait for Anubis challenge to resolve if present
                    ok = await _wait_for_anubis(page, timeout_ms=60_000)
                    if not ok:
                        print(f"           ⚠ {fname}: still on Anubis challenge page")
                        failed.append(url)
                        return
                    # Wait a bit for the real page to finish rendering
                    try:
                        await page.wait_for_load_state("networkidle", timeout=15_000)
                    except Exception:
                        pass  # ads/tracking may prevent networkidle; page content is fine
                    html = await page.content()
                    dest.write_text(html, encoding="utf-8")
                    print(f"           ✔ {fname}")
                except Exception as exc:
                    print(f"           ✘ {fname}: {exc}")
                    failed.append(url)
                finally:
                    await page.close()
                    await context.close()

        tasks = [_download(i, u) for i, u in enumerate(urls, 1)]
        await asyncio.gather(*tasks)

        await browser.close()

    if site_key == "cz":
        update_symlink(out_dir)  # tests/pages follows the CZ snapshot only
    ok = len(urls) - len(failed)
    print(f"\nDone. {ok}/{len(urls)} pages saved.")
    if failed:
        print("Failed URLs:")
        for u in failed:
            print(f"  - {u}")


# ── CLI ──────────────────────────────────────────────────────────────────


def main() -> None:
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8")  # Windows consoles default to cp1252
    parser = argparse.ArgumentParser(
        description="Download ČSFD test pages using Playwright.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    login = sub.add_parser("login", help="Log in to ČSFD and save auth state.")
    dl = sub.add_parser("download", help="Download the test pages listed for the chosen site.")
    for sp in (login, dl):
        sp.add_argument("--site", choices=sorted(SITES), default="cz", help="ČSFD locale (default: cz).")
    dl.add_argument(
        "--headed", action="store_true",
        help="Run browser in headed (visible) mode to help bypass bot detection.",
    )

    args = parser.parse_args()

    if args.command == "login":
        cmd_login(args)
    elif args.command == "download":
        cmd_download(args)


if __name__ == "__main__":
    main()
