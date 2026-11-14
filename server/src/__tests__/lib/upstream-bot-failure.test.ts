import { describe, it, expect } from 'vitest';
import { isUpstreamBotFailureOutput, couldBecomeBotFailure, isRetryableError } from '../../lib/error-classify.js';

describe('isUpstreamBotFailureOutput & couldBecomeBotFailure', () => {
  it('detects Google Gemini Web / Google Drive permission refusal', () => {
    const text1 = "I can't use Google Drive because required Gmail settings are off. Turn on these settings to continue.";
    const text2 = "I cannot access Google Drive because required Gmail settings are off.";
    const text3 = "Google Drive is not available because required settings are off.";

    expect(isUpstreamBotFailureOutput(text1)).toBe(true);
    expect(isUpstreamBotFailureOutput(text2)).toBe(true);
    expect(isUpstreamBotFailureOutput(text3)).toBe(true);
    expect(isUpstreamBotFailureOutput(`\n\n${text1}\n\n`)).toBe(true);
  });

  it('detects Cloudflare anti-bot and Google login challenges in 200 responses', () => {
    expect(isUpstreamBotFailureOutput('<title>Just a moment...</title> Enable JavaScript and cookies to continue')).toBe(true);
    expect(isUpstreamBotFailureOutput('Attention Required! | Cloudflare')).toBe(true);
    expect(isUpstreamBotFailureOutput('<title>Sign in - Google Accounts</title>')).toBe(true);
  });

  it('does not flag normal code or prose discussing Google Drive or Gmail', () => {
    expect(isUpstreamBotFailureOutput('Here is how to query Google Drive files using the Google API client in Python:')).toBe(false);
    expect(isUpstreamBotFailureOutput('function syncGoogleDrive() { return true; }')).toBe(false);
    expect(isUpstreamBotFailureOutput('Please check your Gmail settings in the admin panel if email delivery fails.')).toBe(false);
    expect(isUpstreamBotFailureOutput('const cloudflare = require("cloudflare");')).toBe(false);
  });

  it('couldBecomeBotFailure holds prefixes that could become a bot failure', () => {
    expect(couldBecomeBotFailure("I can't use ")).toBe(true);
    expect(couldBecomeBotFailure("I can't use Google Drive")).toBe(true);
    expect(couldBecomeBotFailure("Attention Required")).toBe(true);
    expect(couldBecomeBotFailure("Just a moment")).toBe(true);
    expect(couldBecomeBotFailure("Sign in - Google")).toBe(true);
  });

  it('couldBecomeBotFailure releases divergent text immediately', () => {
    expect(couldBecomeBotFailure("I can't use recursion here because the stack will overflow.")).toBe(false);
    expect(couldBecomeBotFailure("Hello world, this is a code assistant.")).toBe(false);
    expect(couldBecomeBotFailure("import fs from 'fs';")).toBe(false);
    expect(couldBecomeBotFailure("Hi")).toBe(false);
  });

  it('isRetryableError classifies bot failure errors as retryable', () => {
    const err1 = new Error('in-band provider error from UnoRouter: upstream bot failure output');
    const err2 = new Error('empty completion from UnoRouter (upstream bot failure output)');

    expect(isRetryableError(err1)).toBe(true);
    expect(isRetryableError(err2)).toBe(true);
  });
});
