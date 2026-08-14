"""Simple JSON file persistence (used for user-submitted hazards)."""
from __future__ import annotations

import json
import os
import threading
from pathlib import Path


class JsonStore:
    """Thread-safe JSON file store with atomic writes."""

    def __init__(self, path: str | Path, default: list | dict):
        self.path = Path(path)
        self.default = default
        self._lock = threading.Lock()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._data = self._load()

    def _load(self):
        if self.path.exists():
            try:
                with open(self.path, "r", encoding="utf-8") as fh:
                    return json.load(fh)
            except (json.JSONDecodeError, OSError):
                pass
        return json.loads(json.dumps(self.default))

    def get(self):
        with self._lock:
            return json.loads(json.dumps(self._data))

    def set(self, value):
        with self._lock:
            self._data = json.loads(json.dumps(value))
            tmp = self.path.with_suffix(".tmp")
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(self._data, fh, indent=2)
            os.replace(tmp, self.path)
