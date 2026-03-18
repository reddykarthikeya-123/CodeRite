"""Security utilities for encryption and authentication."""
from cryptography.fernet import Fernet
import os
import logging

logger = logging.getLogger(__name__)

# Get encryption key from environment or generate new one (for development only)
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")

if not ENCRYPTION_KEY:
    # Generate a new key for development (in production, this should be from env)
    ENCRYPTION_KEY = Fernet.generate_key().decode()
    logger.warning("Generated new encryption key. Set ENCRYPTION_KEY environment variable in production.")

cipher = Fernet(ENCRYPTION_KEY.encode())


def encrypt_api_key(api_key: str) -> str:
    """Encrypt an API key for storage.
    
    Args:
        api_key: The plaintext API key to encrypt.
        
    Returns:
        The encrypted API key as a base64-encoded string.
        
    Raises:
        ValueError: If api_key is empty or None.
    """
    if not api_key:
        raise ValueError("API key cannot be empty")
    
    encrypted = cipher.encrypt(api_key.encode())
    return encrypted.decode()


def decrypt_api_key(encrypted_key: str) -> str:
    """Decrypt an API key from storage.
    
    Args:
        encrypted_key: The encrypted API key to decrypt.
        
    Returns:
        The decrypted plaintext API key.
        
    Raises:
        ValueError: If encrypted_key is invalid or None.
    """
    if not encrypted_key:
        raise ValueError("Encrypted key cannot be empty")
    
    try:
        decrypted = cipher.decrypt(encrypted_key.encode())
        return decrypted.decode()
    except Exception as e:
        logger.error(f"Failed to decrypt API key: {e}")
        raise ValueError("Invalid encrypted key")


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
