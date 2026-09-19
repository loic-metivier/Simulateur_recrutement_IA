"""Optional IPv4 transport for Gemini on hosts with broken IPv6 geolocation.

Scoped to the Google GenAI Live WebSocket client. TLS, hostname verification,
credentials and the Google endpoint are unchanged; LiveKit keeps its own network.
"""
import os
import socket
from functools import wraps
from urllib.parse import urlsplit


def configure_gemini_network():
    if os.getenv('GEMINI_FORCE_IPV4', '').lower() not in ('1', 'true', 'yes'):
        return
    from google.genai import live
    original = live.ws_connect
    if getattr(original, '_gemini_ipv4', False) is True:
        return

    @wraps(original)
    def connect(uri, *args, **kwargs):
        if urlsplit(uri).hostname == 'generativelanguage.googleapis.com':
            kwargs['family'] = socket.AF_INET
        return original(uri, *args, **kwargs)

    connect._gemini_ipv4 = True
    live.ws_connect = connect
