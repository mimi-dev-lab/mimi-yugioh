"""yugioh: 游戏王 in the web workspace (mimi-dev-lab/mimi-yugioh).

The backend is dashboard/plugin_api.py (mounted at /api/plugins/yugioh/) and the page is webapp/plugin.js.
register() only lets `hermes plugins` list and enable it.
"""

from __future__ import annotations


def register(ctx) -> None:  # noqa: ARG001 — no tools or hooks to register
    return None
