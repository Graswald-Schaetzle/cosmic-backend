const {
  parsePlacement,
  legacyPlacement,
  currentPlacement,
  frameDelta,
  applyDelta,
  buildFrame,
} = require('./spaceFrame');

const close = (actual, expected) =>
  expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 9));

const place = (scale, rotation_deg, translation) => ({ scale, rotation_deg, translation });

describe('parsePlacement', () => {
  it('accepts a valid placement and copies it', () => {
    const input = place(1.5, [180, 0, 0], [0, 1, 0]);
    const parsed = parsePlacement(input);
    expect(parsed).toEqual(input);
    expect(parsed.rotation_deg).not.toBe(input.rotation_deg);
  });

  it.each([
    [undefined, 'required'],
    [place('1', [0, 0, 0], [0, 0, 0]), 'scale must be a number'],
    [place(0, [0, 0, 0], [0, 0, 0]), 'scale must be between'],
    [place(1000, [0, 0, 0], [0, 0, 0]), 'scale must be between'],
    [place(1, [0, 0], [0, 0, 0]), 'rotation_deg'],
    [place(1, [0, 0, NaN], [0, 0, 0]), 'rotation_deg'],
    [place(1, [0, 0, 0], [0, 0, null]), 'translation'],
  ])('rejects %j', (input, message) => {
    expect(() => parsePlacement(input)).toThrow(message);
  });
});

describe('currentPlacement', () => {
  it('falls back to the legacy rotation of splat_view', () => {
    const space = { splat_view: { rotation_deg: [180, 0, 0] }, space_frame: null };
    expect(currentPlacement(space)).toEqual(place(1, [180, 0, 0], [0, 0, 0]));
    expect(legacyPlacement(null)).toEqual(place(1, [0, 0, 0], [0, 0, 0]));
  });

  it('prefers the stored frame', () => {
    const placement = place(2, [0, 90, 0], [1, 2, 3]);
    const space = { splat_view: { rotation_deg: [180, 0, 0] }, space_frame: buildFrame(3, placement) };
    expect(currentPlacement(space)).toEqual(placement);
  });
});

describe('frameDelta', () => {
  it('is the identity when nothing changes', () => {
    const placement = place(1.3, [20, 30, 40], [1, 2, 3]);
    const delta = frameDelta(placement, placement);
    close(delta, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
  });

  it('keeps a point on the model: delta(old(p)) equals new(p)', () => {
    const before = place(1, [180, 0, 0], [0, 0, 0]);
    const after = place(2.5, [10, -35, 70], [1, -2, 0.5]);
    const source = [0.4, -1.2, 3];
    const inSpace = (placement, p) => {
      // Go through frameDelta against the identity placement to evaluate a placement.
      const identity = place(1, [0, 0, 0], [0, 0, 0]);
      return applyDelta(frameDelta(identity, placement), p);
    };
    const delta = frameDelta(before, after);
    close(applyDelta(delta, inSpace(before, source)), inSpace(after, source));
  });

  it('scales and translates as expected for a simple recalibration', () => {
    const before = place(1, [0, 0, 0], [0, 0, 0]);
    const after = place(2, [0, 0, 0], [0, -1, 0]);
    close(applyDelta(frameDelta(before, after), [1, 1, 1]), [2, 1, 2]);
  });

  it('turns 180 degrees about X into a flipped Y and Z', () => {
    const before = place(1, [0, 0, 0], [0, 0, 0]);
    const after = place(1, [180, 0, 0], [0, 0, 0]);
    close(applyDelta(frameDelta(before, after), [1, 2, 3]), [1, -2, -3]);
  });
});
