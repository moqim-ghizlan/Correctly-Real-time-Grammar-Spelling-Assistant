from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    port: int = 8081
    startup_timeout: float = 90
    probe_timeout: float = 3
    poll_interval: float = 0.5
    monitor_interval: float = 15
    stop_timeout: float = 5
    # Keep the V2 JVM defaults until measurements justify a memory limit.

    def __post_init__(self):
        if not 1 <= self.port <= 65535:
            raise ValueError("Invalid port")
        for name in ("startup_timeout", "probe_timeout", "poll_interval",
                     "monitor_interval", "stop_timeout"):
            if getattr(self, name) <= 0:
                raise ValueError("Timeouts must be positive")
