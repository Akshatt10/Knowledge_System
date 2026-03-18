import os
import logging
import tempfile
from pathlib import Path
from sqlalchemy.orm import Session
from app.services.auth import SessionLocal
from app.models.database import Document
from app.services.s3 import s3_service
from app.utils.encryption import encryption_service
from app.services.ingestion import ingest_document
from app.services.vectorstore import vector_store
from app.config import settings

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("migration")

def migrate_documents():
    """
    Downloads, decrypts, and re-indexes all documents from the DB into 
    the current Pinecone index (configured in .env).
    """
    db: Session = SessionLocal()
    try:
        documents = db.query(Document).all()
        logger.info(f"Found {len(documents)} documents to migrate.")

        for doc in documents:
            logger.info(f"Processing doc {doc.id}: {doc.filename} (User: {doc.user_id})")
            
            try:
                if not doc.s3_uri:
                    logger.warning(f"Skipping doc {doc.id}: No s3_uri found.")
                    continue

                # 1. Derive S3 object key
                object_key = doc.s3_uri.replace(f"s3://{settings.S3_BUCKET_NAME}/", "")

                # 2. Download encrypted file from S3
                encrypted_bytes = s3_service.download_file(object_key)
                
                # 3. Decrypt DEK and then the file
                dek = encryption_service.decrypt_dek(doc.encrypted_dek)
                decrypted_bytes = encryption_service.decrypt_file(encrypted_bytes, dek)
                
                # 3. Save to a temporary file so the ingestion loaders can read it
                suffix = f".{doc.file_type}" if doc.file_type else ".tmp"
                with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                    tmp.write(decrypted_bytes)
                    tmp_path = tmp.name

                try:
                    # 4. Re-ingest into the NEW index
                    # Note: We don't want to create a new DB record, we just want the vectors.
                    # ingest_document usually creates its own UUIDs and DB records, so we'll 
                    # use the internal logic directly or wrap it.
                    
                    # For this migration, we'll manually call the chunking/vectorization part
                    # to keep the existing document_id and metadata consistent.
                    from langchain_community.document_loaders import PyPDFLoader, TextLoader, Docx2txtLoader
                    from langchain_text_splitters import RecursiveCharacterTextSplitter
                    from langchain_core.documents import Document as LCDocument

                    loader_map = {
                        "pdf": PyPDFLoader,
                        "txt": TextLoader,
                        "docx": Docx2txtLoader,
                    }
                    loader_class = loader_map.get(doc.file_type.lower(), TextLoader)
                    loader = loader_class(tmp_path)
                    raw_docs = loader.load()

                    splitter = RecursiveCharacterTextSplitter(
                        chunk_size=settings.CHUNK_SIZE or 1000,
                        chunk_overlap=settings.CHUNK_OVERLAP or 150,
                    )
                    chunks = splitter.split_documents(raw_docs)
                    
                    # Prepare chunks with ORIGINAL metadata to ensure continuity
                    processed_chunks = []
                    for i, chunk in enumerate(chunks):
                        chunk.page_content = f"[Source: {doc.filename}]\n{chunk.page_content}"
                        chunk.metadata.update({
                            "user_id": doc.user_id,
                            "document_id": doc.id,
                            "filename": doc.filename,
                            "file_type": doc.file_type,
                            "chunk_index": i,
                            "uploaded_at": doc.uploaded_at.isoformat() if doc.uploaded_at else ""
                        })
                        processed_chunks.append(chunk)

                    # THIS is where the Hybrid magic happens (dense + sparse)
                    vector_store.add_documents(processed_chunks)
                    logger.info(f"SUCCESS: Migrated {len(processed_chunks)} chunks for {doc.filename}")

                finally:
                    # Clean up temp file
                    if os.path.exists(tmp_path):
                        os.remove(tmp_path)

            except Exception as e:
                logger.error(f"FAILED to migrate document {doc.id} ({doc.filename}): {str(e)}")

        logger.info("Migration complete!")

    finally:
        db.close()

if __name__ == "__main__":
    confirm = input("This will re-index all documents into the index specified in .env. Continue? (y/n): ")
    if confirm.lower() == 'y':
        migrate_documents()
    else:
        logger.info("Migration cancelled.")
