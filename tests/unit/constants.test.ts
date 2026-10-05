import { expect, it } from 'vitest';
import {
  DEFAULT_DEBOUNCE_MS,
  LANGUAGE_TOOL_BASE_URL,
} from '../../src/shared/constants';
it('uses the planned local defaults', () => {
  expect(DEFAULT_DEBOUNCE_MS).toBe(100);
  expect(new URL(LANGUAGE_TOOL_BASE_URL).hostname).toBe('127.0.0.1');
});
