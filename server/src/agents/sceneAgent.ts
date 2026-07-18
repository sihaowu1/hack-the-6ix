import Anthropic from '@anthropic-ai/sdk';
import { validateSceneModule } from '@motionforge/shared';
import { config } from '../config';
import { loadSkill } from '../ai/skills';
import { extractFencedBlocks } from '../ai/extract';

/**
 * The scene agent: prompts Claude (with the scene-generation skill as its
 * system prompt) to write a Three.js scene module and a Blender Python script,
 * validates the result against the module contract, and retries once with the
 * validator's feedback if the contract was violated.
 */

const JS_LANGS = new Set(['js', 'javascript']);

export interface SceneCode {
  code: string;
  blenderCode: string;
}

export async function generateScene(client: Anthropic, prompt: string): Promise<SceneCode> {
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content:
        `Create a 3D scene from this prompt:\n\n${prompt}\n\n` +
        'Return the ```javascript scene module and the ```python Blender script.',
    },
  ];
  return completeWithRetry(client, messages);
}

export async function modifyScene(
  client: Anthropic,
  prompt: string,
  code: string,
  blenderCode: string,
): Promise<SceneCode> {
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content:
        `Modify the current scene.\n\nInstruction: ${prompt}\n\n` +
        `Current scene module:\n\`\`\`javascript\n${code}\n\`\`\`\n\n` +
        `Current Blender script:\n\`\`\`python\n${blenderCode}\n\`\`\`\n\n` +
        'Return the complete updated ```javascript and ```python blocks.',
    },
  ];
  return completeWithRetry(client, messages);
}

async function completeWithRetry(
  client: Anthropic,
  messages: Anthropic.MessageParam[],
): Promise<SceneCode> {
  let errors: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const stream = client.messages.stream({
      model: config.ai.model,
      max_tokens: config.ai.maxTokens,
      thinking: { type: 'adaptive' },
      system: loadSkill('scene-generation'),
      messages,
    });
    const response = await stream.finalMessage();
    if (response.stop_reason === 'refusal') {
      throw new Error('The model declined to generate this scene. Try a different prompt.');
    }
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    const blocks = extractFencedBlocks(text);
    const js = blocks.find((block) => JS_LANGS.has(block.lang));
    const py = blocks.find((block) => block.lang === 'python');
    errors = js ? validateSceneModule(js.code) : ['the response did not include a ```javascript block'];
    if (js && errors.length === 0) {
      return { code: js.code, blenderCode: py?.code ?? '' };
    }
    // Feed the validator's errors back for one corrective attempt. The full
    // content (including thinking blocks) is echoed back unchanged.
    messages.push({ role: 'assistant', content: response.content as Anthropic.MessageParam['content'] });
    messages.push({
      role: 'user',
      content:
        `That response was rejected by the validator: ${errors.join('; ')}. ` +
        'Return corrected ```javascript and ```python blocks that follow the contract exactly.',
    });
  }
  throw new Error(`The model did not produce a valid scene module: ${errors.join('; ')}`);
}
