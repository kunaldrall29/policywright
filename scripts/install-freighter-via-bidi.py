#!/usr/bin/env python3
"""Install unpacked Freighter into Chrome via Selenium BiDi webExtension.install."""
from __future__ import annotations

import json
import pathlib
import time
import traceback

from selenium import webdriver
from selenium.webdriver.chrome.options import Options

EXT = str(pathlib.Path(__file__).resolve().parents[1] / "tools" / "freighter-extension")
PROFILE = str(pathlib.Path.home() / ".config" / "google-chrome-policywright-bidi")



def main() -> None:
    pathlib.Path(PROFILE).mkdir(parents=True, exist_ok=True)

    options = Options()
    options.binary_location = "/usr/bin/google-chrome-stable"
    for arg in [
        "--no-sandbox",
        "--test-type",
        "--disable-dev-shm-usage",
        "--use-gl=angle",
        "--use-angle=swiftshader-webgl",
        "--password-store=basic",
        "--no-first-run",
        "--no-default-browser-check",
        f"--user-data-dir={PROFILE}",
        "--window-size=1280,900",
        "--enable-unsafe-extension-debugging",
        "--remote-debugging-pipe",
    ]:
        options.add_argument(arg)
    options.enable_bidi = True
    options.enable_webextensions = True

    print("launching...", flush=True)
    driver = webdriver.Chrome(options=options)
    print("launched", driver.capabilities.get("browserVersion"), flush=True)

    result = None
    try:
        result = driver.webextension.install(path=EXT)
        print("install result", result, flush=True)
    except Exception:
        traceback.print_exc()

    driver.get("chrome://extensions/")
    time.sleep(2)
    print("title", driver.title, flush=True)

    pref = pathlib.Path(PROFILE) / "Default" / "Secure Preferences"
    if pref.exists():
        data = json.loads(pref.read_text())
        settings = (data.get("extensions") or {}).get("settings") or {}
        for key, value in settings.items():
            manifest = value.get("manifest") or {}
            print(
                "ext",
                key,
                manifest.get("name"),
                value.get("path"),
                value.get("state"),
                flush=True,
            )

    pathlib.Path("/tmp/freighter-install.json").write_text(
        json.dumps({"result": result}, indent=2, default=str)
    )
    print("KEEPING_BROWSER_OPEN", flush=True)
    while True:
        time.sleep(30)
        try:
            _ = driver.title
        except Exception as exc:
            print("browser died", exc, flush=True)
            break


if __name__ == "__main__":
    main()
