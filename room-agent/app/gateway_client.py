"""Gateway request stubs for RoomAgent runtime integration."""

from __future__ import annotations

import logging

import httpx
from config.settings import AgentSettings

logger = logging.getLogger(__name__)


class GatewayClient:
    """HTTP client for backend gateway integration."""

    def __init__(self, gateway_url: str) -> None:
        """Initialize the gateway client with the registry URL."""
        self.gateway_url = gateway_url.rstrip("/")
        self.client = httpx.AsyncClient(timeout=30.0)

    async def register_agent(self, agent: AgentSettings) -> dict | None:
        """Send the startup registration request to the backend gateway.
        
        Args:
            agent: Agent settings containing registration information.
            
        Returns:
            Response data from the gateway, or None if registration failed.
        """
        if not agent.gateway:
            logger.warning("Agent gateway settings not configured, skipping registration")
            return None

        try:
            # Build the AgentCardDto payload
            payload = {
                "id": agent.id,
                "name": agent.id,  # Use agent id as name if not specified
                "description": f"Room agent for {agent.room_id}",
                "agent_type": "room",
                "version": agent.version,
                "url": f"http://{agent.gateway.agent_host}",
            }

            register_url = f"{self.gateway_url}/api/registry/register"
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(register_url, json=payload)
                response.raise_for_status()
                logger.info(f"Agent {agent.id} registered successfully")
                return response.json()
        except httpx.HTTPError as e:
            logger.warning(f"Failed to register agent {agent.id}: {e}")
            return None
        except Exception as e:
            logger.warning(f"Unexpected error during agent registration: {e}")
            return None

    async def send_heartbeat(self, agent: AgentSettings) -> dict | None:
        """Send a heartbeat request to the backend gateway.
        
        Args:
            agent: Agent settings containing the agent ID.
            
        Returns:
            Response data from the gateway, or None if heartbeat failed.
        """
        if not agent.gateway:
            logger.warning("Agent gateway settings not configured, skipping heartbeat")
            return None

        try:
            heartbeat_url = f"{self.gateway_url}/api/registry/{agent.id}/heartbeat"
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(heartbeat_url)
                response.raise_for_status()
                return response.json()
        except httpx.HTTPError as e:
            logger.warning(f"Failed to send heartbeat for agent {agent.id}: {e}")
            return None
        except Exception as e:
            logger.warning(f"Unexpected error during heartbeat: {e}")
            return None

    async def close(self) -> None:
        """Close the async HTTP client."""
        await self.client.aclose()
