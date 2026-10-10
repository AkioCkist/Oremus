import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Balanced defaults: H.264/AAC MP4 (plays everywhere), long edge capped at 1280px (720p),
 * CRF 23 with a 4 Mbps ceiling, at most 30 fps. `faster` keeps CPU time reasonable on a small server.
 */
export const VIDEO_MAX_EDGE = 1280;
export const VIDEO_CRF = 23;
const TRANSCODE_TIMEOUT_MS = 20 * 60 * 1000;

export function transcodeArgs(input: string, output: string): string[] {
  return [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', input,
    '-map', '0:v:0', '-map', '0:a:0?', '-map_metadata', '-1', '-sn', '-dn',
    '-vf', `scale='min(${VIDEO_MAX_EDGE},iw)':'min(${VIDEO_MAX_EDGE},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`,
    '-fpsmax', '30',
    '-c:v', 'libx264', '-preset', 'faster', '-crf', String(VIDEO_CRF), '-maxrate', '4M', '-bufsize', '8M',
    '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
    '-movflags', '+faststart',
    output
  ];
}

/** Picks a representative (non-black) frame from the first couple of seconds as the poster. */
export function posterArgs(input: string, output: string): string[] {
  return ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-vf', 'thumbnail=60', '-frames:v', '1', '-q:v', '4', output];
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(env.FFMPEG_PATH, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); });
    const timer = setTimeout(() => child.kill('SIGKILL'), TRANSCODE_TIMEOUT_MS);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg ${signal ? `killed by ${signal}` : `exited with ${code}`}: ${stderr.trim()}`));
    });
  });
}

export type CompressedVideo = { path: string; filename: string; posterPath: string; posterFilename: string };

/** Transcodes into new files next to the input; the input is left for the caller to remove. */
export async function compressVideo(inputPath: string): Promise<CompressedVideo> {
  const id = crypto.randomUUID();
  const dir = path.dirname(inputPath);
  const result = { path: path.join(dir, `${id}.mp4`), filename: `${id}.mp4`, posterPath: path.join(dir, `${id}.jpg`), posterFilename: `${id}.jpg` };
  try {
    await runFfmpeg(transcodeArgs(inputPath, result.path));
    await runFfmpeg(posterArgs(result.path, result.posterPath));
    return result;
  } catch (error) {
    await Promise.all([fs.rm(result.path, { force: true }), fs.rm(result.posterPath, { force: true })]);
    throw error;
  }
}
