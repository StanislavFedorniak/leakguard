const REDACTED = '[REDACTED]';

/**
 * Wrapper around a raw secret value.
 *
 * The value is stored in a private field and is returned only by an explicit
 * `reveal()` call, so it cannot leak by accident through `JSON.stringify`,
 * string interpolation, or `console.log`.
 */
export class SecretValue {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  /** Returns the raw value. Call it only to compute a fingerprint. */
  reveal(): string {
    return this.#value;
  }

  get length(): number {
    return this.#value.length;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  /** Used by Node's `util.inspect` (and therefore `console.log`). */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return `SecretValue(${REDACTED})`;
  }
}
