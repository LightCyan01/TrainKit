from __future__ import annotations

from typing import Any

from fastapi import WebSocket

from config.settings import DESKTOP_ORIGIN
from core.auth import token_is_valid


class ConnectionManager:
    _instance: ConnectionManager | None = None

    def __init__(self):
        self.active_connections: list[WebSocket] = []

    @classmethod
    def get_instance(cls) -> ConnectionManager:
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    async def connect(self, websocket: WebSocket) -> bool:
        token = websocket.headers.get("x-trainkit-token")
        origin = websocket.headers.get("origin")
        if not token_is_valid(token):
            await websocket.close(code=4401, reason="Unauthorized")
            return False
        if origin != DESKTOP_ORIGIN:
            await websocket.close(code=4403, reason="Invalid origin")
            return False
        await websocket.accept()
        self.active_connections.append(websocket)
        return True

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def send_job(self, job: dict[str, Any]):
        await self._broadcast({"type": "job", **job})

    async def send_log(self, level: str, message: str, source: str = "backend"):
        await self._broadcast({"type": "log", "level": level, "message": message, "source": source})

    async def _broadcast(self, data: dict[str, Any]):
        disconnected: list[WebSocket] = []
        for connection in list(self.active_connections):
            try:
                await connection.send_json(data)
            except Exception:
                disconnected.append(connection)
        for connection in disconnected:
            self.disconnect(connection)

    async def close_all(self):
        for connection in list(self.active_connections):
            try:
                await connection.close(code=1001)
            except Exception:
                pass
        self.active_connections.clear()
