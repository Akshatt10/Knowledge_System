
import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from app.config import settings

async def migrate():
    db_url = settings.DATABASE_URL
    print(f"Connecting to {db_url}")
    
    engine = create_async_engine(db_url)
    
    async with engine.begin() as conn:
        # 1. Add confidence_score to query_logs if it doesn't exist
        print("Checking query_logs table...")
        await conn.execute(text("""
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                               WHERE table_name='query_logs' AND column_name='confidence_score') THEN
                    ALTER TABLE query_logs ADD COLUMN confidence_score FLOAT DEFAULT 0.0;
                    RAISE NOTICE 'Added confidence_score column to query_logs';
                END IF;
            END $$;
        """))
        
        # 2. Create query_feedbacks table if it doesn't exist
        print("Checking query_feedbacks table...")
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS query_feedbacks (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                query_id VARCHAR(36) NOT NULL,
                feedback INTEGER NOT NULL,
                created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() at time zone 'utc')
            );
        """))

        # ── Feature 1: Document summary ──────────────────────────────
        print("Adding summary column to documents...")
        await conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                               WHERE table_name='documents' AND column_name='summary') THEN
                    ALTER TABLE documents ADD COLUMN summary TEXT;
                    RAISE NOTICE 'Added summary column to documents';
                END IF;
            END $$;
        """))

        # ── Feature 2 & 3: Answer snapshot, follow-ups, annotation ───
        print("Adding answer_text, follow_up_questions, user_annotation to query_logs...")
        await conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                               WHERE table_name='query_logs' AND column_name='answer_text') THEN
                    ALTER TABLE query_logs ADD COLUMN answer_text TEXT;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                               WHERE table_name='query_logs' AND column_name='follow_up_questions') THEN
                    ALTER TABLE query_logs ADD COLUMN follow_up_questions JSONB;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                               WHERE table_name='query_logs' AND column_name='user_annotation') THEN
                    ALTER TABLE query_logs ADD COLUMN user_annotation TEXT;
                END IF;
            END $$;
        """))
        
        print("Migration completed successfully.")
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(migrate())
