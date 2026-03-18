"""Database configuration and session management.

This module sets up the SQLAlchemy async engine and provides a dependency
for retrieving database sessions.
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
import os
import sys
import logging

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("CRITICAL: DATABASE_URL environment variable is not set. Exiting.")
    sys.exit(1)

# Disable SQL query logging in production (enable only for debugging via SQL_ECHO=true)
echo_sql = os.getenv("SQL_ECHO", "false").lower() == "true"
engine = create_async_engine(DATABASE_URL, echo=echo_sql)

AsyncSessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
)

Base = declarative_base()

async def get_db():
    """Dependency that provides an async database session.

    Yields:
        An AsyncSession object for database operations.
        
    Raises:
        Exception: If database operation fails, logs error and re-raises.
    """
    try:
        async with AsyncSessionLocal() as session:
            yield session
    except Exception as e:
        logger.error(f"Database session error: {e}", exc_info=True)
        raise
