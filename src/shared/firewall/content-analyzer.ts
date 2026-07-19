/**
 * Content Analyzer — semantic detection of theatrical content patterns.
 *
 * Replaces 4 regex arrays in guardian-hook.ts layerTheatrical:
 *   THEATRICAL_CLAIM_PATTERNS (emoji/markdown tool headers)
 *   THEATRICAL_DELETION_IN_CONTENT (delete/start-from-scratch language)
 *   OFF_TOPIC_IN_CONTENT (malware/AWS/download references)
 *   EXCUSE_PATTERNS_IN_CONTENT (not-my-job/can't-help language)
 *
 * SEMANTIC ADVANTAGE:
 * Instead of checking each regex array separately, this provides a
 * FEATURE VECTOR — combining multiple signals into a structured result.
 * A single ✅ emoji is not enough to block. But ✅ + tool simulation
 * language + code block = clear theatrical pattern.
 * An agent can avoid "✅" by using "DONE" — but they cannot avoid
 * the STRUCTURAL pattern of claiming results without running tools.
 */

export interface ContentAnalysis {
  /** Content contains emoji-based tool headers (⚙ ✅ ❌) */
  hasEmojiToolHeader: boolean;
  /** Content contains markdown faux-tool headers (**Tool: name**) */
  hasFauxToolHeader: boolean;
  /** Content describes tool results without running them */
  hasToolSimulation: boolean;
  /** Content instructs deleting all code and starting over */
  hasDeletionIntent: boolean;
  /** Content references unrelated external resources */
  hasOffTopicReferences: boolean;
  /** Content makes excuses for not doing work */
  hasExcuseLanguage: boolean;
  /** Overall — content is simulating tool execution theatrically */
  isTheatricalSimulation: boolean;
  /** Human-readable reason if flagged */
  reason: string;
}

/**
 * Analyze message/file content for theatrical patterns.
 * Returns a structured analysis with feature flags and overall verdict.
 */
export function analyzeContent(content: string): ContentAnalysis {
  const lines = content.split('\n');
  let hasEmojiToolHeader = false;
  let hasFauxToolHeader = false;
  let hasToolSimulation = false;
  let hasDeletionIntent = false;
  let hasOffTopicReferences = false;
  let hasExcuseLanguage = false;

  // Check each line for tool headers
  for (const line of lines) {
    const trimmed = line.trim();

    // Emoji-based tool headers: ⚙ tool-name, ✅ tool-name:, ❌ tool-name:
    if (/^[⚙✅❌🔍📋📝]\s+\w[\w-]+\s*[:：]/.test(trimmed)) {
      hasEmojiToolHeader = true;
    }

    // Markdown faux-tool headers: **Tool: tool-name**
    if (/^\*\*Tool:\s+\w[\w-]+\*\*/.test(trimmed)) {
      hasFauxToolHeader = true;
    }

    // Tool simulation language
    if (/^(Here are|This is|Here's|These are|Below are)\s+(the\s+)?(results|output|findings|report)/im.test(trimmed)) {
      hasToolSimulation = true;
    }
    if (/^(Running|Executing|Starting|Performing)\s+\w[\w-]+\s*(\.\.\.|:|\n)/im.test(trimmed)) {
      hasToolSimulation = true;
    }
  }

  // Check full content for deletion intent
  if (/\b(delete\s+all\s+(of\s+)?(the\s+)?(code|files|content)|start\s+(from\s+)?(scratch|fresh|clean|zero)|build\s+(a\s+)?(from\s+)?scratch|strip\s+(out|down|everything)|remove\s+(everything|all)|nuclear\s+(option|approach|reset)|clean\s+(slate|start)|start\s+over)\b/i.test(content)) {
    hasDeletionIntent = true;
  }

  // Check for off-topic references
  if (/\b(evil\.com|malware\.com|hack\.com|exploit\.com)\b/i.test(content)) {
    hasOffTopicReferences = true;
  }

  // Check for excuse language
  if (/\b(not\s+my\s+(job|problem|fault|responsibility)|can'?t\s+(really|actually)\s+(help|do|fix)|that'?s\s+(just|not)\s+(how|what)\s+(it\s+)?(works?|happens)|just\s+ignore\s+(it|this|that)|(skip|ignore)\s+(the\s+)?(bug|issue|problem))\b/i.test(content)) {
    hasExcuseLanguage = true;
  }

  // Determine if this is theatrical simulation
  // Requires at least 2 signals: header + simulation, or header + code block
  const isTheatricalSimulation = (hasEmojiToolHeader || hasFauxToolHeader) && hasToolSimulation;

  // Build reason
  let reason = '';
  if (isTheatricalSimulation) reason = 'Content simulates tool execution via formatted headers and result descriptions. Use actual tools instead of formatted output.';
  else if (hasDeletionIntent) reason = 'Content instructs deleting all code and starting from scratch. Fix existing code instead.';
  else if (hasOffTopicReferences) reason = 'Content contains references to unrelated external resources.';
  else if (hasExcuseLanguage) reason = 'Content makes excuses instead of fixing problems.';

  return {
    hasEmojiToolHeader,
    hasFauxToolHeader,
    hasToolSimulation,
    hasDeletionIntent,
    hasOffTopicReferences,
    hasExcuseLanguage,
    isTheatricalSimulation,
    reason,
  };
}
