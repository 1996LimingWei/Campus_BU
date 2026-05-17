# Executor Thin Adapter Refactor Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink `services/agent/executor.ts` into a thin adapter that only owns entrypoint wiring and conversation context assembly, while moving pending-action state, confirmation flow, telemetry, and replay-ready behavior into the LangGraph runtime.

**Architecture:** Treat the LangGraph runtime as the single source of truth for agent behavior, but keep a temporary compatibility shell around `AgentExecutor` until graph behavior is proven equivalent for multi-turn write flows. The migration is staged: first make graph state durable and observable, then migrate behavior coverage, then remove legacy executor branches, and only after that remove the feature flag.

**Tech Stack:** TypeScript, LangGraph, existing `AgentExecutor`, Jest, DeepSeek-backed node prompts, session state helpers.

---

## Scope And Safety Rails

This refactor is **not** a "delete executor and hope graph covers it" change. The graph still lacks full parity with executor's multi-turn write flows, especially:

- cross-turn slot filling for schedule / calendar / course-community writes
- confirmation handling when the next user turn both confirms and edits parameters
- cancellation and pending-action clearing
- replay-grade structured state handoff between turns

The implementation order must therefore be:

1. make graph state durable across turns
2. make graph behavior equivalent for critical multi-turn write flows
3. add graph-first runtime tests for those flows
4. shrink executor to a thin adapter
5. keep `LANGGRAPH_ENABLED` as a kill switch until parity is verified
6. remove the flag in a final cleanup task only after all earlier tasks pass

## File Map

**Create**

- `__tests__/services/agent/graph/runtime.test.ts`
- `__tests__/services/agent/graph/pending_action_state.test.ts`

**Modify**

- `services/agent/types.ts`
- `services/agent/session_state.ts`
- `services/agent/index.ts`
- `services/agent/config.ts`
- `services/agent/executor.ts`
- `services/agent/graph/types.ts`
- `services/agent/graph/state.ts`
- `services/agent/graph/index.ts`
- `services/agent/graph/edges.ts`
- `services/agent/graph/telemetry.ts`
- `services/agent/graph/nodes/prepare_action.ts`
- `services/agent/graph/nodes/clarify_user.ts`
- `services/agent/graph/nodes/confirm_action.ts`
- `services/agent/graph/nodes/execute_tools.ts`
- `services/agent/graph/nodes/synthesize_response.ts`
- `services/agent/graph/nodes/write_memory.ts`
- `__tests__/services/agent/executor.test.ts`
- `components/agent/AgentChatScreen.tsx` only if response typing forces a small compile fix

## Non-Goals

- No UI redesign of the chat screen in this refactor.
- No persistent database storage for traces in this refactor.
- No removal of `AgentExecutor` public API surface. The UI should continue using:
  - `new AgentExecutor(uid)`
  - `.setDeviceLocation(location)`
  - `.process(prompt, onUpdate)`

## Design Decisions

### 1. Pending action must be structural, not inferred from assistant prose

Do **not** clear or recover `pendingAction` by matching strings such as "已经帮你" or "已取消". That would reintroduce state coupling to Chinese response wording.

Instead:

- graph owns `pendingAction`
- graph writes `pendingAction` back into `sessionState`
- graph decides when it is cleared:
  - action fully executed
  - user explicitly cancels
  - graph determines the pending action is superseded by a new one

### 2. Executor stays as compatibility adapter until graph parity is verified

`AgentExecutor` remains the public entrypoint during migration, but its internals shrink. It should still own:

- user/session bootstrap
- device location injection
- history append
- history summary refresh
- writing returned `sessionState` back into in-memory context

It should no longer own:

- intent routing
- stable task routing
- local rule routing
- pending write state machine
- confirmation parsing
- tool execution
- memory write pass
- response caching decisions

### 3. Keep the LangGraph feature flag until the final cleanup task

The plan must preserve `AGENT_CONFIG.LANGGRAPH_ENABLED` until:

- graph runtime tests cover the previously executor-only multi-turn flows
- adapter tests pass
- manual chat regression passes

Only then can we remove the fallback path.

---

## Task 1: Promote `PendingAction` To Shared Core Types

**Files:**

- Modify: `services/agent/types.ts`
- Modify: `services/agent/graph/types.ts`
- Test: `__tests__/services/agent/graph/pending_action_state.test.ts`

- [ ] **Step 1: Move the canonical `PendingAction` union into `services/agent/types.ts`**

The graph currently defines `PendingAction` locally in `graph/types.ts`. Move that union into the shared agent types module so both executor and graph can reference the same type without duplication.

Required result:

```ts
export type PendingAction = /* existing union moved from graph/types.ts */;
```

- [ ] **Step 2: Extend `AgentSessionState` with structural pending-action storage**

Add a nullable field:

```ts
pendingAction?: PendingAction | null;
```

This is the durable cross-turn holder used by the graph runtime.

- [ ] **Step 3: Update `graph/types.ts` to import `PendingAction` from `../types`**

Remove the local union definition from `graph/types.ts` and replace it with:

```ts
import type { PendingAction } from '../types';
```

- [ ] **Step 4: Add a type-level test that verifies `AgentSessionState` accepts a `PendingAction`**

Add a small runtime-safe test that constructs a session state with `pendingAction` and verifies the object shape survives round-tripping through the graph state initializer.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- --runInBand __tests__/services/agent/graph/pending_action_state.test.ts
```

Expected: PASS

## Task 2: Make Session State Persist Pending Action Without Prose Heuristics

**Files:**

- Modify: `services/agent/session_state.ts`
- Test: `__tests__/services/agent/graph/pending_action_state.test.ts`

- [ ] **Step 1: Initialize `pendingAction` to `null` in `createInitialSessionState()`**

Required result:

```ts
export const createInitialSessionState = (): AgentSessionState => ({
  facts: {},
  recentDecisions: [],
  openLoops: [],
  pendingAction: null,
});
```

- [ ] **Step 2: Do not mutate `pendingAction` inside `updateSessionStateWithTurn()` based on assistant wording**

Leave `updateSessionStateWithTurn()` responsible for lightweight conversational metadata only. It may continue updating `openLoops`, `goal`, or `referencedCourse`, but it must not attempt to derive pending-action state from natural language replies.

- [ ] **Step 3: Extend `formatSessionState()` to render a compact `pendingAction` summary**

Add one line when present, for example:

```txt
pendingAction: write_user_schedule_entry (missing: dayOfWeek, timeRange)
```

This is for debug context only; it is not the source of truth.

- [ ] **Step 4: Add tests confirming `pendingAction` survives user and assistant turns untouched**

Test:

- start with a session state containing `pendingAction`
- run `updateSessionStateWithTurn()` with a user turn
- run it again with an assistant turn
- verify `pendingAction` is still present unless explicitly replaced elsewhere

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- --runInBand __tests__/services/agent/graph/pending_action_state.test.ts
```

Expected: PASS

## Task 3: Rehydrate And Return Durable Graph Session State

**Files:**

- Modify: `services/agent/graph/state.ts`
- Modify: `services/agent/graph/types.ts`
- Modify: `services/agent/graph/index.ts`
- Modify: `services/agent/index.ts`
- Test: `__tests__/services/agent/graph/pending_action_state.test.ts`

- [ ] **Step 1: Initialize graph state from `input.sessionState.pendingAction`**

In `createInitialAgentGraphState()`, replace:

```ts
pendingAction: null,
```

with:

```ts
pendingAction: input.sessionState.pendingAction ?? null,
```

- [ ] **Step 2: Add a `GraphRunResult` type**

Define:

```ts
export type GraphRunResult = {
  response: AgentResponse;
  sessionState: AgentSessionState;
  finalState: AgentGraphState;
};
```

`finalState` is included for tests and replay-oriented debugging.

- [ ] **Step 3: Change `GraphRuntime.run()` to return `GraphRunResult`**

Update `graph/types.ts`, `graph/index.ts`, and `services/agent/index.ts` accordingly.

- [ ] **Step 4: Centralize session-state writeback in `graph/index.ts`**

Before returning from the runtime, create a final `sessionState` object derived from `finalState.sessionState` plus the graph-owned `pendingAction`:

```ts
const nextSessionState = {
  ...finalState.sessionState,
  pendingAction: finalState.pendingAction,
};
```

Return this in `GraphRunResult` instead of manually syncing in multiple nodes.

- [ ] **Step 5: Avoid duplicate pending-action syncing in leaf nodes**

Do not add writeback logic separately to both `synthesize_response` and `write_memory`. The runtime return boundary should be the single place that materializes session-state output.

- [ ] **Step 6: Add a test proving pending action survives one graph run and is visible in the returned session state**

Scenario:

- input session state has a pending action
- graph runs a follow-up turn that does not execute yet
- returned `sessionState.pendingAction` is still populated

- [ ] **Step 7: Run targeted tests**

Run:

```bash
npm test -- --runInBand __tests__/services/agent/graph/pending_action_state.test.ts
```

Expected: PASS

## Task 4: Upgrade Graph Confirmation Flow To Handle Resume, Cancel, And Edit-While-Confirming

**Files:**

- Modify: `services/agent/graph/nodes/prepare_action.ts`
- Modify: `services/agent/graph/nodes/clarify_user.ts`
- Modify: `services/agent/graph/nodes/confirm_action.ts`
- Modify: `services/agent/graph/edges.ts`
- Test: `__tests__/services/agent/graph/runtime.test.ts`
- Test: `__tests__/services/agent/graph/actions.test.ts`

- [ ] **Step 1: Make `prepare_action` merge with an existing pending action**

Current behavior mostly derives a new action from only the current input. Update it so that:

- if `state.pendingAction` already exists and the current user turn looks like a slot-filling follow-up, merge new fields into that pending action
- if the current turn clearly starts a different action, replace the pending action

Required helper behavior:

- merge partial schedule fields
- merge partial calendar-event fields
- merge review rating/content/courseCode
- merge course-community section/content

- [ ] **Step 2: Make `clarify_user` ask for missing fields against the merged pending action**

If a pending action exists with missing fields, the clarifier prompt and returned question must reference the remaining missing fields from that structured action, not ask a generic fresh question.

- [ ] **Step 3: Teach `confirm_action` to support three branches**

It should distinguish:

- confirm only
- cancel
- confirm plus parameter edits in the same turn

The simplest acceptable first-pass shape is:

```ts
confirmation: {
  required: boolean;
  satisfied: boolean;
  cancelled?: boolean;
  updatedPendingAction?: PendingAction | null;
  prompt?: string;
}
```

- [ ] **Step 4: Update branching logic in `edges.ts`**

Required branch behavior:

- if cancelled: skip tool execution, clear pending action, synthesize a cancellation response
- if confirmation satisfied and pending action is still safe: execute tools
- if user edited parameters and required fields are now missing again: go back to clarification
- if confirmation still pending: synthesize confirmation prompt

- [ ] **Step 5: Add runtime tests for critical multi-turn flows**

Add graph runtime tests for all of the following:

- schedule write: initial draft -> confirmation prompt -> confirm -> tool executes
- schedule write: initial draft -> user changes time in confirmation turn -> updated confirmation prompt -> confirm -> tool executes with new time
- schedule write: initial draft -> cancel -> tool does not execute -> pending action cleared
- calendar event: missing date -> user supplies date -> confirmation prompt -> confirm
- assignment event: missing time -> user supplies time -> confirmation prompt -> confirm
- course review: first turn has content only -> second turn has rating -> confirmation prompt -> confirm

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm test -- --runInBand __tests__/services/agent/graph/actions.test.ts __tests__/services/agent/graph/runtime.test.ts
```

Expected: PASS

## Task 5: Add Replay-Oriented Graph Telemetry Surface

**Files:**

- Modify: `services/agent/graph/telemetry.ts`
- Modify: `services/agent/graph/types.ts`
- Modify: `services/agent/graph/index.ts`
- Modify: `services/agent/graph/nodes/clarify_user.ts`
- Modify: `services/agent/graph/nodes/synthesize_response.ts`
- Modify: `services/agent/graph/nodes/execute_tools.ts`
- Test: `__tests__/services/agent/graph/runtime.test.ts`

- [ ] **Step 1: Replace the minimal trace entry shape with a richer structure**

Current trace is:

```ts
Array<{ node: string; summary: string }>
```

Replace it with a replay-ready shape such as:

```ts
type GraphTraceEntry = {
  node: string;
  summary: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  branch?: string;
  llmCalls?: Array<{ model: string; success: boolean; latencyMs?: number }>;
  toolCalls?: Array<{ toolName: string; success: boolean; retryable: boolean }>;
  checkpoint?: 'clarification' | 'confirmation' | 'cancelled' | 'completed';
};
```

- [ ] **Step 2: Make `pushTrace` able to accept structured metadata**

Do not force every node to hand-roll timestamps. Provide a helper that can create a finished trace entry from a start time and metadata.

- [ ] **Step 3: Record LLM call count and latency in LLM-backed nodes**

At minimum, instrument:

- `clarify_user`
- `synthesize_response`

Include model name and success/failure.

- [ ] **Step 4: Record tool success summary in `execute_tools`**

The trace entry for `execute_tools` should include one item per tool call and make tool success rate derivable from the response alone.

- [ ] **Step 5: Mark confirmation and clarification checkpoints**

When the graph pauses awaiting user input, emit explicit checkpoints so replay consumers do not have to infer pauses from prose.

- [ ] **Step 6: Expose trace entries through `GraphRunResult.response.steps` without losing structure**

Keep `AgentResponse.steps` backward-compatible enough for the UI, but include trace-derived summaries consistently. If needed, extend `AgentResponse` with a `debug` or `trace` field rather than flattening everything into `thought`.

- [ ] **Step 7: Add tests confirming telemetry shape exists for at least one LLM node, one tool node, and one confirmation pause**

Run:

```bash
npm test -- --runInBand __tests__/services/agent/graph/runtime.test.ts
```

Expected: PASS

## Task 6: Rewrite `AgentExecutor` As A Thin Adapter Without Removing The Kill Switch Yet

**Files:**

- Modify: `services/agent/executor.ts`
- Test: `__tests__/services/agent/executor.test.ts`

- [ ] **Step 1: Keep only adapter responsibilities in `executor.ts`**

Target remaining responsibilities:

- constructor and context initialization
- `setDeviceLocation`
- `pushHistory`
- `maybeRefreshHistorySummary`
- `process`

Optional:

- `processWithGraph` may remain temporarily as a private or test-only wrapper during the migration, but it should stop carrying special business logic

- [ ] **Step 2: In graph mode, write back returned session state**

`process()` should:

- push user history
- refresh history summary if needed
- call `runAgentGraph(...)`
- set `this.context.sessionState = result.sessionState`
- push assistant history from `result.response.finalAnswer`
- return `result.response`

- [ ] **Step 3: Preserve the legacy branch behind the flag for one migration window**

Do not remove the old branch yet. The graph path becomes the preferred path, but the `LANGGRAPH_ENABLED` fallback remains until the next task completes.

- [ ] **Step 4: Remove dead helper usage from the graph path**

The graph path must no longer call:

- `finalizeAgentResponse`
- `runPostResponseMemoryPass`
- legacy pending-action handlers

- [ ] **Step 5: Add adapter-focused tests**

Test:

- `process()` forwards `history`, `historySummary`, `sessionState`, and `deviceLocation`
- returned `sessionState` is written back into executor context
- returned `finalAnswer` is appended to history

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm test -- --runInBand __tests__/services/agent/executor.test.ts
```

Expected: PASS

## Task 7: Migrate Coverage From Legacy Executor Tests To Graph Runtime Tests

**Files:**

- Modify: `__tests__/services/agent/executor.test.ts`
- Modify: `__tests__/services/agent/graph/runtime.test.ts`

- [ ] **Step 1: Keep legacy tests until graph equivalents exist**

Do not delete large executor test blocks first. Mark them for migration and move them scenario-by-scenario only after equivalent graph runtime coverage exists.

- [ ] **Step 2: Move the highest-value multi-turn scenarios first**

The first scenarios that must exist in graph tests before any executor deletions:

- course teaming publish with multi-turn slot filling and final confirmation
- course review publish with missing rating/content completion
- schedule write with follow-up slot filling
- calendar event write with follow-up slot filling
- cancel after draft
- confirm with parameter edits

- [ ] **Step 3: Shrink executor tests down to adapter behavior only after graph parity is covered**

At the end of this task, executor tests should mostly assert:

- context assembly
- graph delegation
- session-state writeback
- history maintenance

- [ ] **Step 4: Run focused test suites**

Run:

```bash
npm test -- --runInBand __tests__/services/agent/executor.test.ts __tests__/services/agent/graph/runtime.test.ts
```

Expected: PASS

## Task 8: Manual Regression Pass With Flag Still Present

**Files:**

- Modify: none unless regressions are found

- [ ] **Step 1: Verify graph mode in the app manually**

With `EXPO_PUBLIC_AGENT_LANGGRAPH_ENABLED=true`, test in `AgentChatScreen`:

- schedule draft -> confirm
- schedule draft -> edit -> confirm
- assignment/event draft -> missing slot -> fill slot -> confirm
- course review -> fill missing fields -> confirm
- cancel flow
- normal read query like "今天有什么课"

- [ ] **Step 2: Verify fallback still works if needed**

Temporarily flip the flag off and confirm the app still boots and basic agent interactions do not hard-crash. This is a safety validation, not a long-term requirement.

- [ ] **Step 3: Record any behavior mismatch and fix before flag removal**

No flag removal until manual regression is clean.

## Task 9: Remove Legacy Executor Branch And `LANGGRAPH_ENABLED` Flag

**Files:**

- Modify: `services/agent/config.ts`
- Modify: `services/agent/executor.ts`
- Modify: `__tests__/services/agent/executor.test.ts`

- [ ] **Step 1: Delete the old non-graph execution branch**

Only do this after Tasks 1-8 pass.

- [ ] **Step 2: Remove `LANGGRAPH_ENABLED` from config and all tests**

Delete:

```ts
LANGGRAPH_ENABLED: process.env.EXPO_PUBLIC_AGENT_LANGGRAPH_ENABLED === 'true',
```

and remove test toggles that depend on it.

- [ ] **Step 3: Collapse `process()` into graph-only adapter logic**

At this point `process()` always routes through `runAgentGraph(...)`.

- [ ] **Step 4: Run full test suite**

Run:

```bash
npm test -- --runInBand
```

Expected: PASS

## Task 10: Final Cleanup And Size Check

**Files:**

- Modify: `services/agent/executor.ts`

- [ ] **Step 1: Remove leftover dead code from executor**

Delete any remaining methods no longer referenced after legacy branch removal.

- [ ] **Step 2: Confirm `executor.ts` is materially smaller and easier to understand**

Target outcome:

- no routing logic
- no tool execution logic
- no pending-action business logic
- no memory-write business logic

- [ ] **Step 3: Run final sanity tests**

Run:

```bash
npm test -- --runInBand __tests__/services/agent/executor.test.ts __tests__/services/agent/graph/runtime.test.ts
```

Expected: PASS

---

## Verification Checklist

Implementation is not complete unless all of the following are true:

- `pendingAction` survives across graph turns via `sessionState`
- graph handles confirm, cancel, and confirm-with-edit flows
- graph emits structured checkpoints for clarification and confirmation pauses
- executor only assembles context and writes back returned graph state
- feature flag is removed only after graph parity and manual regression are complete
- UI still uses the same public `AgentExecutor` API without caller changes

## Suggested Command Order

Run these commands during implementation:

1. `npm test -- --runInBand __tests__/services/agent/graph/pending_action_state.test.ts`
2. `npm test -- --runInBand __tests__/services/agent/graph/actions.test.ts __tests__/services/agent/graph/runtime.test.ts`
3. `npm test -- --runInBand __tests__/services/agent/executor.test.ts`
4. `npm test -- --runInBand`

## Handoff Note

This file is now safe to execute as an implementation plan. The key change from the previous version is migration order: graph parity first, executor shrink second, flag removal last.
