"""Shorten historical session_ids from 36-char UUID to 20-char hex in all sessions.db files."""
import sqlite3
import os
import glob

def shorten_id(old_id):
    """Take first 20 chars of hex (strip dashes, take 20)."""
    hex_part = old_id.replace('-', '')
    return hex_part[:20]

def process_db(db_path):
    print(f"\nProcessing: {db_path}")
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    # Check sessions table
    c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'")
    has_sessions = c.fetchone() is not None
    
    if has_sessions:
        c.execute("SELECT session_id FROM sessions")
        rows = c.fetchall()
        print(f"  sessions table: {len(rows)} rows")
        for (sid,) in rows:
            new_sid = shorten_id(sid)
            if new_sid != sid:
                # Update session_id in sessions table
                c.execute("UPDATE sessions SET session_id=? WHERE session_id=?", (new_sid, sid))
                # Update session_id in messages table
                c.execute("UPDATE messages SET session_id=? WHERE session_id=?", (new_sid, sid))
                print(f"  {sid} -> {new_sid}")
    
    # Also check messages table for any orphaned session_ids
    c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'")
    has_messages = c.fetchone() is not None
    
    if has_messages:
        c.execute("SELECT DISTINCT session_id FROM messages")
        msg_sids = c.fetchall()
        print(f"  messages table: {len(msg_sids)} distinct session_ids")
    
    conn.commit()
    conn.close()
    print(f"  Done.")

# Find all sessions.db files
for db_path in glob.glob('/home/gavin/.siper/agents/*/sessions/sessions.db'):
    process_db(db_path)

print("\nAll done.")
