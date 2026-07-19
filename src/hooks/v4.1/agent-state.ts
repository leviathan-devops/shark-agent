/**
 * Agent Session State
 * 
 * Tracks which agent is currently active in the session.
 * Uses session-based Map to persist across hook invocations.
 * 
 * V4.8.3 FIX: Module-level variable didn't persist between hooks
 * in containerized environment. Using Map keyed by session ID.
 */

interface AgentState {
  agent: string | undefined;
  timestamp: number;
  slopScore: number;
  lastUserMessage: string;
}

const DEFAULT_SESSION = 'default';
const agentBySession = new Map<string, AgentState>();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Global fallback — the last agent set via setCurrentAgent.
 * Used when sessionID lookup fails (tool hooks may receive different
 * sessionID than chat.message hooks in some opencode versions).
 */
let _lastKnownAgent: string | undefined = undefined;

function cleanupStaleSessions(): void {
  const now = Date.now();
  for (const [sessionId, state] of agentBySession.entries()) {
    if (now - state.timestamp > SESSION_TTL_MS) {
      agentBySession.delete(sessionId);
    }
  }
}

export function setCurrentAgent(agent: string | undefined, sessionId?: string, lastUserMessage?: string): void {
  const sid = sessionId || DEFAULT_SESSION;
  const currentState = agentBySession.get(sid);
  agentBySession.set(sid, {
    agent,
    timestamp: Date.now(),
    slopScore: currentState?.slopScore || 0,
    lastUserMessage: lastUserMessage || currentState?.lastUserMessage || '',
  });
  // Track globally so tool hooks with mismatched sessionIDs can still resolve
  if (agent) _lastKnownAgent = agent;
}

export function getLastUserMessage(sessionId?: string): string {
  const sid = sessionId || DEFAULT_SESSION;
  return agentBySession.get(sid)?.lastUserMessage || '';
}

export function getCurrentAgent(sessionIdOrInput?: string | Record<string, unknown>): string | undefined {
  cleanupStaleSessions();

  // If passed an input object (hook input), extract agent from input fields directly.
  // Uses input.agent, input.agentName, or input.name — NOT input.sessionID.
  if (sessionIdOrInput && typeof sessionIdOrInput === 'object') {
    return extractAgentFromInput(sessionIdOrInput) || _lastKnownAgent;
  }

  const sid = (sessionIdOrInput as string) || DEFAULT_SESSION;
  const state = agentBySession.get(sid);
  if (state?.agent) return state.agent;
  // Fallback 1: try default session (chat.message may have used undefined sessionID)
  const defaultState = agentBySession.get(DEFAULT_SESSION);
  if (defaultState?.agent) return defaultState.agent;
  // Fallback 2: if only one agent is tracked across all sessions, use it
  if (agentBySession.size > 0) {
    const agents = new Set<string>();
    for (const s of agentBySession.values()) {
      if (s.agent) agents.add(s.agent);
    }
    if (agents.size === 1) return agents.values().next().value;
  }
  // Fallback 3: global last-known agent
  return _lastKnownAgent;
}

export function getSlopScore(sessionId?: string): number {
  const sid = sessionId || DEFAULT_SESSION;
  return agentBySession.get(sid)?.slopScore || 0;
}

export function incrementSlopScore(sessionId?: string, amount: number = 1): number {
  const sid = sessionId || DEFAULT_SESSION;
  const state = agentBySession.get(sid);
  if (!state) return 0;
  
  const newScore = state.slopScore + amount;
  agentBySession.set(sid, { ...state, slopScore: newScore });
  return newScore;
}

export function clearCurrentAgent(sessionId?: string): void {
  const sid = sessionId || DEFAULT_SESSION;
  agentBySession.delete(sid);
}

/**
 * Handle agent switch — deload old identity before loading new.
 * Called by session hook when a session.updated event fires for a different agent.
 * Prevents stale agent identity from persisting across agent switches.
 */
export function handleAgentSwitch(sessionId: string | undefined, newAgent: string | undefined): void {
  const sid = sessionId || DEFAULT_SESSION;
  const cached = agentBySession.get(sid);
  if (cached && cached.agent && newAgent && cached.agent !== newAgent) {
    // Agent switch detected — deload old identity BEFORE loading new
    agentBySession.delete(sid);
  }
}

export function getSessionIds(): string[] {
  return Array.from(agentBySession.keys());
}

/**
 * Robustly extract agent identifier from hook input.
 * Checks multiple fields because different opencode versions and hook types
 * populate different fields (agentName, agent, name, sessionID).
 * Used by chat-message-hook and tool hooks for cross-version compatibility.
 */
export function extractAgentFromInput(input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const rec = input as Record<string, unknown>;
  return (typeof rec.agentName === 'string' ? rec.agentName : '')
    || (typeof rec.agent === 'string' ? rec.agent : '')
    || (typeof rec.name === 'string' ? rec.name : '')
    || '';
}
