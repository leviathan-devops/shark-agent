# TypeScript State Machine Library — SPEC

## Overview

A lightweight, type-safe state machine library written in TypeScript. It
provides a declarative configuration model, strict transition validation, and
clear error semantics — suitable for everything from UI flows to workflow
orchestration.

---

## Architecture

### File Structure

```
src/
  types.ts    — Enum definitions (State, Event) and configuration interfaces
  machine.ts  — Factory function (createMachine) and runtime types
  index.ts    — Barrel module that re-exports the public API
SPEC.md       — This document
```

### Core Concepts

| Concept        | Description                                                   |
|----------------|---------------------------------------------------------------|
| **State**      | A node in the state graph. Defined by the `State` enum.       |
| **Event**      | A signal that may trigger a transition. Defined by `Event`.   |
| **Transition** | A directed edge `(from, on, to)` declaring a valid move.      |
| **Machine**    | An instance created via `createMachine(config)`. Holds the    |
|                | current state and exposes `getCurrentState`, `send`, `canHandle`. |

### Data Flow

```
                     send(event)
                         │
                         ▼
               ┌─────────────────┐
               │  Transition Map │  O(1) lookup by `${from}:${event}`
               └────────┬────────┘
                        │
              ┌─────────┴──────────┐
              ▼                    ▼
        Transition found      Not found
              │                    │
              ▼                    ▼
      currentState = to    Throw InvalidTransitionError
                                │
                          onError? → callback
```

### Lifecycle

1. **Construction** — `createMachine(config)` validates the config eagerly.
2. **Query** — `getCurrentState()` returns the current state (no side effects).
3. **Guard** — `canHandle(event)` checks if an event would be accepted.
4. **Transition** — `send(event)` mutates state or throws.

---

## API Reference

### `createMachine(config: StateMachineConfig): StateMachine`

Creates a new state machine. Validates the config at construction time
(fail-fast).

**Throws on construction if:**
- `initialState` is missing or not a valid `State` value.
- `transitions` is empty.
- Duplicate `(from, on)` pairs exist.

### `machine.getCurrentState(): State`

Returns the current state. Pure — no side effects, never throws.

### `machine.send(event: Event): State`

Attempts a transition. On success the internal state is updated and the
**new** state is returned.

### `machine.canHandle(event: Event): boolean`

Returns `true` if `send(event)` would succeed from the current state.
Pure — no side effects, never throws.

### `InvalidTransitionError`

Custom `Error` subclass with `.from` (the current state) and `.event` (the
rejected event) properties for programmatic inspection.

---

## Error Handling

### Design Principles

1. **Fail-fast at construction** — Invalid configs are rejected immediately
   when `createMachine` is called, not when a transition is attempted.
2. **Fail-loud at runtime** — Invalid `send()` calls throw synchronously.
   Silent swallowing of invalid transitions is explicitly avoided.
3. **Callback hook** — The optional `onError` callback lets consumers log,
   report metrics, or notify telemetry *before* the exception propagates.

### Error Scenarios

| Scenario                           | Error Type                | When                             |
|------------------------------------|---------------------------|----------------------------------|
| Missing `initialState`             | `Error`                   | `createMachine()`                |
| Empty `transitions` array          | `Error`                   | `createMachine()`                |
| Invalid `initialState` value       | `Error`                   | `createMachine()`                |
| Duplicate `(from, on)` pair        | `Error`                   | `createMachine()`                |
| Event not valid in current state   | `InvalidTransitionError`  | `machine.send(event)`            |

### Error Handling Example

```ts
import { State, Event, createMachine, InvalidTransitionError } from './src/index.js';

const machine = createMachine({
  initialState: State.IDLE,
  onError: (err) => {
    console.warn('[state-machine]', err.message);
    // e.g. send to error tracking service
  },
  transitions: [
    { from: State.IDLE, to: State.LOADING, on: Event.START },
    { from: State.LOADING, to: State.SUCCESS, on: Event.COMPLETE },
    { from: State.LOADING, to: State.ERROR, on: Event.FAIL },
  ],
});

try {
  machine.send(Event.COMPLETE); // ERROR — machine is still in IDLE
} catch (e) {
  if (e instanceof InvalidTransitionError) {
    console.error(`Cannot ${e.event} when in ${e.from}`);
    // Output: Cannot complete when in idle
  }
}
```

### Why Not Silent Ignore?

Silently ignoring invalid transitions leads to **state drift** — the
application believes it is in one state when it is actually in another. This
produces subtle, hard-to-reproduce bugs. The library therefore **throws** by
design, making invalid sequences visible immediately.

---

## Default Transition Table

The library ships with a pre-defined `State` and `Event` enum but places no
restrictions on valid paths — the consumer defines every transition in the
config. A typical flow:

```
                  START
    ┌─────┐ ──────────► ┌─────────┐
    │ IDLE│             │ LOADING │
    └─────┘ ◄────────── └────┬────┘
     ▲    │          RESET    │
     │    │          ┌───COMPLETE──┐
     │    │          │            │
     │    │          ▼            ▼
     │    │    ┌─────────┐  ┌─────────┐
     │    └────│ SUCCESS │  │  ERROR  │
     │  RESET  └─────────┘  └────┬────┘
     │                           │
     └───────────────────────────┘
              RETRY
```

---

## Testing Strategy

### Unit Tests (via Vitest)

| Test Area                 | What It Covers                               |
|---------------------------|----------------------------------------------|
| Construction validation   | Missing / empty / duplicate / invalid config |
| Successful transitions    | State advances as defined in the transition  |
| Invalid transitions       | `InvalidTransitionError` is thrown           |
| `canHandle` guard         | Returns correct boolean before sending       |
| `onError` callback        | Callback fires before the throw              |
| Edge cases                | No transitions defined, unknown events       |

### Running Tests

```bash
npx vitest run
```
