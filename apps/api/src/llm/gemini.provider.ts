import { Injectable } from '@nestjs/common';
import { LlmProvider } from './llm.interface';
import { ConfigService } from '@nestjs/config';

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

@Injectable()
export class GeminiProvider implements LlmProvider {
  constructor(private readonly configService: ConfigService) {}

  async generateStructured<T>(prompt: { system?: string; user: string }): Promise<T> {
    const apiKey = this.configService.get<string>('LLM_API_KEY');
    const model = this.configService.get<string>('LLM_MODEL') || 'gemini-3.1-flash-lite';

    if (!apiKey) {
      throw new Error('LLM_API_KEY is not defined in environment variables');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(prompt.system && {
          system_instruction: {
            parts: [{ text: prompt.system }],
          },
        }),
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt.user }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('Gemini returned no response text');
    }

    const cleanedText = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    return JSON.parse(cleanedText) as T;
  }
}
