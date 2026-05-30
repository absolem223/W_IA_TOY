# Memory System

The memory system provides the AI with persistent context across sessions without relying on cloud services. It is strictly local-first and currently uses crash-safe JSON files plus heuristic retrieval. Vector search and SQLite-backed indexing are planned for a later phase.

## Architecture
Located in `src/main/memory/`.

### 1. Working Memory (`working/working.json`)
- Recent turn buffer for the current conversational flow.
- Tracks active topics, turn count, reflection score, and session metadata.
- Flushed periodically with atomic writes.

### 2. Episodic Memory (`episodic/episodic.json`)
- Stores summarized sessions and concrete events.
- Intended for continuity, temporal context, and task carryover.

### 3. Semantic Memory (`semantic/semantic.json`)
- Stores user profile facts, recurring patterns, technical stack, and assistant identity.
- Profile and identity are injected into the prompt as structured context.

### 4. Vault Memory (`vault/index.json` + `vault/entries/*.md`)
- Stores explicit long-term memories added by the user.
- Uses title and tags for current retrieval.

### 5. Cognitive Layer (`CognitiveLayer.ts`)
- Tracks active topic, recent intents, topic graph, and context pressure.
- Routes retrieved memories toward the current focus.

### 6. Engram Layer (planned)
- See `docs/ENGRAM_ARCHITECTURE.md`.
- Adds behavioral, relational, semantic, and episodic engrams that can modify response behavior.

## Migrations
To bootstrap memory, `/migrate` imports local chat history into working memory. Future migrations should also extract episodic summaries, semantic facts, and behavioral engram candidates.

## Slash Commands
- `/memory` (Status)
- `/vault add <topic> | <content> | [tags]`
- `/vault rm <id>`
- `/profile set <key> | <value>`
- `/profile rm <key>`
- `/migrate`
