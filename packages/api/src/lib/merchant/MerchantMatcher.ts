import { MerchantRule, MatchType } from '@financas/shared';

export const PARTIAL_MATCH_THRESHOLD = 0.35;

export function normalizeMerchant(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

export interface MatchResult {
  rule: MerchantRule;
  matchType: MatchType;
}

export function matchMerchant(merchantName: string, rules: MerchantRule[]): MatchResult | null {
  if (rules.length === 0) return null;

  const normalizedInput = normalizeMerchant(merchantName);

  // Pass 1: exact match
  for (const rule of rules) {
    if (normalizeMerchant(rule.pattern) === normalizedInput) {
      return { rule, matchType: 'exact' };
    }
  }

  // Pass 2: partial/fuzzy match via Levenshtein ratio
  for (const rule of rules) {
    const normalizedPattern = normalizeMerchant(rule.pattern);
    const maxLen = Math.max(normalizedInput.length, normalizedPattern.length);
    if (maxLen === 0) continue;
    const dist = levenshtein(normalizedInput, normalizedPattern);
    if (dist / maxLen <= PARTIAL_MATCH_THRESHOLD) {
      return { rule, matchType: 'partial' };
    }
  }

  return null;
}
