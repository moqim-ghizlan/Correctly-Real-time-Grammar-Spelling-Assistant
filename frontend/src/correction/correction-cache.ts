import { CACHE_LIMIT } from '../shared/constants';
import type { CorrectionMatch } from './correction-types';
import type { Language } from './language';
export class CorrectionCache {
  private entries = new Map<string, CorrectionMatch[]>();
  constructor(private limit = CACHE_LIMIT) {}
  get size() {
    return this.entries.size;
  }
  get(text: string, language: Language) {
    const key = JSON.stringify([language, text]);
    const value = this.entries.get(key);
    if (value) {
      this.entries.delete(key);
      this.entries.set(key, value);
    }
    return value;
  }
  set(text: string, language: Language, matches: CorrectionMatch[]) {
    const key = JSON.stringify([language, text]);
    this.entries.delete(key);
    this.entries.set(key, matches);
    while (this.entries.size > this.limit) {
      const first = this.entries.keys().next().value;
      if (first !== undefined) this.entries.delete(first);
    }
  }
}
