const {
  mapProviderStatus,
  describeFailure,
  describeApiError,
  splatUrlFromJson,
  webhookToken,
  isValidWebhookToken,
  webhookUrl,
  frameCountError,
} = require('./spaitialResolver');

describe('mapProviderStatus', () => {
  test('maps the documented and the likely status values', () => {
    expect(mapProviderStatus('PENDING')).toBe('queued');
    expect(mapProviderStatus('FAILED')).toBe('failed');
    expect(mapProviderStatus('completed')).toBe('completed');
    expect(mapProviderStatus('SUCCEEDED')).toBe('completed');
  });

  test('treats unknown values as still running and a missing value as queued', () => {
    expect(mapProviderStatus('PROCESSING')).toBe('training_splat');
    expect(mapProviderStatus('SOMETHING_NEW')).toBe('training_splat');
    expect(mapProviderStatus(undefined)).toBe('queued');
  });
});

describe('describeFailure', () => {
  test('lists validation errors and skips warnings', () => {
    const message = describeFailure({
      status: 'FAILED',
      validation: {
        passed: false,
        issues: [
          {
            code: 'TRAJECTORY_COUNT_MISMATCH',
            severity: 'error',
            message: '12 poses, 14 images',
          },
          { code: 'LOW_LIGHT', severity: 'warning', message: 'dark' },
        ],
      },
    });
    expect(message).toBe(
      'Capture rejected: TRAJECTORY_COUNT_MISMATCH: 12 poses, 14 images',
    );
  });

  test('falls back to a generic message', () => {
    expect(describeFailure({ status: 'FAILED' })).toBe(
      'SpAItial reported the capture as failed',
    );
    expect(describeFailure({ error: { message: 'boom' } })).toBe('boom');
  });
});

describe('describeApiError', () => {
  test('includes status and error code', () => {
    const error = {
      response: {
        status: 402,
        data: { error: { code: 'INSUFFICIENT_CREDITS', message: 'top up' } },
      },
    };
    expect(describeApiError(error)).toBe(
      'SpAItial API 402 INSUFFICIENT_CREDITS: top up',
    );
  });

  test('reports network errors', () => {
    expect(describeApiError({ message: 'timeout' })).toBe(
      'SpAItial request failed: timeout',
    );
  });
});

describe('splatUrlFromJson', () => {
  test('finds an https URL and ignores anything else', () => {
    expect(splatUrlFromJson({ url: 'https://files.example/splat.spz' })).toBe(
      'https://files.example/splat.spz',
    );
    expect(
      splatUrlFromJson({ splat: { url: 'https://files.example/a' } }),
    ).toBe('https://files.example/a');
    expect(splatUrlFromJson({ url: 'http://insecure.example/a' })).toBeNull();
    expect(splatUrlFromJson({})).toBeNull();
  });
});

describe('webhook token', () => {
  const secret = 'test-secret';

  test('is stable per job and differs between jobs', () => {
    expect(webhookToken(7, secret)).toBe(webhookToken('7', secret));
    expect(webhookToken(7, secret)).not.toBe(webhookToken(8, secret));
    expect(webhookToken(7, secret)).toMatch(/^[0-9a-f]{64}$/);
  });

  test('validates only the matching token', () => {
    expect(isValidWebhookToken(7, webhookToken(7, secret), secret)).toBe(true);
    expect(isValidWebhookToken(8, webhookToken(7, secret), secret)).toBe(false);
    expect(isValidWebhookToken(7, 'short', secret)).toBe(false);
    expect(isValidWebhookToken(7, undefined, secret)).toBe(false);
    expect(isValidWebhookToken(7, webhookToken(7, secret), '')).toBe(false);
  });

  test('builds the webhook URL without leaking the secret', () => {
    const previous = process.env.SPAITIAL_WEBHOOK_SECRET;
    process.env.SPAITIAL_WEBHOOK_SECRET = secret;
    try {
      const url = webhookUrl(7, 'https://backend.example/');
      expect(url).toBe(
        `https://backend.example/room-captures/7/webhook?token=${webhookToken(7, secret)}`,
      );
      expect(url).not.toContain(secret);
      expect(webhookUrl(7, '')).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.SPAITIAL_WEBHOOK_SECRET;
      else process.env.SPAITIAL_WEBHOOK_SECRET = previous;
    }
  });
});

describe('frameCountError', () => {
  test('accepts 1 to 5000 whole frames', () => {
    expect(frameCountError(1)).toBeNull();
    expect(frameCountError(5000)).toBeNull();
    expect(frameCountError(0)).not.toBeNull();
    expect(frameCountError(5001)).not.toBeNull();
    expect(frameCountError(12.5)).not.toBeNull();
    expect(frameCountError(NaN)).not.toBeNull();
  });
});
