<p align="center">
  <img src="public/assets/logo.svg" width="64" height="64" alt="SharedBrain logo">
</p>

<h1 align="center">SharedBrain</h1>

<p align="center">
  Persistent, shared memory for AI agents. Local-first, cited, and honest about what it doesn't know.
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#macos-app">macOS app</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="#api">API</a>
</p>

---

SharedBrain is a knowledge base with a multi-agent answer pipeline. A Researcher, an Analyst, a Writer and a Critic all read from and write to **one SQLite database**. Every answer cites the document sections it came from. When the knowledge base doesn't cover a question, SharedBrain declines instead of guessing.

It runs as a single Node.js process with no external services and no required API key.

- **Ask** questions and watch each agent stage stream in with real timings.
- **Knowledge**: write Markdown notes with `[[wikilinks]]`, import files, or drag them onto the page.
- **Graph**: explore how documents link together.
- **Console**: review distilled memories, build context packs, and back up the database.
- **Docs**: full documentation, served by the app at `/docs`.

## Quick start

Requires Node.js 20 or newer.

```bash
npm install
npm run serve
```

Open http://localhost:3000. The first run seeds a sample knowledge base about a fictional API platform, so you can try:

- *What are the rate limiting tiers?*
- *How do I roll back a SEV-1 incident?*
- *What is the capital of France?* (declined: nothing in the knowledge base covers it)

## macOS app

`SharedBrain-1.0.0-arm64.dmg` is a native app that bundles its own Node.js runtime, so nothing else needs to be installed. It needs an Apple silicon Mac running macOS 13 or later.

1. Open the DMG and drag **SharedBrain** into **Applications**.
2. The app isn't notarized. The first time, right-click it and choose **Open**. If macOS still blocks it, use **System Settings → Privacy & Security → Open Anyway**.
3. If macOS reports the app as damaged (common after AirDrop), run this once:

   ```bash
   xattr -dr com.apple.quarantine /Applications/SharedBrain.app
   ```

Data is stored in `~/Library/Application Support/SharedBrain`. The **File** menu opens the drop folder, the data folder, the settings file, and the server log.

To rebuild the DMG yourself on a Mac:

```bash
npm run app:dmg
```

## How it works

| Agent | Stage | What it does |
| --- | --- | --- |
| Researcher | Retrieval | Splits documents into heading sections and ranks them, along with ingested chunks and distilled memories, with BM25. |
| Analyst | Scope check | Measures how many of the question's terms the top passages cover, and declines below 50%. |
| Writer | Answer | Writes a cited answer with the configured LLM, or quotes the most relevant lines when no model is set. |
| Critic | Grounding check | Reports the share of the answer's terms that appear in the sources. |

Files you import are also **distilled**: decisions, constraints, conventions and bug fixes become memories, each stored with the verbatim quote and byte offsets it came from. Memories move through a reviewed lifecycle (`suggested → approved → archived/superseded`) and can be bundled into token-budgeted **context packs** for other agents.

```
src/
  core/          schema, BM25 retrieval, RAG engine, ingestion, memory transitions, context packs
  agents/        Researcher, Analyst, Writer, Critic (used by the CLI workflow)
  server/        Express server, /api routes, /v1 memory-engine router
  cli/           command-line interface
public/          web UI (plain HTML/CSS/JS, no build step, works offline)
macos/           native Swift wrapper and DMG build script
```

## Configuration

Copy `.env.example` to `.env`. Everything is optional.

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | – | Written answers through any OpenAI-compatible API |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Ollama, LM Studio, OpenRouter, Groq, … |
| `OPENAI_MODEL` | `gpt-4o` | Model name |
| `GEMINI_API_KEY` | – | Use Gemini instead (when no OpenAI key is set) |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model name |
| `DATABASE_PATH` | `./data/shared_brain.db` | SQLite file |
| `DATA_INCOMING_DIR` | `./data/incoming` | Drop folder watched for new files |
| `PORT` | `3000` | HTTP port. The next free port is used if it's taken |

Fully offline with Ollama:

```env
OPENAI_API_KEY=ollama
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_MODEL=llama3.1
```

## API

```bash
# Add a document (it is chunked and distilled into memories)
curl -s localhost:3000/api/ingest -H 'content-type: application/json' \
  -d '{"title":"Deploy policy","content":"# Deploy policy\nWe never deploy on Fridays."}'

# Ask a question
curl -s localhost:3000/api/ask -H 'content-type: application/json' \
  -d '{"question":"Can we deploy on Friday?"}'
```

`POST /v1/chat/completions` is an OpenAI-compatible endpoint that injects grounded context, so tools like AnythingLLM or Open WebUI can use SharedBrain as a model. See `/docs#api` in the running app for the full reference.

## CLI

```bash
npm run cli -- ask "How do webhook retries work?"
npm run cli -- run "Compare SQLite WAL and Postgres for an edge cache"
npm run cli -- memory stats
npm run demo
```

## Development

```bash
npm test          # unit tests (vitest)
npm run eval      # retrieval benchmark (recall@5 / precision@5)
npm run accept    # verifies the eight memory-engine invariants
npm run build     # compile to dist/
npm start         # run the compiled server
docker compose up --build
```

## License

[MIT](LICENSE)
