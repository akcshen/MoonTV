import {
  isSourceDemoted,
  parseVodJson,
  recordSourceFailure,
  recordSourceSuccess,
  resetSourceHealth,
  SOURCE_DEMOTE_COOLDOWN_MS,
  SOURCE_FAILURES_BEFORE_DEMOTE,
} from './sourceHealth';

describe('sourceHealth', () => {
  beforeEach(() => {
    resetSourceHealth();
  });

  it('demotes a source only after consecutive failures', () => {
    const now = 1_000_000;
    recordSourceFailure('wwzy', now);
    expect(isSourceDemoted('wwzy', now)).toBe(false);

    recordSourceFailure('wwzy', now);
    expect(SOURCE_FAILURES_BEFORE_DEMOTE).toBe(2);
    expect(isSourceDemoted('wwzy', now)).toBe(true);
    expect(isSourceDemoted('wwzy', now + SOURCE_DEMOTE_COOLDOWN_MS - 1)).toBe(
      true
    );
    expect(isSourceDemoted('wwzy', now + SOURCE_DEMOTE_COOLDOWN_MS)).toBe(
      false
    );
  });

  it('clears demotion after a successful JSON response', () => {
    recordSourceFailure('heimuer', 10);
    recordSourceFailure('heimuer', 11);
    expect(isSourceDemoted('heimuer', 12)).toBe(true);
    recordSourceSuccess('heimuer');
    expect(isSourceDemoted('heimuer', 12)).toBe(false);
  });

  it('treats HTML and invalid JSON as non-payloads', () => {
    expect(parseVodJson('<!DOCTYPE html><html></html>')).toBeNull();
    expect(parseVodJson('Verify Yourself')).toBeNull();
    expect(parseVodJson('')).toBeNull();
    expect(parseVodJson('{')).toBeNull();
    expect(parseVodJson('{"code":1,"list":[]}')).toEqual({
      code: 1,
      list: [],
    });
  });
});
