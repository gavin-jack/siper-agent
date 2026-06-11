"""
URL Safety Checks — blocks requests to private/internal network addresses.

Prevents SSRF (Server-Side Request Forgery) where a malicious prompt could
trick the agent into fetching internal resources like cloud metadata endpoints
(169.254.169.254), localhost services, or private network hosts.
"""

import ipaddress
import logging
import socket
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# Hostnames that should always be blocked regardless of any config toggle.
_BLOCKED_HOSTNAMES = frozenset({
    "metadata.google.internal",
    "metadata.goog",
})

# Cloud metadata IPs — always blocked, the #1 SSRF target.
_ALWAYS_BLOCKED_IPS = frozenset({
    ipaddress.ip_address("169.254.169.254"),  # AWS/GCP/Azure/DO/Oracle metadata
    ipaddress.ip_address("169.254.170.2"),     # AWS ECS task metadata
    ipaddress.ip_address("169.254.169.253"),   # Azure IMDS wire server
    ipaddress.ip_address("fd00:ec2::254"),     # AWS metadata (IPv6)
    ipaddress.ip_address("100.100.100.200"),   # Alibaba Cloud metadata
})
_ALWAYS_BLOCKED_NETWORKS = (
    ipaddress.ip_network("169.254.0.0/16"),    # Entire link-local range
)

# CGNAT range (100.64.0.0/10) not covered by ipaddress.is_private
_CGNAT_NETWORK = ipaddress.ip_network("100.64.0.0/10")


def _is_blocked_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Return True if the IP should be blocked."""
    # Always block loopback, multicast, unspecified
    if ip.is_loopback or ip.is_multicast or ip.is_unspecified:
        return True
    # IPv4: standard private ranges + CGNAT
    if isinstance(ip, ipaddress.IPv4Address):
        if ip.is_private or ip.is_reserved or ip.is_link_local:
            return True
        if ip in _CGNAT_NETWORK:
            return True
        return False
    # IPv6: only block specific ranges, NOT is_private (which catches 2001::/32 docs range)
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.is_link_local or ip.is_site_local:
            return True
        # Unique local addresses (fc00::/7)
        if ip in ipaddress.ip_network("fc00::/7"):
            return True
        return False
    return False


def is_safe_url(url: str) -> bool:
    """Return True if the URL target is not a private/internal address.

    Resolves the hostname to an IP and checks against private ranges.
    Fails closed: DNS errors and unexpected exceptions block the request.

    Cloud metadata endpoints (169.254.169.254, metadata.google.internal)
    remain blocked regardless.
    """
    try:
        parsed = urlparse(url)
        hostname = (parsed.hostname or "").strip().lower().rstrip(".")
        if not hostname:
            return False

        # Block known internal hostnames — ALWAYS
        if hostname in _BLOCKED_HOSTNAMES:
            logger.warning("Blocked request to internal hostname: %s", hostname)
            return False

        # Try to resolve and check IP
        try:
            addr_info = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
        except socket.gaierror:
            # DNS resolution failed — fail closed
            logger.warning("Blocked request — DNS resolution failed for: %s", hostname)
            return False

        for family, _, _, _, sockaddr in addr_info:
            ip_str = sockaddr[0]
            try:
                ip = ipaddress.ip_address(ip_str)
            except ValueError:
                continue

            # Always block cloud metadata IPs and link-local
            if ip in _ALWAYS_BLOCKED_IPS or any(ip in net for net in _ALWAYS_BLOCKED_NETWORKS):
                logger.warning("Blocked request to cloud metadata address: %s -> %s", hostname, ip_str)
                return False

            if _is_blocked_ip(ip):
                logger.warning("Blocked request to private/internal address: %s -> %s", hostname, ip_str)
                return False

        return True

    except Exception as exc:
        logger.warning("Blocked request — URL safety check error for %s: %s", url, exc)
        return False
