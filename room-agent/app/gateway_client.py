"""Gateway request stubs for RoomAgent runtime integration."""

from __future__ import annotations

from config.settings import AgentSettings


class GatewayClient:
    """Placeholder HTTP client for backend gateway integration."""

    async def register_agent(self, agent: AgentSettings) -> None:
        """Send the startup registration request to the backend gateway."""
        return None

    async def send_heartbeat(self, agent: AgentSettings) -> None:
        """Send a heartbeat request to the backend gateway."""
        return None
