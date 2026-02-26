import asyncio
import asyncpg
import os

async def main():
    try:
        # User credentials
        conn = await asyncpg.connect(
            user='postgres',
            password='145913_Mss',
            database='coderite',
            host='129.213.157.87',
            port=5000
        )
        print("Successfully connected to the remote database.")
        
        # Check ai_connections
        rows = await conn.fetch('SELECT id, name, is_active FROM ai_connections')
        print("Current AI Connections in DB:")
        for row in rows:
            print(dict(row))
            
        # Count active
        active_rows = [r for r in rows if r['is_active']]
        print(f"Number of active connections: {len(active_rows)}")
        
        if len(active_rows) > 1:
            print("Fixing multiple active connections...")
            # Keep the first active one, deactivate the rest
            keep_id = active_rows[0]['id']
            await conn.execute(
                'UPDATE ai_connections SET is_active = False WHERE id != $1',
                keep_id
            )
            print(f"Kept connection ID {keep_id} active. Deactivated others.")
            
            # Verify changes
            rows_updated = await conn.fetch('SELECT id, name, is_active FROM ai_connections')
            for row in rows_updated:
                print(dict(row))
        else:
            print("No fix needed. Number of active connections is <= 1.")

        await conn.close()
    except Exception as e:
        print(f"Error connecting or querying database: {e}")

if __name__ == "__main__":
    asyncio.run(main())
