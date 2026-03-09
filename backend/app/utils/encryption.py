import os
import base64
import logging
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from app.config import settings

logger = logging.getLogger(__name__)

class EncryptionService:
    def __init__(self):
        self.master_key_b64 = settings.DOCUMENT_ENCRYPTION_KEY
        if not self.master_key_b64:
            logger.warning("DOCUMENT_ENCRYPTION_KEY is not set. Encryption will fail.")
            self.master_key = None
        else:
            try:
                self.master_key = base64.b64decode(self.master_key_b64)
                if len(self.master_key) != 32:
                    raise ValueError("Master key must be exactly 32 bytes (256 bits).")
            except Exception as e:
                logger.error(f"Failed to decode master key: {e}")
                self.master_key = None

    def generate_dek(self) -> bytes:
        """Generate a random 32-byte Data Encryption Key (DEK)."""
        return os.urandom(32)

    def encrypt_dek(self, dek: bytes) -> str:
        """Encrypt the DEK using the Master Key and return as base64 string."""
        if not self.master_key:
            raise ValueError("Master key not initialized.")
        
        aesgcm = AESGCM(self.master_key)
        iv = os.urandom(12) # 12-byte IV for GCM
        ciphertext = aesgcm.encrypt(iv, dek, None)
        # Store as [IV][Ciphertext]
        return base64.b64encode(iv + ciphertext).decode()

    def decrypt_dek(self, encrypted_dek_b64: str) -> bytes:
        """Decrypt the DEK using the Master Key."""
        if not self.master_key:
            raise ValueError("Master key not initialized.")
            
        data = base64.b64decode(encrypted_dek_b64)
        iv = data[:12]
        ciphertext = data[12:]
        
        aesgcm = AESGCM(self.master_key)
        return aesgcm.decrypt(iv, ciphertext, None)

    def encrypt_file(self, file_bytes: bytes, dek: bytes) -> bytes:
        """Encrypt file bytes using a DEK (AES-256 GCM)."""
        aesgcm = AESGCM(dek)
        iv = os.urandom(12)
        ciphertext = aesgcm.encrypt(iv, file_bytes, None)
        # Return [IV][Ciphertext] (Note: GCM ciphertext includes the 16-byte Auth Tag at the end)
        return iv + ciphertext

    def decrypt_file(self, encrypted_bytes: bytes, dek: bytes) -> bytes:
        """Decrypt file bytes using a DEK."""
        iv = encrypted_bytes[:12]
        ciphertext = encrypted_bytes[12:]
        
        aesgcm = AESGCM(dek)
        return aesgcm.decrypt(iv, ciphertext, None)

encryption_service = EncryptionService()
