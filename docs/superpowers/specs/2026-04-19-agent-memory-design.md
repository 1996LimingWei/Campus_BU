# Agent Memory Design

## Goal

Add an agent memory mechanism that lets the LLM decide whether to store a memory, what key to use, and what non-predefined information to persist, while keeping programmatic guardrails that prevent noisy or unsafe memories from being written.

The target user experience is:

- The user does not need to confirm each memory write.
- The LLM can propose new memory keys instead of being limited to a fixed enum.
- The system only stores durable, useful user facts.
- Memory storage stays maintainable over time.

## Non-Goals

- No per-memory user confirmation flow in v1.
- No fully unbounded raw transcript storage.
- No semantic vector memory in v1.
- No complicated memory deletion, merge conflict resolution, or version graph in v1.

## Current State

The codebase already has a lightweight persistent memory layer:

- [`services/agent/memory.ts`](C:/Users/Tim/Documents/GitHub/CampusCopy/services/agent/memory.ts:1) stores arbitrary `fact_key` / `fact_value` pairs in `agent_memory`.
- [`services/agent/stable_tasks.ts`](C:/Users/Tim/Documents/GitHub/CampusCopy/services/agent/stable_tasks.ts:1) handles a few explicit memory read/write cases through regex rules.
- [`services/agent/executor.ts`](C:/Users/Tim/Documents/GitHub/CampusCopy/services/agent/executor.ts:1051) can prepare and execute memory writes, but the logic still assumes relatively fixed keys and explicit memory intents.

This means storage is already flexible enough. The missing piece is a better decision layer for when to store memory and how to normalize model-proposed keys.

## Chosen Approach

Use `LLM decision + programmatic filtering`.

Flow:

1. The main agent completes its normal reply.
2. A lightweight memory extraction pass runs on the recent conversation window.
3. The LLM proposes zero or more candidate memories in a structured format.
4. Programmatic filters reject low-value, temporary, malformed, or sensitive candidates.
5. Accepted candidates have their keys normalized before persistence.
6. The system writes accepted candidates to `agent_memory`.

This approach keeps the model flexible while preventing memory quality from drifting.

## Why This Approach

Compared with pure rule-based memory extraction:

- It supports non-predefined information.
- It removes the need to enumerate every allowed memory key ahead of time.
- It captures more natural user facts without expanding regex complexity.

Compared with unconstrained LLM memory writing:

- It avoids noisy or unsafe writes.
- It keeps keys readable and queryable.
- It gives the app predictable maintenance characteristics.

## Memory Categories

The extractor is allowed to propose memories in these categories:

- Long-term preferences
  - language preference
  - nickname / preferred form of address
  - food preference
  - recurring communication style or output preference
- Durable background facts useful for future tasks
  - major
  - residence hall
  - year / study stage
  - exchange plan
  - club or role identity
  - recurring course context

These are out of scope for storage:

- short-term emotions
- one-off requests
- instant location or momentary state
- transient chat details
- highly sensitive personal data

## Candidate Memory Contract

The new memory extractor should ask the LLM to return structured candidate memories, for example:

```json
{
  "candidates": [
    {
      "should_store": true,
      "key": "exchange_plan",
      "value": "plans to go on exchange next term",
      "memory_type": "background_fact",
      "confidence": 0.88,
      "reason": "This is a durable future plan likely to affect later recommendations."
    }
  ]
}
```

Each candidate should contain:

- `should_store`
- `key`
- `value`
- `memory_type`
- `confidence`
- `reason`

The LLM is only proposing candidates. It is not the final authority.

## Filtering Rules

Programmatic filtering is a hard gate after model extraction.

### Allow Rules

A memory may be stored only if:

- `should_store` is true
- `confidence` meets the configured threshold
- `memory_type` is one of the supported durable categories
- `value` is non-empty and reasonably short
- `key` is non-empty and normalizable
- the candidate appears useful for future conversations or tasks

### Reject Rules

A memory must be rejected if it appears to be:

- a short-term emotional state
- a single-use request
- a momentary state or location
- empty chatter or non-actionable small talk
- high-sensitivity personal data
- too vague to be useful
- too long, raw, or transcript-like

### Duplicate / Update Rules

- If the same normalized key already exists with the same value, skip the write.
- If the same normalized key exists with a different value, overwrite in v1 and rely on `updated_at`.
- Full conflict resolution and memory history are explicitly deferred.

## Key Normalization

Keys are not pre-enumerated, but they are not fully free-form either.

### Raw LLM Freedom

The LLM can propose natural keys that match the memory content.

### Programmatic Normalization

Before persistence, the system normalizes keys:

- lowercase only
- spaces converted to underscores
- only allow `a-z`, `0-9`, `.`, `_`, `-`
- enforce a length limit such as `2-64`

### Programmatic Rejection

Reject keys that are:

- too generic, such as `info`, `thing`, `user_data`
- sentence-like
- mostly stopwords or punctuation
- obviously tied to a one-off moment

### Canonical Merge Mapping

To keep keys maintainable, add a normalization map that merges obvious variants into canonical keys.

Examples:

- `food_preference`, `favorite_food`, `food_like` -> `favorite_food`
- `study_abroad_plan`, `exchange_plan_next_term` -> `future_plan.exchange`
- `call_me_name`, `preferred_name`, `nickname` -> `nickname`

This keeps the system flexible without letting key quality degrade over time.

## Architecture Changes

### 1. New Memory Extraction Module

Add a new module such as:

- `services/agent/memory_extractor.ts`

Responsibilities:

- prepare extraction prompt inputs
- call the LLM for candidate memories
- validate model output shape
- apply filtering rules
- normalize keys
- return accepted memory write candidates

This module should be isolated from main agent reply generation so it can evolve independently.

### 2. Executor Hook

In [`services/agent/executor.ts`](C:/Users/Tim/Documents/GitHub/CampusCopy/services/agent/executor.ts:1), add a post-reply hook such as `postResponseMemoryPass(...)`.

Responsibilities:

- gather recent user / assistant turns
- optionally include current memory summary
- invoke the memory extractor
- persist accepted results through `saveMemoryFact`

This should happen after the main answer has been formed so memory logic does not block or complicate primary response planning.

### 3. Reuse Existing Persistence Layer

Keep using [`services/agent/memory.ts`](C:/Users/Tim/Documents/GitHub/CampusCopy/services/agent/memory.ts:1) for v1 persistence.

No table redesign is required for the first implementation because `fact_key` is already flexible.

### 4. Keep Stable Explicit Commands

Retain the current explicit memory shortcuts in [`services/agent/stable_tasks.ts`](C:/Users/Tim/Documents/GitHub/CampusCopy/services/agent/stable_tasks.ts:1) for direct commands such as:

- “记住我住 Hall 7”
- “以后叫我 Tim”

These remain useful as a fast path. The new extractor covers more implicit durable facts.

## Runtime Flow

The end-to-end runtime becomes:

1. User sends a message.
2. Main agent plans and replies normally.
3. The system triggers the memory extraction pass on the recent conversation slice.
4. The LLM returns structured candidate memories.
5. Programmatic filters reject invalid candidates.
6. Keys are normalized.
7. Accepted memories are upserted into `agent_memory`.
8. Future turns can retrieve relevant memories and inject them into context.

## Suggested V1 Limits

To keep the first release stable:

- inspect only the most recent `1-3` turns
- allow at most `1-3` writes per pass
- store only durable preference / background memories
- use overwrite semantics with `updated_at`
- skip delete / archive workflows
- do not add vector search yet

These limits reduce the chance of runaway writes while still proving the design.

## Retrieval Direction

V1 can continue using current memory reads plus `getAllUserFacts`.

Recommended next step after write-path stability:

- add relevant-memory retrieval instead of dumping all facts
- rank memory by key match, recentness, and task relevance
- inject a compact memory summary into the agent context

This retrieval improvement is important, but it should come after write-path quality is proven.

## Error Handling

- If extraction fails, do not block the user-facing reply.
- If structured parsing fails, skip memory write and log a warning.
- If Supabase write fails, log and continue without user interruption.
- If `agent_memory` is missing, preserve current graceful fallback behavior.

The memory system should be opportunistic, not user-blocking.

## Testing Strategy

Focus testing on deterministic program logic.

### Unit Tests

- key normalization
- key rejection rules
- candidate filtering rules
- overwrite / duplicate behavior
- extractor result validation

### Integration Tests

- executor post-response memory pass triggers correctly
- accepted memory candidates write through `saveMemoryFact`
- rejected candidates do not write
- failures in extraction or persistence do not break normal agent replies

### Prompt / Fixture Tests

Use fixed conversation fixtures to verify:

- stable preference gets stored
- durable background fact gets stored
- temporary emotion does not get stored
- one-off request does not get stored
- malformed key gets normalized or rejected

## Risks

- LLM may still propose noisy keys or weak facts.
- Poor normalization could create fragmented memory namespaces.
- Too much memory injection later could pollute agent context.
- Overwriting changed facts without history may hide useful evolution.

These are acceptable in v1 as long as filtering and normalization are implemented conservatively.

## Open Decisions Deferred

- memory deletion UI
- explicit user memory management screen
- semantic retrieval / embeddings
- multi-value memories per key
- memory confidence decay
- full audit trail

These can be layered on after write quality and retrieval relevance are validated.

## Acceptance Criteria

- The agent can store non-predefined user facts without requiring per-write confirmation.
- The LLM is not limited to a fixed key list.
- Programmatic filtering blocks temporary, low-value, or sensitive memory candidates.
- Keys are normalized before persistence.
- Existing explicit memory commands still work.
- Main user-facing replies continue to work even if memory extraction fails.
