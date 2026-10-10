// Template for a new migration: copy to `NNN-short-name.ts`, rename the export, then add it to `index.ts`.
// This file is not registered, so it never runs.
import type { Migration } from './types.js';

export const exampleMigration: Migration = {
  id: 'example-change-v1',
  description: 'What changes in the data, and why.',
  async up() {
    // Prefer updateMany with a filter that only matches unmigrated documents, so a re-run is harmless:
    // const result = await Post.updateMany({ newField: { $exists: false } }, { $set: { newField: 'default' } });
    // return `updated ${result.modifiedCount} posts`;
  }
};
