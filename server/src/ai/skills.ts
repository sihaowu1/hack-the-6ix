import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../utils/fsx';

const cache = new Map<string, string>();

/**
 * Loads a Claude Skill from skills/<name>/SKILL.md and returns its body
 * (frontmatter stripped) for use as the agent's system prompt. The same files
 * are valid Claude Code skills.
 */
export function loadSkill(name: string): string {
  const cached = cache.get(name);
  if (cached) return cached;
  const filePath = path.join(repoRoot, 'skills', name, 'SKILL.md');
  const raw = fs.readFileSync(filePath, 'utf8');
  const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
  cache.set(name, body);
  return body;
}
