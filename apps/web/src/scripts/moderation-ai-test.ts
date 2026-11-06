import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * End-to-end check of the moderation pipeline (rules + AI models) against the files in outputs/test_files.
 *
 * `moderation-ai-test -- --mode shadow|enforce [--files <dir>] [--cleanup]`
 *
 * Every post goes through the same steps as a real write: assertTextAllowed, initialStatus, then scanTarget.
 * Everything is written by one clone account. A run first deletes that account and all it left behind,
 * and the new data stays after the run so it can be read in the admin panel. `--cleanup` only deletes.
 */
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const option = (name: string) => { const index = args.indexOf(name); return index === -1 ? undefined : args[index + 1]; };
const mode = option('--mode');
const cleanupOnly = args.includes('--cleanup');
if (!cleanupOnly && mode !== 'shadow' && mode !== 'enforce' && mode !== 'auto') {
  console.error('Usage: moderation-ai-test --mode <shadow|enforce|auto> [--files <dir>] [--cleanup]');
  process.exit(1);
}
// env.ts reads MODERATION_MODE once at import, so it has to be set before anything from the app is loaded.
if (mode) process.env.MODERATION_MODE = mode;

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const FILES = path.resolve(option('--files') ?? path.join(ROOT, 'outputs/test_files'));
const RESULTS = path.join(FILES, 'results');
const UPLOADS = path.resolve(process.cwd(), 'uploads');
const CLONE = { username: 'modtest_clone', email: 'modtest_clone@oremus.test', displayName: 'Moderation Test Clone' };
const MEDIA_EXT = /\.(jpe?g|png|webp|gif|mp4|mov|webm|m4v)$/i;
const VIDEO_EXT = /\.(mp4|mov|webm|m4v)$/i;

const { connectInfrastructure, disconnectInfrastructure } = await import('../config/database.js');
const { env } = await import('../config/env.js');
const { ModerationCase, ModerationScan, Notification, Post, Report, User } = await import('../models/index.js');
const { assertTextAllowed, initialStatus } = await import('../services/moderation.service.js');
const { scanTarget } = await import('../jobs/moderation.job.js');
const { checkRules } = await import('../moderation/rules.js');
const { QUARANTINE } = await import('../moderation/quarantine.js');

type Level = 'block' | 'flag' | 'ok' | 'media';
type Case = { source: string; level: Level; category: string; text: string; media?: string };
type Outcome = { rejected: boolean; status?: string; scan?: any; case?: any; ruleMatches: string[] };

/** Section headers pick the level ("# ===== ... BLOCK"), "## name" picks the category, every other line is one post. */
async function readCases(file: string): Promise<Case[]> {
  const source = path.relative(FILES, file).replace(/\\/g, '/');
  const lines = (await fs.readFile(file, 'utf8')).split(/\r?\n/);
  const cases: Case[] = [];
  let level: Level | null = null, category = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('# =====')) { level = /BLOCK/i.test(line) ? 'block' : /FLAG/i.test(line) ? 'flag' : /OK/i.test(line) ? 'ok' : null; continue; }
    if (line.startsWith('## ')) { category = line.slice(3).trim(); continue; }
    if (!line || line.startsWith('#') || !level) continue;
    cases.push({ source, level, category, text: line });
  }
  return cases;
}

/** Every *.txt is a list of posts; every picture or video in sexual_content must be caught as sexual. */
async function loadCases(): Promise<Case[]> {
  const cases: Case[] = [];
  for (const dir of await fs.readdir(FILES, { withFileTypes: true })) {
    if (!dir.isDirectory() || dir.name === 'results') continue;
    for (const name of await fs.readdir(path.join(FILES, dir.name))) {
      const file = path.join(FILES, dir.name, name);
      if (name.endsWith('.txt')) cases.push(...await readCases(file));
      else if (MEDIA_EXT.test(name)) cases.push({ source: `${dir.name}/${name}`, level: 'media', category: dir.name.replace(/_content$/, ''), text: '', media: file });
    }
  }
  return cases;
}

/** Deletes the clone and everything it wrote or received, including its uploaded copies. */
async function removeClone(): Promise<void> {
  const user: any = await User.findOne({ username: CLONE.username }).select('_id').lean();
  if (!user) return;
  const posts = await Post.find({ authorId: user._id }).select('media').lean();
  const names = posts.flatMap((post: any) => post.media.map((item: any) => path.basename(item.url)));
  await Promise.all(names.flatMap((name) => [path.join(UPLOADS, name), path.join(QUARANTINE, name)].map((file) => fs.rm(file, { force: true }))));
  await Promise.all([
    Post.deleteMany({ authorId: user._id }),
    ModerationScan.deleteMany({ authorId: user._id }),
    ModerationCase.deleteMany({ authorId: user._id }),
    Notification.deleteMany({ recipientId: user._id }),
    Report.deleteMany({ targetId: { $in: posts.map((post: any) => post._id) } })
  ]);
  await User.deleteOne({ _id: user._id });
  console.log(`Deleted the old ${CLONE.username} account, ${posts.length} posts and ${names.length} files.`);
}

async function createClone(): Promise<string> {
  // Nobody signs in as the clone, so its password is random and never kept.
  const user = await User.create({ ...CLONE, passwordHash: `!${randomBytes(24).toString('hex')}` });
  return String(user._id);
}

/** The write path of a post, followed by the scan the jobs worker would run. */
async function run(authorId: string, test: Case): Promise<Outcome> {
  const ruleMatches = checkRules(test.text).matches;
  try { assertTextAllowed(test.text); }
  catch (error: any) {
    if (error?.code === 'CONTENT_REJECTED') return { rejected: true, ruleMatches };
    throw error;
  }
  let media: any[] = [];
  if (test.media) {
    const name = `modtest-${randomBytes(6).toString('hex')}${path.extname(test.media).toLowerCase()}`;
    await fs.mkdir(UPLOADS, { recursive: true });
    await fs.copyFile(test.media, path.join(UPLOADS, name));
    media = [{ url: `/uploads/${name}`, mimeType: VIDEO_EXT.test(name) ? 'video/mp4' : 'image/jpeg' }];
  }
  const post = await Post.create({ authorId, content: test.text, media, moderationStatus: initialStatus(media.length > 0) });
  await scanTarget({ targetType: 'Post', targetId: String(post._id) });
  const [saved, scan, found]: any[] = await Promise.all([
    Post.findById(post._id).select('moderationStatus').lean(),
    ModerationScan.findOne({ targetId: post._id }).sort({ createdAt: -1 }).lean(),
    ModerationCase.findOne({ targetType: 'Post', targetId: post._id }).lean()
  ]);
  return { rejected: false, status: saved?.moderationStatus, scan, case: found, ruleMatches };
}

/** What each mode must do. Shadow never changes what members see; enforce acts on it. Returns the problems found. */
function check(test: Case, outcome: Outcome): string[] {
  const problems: string[] = [];
  const expect = (ok: boolean, problem: string) => { if (!ok) problems.push(problem); };
  const caught = (categories: string[] = []) => categories.includes(test.category);
  if (test.level === 'block' || test.level === 'flag') expect(outcome.ruleMatches.length > 0, 'no keyword matched');
  if (test.level === 'ok') expect(outcome.ruleMatches.length === 0, `keyword matched: ${outcome.ruleMatches.join(', ')}`);

  if (mode === 'shadow') {
    expect(!outcome.rejected, 'write was refused in shadow mode');
    if (outcome.rejected) return problems;
    expect(outcome.status === 'approved', `status ${outcome.status}, members should see no change`);
    expect(!outcome.case, 'a case was opened in shadow mode');
    expect(outcome.scan?.shadow === true, 'no shadow scan was recorded');
    if (test.level === 'ok') expect(outcome.scan?.decision === 'approved', `would be ${outcome.scan?.decision} (${outcome.scan?.categories?.join(', ')})`);
    else expect(outcome.scan?.decision !== 'approved' && caught(outcome.scan?.categories), `would be ${outcome.scan?.decision}, categories [${outcome.scan?.categories?.join(', ') ?? ''}]`);
    return problems;
  }

  if (test.level === 'block') { expect(outcome.rejected, 'write was not refused'); return problems; }
  expect(!outcome.rejected, 'write was refused');
  if (outcome.rejected) return problems;
  if (test.level === 'ok') {
    expect(outcome.status === 'approved', `status ${outcome.status} (${outcome.scan?.categories?.join(', ')})`);
    expect(!outcome.case, 'a case was opened');
  } else {
    expect(outcome.status === 'limited' || outcome.status === 'removed', `status ${outcome.status}`);
    expect(caught(outcome.case?.categories), `case categories [${outcome.case?.categories?.join(', ') ?? 'no case'}]`);
  }
  return problems;
}

const action = (outcome: Outcome) => (outcome.rejected ? 'rejected' : mode === 'shadow' ? `would be ${outcome.scan?.decision ?? '?'}` : outcome.status ?? '?');
const topScore = (scores: Record<string, number> = {}) => Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([key, value]) => `${key} ${value.toFixed(2)}`).join(', ');

async function main() {
  await connectInfrastructure();
  await removeClone();
  if (cleanupOnly) return;
  const health: any = await fetch(`${env.MODERATION_URL}/health`).then((response) => response.json()).catch(() => null);
  if (health?.status !== 'ready') throw new Error(`The moderation service at ${env.MODERATION_URL} is ${health?.status ?? 'not reachable'}. Start it and wait for the models before running this test.`);

  const authorId = await createClone();
  const cases = await loadCases();
  console.log(`Mode ${mode}: ${cases.length} cases from ${FILES} as @${CLONE.username}.\n`);
  const results = [];
  for (const [index, test] of cases.entries()) {
    const outcome = await run(authorId, test);
    const problems = check(test, outcome);
    const label = test.media ? path.basename(test.media) : test.text;
    console.log(`${problems.length ? 'FAIL' : 'pass'}  ${String(index + 1).padStart(3)}  ${test.level.padEnd(5)} ${test.category.padEnd(10)} ${action(outcome).padEnd(20)} ${label.slice(0, 50)}${outcome.scan ? `  [${topScore(outcome.scan.scores)}]` : ''}`);
    for (const problem of problems) console.log(`            - ${problem}`);
    results.push({ ...test, media: test.media && path.basename(test.media), action: action(outcome), problems, ruleMatches: outcome.ruleMatches, scores: outcome.scan?.scores, categories: outcome.scan?.categories, caseId: outcome.case?._id });
  }

  const failed = results.filter((result) => result.problems.length);
  console.log(`\n${results.length - failed.length}/${results.length} passed in ${mode} mode.`);
  for (const level of ['block', 'flag', 'ok', 'media']) {
    const group = results.filter((result) => result.level === level);
    if (group.length) console.log(`  ${level.padEnd(5)} ${group.length - group.filter((result) => result.problems.length).length}/${group.length}`);
  }
  await fs.mkdir(RESULTS, { recursive: true });
  const report = path.join(RESULTS, `${mode}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await fs.writeFile(report, JSON.stringify({ mode, ranAt: new Date(), passed: results.length - failed.length, total: results.length, results }, null, 2));
  console.log(`Report: ${report}`);
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await disconnectInfrastructure(); process.exit(); });
