# AI Agent LangGraph Redesign Design

## Goal

Redesign the current HKCampus agent into a LangGraph-based hybrid assistant that can:

- answer campus questions with higher retrieval quality and clearer evidence,
- ask focused clarification questions when user intent is incomplete,
- execute campus actions only when parameters and confirmation gates are satisfied,
- keep a stable external interface for the existing app UI while replacing the internal execution architecture.

The target user experience is:

- a user can ask mixed requests such as "How does add/drop work, and help me add this quiz to my calendar";
- the agent can first retrieve official or app-native context, then decide whether to answer, clarify, or act;
- write actions are explicit, validated, and confirmable;
- complex agent behavior is visible in code as state transitions rather than hidden in one large executor.

## Non-Goals

- No full multi-agent system in v1.
- No autonomous background task execution without a user message trigger.
- No generic internet browsing agent.
- No full semantic vector memory redesign in this project.
- No migration of the daily digest subsystem unless a shared graph utility is naturally reusable.
- No frontend redesign of the chat UI beyond minimal compatibility changes.

## Why This Redesign Is Needed

The current agent implementation already supports a broad range of capabilities, but the behavior is concentrated in a large hand-orchestrated executor:

- [`services/agent/executor.ts`](C:/Users/Tim/Documents/GitHub/HKCampus/services/agent/executor.ts:1) currently mixes routing, retrieval, memory handling, clarification, tool preparation, tool execution, and reply synthesis.
- [`services/agent/retrieval.ts`](C:/Users/Tim/Documents/GitHub/HKCampus/services/agent/retrieval.ts:1) provides useful query expansion and reranking, but it is still a narrow retrieval helper rather than a first-class graph stage.
- [`services/agent/tools.ts`](C:/Users/Tim/Documents/GitHub/HKCampus/services/agent/tools.ts:1) defines tools well enough for model prompting, but not yet as explicit runtime tool contracts in a graph workflow.
- [`components/agent/AgentChatScreen.tsx`](C:/Users/Tim/Documents/GitHub/HKCampus/components/agent/AgentChatScreen.tsx:1) depends on the current executor contract and should not absorb orchestration complexity.

This creates four problems:

1. Behavior is hard to reason about because routing and execution are implicit control flow inside one file.
2. Mixed requests are awkward because retrieval, clarification, and action planning compete inside one monolithic loop.
3. Retrieval helps answers, but it is not modeled as a reusable evidence supply layer for later execution.
4. Testing is broader and more brittle than necessary because many concerns are coupled.

## Product Scope

This redesign targets the "hybrid assistant" path, meaning one user turn may require one or more of these phases:

1. understand the request,
2. retrieve campus or user context,
3. ask for missing information,
4. execute an action,
5. synthesize a final answer.

The main supported request families in v1 are:

- campus FAQ and knowledge-base questions,
- course community reads,
- schedule reads and writes,
- calendar event writes,
- course review / teaming / chat publishing,
- basic building and nearby-place lookups,
- mixed requests combining information lookup and follow-up action.

## Primary Success Criteria

The redesign is successful when:

- mixed requests no longer rely on implicit executor branching,
- retrieval outputs structured evidence instead of raw helper results,
- every write action passes through a shared validation and confirmation gate,
- the agent can explicitly choose between `answer`, `clarify`, and `act`,
- node-level tests cover key behavior without requiring full end-to-end LLM runs,
- the app UI can keep calling one agent entrypoint without learning graph internals.

## Current State Summary

### Existing Strengths

- The app already has rich campus domain tools and business services.
- Stable task inference already bypasses the LLM for some predictable flows.
- FAQ, memory, and course-community features already have tests.
- LangChain and LangGraph dependencies are already installed in [`package.json`](C:/Users/Tim/Documents/GitHub/HKCampus/package.json:1).

### Existing Weaknesses

- The main executor has grown too large to serve as a durable architecture boundary.
- Retrieval is not designed as a general evidence pipeline.
- Clarification behavior is embedded in action-specific logic rather than shared state transitions.
- Write actions do not yet flow through a uniform "prepare -> validate -> confirm -> execute" path in a graph model.

## Chosen Approach

Use a single LangGraph-based primary agent graph in v1, with well-bounded nodes and typed shared state.

This is a full internal architecture replacement, not a wrapper around the old executor. The graph becomes the new source of truth for agent control flow. The app-facing contract stays stable.

### Why A Single Primary Graph

Compared with `LangChain AgentExecutor only`:

- LangGraph gives explicit state transitions.
- It fits mixed flows better than an implicit tool loop.
- It makes clarification and confirmation first-class branches.

Compared with `multiple specialized graphs from day one`:

- one primary graph is easier to land safely,
- it avoids premature fragmentation,
- subgraphs can still be introduced later behind stable node boundaries.

### Architecture Principle

The graph should separate:

- decision-making,
- evidence gathering,
- action preparation,
- irreversible execution,
- user-facing response generation.

No node should both decide policy and mutate external systems unless that is the explicit purpose of the node.

## User-Facing Behavior Model

For every user turn, the system should aim to produce exactly one of three next-step outcomes before synthesis:

- `answer`: the agent already has enough evidence to answer directly,
- `clarify`: the user intent or required slots are incomplete,
- `act`: the requested action is specific enough to prepare and possibly execute.

This tri-state decision is central. It prevents the agent from:

- improvising low-confidence answers when evidence is weak,
- executing writes too early,
- asking vague follow-up questions when the system already knows enough to proceed.

## Proposed Runtime Architecture

The runtime is split into four layers.

### 1. App Integration Layer

This layer remains responsible for:

- receiving user text,
- maintaining UI-visible streaming and steps,
- passing device location and session context,
- rendering final agent output.

The main consumer is:

- [`components/agent/AgentChatScreen.tsx`](C:/Users/Tim/Documents/GitHub/HKCampus/components/agent/AgentChatScreen.tsx:1)

This layer should not know graph node names or routing details.

### 2. Graph Orchestration Layer

This becomes the new internal core:

- graph definition,
- state schema,
- node execution,
- edge conditions,
- checkpoint-safe state transitions if added later.

### 3. Domain Capability Layer

This layer wraps business logic into graph-friendly adapters:

- FAQ retrieval,
- course community access,
- schedule operations,
- calendar creation,
- memory reads,
- building and nearby place lookups.

This layer may reuse existing service functions directly, but graph nodes should not reach into unrelated app code ad hoc.

### 4. Data and Model Layer

This layer contains:

- LLM calls,
- embedding calls,
- Supabase reads and writes,
- low-level prompt templates and output parsing.

## File Structure

Create a new graph-oriented folder without deleting the legacy executor during migration:

- `services/agent/index.ts`
  - stable app-facing entrypoint
- `services/agent/graph/index.ts`
  - creates and runs the compiled graph
- `services/agent/graph/state.ts`
  - graph state shape, reducers, helper constructors
- `services/agent/graph/types.ts`
  - graph-specific shared types
- `services/agent/graph/edges.ts`
  - conditional routing helpers
- `services/agent/graph/nodes/normalize_input.ts`
- `services/agent/graph/nodes/route_intent.ts`
- `services/agent/graph/nodes/retrieve_context.ts`
- `services/agent/graph/nodes/plan_next_step.ts`
- `services/agent/graph/nodes/clarify_user.ts`
- `services/agent/graph/nodes/prepare_action.ts`
- `services/agent/graph/nodes/confirm_action.ts`
- `services/agent/graph/nodes/execute_tools.ts`
- `services/agent/graph/nodes/synthesize_response.ts`
- `services/agent/graph/nodes/write_memory.ts`
- `services/agent/graph/prompts/*.ts`
  - prompt builders and output contracts per node
- `services/agent/graph/retrieval/normalize_query.ts`
- `services/agent/graph/retrieval/retrievers.ts`
- `services/agent/graph/retrieval/rerank.ts`
- `services/agent/graph/retrieval/evidence.ts`
- `services/agent/graph/tools/*.ts`
  - tool adapters that wrap existing business functions
- `services/agent/graph/telemetry.ts`
  - trace and node timing helpers

Legacy files may remain during the transition:

- [`services/agent/executor.ts`](C:/Users/Tim/Documents/GitHub/HKCampus/services/agent/executor.ts:1)
- [`services/agent/retrieval.ts`](C:/Users/Tim/Documents/GitHub/HKCampus/services/agent/retrieval.ts:1)

But new code should treat them as migration sources, not as the target architecture.

## Graph State Design

Introduce a single typed shared state object, `AgentGraphState`.

### Required Fields

- `input: string`
  - raw user input
- `normalizedInput: string`
  - normalized query text used by routing and retrieval
- `sessionId: string`
- `userId: string`
- `history: AgentHistoryItem[]`
- `historySummary?: string`
- `deviceLocation?: AgentGeoPoint | null`
- `sessionState: AgentSessionState`
- `intent`
  - high-level intent classification result
- `retrieval`
  - retrieval planning and results bundle
- `evidence`
  - normalized evidence items selected for downstream reasoning
- `plan`
  - planner decision and rationale
- `clarification`
  - clarification status and question
- `pendingAction`
  - structured action candidate
- `confirmation`
  - whether user confirmation is required, available, or satisfied
- `toolCalls`
  - prepared tool invocations
- `toolResults`
  - normalized execution results
- `finalResponse?: string`
- `memoryCandidates`
  - optional post-response memory proposals
- `trace`
  - node-level debug breadcrumbs
- `errors`
  - non-fatal accumulated errors

### State Shape Principles

- Every node writes only the fields it owns.
- Fields that cross node boundaries must be explicit and typed.
- External side effects should be represented in state before they are executed.
- Nodes should be replay-safe where feasible, especially before irreversible writes.

## State Subtypes

### Intent State

Represents the top-level request family and risk:

- `kind: 'qa' | 'action' | 'hybrid' | 'unsupported'`
- `domain: 'faq' | 'course_community' | 'schedule' | 'calendar' | 'campus' | 'memory' | 'mixed'`
- `requiresRetrieval: boolean`
- `requiresActionPreparation: boolean`
- `requiresConfirmation: boolean`
- `confidence: number`
- `reason: string`

### Retrieval State

Represents retrieval planning and execution:

- `query: string`
- `expandedQueries: string[]`
- `sourcesRequested: Array<'faq' | 'knowledge_base' | 'memory' | 'session_context' | 'course_context'>`
- `rawResults`
- `rankedEvidence`
- `answerability: 'sufficient' | 'insufficient' | 'ambiguous'`
- `answerabilityReason: string`

### Plan State

Represents the planner result:

- `decision: 'answer' | 'clarify' | 'act'`
- `reason: string`
- `selectedEvidenceIds: string[]`
- `proposedActionType?: string`

### Clarification State

- `needed: boolean`
- `question?: string`
- `missingSlots: string[]`
- `scope: 'intent' | 'action_parameters' | 'confirmation' | 'retrieval_disambiguation'`

### Pending Action State

Represents a normalized business action before execution:

- `type`
  - `post_course_review`
  - `post_course_teaming`
  - `send_course_chat_message`
  - `write_user_schedule_entry`
  - `create_user_calendar_event`
- `params`
  - validated but not yet executed parameters
- `missingRequiredFields: string[]`
- `userVisibleSummary`
  - short summary used in confirmation prompts
- `safeToExecute: boolean`

### Tool Result State

- `toolName`
- `success`
- `resultSummary`
- `rawResult`
- `userVisibleData`
- `retryable`

## Evidence Model

Introduce a normalized `EvidenceItem` so retrieval output is reusable across answer generation and action planning.

Each evidence item should contain:

- `id`
- `sourceType`
  - `faq`, `knowledge_base`, `memory`, `session_state`, `course_data`, `tool_prefetch`
- `topic`
- `title`
- `contentSnippet`
- `fullContentRef`
  - reference to raw content when needed
- `metadata`
- `score`
- `retrievedAt`
- `supportsAction: boolean`

This is a key change. Retrieval is no longer a string helper. It becomes a structured context supply system.

## Node Design

### 1. `normalize_input`

Responsibilities:

- normalize multilingual punctuation and spacing,
- normalize course code forms,
- normalize common campus aliases,
- extract obvious time/date/building tokens,
- produce a stable retrieval query.

This node should be deterministic and mostly rule-based.

Outputs:

- `normalizedInput`
- lightweight extracted slots for downstream nodes
- trace notes

It should not call the LLM.

### 2. `route_intent`

Responsibilities:

- classify the request as `qa`, `action`, `hybrid`, or `unsupported`,
- determine whether retrieval is needed,
- determine whether any write path may happen,
- mark whether confirmation will eventually be required.

Recommended implementation:

- reuse existing rule-based intent helpers where possible,
- add a small LLM-assisted fallback only when rules are inconclusive,
- preserve deterministic handling for well-known campus intents.

This node should not execute tools.

### 3. `retrieve_context`

Responsibilities:

- decide which retrieval sources are relevant,
- run source-specific retrieval,
- merge and rerank results,
- determine whether evidence is sufficient to answer or proceed.

This node is the heart of the RAG redesign.

### 4. `plan_next_step`

Responsibilities:

- inspect `intent`, `evidence`, and extracted slots,
- choose one of `answer`, `clarify`, or `act`,
- explain why,
- identify which evidence supports the choice.

This node may call the LLM, but the output contract must be strict JSON with one decision only.

### 5. `clarify_user`

Responsibilities:

- generate one concise, specific clarification question,
- avoid broad or repetitive follow-ups,
- focus on the smallest missing input needed to proceed.

Examples:

- if the user asks "How is this course" without a clear sub-intent, ask whether they want reviews, chat activity, or teaming status;
- if the user wants a calendar write but gave no date, ask only for the date;
- if the user wants a review post but omitted the rating, ask only for the rating.

This node should never also execute.

### 6. `prepare_action`

Responsibilities:

- convert the request into one structured domain action,
- map normalized slots into tool parameters,
- resolve references such as course code or event type,
- identify missing fields,
- generate a confirmation summary if needed.

This node should be the only place where free-form mixed user text becomes structured business action intent.

### 7. `confirm_action`

Responsibilities:

- decide whether confirmation is required,
- detect whether the current user turn already confirms,
- generate a confirmation prompt if needed,
- block execution when confirmation is absent.

All irreversible writes should pass through this node, including:

- posting course reviews,
- posting teaming requests,
- sending chat messages,
- writing schedule entries,
- creating calendar events.

### 8. `execute_tools`

Responsibilities:

- execute exactly the prepared tool calls,
- catch and normalize execution errors,
- never invent missing parameters,
- record structured tool results.

This node should not revisit planning unless the graph explicitly routes back due to retryable error classes.

### 9. `synthesize_response`

Responsibilities:

- produce the final user-facing answer,
- cite evidence compactly when useful,
- summarize tool outcomes clearly,
- acknowledge uncertainty when retrieval was partial.

Answer quality rules:

- prefer direct, campus-specific language,
- avoid pretending unknown facts are certain,
- for successful writes, confirm exactly what was created or posted,
- for failures, explain what failed and what the user can provide next.

### 10. `write_memory`

Responsibilities:

- run the memory extraction pass after the main response path,
- reuse current memory filtering principles,
- store only accepted durable facts,
- never block the main response on memory failures.

This node is optional for unsupported or purely error outcomes.

## Graph Edge Design

Use explicit edges based on state rather than node-local hidden branching.

Recommended primary flow:

1. `normalize_input`
2. `route_intent`
3. conditional edge:
   - `unsupported -> synthesize_response`
   - `requires_retrieval -> retrieve_context`
   - otherwise -> `plan_next_step`
4. `retrieve_context`
5. `plan_next_step`
6. conditional edge:
   - `decision = answer -> synthesize_response`
   - `decision = clarify -> clarify_user -> synthesize_response`
   - `decision = act -> prepare_action`
7. `prepare_action`
8. conditional edge:
   - if missing fields -> `clarify_user -> synthesize_response`
   - else -> `confirm_action`
9. `confirm_action`
10. conditional edge:
    - if awaiting confirmation -> `synthesize_response`
    - if confirmed -> `execute_tools`
11. `execute_tools`
12. `synthesize_response`
13. `write_memory`

This keeps the main logic legible and testable.

## RAG Redesign

The retrieval system should move from helper functions to a three-stage retrieval pipeline.

### Stage 1: Query Normalization

Purpose:

- make user wording less brittle,
- improve recall across English, Simplified Chinese, and Traditional Chinese,
- convert colloquial phrases into canonical retrieval terms.

This stage should:

- reuse and expand logic from [`services/agent/retrieval.ts`](C:/Users/Tim/Documents/GitHub/HKCampus/services/agent/retrieval.ts:1),
- normalize common university aliases,
- normalize course codes,
- map policy phrases like `add/drop`, `withdraw`, `GPA`, `hall deposit`, `BUniPort`, `e-visa`.

Outputs:

- canonical query,
- alias terms,
- source hints,
- extracted entities.

### Stage 2: Hybrid Retrieval

Run multiple retrievers in parallel where reasonable:

- FAQ retriever
  - source: local FAQ data and existing `FAQService.searchFAQs`
- knowledge-base retriever
  - source: Supabase `agent_knowledge_base` and existing KB search path
- memory retriever
  - source: durable user facts when personalization matters
- session-context retriever
  - source: conversation summary and recent references
- domain retriever
  - source: course, building, or schedule context when the request already names one

Not every request uses every source. Retrieval planning should be source-aware.

### Stage 3: Evidence Ranking and Answerability

After collecting candidate results:

- transform all results into `EvidenceItem`,
- apply source-aware reranking,
- prefer official or app-native sources when answer conflicts exist,
- determine whether the evidence is enough to answer or only enough to narrow the next question.

This stage should not produce the final answer text. It produces evidence and an answerability judgment.

## Retrieval Scoring Strategy

Use a weighted scoring model rather than raw similarity alone.

Suggested scoring dimensions:

- lexical query match,
- synonym and alias match,
- metadata match,
- source trust tier,
- action support relevance,
- freshness when relevant,
- exact entity hit such as course code or building code.

Suggested trust bias:

- FAQ / official knowledge-base entries outrank weak conversational memory for policy answers,
- domain-specific app data outranks generic KB text for schedule or course-community operations,
- memory can personalize but should not override official institutional facts.

## Clarification Strategy

Clarification should be narrow and surgical.

Rules:

- Ask one question at a time.
- Ask only for missing information that directly unlocks the next graph edge.
- Do not ask the user to restate the whole request.
- Prefer multiple-choice style wording when natural.

Examples:

- "You want course info for `COMP3015`. Do you want reviews, chat activity, or teaming posts?"
- "I can create the quiz event, but I still need the date. What is the date in `YYYY-MM-DD` format?"
- "I have the review text. Please send a `1-5` rating so I can post it."

## Action Safety Model

All write actions require structured preparation before execution.

### Hard Requirements

- no write tool executes without a complete parameter set,
- no write tool executes without passing the confirmation gate,
- tool execution never fills in unknown business parameters by guessing,
- failures are surfaced as normalized result objects, not thrown straight into user text.

### Confirmation Policy

Require explicit confirmation for:

- schedule writes,
- calendar event creation,
- course review posting,
- teaming post publishing,
- chat message sending.

Confirmation may be considered satisfied when:

- the same turn contains an explicit confirmation phrase after a prepared action already exists in session state,
- the action was just summarized and the user replies with a known confirm expression.

## Tool Adapter Design

Convert current conceptual tools into graph tool adapters, not raw prompt-only definitions.

Each adapter should define:

- input schema,
- parameter normalization,
- invocation method,
- result normalization,
- retryability classification.

### Example Adapter Families

- `faq_tools.ts`
- `schedule_tools.ts`
- `calendar_tools.ts`
- `course_community_tools.ts`
- `campus_lookup_tools.ts`
- `memory_tools.ts`

They should wrap existing domain services such as:

- [`services/faq.ts`](C:/Users/Tim/Documents/GitHub/HKCampus/services/faq.ts:1)
- [`services/schedule.ts`](C:/Users/Tim/Documents/GitHub/HKCampus/services/schedule.ts:1)
- [`services/calendar.ts`](C:/Users/Tim/Documents/GitHub/HKCampus/services/calendar.ts:1)
- [`services/courses.ts`](C:/Users/Tim/Documents/GitHub/HKCampus/services/courses.ts:1)
- [`services/teaming.ts`](C:/Users/Tim/Documents/GitHub/HKCampus/services/teaming.ts:1)

## LLM Role Design

The LLM should not own the whole runtime. It should be used in bounded places.

### Appropriate LLM Responsibilities

- planner decision in ambiguous mixed requests,
- evidence-aware answer composition,
- concise clarification phrasing,
- optional fallback intent classification,
- post-response memory candidate extraction.

### Inappropriate LLM Responsibilities

- executing domain writes directly,
- inferring missing required business fields without evidence,
- bypassing confirmation rules,
- selecting arbitrary external tools not defined by the system,
- serving as the sole source of truth for campus policy.

## Prompt Design

Use per-node prompt files, not one giant system prompt string.

Each prompt file should include:

- node purpose,
- strict allowed outputs,
- domain constraints,
- example JSON outputs,
- evidence formatting instructions where relevant.

Minimum prompts expected:

- planner prompt,
- clarification prompt,
- synthesis prompt,
- memory extraction prompt,
- optional fallback router prompt.

## Streaming Strategy

The current UI already supports incremental updates. The graph redesign should preserve a compatible streaming story without making every node stream.

Recommended approach:

- non-LLM nodes do not stream,
- planner and clarification nodes usually do not stream partial text,
- synthesis node may stream the final answer text,
- tool execution emits step-level progress summaries to the UI if helpful.

This avoids the complexity of trying to surface partial internal graph state as user-facing prose.

## Session and Memory Design

This redesign should reuse the current session-state and memory ideas while making them graph-aware.

### Session State

Continue carrying:

- recent conversation history,
- history summary,
- recently referenced entities,
- pending confirmation context.

But move the authoritative "what is pending" model into graph state instead of implicit executor member variables.

### Memory

Reuse durable memory storage behavior from the previous design, but treat memory as one retrieval source, not the core planner.

Memory should influence:

- personalization,
- clarification specificity,
- action defaults when safe and explicit.

Memory should not:

- override current user intent,
- fill policy facts,
- trigger writes without user request.

## Error Handling

Design error handling per layer.

### Retrieval Errors

- If one retrieval source fails, continue with partial evidence when possible.
- Mark degraded state in trace and synthesis.
- Do not collapse the whole turn unless all critical sources fail.

### Planner Errors

- Fallback to a conservative clarify response when planner output is malformed.
- Log parse failures with node-local telemetry.

### Tool Errors

- Normalize execution failures into `ToolResultState`.
- Distinguish retryable infra failures from user-fixable validation failures.

### Memory Errors

- Never block the main reply.
- Log and skip.

## Telemetry and Debuggability

Add lightweight graph trace data so future debugging is not guesswork.

Per node, record:

- node name,
- start and end time,
- major decision summary,
- any degraded fallback used,
- key IDs of evidence or tool results produced.

Avoid storing raw sensitive user data in verbose debug logs unless already permitted by the existing app logging standard.

## Testing Strategy

This redesign needs layered tests.

### Unit Tests

Test deterministic logic in isolation:

- input normalization,
- entity extraction,
- retrieval query expansion,
- evidence scoring,
- action parameter validation,
- confirmation phrase detection,
- error normalization.

### Node Tests

For each graph node:

- given state in,
- verify state out,
- mock external dependencies,
- assert no unrelated fields are mutated.

### Graph Path Tests

Add end-to-end graph path tests for representative flows:

- pure FAQ answer,
- ambiguous course query requiring clarification,
- schedule read direct answer,
- quiz calendar creation requiring date clarification then confirmation,
- course review post requiring missing rating clarification,
- mixed request: retrieve policy info and then prepare a write action.

### Regression Tests

Port key executor behaviors now covered in:

- [`__tests__/services/agent/executor.test.ts`](C:/Users/Tim/Documents/GitHub/HKCampus/__tests__/services/agent/executor.test.ts:1)

The goal is not to delete good coverage. It is to remap it to the new architecture.

### Prompt Contract Tests

For nodes with structured LLM outputs:

- validate parser behavior for good output,
- validate fallback behavior for malformed output,
- keep fixture-based examples for planner and clarification.

## Migration Plan

Even though the chosen architecture is a direct internal redesign, delivery should still be phased.

### Phase 1: Graph Foundations

- create graph folder structure,
- define `AgentGraphState`,
- implement deterministic nodes: normalization, basic routing, edge helpers,
- wire graph entrypoint behind a feature-local interface.

### Phase 2: Retrieval Pipeline

- extract and expand retrieval logic into graph retrieval modules,
- introduce `EvidenceItem`,
- integrate FAQ and knowledge-base retrieval,
- add answerability judgment.

### Phase 3: Planner and Clarification

- add `plan_next_step`,
- add `clarify_user`,
- cover ambiguous mixed requests.

### Phase 4: Action Path

- add action preparation,
- add confirmation gate,
- add tool adapters and execution node,
- migrate schedule, calendar, and course-community write actions.

### Phase 5: Response and Memory

- add synthesis node,
- add memory-write node,
- refine UI compatibility and step streaming.

### Phase 6: Legacy Cutover

- switch app-facing entrypoint fully to graph runtime,
- leave legacy executor only as temporary rollback reference if needed,
- remove unused duplicated orchestration logic after parity is proven.

## Backward Compatibility

The app-facing execution API should remain stable enough that:

- [`components/agent/AgentChatScreen.tsx`](C:/Users/Tim/Documents/GitHub/HKCampus/components/agent/AgentChatScreen.tsx:1) does not need a conceptual rewrite,
- existing step rendering can continue with modest adaptation,
- existing auth and device-location context passing remains unchanged.

If a new response shape is needed, adapt it in `services/agent/index.ts`, not in UI code first.

## Risks

- The redesign may initially regress niche flows hidden in the legacy executor.
- Poorly designed graph state can recreate the same complexity under new names.
- Planner overuse could increase latency or token cost.
- Retrieval quality may improve recall but still produce noisy evidence if source weighting is weak.
- Confirmation state can become brittle if session carry-over logic is underspecified.

## Risk Mitigations

- keep deterministic routing for known high-confidence campus tasks,
- constrain planner outputs to a small contract,
- use node tests before broad graph-path tests,
- migrate one action family at a time,
- keep evidence and pending-action structures explicit and inspectable.

## Acceptance Criteria

- The primary agent runtime uses LangGraph as the control-flow engine.
- The external app-facing entrypoint remains stable for the chat screen.
- Retrieval produces structured evidence rather than only raw helper text.
- The planner can choose `answer`, `clarify`, or `act`.
- Ambiguous mixed requests can trigger clarification instead of guessing.
- All write actions pass through shared preparation and confirmation stages.
- Tool execution is separated from decision-making.
- Memory writes remain opportunistic and non-blocking.
- New tests cover both node logic and representative graph paths.

## Open Decisions Deferred

- whether to split the primary graph into subgraphs after v1 parity,
- whether to add persistence-backed graph checkpoints,
- whether to add semantic memory retrieval beyond current durable facts,
- whether to expose evidence citations directly in the UI,
- whether to add per-node analytics dashboards.

## Implementation Readiness Summary

This design is ready to move into implementation planning.

The essential decomposition is:

- one primary graph,
- one explicit typed state,
- retrieval as structured evidence pipeline,
- planner limited to `answer / clarify / act`,
- all writes behind `prepare -> confirm -> execute`,
- synthesis and memory as terminal concerns rather than mid-flow side effects.

That is the architectural shift that should make the HKCampus agent more capable on mixed requests and more maintainable for future work.
