import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { isCrossSiteRequest, isFormBody } from './cross-site';

const req = (method: string, site?: string) =>
  ({ method, headers: site ? { 'sec-fetch-site': site } : {} }) as unknown as Request;

const typed = (method: string, contentType?: string) =>
  ({ method, headers: contentType ? { 'content-type': contentType } : {} }) as unknown as Request;

describe('isCrossSiteRequest', () => {
  it('blocks state changes started by another site', () => {
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      expect(isCrossSiteRequest(req(method, 'cross-site'))).toBe(true);
      expect(isCrossSiteRequest(req(method, 'same-site'))).toBe(true);
    }
  });

  it('allows the site itself, direct navigation and non-browser clients', () => {
    expect(isCrossSiteRequest(req('POST', 'same-origin'))).toBe(false);
    expect(isCrossSiteRequest(req('POST', 'none'))).toBe(false);
    expect(isCrossSiteRequest(req('POST'))).toBe(false);
  });

  it('never blocks safe methods, including the payment callback', () => {
    expect(isCrossSiteRequest(req('GET', 'cross-site'))).toBe(false);
    expect(isCrossSiteRequest(req('HEAD', 'cross-site'))).toBe(false);
    expect(isCrossSiteRequest(req('OPTIONS', 'cross-site'))).toBe(false);
  });

  it('refuses the content types a cross-site form can send', () => {
    expect(isFormBody(typed('POST', 'application/x-www-form-urlencoded'))).toBe(true);
    expect(isFormBody(typed('POST', 'text/plain;charset=UTF-8'))).toBe(true);
    expect(isFormBody(typed('POST', 'application/json'))).toBe(false);
    expect(isFormBody(typed('POST', 'multipart/form-data; boundary=x'))).toBe(false);
    expect(isFormBody(typed('POST'))).toBe(false);
    expect(isFormBody(typed('GET', 'application/x-www-form-urlencoded'))).toBe(false);
  });
});
