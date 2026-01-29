import { HttpClient, HttpClientRequest } from '@effect/platform';
import { Effect, Option, Stream } from 'effect';

import { Message, ModelConfig, Settings } from '../app/types';

export class LLMError {
  readonly _tag = 'LLMError';
  constructor(
    readonly message: string,
    readonly cause?: unknown,
  ) {}
}

export const createApiMessages = (messages: Message[], systemPrompt: string) => {
  const apiMessages: any[] = [{ role: 'system', content: systemPrompt }];

  messages.forEach((m) => {
    if (!m.attachments || m.attachments.length === 0) {
      apiMessages.push({ role: m.role, content: m.content });
    } else {
      const content: any[] = [{ type: 'text', text: m.content || ' ' }];
      m.attachments.forEach((att) => {
        if (att.type === 'image') {
          content.push({
            type: 'image_url',
            image_url: { url: att.url },
          });
        }
      });
      apiMessages.push({ role: m.role, content });
    }
  });

  return apiMessages;
};

export const streamCompletion = (
  messages: Message[],
  systemPrompt: string,
  settings: Settings,
  config: ModelConfig,
  sessionPrompt?: string,
  overrideGlobal?: boolean,
) => {
  if (sessionPrompt && !overrideGlobal) {
    systemPrompt = `${systemPrompt}\n\nAdditional instructions for this chat:\n${sessionPrompt}`;
  }

  const body = {
    model: config.model,
    messages: createApiMessages(messages, systemPrompt),
    temperature: config.temperature,
    stream: true,
    max_tokens: config.maxTokens,
    top_p: config.topP,
  };

  const requestEffect = HttpClientRequest.post(`${settings.baseUrl}/chat/completions`).pipe(
    HttpClientRequest.setHeader('Content-Type', 'application/json'),
    HttpClientRequest.setHeader('Authorization', `Bearer ${settings.apiKey}`),
    HttpClientRequest.bodyJson(body),
  );

  return Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const request = yield* requestEffect;
    const response = yield* client.execute(request).pipe(Effect.mapError((e) => new LLMError('Failed to connect to LLM API', e)));

    if (response.status !== 200) {
      const errorText = yield* response.text.pipe(Effect.orElseSucceed(() => 'Unknown API Error'));
      return yield* Effect.fail(new LLMError(`API Error ${response.status}: ${errorText}`));
    }

    return response.stream.pipe(
      Stream.decodeText('utf-8'),
      Stream.splitLines,
      Stream.filterMap((line: string) => {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed === 'data: [DONE]') return Option.none();
        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6));
            const token = data.choices[0]?.delta?.content || '';
            const reasoning = data.choices[0]?.delta?.reasoning_content || '';
            const result = reasoning ? ` <reasoning>${reasoning}</reasoning> ` : token;
            return result ? Option.some(result) : Option.none();
          } catch (e) {
            return Option.none();
          }
        }
        return Option.none();
      }),
    );
  });
};
