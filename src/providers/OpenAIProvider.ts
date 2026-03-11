import { HttpClient, HttpClientRequest, HttpClientResponse } from '@effect/platform';
import { Effect, Layer, Option, Schema, Stream } from 'effect';

import { LLMProviderError } from '../app/Error';
import { LLMProvider } from './LLMProvider';

import type { Attachment, ThreadMessage, ToolCall } from '../app/Schema';

interface OpenAIMessage {
  readonly role: string;
  readonly content: string | OpenAIContent[] | null;
  readonly tool_calls?: ReadonlyArray<ToolCall>;
  readonly tool_call_id?: string;
}

type OpenAIContent =
  | {
      readonly type: 'text';
      readonly text: string;
    }
  | {
      readonly type: 'image_url';
      readonly image_url: { readonly url: string };
    };

const createApiMessages = (messages: readonly ThreadMessage[], systemPrompt: string): OpenAIMessage[] => {
  const result: OpenAIMessage[] = [{ role: 'system', content: systemPrompt }];
  for (let i = 0, len = messages.length; i < len; i++) {
    const m = messages[i];

    if (m.role === 'tool' || m.toolCallId) {
      result.push({
        role: 'tool',
        content: m.content,
        tool_call_id: m.toolCallId,
      });
      continue;
    }

    if (m.toolCalls) {
      result.push({
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls,
      });
      continue;
    }

    if (!m.attachments || m.attachments.length === 0) {
      result.push({ role: m.role, content: m.content });
      continue;
    }

    const textContent: OpenAIContent = { type: 'text', text: m.content || ' ' };
    const attachmentContents = m.attachments.map((att: Attachment): OpenAIContent => {
      switch (att.type) {
        case 'image':
          return {
            type: 'image_url',
            image_url: { url: att.url },
          };
      }
    });

    result.push({
      role: m.role,
      content: [textContent, ...attachmentContents],
    });
  }
  return result;
};

export const OpenAIProviderLive = Layer.effect(
  LLMProvider,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;

    return LLMProvider.of({
      fetchModels: (settings) =>
        HttpClientRequest.get(`${settings.baseUrl}/models`).pipe(
          HttpClientRequest.setHeader('Content-Type', 'application/json'),
          HttpClientRequest.setHeader('Authorization', `Bearer ${settings.apiKey}`),
          (req) => client.execute(req),
          Effect.mapError((e) => new LLMProviderError({ message: 'Failed to connect to LLM API', cause: e })),
          Effect.flatMap((response: HttpClientResponse.HttpClientResponse) => {
            if (response.status !== 200) {
              return response.text.pipe(
                Effect.orElseSucceed(() => 'Unknown API Error'),
                Effect.flatMap((errorText) => Effect.fail(new LLMProviderError({ message: `API Error ${response.status}: ${errorText}` }))),
              );
            }
            return HttpClientResponse.schemaBodyJson(Schema.Struct({ data: Schema.Array(Schema.Struct({ id: Schema.String })) }))(response).pipe(
              Effect.mapError((e) => new LLMProviderError({ message: 'Failed to parse models response', cause: e })),
            );
          }),
        ),

      streamCompletion: (messages, settings, config, systemPrompt) => {
        const body = {
          model: config.model,
          messages: createApiMessages(messages, systemPrompt),
          temperature: config.temperature,
          max_tokens: config.maxTokens,
          top_p: config.topP,
          stream: true,
          tools: config.tools,
        };

        return HttpClientRequest.post(`${settings.baseUrl}/chat/completions`).pipe(
          HttpClientRequest.setHeader('Content-Type', 'application/json'),
          HttpClientRequest.setHeader('Authorization', `Bearer ${settings.apiKey}`),
          HttpClientRequest.bodyJson(body),
          Effect.mapError((e) => new LLMProviderError({ message: 'Failed to prepare request', cause: e })),
          Effect.flatMap((req) =>
            client.execute(req).pipe(
              Effect.mapError((e) => new LLMProviderError({ message: 'Failed to connect to LLM API', cause: e })),
              Effect.flatMap((response: HttpClientResponse.HttpClientResponse) => {
                if (response.status !== 200) {
                  return response.text.pipe(
                    Effect.orElseSucceed(() => 'Unknown API Error'),
                    Effect.flatMap((errorText) => Effect.fail(new LLMProviderError({ message: `API Error ${response.status}: ${errorText}` }))),
                  );
                }
                const stream = response.stream.pipe(
                  Stream.mapError((e) => new LLMProviderError({ message: 'Stream error', cause: e })),
                  (s) => Stream.decodeText(s, 'utf-8'),
                  Stream.splitLines,
                  Stream.filterMap((line) => {
                    const trimmed = line.trim();
                    if (trimmed === '' || trimmed === 'data: [DONE]') return Option.none();
                    if (trimmed.startsWith('data: ')) {
                      try {
                        const data = JSON.parse(trimmed.slice(6));
                        const delta = data.choices[0]?.delta;
                        if (!delta) return Option.none();

                        const token = delta.content || '';
                        const reasoning = delta.reasoning_content || '';
                        const toolCalls = delta.tool_calls;

                        if (toolCalls) {
                          return Option.some(`TOOL_CALLS:${JSON.stringify(toolCalls)}`);
                        }

                        if (reasoning) {
                          return Option.some(` <reasoning>${reasoning}</reasoning> `);
                        }
                        if (token) {
                          return Option.some(token);
                        }
                        return Option.none();
                      } catch {
                        return Option.none();
                      }
                    }
                    return Option.none();
                  }),
                );
                return Effect.succeed(stream);
              }),
            ),
          ),
        );
      },
    });
  }),
);
