
import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from app.config import settings

async def migrate():
    # Construct async URL from sync one if needed, or just use the constructed one
    # The current DATABASE_URL is postgresql+psycopg://... which is compatible with async psycopg
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
        
        print("Migration completed successfully.")
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(migrate())
