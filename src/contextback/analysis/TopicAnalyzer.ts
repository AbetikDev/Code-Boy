import type { CBEvent, CBTopic } from '../types';

/** Term → category mapping for keyword-based topic extraction */
const TOPIC_KEYWORDS: Record<string, string[]> = {
  'Authentication': ['auth', 'login', 'logout', 'oauth', 'jwt', 'token', 'session', 'passport', 'credentials', 'password', 'signup', 'register'],
  'Database': ['database', 'db', 'sql', 'mongo', 'postgres', 'mysql', 'query', 'schema', 'migration', 'model', 'repository', 'entity', 'prisma', 'sequelize', 'drizzle'],
  'API': ['api', 'endpoint', 'route', 'controller', 'handler', 'request', 'response', 'http', 'rest', 'graphql', 'webhook', 'middleware'],
  'UI': ['component', 'view', 'page', 'style', 'css', 'html', 'template', 'button', 'form', 'modal', 'layout', 'theme', 'react', 'vue', 'svelte'],
  'Testing': ['test', 'spec', 'jest', 'mocha', 'vitest', 'playwright', 'cypress', 'mock', 'fixture', 'coverage', 'assert'],
  'Configuration': ['config', 'env', 'settings', 'setup', 'deploy', 'docker', 'ci', 'pipeline', 'yaml', 'dotenv'],
  'Payment': ['payment', 'stripe', 'billing', 'checkout', 'invoice', 'subscription', 'webhook', 'paypal'],
  'Security': ['security', 'xss', 'csrf', 'injection', 'sanitize', 'validation', 'rate.limit', 'firewall', 'tls', 'https', 'cors'],
  'Performance': ['performance', 'cache', 'redis', 'optimize', 'profil', 'latency', 'throughput', 'memory', 'indexing'],
  'Notifications': ['notification', 'email', 'smtp', 'sendgrid', 'push', 'alert', 'message', 'chat'],
};

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9_/.-]/g, ' ').split(/\s+/).filter(Boolean);
}

function score(tokens: string[], keywords: string[]): number {
  let hits = 0;
  for (const token of tokens) {
    if (keywords.some(kw => token.includes(kw))) hits++;
  }
  return hits / Math.max(1, tokens.length) + Math.min(0.4, hits * 0.08);
}

export class TopicAnalyzer {
  analyze(events: CBEvent[]): CBTopic[] {
    const corpus: string[] = [];
    for (const e of events) {
      if (e.filePath) corpus.push(...tokenize(e.filePath));
      for (const v of Object.values(e.data)) {
        if (typeof v === 'string') corpus.push(...tokenize(v));
      }
    }
    if (!corpus.length) return [];

    const results: CBTopic[] = [];
    for (const [name, keywords] of Object.entries(TOPIC_KEYWORDS)) {
      const s = Math.min(1, score(corpus, keywords));
      if (s > 0.04) {
        const matched = keywords.filter(kw => corpus.some(t => t.includes(kw)));
        results.push({ name, confidence: Math.round(s * 100) / 100, keywords: matched });
      }
    }
    return results.sort((a, b) => b.confidence - a.confidence);
  }

  /** Extract the top unique keywords from a set of file paths and messages. */
  extractKeywords(events: CBEvent[]): string[] {
    const freq = new Map<string, number>();
    for (const e of events) {
      for (const token of tokenize(e.filePath + ' ' + Object.values(e.data).filter(v => typeof v === 'string').join(' '))) {
        if (token.length > 3) freq.set(token, (freq.get(token) ?? 0) + 1);
      }
    }
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k);
  }
}
