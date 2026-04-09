interface GLMChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

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
  private apiKey: string;
  private apiBase: string;
  private model: string;
  private disableThinking: boolean;

  constructor() {
    this.apiKey = import.meta.env.VITE_GLM_API_KEY;
    this.apiBase = (import.meta.env.VITE_GLM_API_BASE || 'https://api.z.ai/api/coding/paas/v4').replace(/\/$/, '');
    this.model = import.meta.env.VITE_GLM_MODEL || 'glm-4.7-flash';
    this.disableThinking = import.meta.env.VITE_GLM_DISABLE_THINKING !== 'false';

    if (!this.apiKey || this.apiKey === 'your_glm_api_key') {
      throw new Error('GLM API Key not configured. Please set VITE_GLM_API_KEY in your .env file');
    }
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
      const response = await fetch(`${this.apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Language': 'ko-KR,ko',
          'Authorization': `Bearer ${this.apiKey}`,
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
