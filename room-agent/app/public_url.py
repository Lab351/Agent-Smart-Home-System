"""Resolve the RoomAgent public HTTP URL advertised through A2A discovery."""

from __future__ import annotations

import ipaddress
import socket
import subprocess
from collections.abc import Iterable
from urllib.parse import urlparse

from config.settings import GatewaySettings, Settings


class PublicUrlResolutionError(RuntimeError):
    """Raised when no phone-reachable RoomAgent URL can be resolved."""


def resolve_public_agent_url(settings: Settings, bind_host: str, port: int) -> str:
    """Resolve the public URL for qwen-backend registration and agent-card publishing."""
    gateway = settings.agent.gateway
    if gateway is None:
        raise PublicUrlResolutionError("Gateway settings are required to resolve public URL.")

    return _resolve_reachable_agent_url(gateway=gateway, bind_host=bind_host, port=port)


def resolve_agent_card_url(settings: Settings, bind_host: str, port: int) -> str:
    """Resolve the URL advertised in the A2A AgentCard."""
    try:
        return _resolve_reachable_agent_url(
            gateway=settings.agent.gateway,
            bind_host=bind_host,
            port=port,
        )
    except PublicUrlResolutionError:
        loopback_url = _loopback_url_or_none(bind_host, port)
        if loopback_url is not None:
            return loopback_url
        raise


def _resolve_reachable_agent_url(
    *,
    gateway: GatewaySettings | None,
    bind_host: str,
    port: int,
) -> str:
    configured_host = (gateway.agent_host or "").strip() if gateway is not None else ""
    if configured_host:
        return _normalize_url(configured_host)

    if gateway is not None:
        route_ip = _detect_route_local_ip(gateway.url)
        if route_ip is not None:
            return _build_http_url(route_ip, port)

    bind_ip = _valid_ipv4_or_none(bind_host)
    if bind_ip is not None:
        return _build_http_url(bind_ip, port)

    fallback_ip = next(_valid_ipv4_candidates(_enumerate_host_ipv4_candidates()), None)
    if fallback_ip is not None:
        return _build_http_url(fallback_ip, port)

    raise PublicUrlResolutionError(
        "Unable to detect a non-loopback IPv4 address for RoomAgent. "
        "Set gateway.agent_host explicitly if this deployment uses a fixed public URL."
    )


def _normalize_url(value: str) -> str:
    return value.rstrip("/") + "/"


def _build_http_url(host: str, port: int) -> str:
    return f"http://{host}:{port}/"


def _loopback_url_or_none(host: str, port: int) -> str | None:
    if host == "localhost":
        return _build_http_url(host, port)

    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return None

    if address.version == 4 and address.is_loopback:
        return _build_http_url(str(address), port)

    return None


def _detect_route_local_ip(gateway_url: str) -> str | None:
    parsed = urlparse(gateway_url)
    target_host = parsed.hostname
    if not target_host:
        return None

    target_port = parsed.port
    if target_port is None:
        target_port = 443 if parsed.scheme == "https" else 80

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect((target_host, target_port))
            local_ip = sock.getsockname()[0]
    except OSError:
        return None

    return _valid_ipv4_or_none(local_ip)


def _enumerate_host_ipv4_candidates() -> list[str]:
    candidates: list[str] = []
    candidates.extend(_enumerate_ip_command_ipv4_candidates())
    candidates.extend(_enumerate_socket_ipv4_candidates())
    return candidates


def _enumerate_ip_command_ipv4_candidates() -> list[str]:
    try:
        output = subprocess.check_output(
            ["ip", "-o", "-4", "addr", "show", "scope", "global"],
            text=True,
            stderr=subprocess.DEVNULL,
            timeout=2,
        )
    except (OSError, subprocess.SubprocessError):
        return []

    candidates: list[str] = []
    for line in output.splitlines():
        parts = line.split()
        if "inet" not in parts:
            continue
        address = parts[parts.index("inet") + 1]
        candidates.append(address.split("/", 1)[0])
    return candidates


def _enumerate_socket_ipv4_candidates() -> list[str]:
    candidates: list[str] = []
    hostnames = {socket.gethostname(), socket.getfqdn(), "localhost"}
    for hostname in hostnames:
        try:
            infos = socket.getaddrinfo(hostname, None, family=socket.AF_INET)
        except OSError:
            continue
        candidates.extend(info[4][0] for info in infos)
    return candidates


def _valid_ipv4_candidates(values: Iterable[str]) -> Iterable[str]:
    seen: set[str] = set()
    for value in values:
        ip = _valid_ipv4_or_none(value)
        if ip is not None and ip not in seen:
            seen.add(ip)
            yield ip


def _valid_ipv4_or_none(value: str | None) -> str | None:
    if not value:
        return None

    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        return None

    if (
        address.version != 4
        or address.is_loopback
        or address.is_unspecified
        or address.is_link_local
        or address.is_multicast
    ):
        return None

    return str(address)
