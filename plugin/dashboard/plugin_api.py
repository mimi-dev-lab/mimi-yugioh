"""游戏王 backend, mounted by Hermes at /api/plugins/yugioh/. A shell: it passes the request to the yugioh service
(src/server.js, on this machine) and gives its answer back unchanged. It works nothing out, reads no data files and
starts no process.

GET  /hand               → GET  /hand                  (the hand in progress: prompt and legal options, board, step log, clock)
POST /hand/<sub>         → POST /hand/<sub>            (every write, one route; only the paths in HAND_WRITES go through, any other
                                                         is a 404 here and never reaches the service; the body goes through as it is)
                                                         start: deal a new hand; choose: answer the prompt; end: end the turn
GET  /cards              → GET  /cards                 (every card of the deck: Master Duel name, role, the three things)
GET  /card-image?code=N  → GET  /card-image?code=N     (one card picture, as JSON with base64; the code has to be digits)
GET  /quiz               → GET  /quiz                  (记卡: how many cards are due)
POST /quiz/<sub>         → POST /quiz/<sub>            (only the paths in QUIZ_WRITES go through; next: the next question, answer: answer it)

YUGIOH_URL (default http://127.0.0.1:4519) says where the service is; it has to be on this machine.
"""

from __future__ import annotations

import asyncio
import json
import os
import urllib.error
import urllib.request
from urllib.parse import urlsplit

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter()

DEFAULT_URL = "http://127.0.0.1:4519"
LOCAL_HOSTS = ("127.0.0.1", "localhost", "::1")
# The writes this plugin lets through. Adding one here needs a gateway restart.
HAND_WRITES = ("start", "choose", "end")
QUIZ_WRITES = ("next", "answer")
TIMEOUT_S = 30  # the service only plays one hand in memory and reads its own data folder on this machine


def service_url() -> str:
    url = os.environ.get("YUGIOH_URL") or DEFAULT_URL
    parts = urlsplit(url)
    if parts.scheme != "http" or parts.hostname not in LOCAL_HOSTS:
        raise ValueError(f"YUGIOH_URL must be an http address on this machine, got {url!r}")
    return url.rstrip("/")


def forward(method: str, path: str, body: bytes | None = None) -> tuple[int, dict]:
    """The service's status and JSON answer; a service that is down or answers badly becomes a 502."""
    try:
        base = service_url()
    except ValueError as e:
        return 500, {"error": str(e)}
    request = urllib.request.Request(base + path, data=body, method=method,
                                     headers={"content-type": "application/json"} if body is not None else {})
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


@router.get("/hand")
async def hand():
    status, body = await asyncio.to_thread(forward, "GET", "/hand")
    return JSONResponse(body, status_code=status)


@router.post("/hand/{sub}")
async def hand_write(sub: str, request: Request):
    if sub not in HAND_WRITES:
        return JSONResponse({"error": f"没有这个接口：/hand/{sub}"}, status_code=404)
    status, body = await asyncio.to_thread(forward, "POST", f"/hand/{sub}", await request.body())
    return JSONResponse(body, status_code=status)


@router.get("/cards")
async def cards():
    status, body = await asyncio.to_thread(forward, "GET", "/cards")
    return JSONResponse(body, status_code=status)


@router.get("/card-image")
async def card_image(code: str):
    """The code is checked here so that nothing but digits reaches the service."""
    if not code.isdigit() or len(code) > 10:
        return JSONResponse({"error": "卡号要是数字"}, status_code=400)
    status, body = await asyncio.to_thread(forward, "GET", f"/card-image?code={code}")
    return JSONResponse(body, status_code=status)


@router.get("/quiz")
async def quiz():
    status, body = await asyncio.to_thread(forward, "GET", "/quiz")
    return JSONResponse(body, status_code=status)


@router.post("/quiz/{sub}")
async def quiz_write(sub: str, request: Request):
    if sub not in QUIZ_WRITES:
        return JSONResponse({"error": f"没有这个接口：/quiz/{sub}"}, status_code=404)
    status, body = await asyncio.to_thread(forward, "POST", f"/quiz/{sub}", await request.body())
    return JSONResponse(body, status_code=status)
