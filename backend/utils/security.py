"""Security utilities for encryption and authentication."""
import logging

logger = logging.getLogger(__name__)
def mask_api_key(api_key: str) -> str:
    """Mask an API key for display purposes.
    
    Args:
        api_key: The API key to mask.
        
    Returns:
        A masked version of the API key (e.g., "sk-...abc123").
    """
    if not api_key:
        return ""
    
    if len(api_key) <= 8:
        return "*" * len(api_key)
    
    return f"{api_key[:4]}...{api_key[-4:]}"
