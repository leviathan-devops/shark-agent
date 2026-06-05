/**
 * Brain Messenger — Priority Cross-Brain Signals
 *
 * Provides async priority-based messaging between brains.
 * Priority: critical > high > normal > low
 */

export type BrainName = 'shark-execution' | 'shark-reasoning' | 'shark-system';
export type MessagePriority = 'critical' | 'high' | 'normal' | 'low';
export type MessageType = 'gate-failure' | 'context-inject' | 'checkpoint' | 'derailment' | 'phase-transition' | 'evidence-ready';

export interface BrainMessage {
  id: string;
  from: BrainName;
  to: BrainName;
  type: MessageType;
  priority: MessagePriority;
  payload: Record<string, unknown>;
  requiresAck: boolean;
  timestamp: string;
}

export interface BrainMessenger {
  send(msg: Omit<BrainMessage, 'timestamp' | 'id'>): void;
  receive(to: BrainName): BrainMessage[];
  peek(to: BrainName): BrainMessage | null;
  ack(msgId: string): void;
  clear(to: BrainName): void;
  getPendingAckCount(): number;
}

const PRIORITY_ORDER: Record<MessagePriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

let messageIdCounter = 0;
const messageStore = new Map<string, BrainMessage[]>();

function getMessageQueue(brain: BrainName): BrainMessage[] {
  if (!messageStore.has(brain)) {
    messageStore.set(brain, []);
  }
  return messageStore.get(brain)!;
}

function sortByPriority(messages: BrainMessage[]): BrainMessage[] {
  return [...messages].sort((a, b) => {
    const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  });
}

export function createBrainMessenger(): BrainMessenger {
  const pendingAcks = new Map<string, { messageId: string; timestamp: number }>();

  function purgeExpiredAcks(): void {
    const now = Date.now();
    for (const [id, entry] of pendingAcks) {
      if (now - entry.timestamp > 30000) {
        console.error(`[BrainMessenger] Critical message ${id} was not acknowledged within 30s`);
        pendingAcks.delete(id);
      }
    }
  }

  return {
    send(msg: Omit<BrainMessage, 'timestamp' | 'id'>): void {
      purgeExpiredAcks();
      const queue = getMessageQueue(msg.to);
      const id = `msg-${++messageIdCounter}`;
      const message: BrainMessage = {
        ...msg,
        id,
        timestamp: new Date().toISOString(),
      };
      queue.push(message);

      if (msg.requiresAck) {
        pendingAcks.set(id, { messageId: id, timestamp: Date.now() });
      }
    },

    receive(to: BrainName): BrainMessage[] {
      purgeExpiredAcks();
      const queue = getMessageQueue(to);
      const sorted = sortByPriority(queue);
      queue.length = 0;
      return sorted;
    },

    peek(to: BrainName): BrainMessage | null {
      const queue = getMessageQueue(to);
      if (queue.length === 0) return null;
      return sortByPriority(queue)[0];
    },

    ack(msgId: string): void {
      purgeExpiredAcks();
      if (pendingAcks.has(msgId)) {
        pendingAcks.delete(msgId);
      }
    },

    clear(to: BrainName): void {
      messageStore.set(to, []);
    },

    getPendingAckCount(): number {
      purgeExpiredAcks();
      return pendingAcks.size;
    },
  };
}

export function createGateFailureMessage(
  to: BrainName,
  gateId: string,
  failure: string
): Omit<BrainMessage, 'timestamp' | 'id'> {
  return {
    from: 'shark-system',
    to,
    type: 'gate-failure',
    priority: 'critical',
    payload: { gateId, failure },
    requiresAck: true,
  };
}

export function createContextInjectMessage(
  to: BrainName,
  thinkingState: Record<string, unknown>
): Omit<BrainMessage, 'timestamp' | 'id'> {
  return {
    from: 'shark-reasoning',
    to,
    type: 'context-inject',
    priority: 'high',
    payload: { thinkingState },
    requiresAck: false,
  };
}

export function createCheckpointMessage(
  to: BrainName,
  phase: string,
  completedFiles: number
): Omit<BrainMessage, 'timestamp' | 'id'> {
  return {
    from: 'shark-execution',
    to: 'shark-system',
    type: 'checkpoint',
    priority: 'normal',
    payload: { phase, completedFiles },
    requiresAck: false,
  };
}

export function createDerailmentMessage(
  to: BrainName,
  detection: string,
  severity: 'critical' | 'high' | 'medium' | 'low'
): Omit<BrainMessage, 'timestamp' | 'id'> {
  return {
    from: 'shark-system',
    to,
    type: 'derailment',
    priority: severity === 'critical' ? 'critical' : 'high',
    payload: { detection, severity },
    requiresAck: true,
  };
}
