from fastapi import WebSocket
from typing import List

class ConnectionManager:
    _instance = None
    
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    @classmethod
    def get_instance(cls) -> "ConnectionManager":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
    
    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
    
    async def send_progress(self, current: int, total: int, message: str):
        data = {
            "type": "progress",
            "current": current,
            "total": total,
            "message": message,
            "percent": round((current / total) * 100, 1) if total > 0 else 0
        }
        await self._broadcast(data)
    
    async def send_log(self, level: str, message: str, source: str = "backend"):
        data = {
            "type": "log",
            "level": level,
            "message": message,
            "source": source
        }
        await self._broadcast(data)
    
    async def _broadcast(self, data: dict):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(data)
            except Exception:
                disconnected.append(connection)
        
        for conn in disconnected:
            self.disconnect(conn)
