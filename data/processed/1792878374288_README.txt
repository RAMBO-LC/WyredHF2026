SharedBrain Local Production RAG - Drop Folder
=============================================
Drop any .md, .txt, .json, .csv, or code files here.
The local ingestion engine will automatically:
  1. Store raw content and compute SHA-256 hash.
  2. Split into hierarchical chunks with byte offsets.
  3. Distill actionable decisions, constraints, conventions, and bug fixes.
  4. Enforce Invariants I1-I8 (verbatim evidence verification).
  5. Index into SQLite WAL FTS5 and update the interactive Knowledge Graph.
  6. Move the processed file to ./data/processed/

Live production active!
