import { Message, ModelConfig, Settings } from '../app/types';

interface StreamCallbacks {
  onToken: (token: string) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
}

export const streamChatCompletion = async (
  messages: Message[],
  systemPrompt: string,
  settings: Settings,
  config: ModelConfig,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
) => {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    };

    // Prepare messages for OpenAI format
    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => {
        if (!m.attachments || m.attachments.length === 0) {
          return { role: m.role, content: m.content };
        }

        // Multimodal content
        const content: any[] = [
          { type: 'text', text: m.content || ' ' }, // Ensure at least some text or it might complain
        ];

        m.attachments.forEach((att) => {
          if (att.type === 'image') {
            content.push({
              type: 'image_url',
              image_url: {
                url: att.url,
              },
            });
          }
        });

        return { role: m.role, content };
      }),
    ];

    const body = JSON.stringify({
      model: config.model,
      messages: apiMessages,
      temperature: config.temperature,
      stream: true,
      max_tokens: config.maxTokens,
    });

    const response = await fetch(`${settings.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body,
      signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API Error: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('No response body received');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let done = false;

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter((line) => line.trim() !== '');

        for (const line of lines) {
          if (line === 'data: [DONE]') {
            done = true;
            break;
          }
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              const token = data.choices[0]?.delta?.content || '';
              if (token) {
                callbacks.onToken(token);
              }
            } catch (e) {
              console.warn('Error parsing stream chunk', e);
            }
          }
        }
      }
    }

    callbacks.onComplete();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      // Ignore abort errors
      return;
    }
    callbacks.onError(error instanceof Error ? error : new Error('Unknown error'));
  }
};
