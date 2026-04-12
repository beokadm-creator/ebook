interface GLMChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const env = ((import.meta as ImportMeta & {
  env?: Record<string, string | boolean | undefined>;
}).env ?? {}) as Record<string, string | boolean | undefined>;

interface GLMChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

class GLMClient {
  private apiKey?: string;
  private apiBase: string;
  private model: string;
  private disableThinking: boolean;

  constructor() {
    this.apiKey = typeof env.VITE_GLM_API_KEY === 'string' ? env.VITE_GLM_API_KEY : undefined;
    const defaultApiBase = env.DEV
      ? 'https://api.z.ai/api/coding/paas/v4'
      : '/api/glm';
    this.apiBase = ((typeof env.VITE_GLM_API_BASE === 'string' ? env.VITE_GLM_API_BASE : defaultApiBase)).replace(/\/$/, '');
    this.model = typeof env.VITE_GLM_MODEL === 'string' ? env.VITE_GLM_MODEL : 'glm-4.7';
    this.disableThinking = env.VITE_GLM_DISABLE_THINKING !== 'false';
  }

  private usesProxy() {
    return this.apiBase.startsWith('/');
  }

  private ensureConfigured() {
    if (this.usesProxy()) {
      return;
    }

    if (!this.apiKey || this.apiKey === 'your_glm_api_key') {
      throw new Error('GLM API Key not configured. Please set VITE_GLM_API_KEY in your local .env file or configure the server proxy secret.');
    }
  }

  isConfigured(): boolean {
    return this.usesProxy() || (!!this.apiKey && this.apiKey !== 'your_glm_api_key');
  }

  async createChatCompletion(
    messages: GLMChatMessage[],
    options: {
      temperature?: number;
      max_tokens?: number;
      top_p?: number;
    } = {}
  ): Promise<string> {
    const {
      temperature = 0.7,
      max_tokens = 2048,
      top_p = 0.9,
    } = options;

    try {
      this.ensureConfigured();

      const response = await fetch(`${this.apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Language': 'ko-KR,ko',
          ...(this.apiKey && !this.usesProxy() ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature,
          max_tokens,
          top_p,
          ...(this.disableThinking ? { thinking: { type: 'disabled' as const } } : {}),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GLM API Error (${response.status}): ${errorText}`);
      }

      const data: GLMChatResponse = await response.json();

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid response format from GLM API');
      }

      return data.choices[0].message.content.trim();
    } catch (error) {
      console.error('GLM API Error:', error);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.createChatCompletion([
        { role: 'user', content: 'Hello' }
      ]);
      return true;
    } catch {
      return false;
    }
  }
}

export const glmClient = new GLMClient();
