/**
 * One-time data change. Applied migrations are recorded in the `migrations` collection by `id`,
 * so `up` runs at most once per database. Keep `up` idempotent anyway: a crash halfway through
 * leaves no record, and the next run starts it again.
 */
export type Migration = {
  /** Stable, unique id. Never rename it after it has shipped, or it will run again. */
  id: string;
  description: string;
  /** Returns an optional one-line summary for the log. */
  up: () => Promise<string | void>;
};
