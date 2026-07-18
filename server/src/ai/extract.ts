export interface FencedBlock {
  lang: string;
  code: string;
}

const FENCE_RE = /```([\w+-]*)[^\n]*\n([\s\S]*?)```/g;

/** Pulls every fenced code block (with its language tag) out of model output. */
export function extractFencedBlocks(text: string): FencedBlock[] {
  const blocks: FencedBlock[] = [];
  for (const match of text.matchAll(FENCE_RE)) {
    blocks.push({ lang: match[1].toLowerCase(), code: `${match[2].trim()}\n` });
  }
  return blocks;
}
