import { describe, expect, it } from 'vitest';
import { centerSquareCrop } from './frameCrop';

describe('centerSquareCrop', () => {
  it('keeps a square crop centered in a widescreen frame', () => {
    expect(centerSquareCrop(1280, 720)).toEqual({
      sx: 280,
      sy: 0,
      side: 720,
      out: 720,
    });
  });

  it('caps a large square so decoding stays fast', () => {
    expect(centerSquareCrop(1920, 1920)).toEqual({
      sx: 0,
      sy: 0,
      side: 1920,
      out: 720,
    });
  });

  it('returns null until the camera has a real frame', () => {
    expect(centerSquareCrop(0, 720)).toBeNull();
  });
});
