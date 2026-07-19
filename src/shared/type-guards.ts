/**
 * Runtime type guards — SHARK v5.1.0
 * 
 * Every function that accepts external input MUST use these
 * before accessing properties. This eliminates the 227 CRIT
 * type safety violations found in Trident audit.
 */

/** Type guard: value is a plain object (not null, not array) */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);
}

/** Type guard: value is a string */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/** Type guard: value is a number */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

/** Type guard: value is a boolean */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/** Type guard: value is a non-empty string */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** Type guard: value is an array */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/** Type guard: value is a string array */
export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(v => typeof v === 'string');
}

/**
 * Safe property access — extract a string field from an unknown object
 * with runtime validation. Returns defaultValue if field missing or wrong type.
 */
export function safeGetString(obj: Record<string, unknown>, key: string, defaultValue: string = ''): string {
  const val = obj[key];
  return typeof val === 'string' ? val : defaultValue;
}

/**
 * Safe property access — extract a number field from an unknown object.
 */
export function safeGetNumber(obj: Record<string, unknown>, key: string, defaultValue: number = 0): number {
  const val = obj[key];
  return typeof val === 'number' && !isNaN(val) ? val : defaultValue;
}

/**
 * Safe property access — extract a boolean field from an unknown object.
 */
export function safeGetBoolean(obj: Record<string, unknown>, key: string, defaultValue: boolean = false): boolean {
  const val = obj[key];
  return typeof val === 'boolean' ? val : defaultValue;
}

/**
 * Safe property access — extract an array field from an unknown object.
 */
export function safeGetArray(obj: Record<string, unknown>, key: string): unknown[] {
  const val = obj[key];
  return Array.isArray(val) ? val : [];
}

/**
 * Safe property access — extract a record field from an unknown object.
 */
export function safeGetRecord(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const val = obj[key];
  return isRecord(val) ? val : {};
}

/**
 * Parse JSON safely with type assertion.
 * Returns null on parse failure (use safeParseJSONWithFallback for a fallback value).
 */
export function safeParseJSON<T = unknown>(text: string): T | null {
  try {
    const parsed = JSON.parse(text) as T;
    return parsed;
  } catch {
      console.warn('[type-guards] safeParseJSON failed');
      return null;
    }
  }
  
  /**
   * Parse JSON safely with a fallback value.
   * Never throws — returns fallback on parse failure.
   */
  export function safeParseJSONWithFallback<T>(text: string, fallback: T): T {
    try {
      return JSON.parse(text) as T;
    } catch {
      console.warn('[type-guards] safeParseJSONWithFallback failed');
      return fallback;
  }
}
