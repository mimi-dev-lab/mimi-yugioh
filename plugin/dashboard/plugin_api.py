"""游戏王 backend, mounted by Hermes at /api/plugins/yugioh/. A shell: it passes the request to the yugioh service
(src/server.js, on this machine) and gives its answer back unchanged. It works nothing out, reads no data files and
starts no process.

GET  /deck               → GET  /deck                  (卡组一览: every card with its names, role, count, effect and how it interrupts)
GET  /card-image?code=N  → GET  /card-image?code=N     (one card picture, as JSON with base64; the code has to be digits)

The tutorial only reads: there are no writes to let through.

YUGIOH_URL (default http://127.0.0.1:4519) says where the service is; it has to be on this machine.
"""

from __future__ import annotations

import asyncio
import json
import os
import urllib.error
import urllib.request
from urllib.parse import urlsplit

from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter()

DEFAULT_URL = "http://127.0.0.1:4519"
LOCAL_HOSTS = ("127.0.0.1", "localhost", "::1")
# Adding a route here needs a gateway restart.
TIMEOUT_S = 30  # the service answers from memory and reads card pictures from its own data folder on this machine


def service_url() -> str:
    url = os.environ.get("YUGIOH_URL") or DEFAULT_URL
    parts = urlsplit(url)
    if parts.scheme != "http" or parts.hostname not in LOCAL_HOSTS:
        raise ValueError(f"YUGIOH_URL must be an http address on this machine, got {url!r}")
    return url.rstrip("/")


def forward(method: str, path: str) -> tuple[int, dict]:
    """The service's status and JSON answer; a service that is down or answers badly becomes a 502."""
    try:
        base = service_url()
    except ValueError as e:
        return 500, {"error": str(e)}
    request = urllib.request.Request(base + path, method=method)
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_S) as r:
            status, raw = r.status, r.read()
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read()
    except OSError as e:
        return 502, {"error": f"游戏王的服务没有应答（{e}）"}
    try:
        return status, json.loads(raw)
    except ValueError:
        return 502, {"error": f"游戏王的服务回了看不懂的内容（HTTP {status}）"}


@router.get("/deck")
async def deck():
    status, body = await asyncio.to_thread(forward, "GET", "/deck")
    return JSONResponse(body, status_code=status)


@router.get("/card-image")
async def card_image(code: str):
    """The code is checked here so that nothing but digits reaches the service."""
    if not code.isdigit() or len(code) > 10:
        return JSONResponse({"error": "卡号要是数字"}, status_code=400)
    status, body = await asyncio.to_thread(forward, "GET", f"/card-image?code={code}")
    return JSONResponse(body, status_code=status)
