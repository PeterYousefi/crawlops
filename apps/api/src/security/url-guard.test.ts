import { describe, it, expect } from 'vitest';
import { validateUserUrl } from './url-guard.js';

describe('validateUserUrl (SSRF guard)', () => {
  it('allows normal public https URLs', () => {
    expect(validateUserUrl('https://example.com/pricing').ok).toBe(true);
  });

  it('rejects non-http protocols', () => {
    expect(validateUserUrl('file:///etc/passwd').ok).toBe(false);
    expect(validateUserUrl('ftp://example.com').ok).toBe(false);
  });

  it('rejects localhost and loopback', () => {
    expect(validateUserUrl('http://localhost:8080').ok).toBe(false);
    expect(validateUserUrl('http://127.0.0.1').ok).toBe(false);
  });

  it('rejects the cloud metadata endpoint', () => {
    expect(validateUserUrl('http://169.254.169.254/latest/meta-data/').ok).toBe(false);
  });

  it('rejects private IP ranges', () => {
    expect(validateUserUrl('http://10.0.0.5').ok).toBe(false);
    expect(validateUserUrl('http://192.168.1.1').ok).toBe(false);
    expect(validateUserUrl('http://172.16.0.1').ok).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(validateUserUrl('not a url').ok).toBe(false);
  });
});
