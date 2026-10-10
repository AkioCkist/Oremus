import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { compressImage, IMAGE_MAX_EDGE } from '../media/image.js';
import { posterArgs, transcodeArgs, VIDEO_MAX_EDGE } from '../media/video.js';

let dir = '';
beforeAll(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'oremus-media-')); });
afterAll(async () => { await fs.rm(dir, { recursive: true, force: true }); });

describe('image compression', () => {
  it('downsizes large photos to WebP, strips metadata and shrinks the file', async () => {
    const input = path.join(dir, 'big.jpg');
    // Smooth gradient plus grain, like a camera photo.
    const raw = Buffer.alloc(3000 * 2000 * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = (Math.floor(i / 9000) + (i % 3) * 60 + Math.floor(Math.random() * 24)) % 256;
    await sharp(raw, { raw: { width: 3000, height: 2000, channels: 3 } }).withExif({ IFD0: { Copyright: 'secret' } }).jpeg({ quality: 95 }).toFile(input);
    const result = await compressImage(input, 'image/jpeg');
    const meta = await sharp(result.path).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width!, meta.height!)).toBe(IMAGE_MAX_EDGE);
    expect(meta.exif).toBeUndefined();
    expect(result.size).toBeLessThan((await fs.stat(input)).size);
  });

  it('never makes flat graphics larger than the original', async () => {
    const input = path.join(dir, 'graphic.png');
    const raw = Buffer.alloc(1200 * 800 * 3); for (let i = 0; i < raw.length; i++) raw[i] = (i * 7919) % 251;
    await sharp(raw, { raw: { width: 1200, height: 800, channels: 3 } }).png().toFile(input);
    const result = await compressImage(input, 'image/png');
    expect(result.size).toBeLessThanOrEqual((await fs.stat(input)).size * 1.05);
  });

  it('never enlarges small photos and applies EXIF rotation', async () => {
    const input = path.join(dir, 'small.jpg');
    await sharp({ create: { width: 300, height: 200, channels: 3, background: '#3b82f6' } }).withMetadata({ orientation: 6 }).jpeg().toFile(input);
    const meta = await sharp((await compressImage(input, 'image/jpeg')).path).metadata();
    expect([meta.width, meta.height]).toEqual([200, 300]);
  });

  it('keeps GIF animation', async () => {
    const input = path.join(dir, 'anim.gif');
    const frame = (background: string) => sharp({ create: { width: 40, height: 40, channels: 3, background } }).png().toBuffer();
    await sharp([await frame('#ff0000'), await frame('#0000ff')], { join: { animated: true } }).gif().toFile(input);
    const meta = await sharp((await compressImage(input, 'image/gif')).path, { animated: true }).metadata();
    expect(meta.pages).toBe(2);
  });

  it('rejects files that are not images', async () => {
    const input = path.join(dir, 'fake.png');
    await fs.writeFile(input, 'not an image');
    await expect(compressImage(input, 'image/png')).rejects.toThrow();
  });
});

describe('video transcoding arguments', () => {
  it('targets web-friendly H.264/AAC with capped size, frame rate and no metadata', () => {
    const args = transcodeArgs('in.mov', 'out.mp4').join(' ');
    expect(args).toContain('-c:v libx264');
    expect(args).toContain('-c:a aac');
    expect(args).toContain(`min(${VIDEO_MAX_EDGE},iw)`);
    expect(args).toContain('force_original_aspect_ratio=decrease');
    expect(args).toContain('-fpsmax 30');
    expect(args).toContain('-map_metadata -1');
    expect(args).toContain('-movflags +faststart');
    expect(args.endsWith('out.mp4')).toBe(true);
  });
  it('grabs a single poster frame', () => {
    expect(posterArgs('a.mp4', 'a.jpg')).toEqual(expect.arrayContaining(['-frames:v', '1', 'a.jpg']));
  });
});
