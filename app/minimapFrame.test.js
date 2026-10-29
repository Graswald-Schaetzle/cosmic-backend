const { parseMinimapFrame, minimapOutput } = require('./minimapFrame');

const frame = {
  origin: [-8.19, 0.64, 5.48],
  u: [12.93, 0, 0.17],
  v: [0.17, 0, -12.93],
};

describe('parseMinimapFrame', () => {
  it('accepts a valid frame and copies it', () => {
    const parsed = parseMinimapFrame(frame);
    expect(parsed).toEqual(frame);
    expect(parsed.origin).not.toBe(frame.origin);
  });

  it.each([
    [undefined, 'required'],
    [{ ...frame, origin: [0, 0] }, 'origin must be three numbers'],
    [{ ...frame, u: [1, 'a', 0] }, 'u must be three numbers'],
    [{ ...frame, v: null }, 'v must be three numbers'],
    [{ ...frame, u: [0, 5, 0] }, 'must run along the floor'],
    [{ ...frame, v: [2 * 12.93, 0, 2 * 0.17] }, 'must not be parallel'],
  ])('rejects %j', (input, message) => {
    expect(() => parseMinimapFrame(input)).toThrow(message);
  });
});

describe('minimapOutput', () => {
  it('returns url and frame', () => {
    expect(minimapOutput('https://x/minimap.png', frame)).toEqual({
      url: 'https://x/minimap.png',
      frame,
    });
  });

  it('is null without a url, without a frame or with a broken frame', () => {
    expect(minimapOutput(null, frame)).toBeNull();
    expect(minimapOutput('https://x/minimap.png', null)).toBeNull();
    expect(
      minimapOutput('https://x/minimap.png', { origin: [0, 0, 0] }),
    ).toBeNull();
  });
});
