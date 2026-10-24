import dotenv from 'dotenv';
import path from 'path';
import OpenAI from 'openai';

// Load environment variables from .env if present
dotenv.config();

export interface AppConfig {
  openaiApiKey?: string;
  openaiBaseUrl: string;
  openaiModel: string;
  databasePath: string;
  useMockLLM: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

const hasKey = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0);
const forceMock = process.env.USE_MOCK_LLM === 'true';

export const config: AppConfig = {
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o',
  databasePath: process.env.DATABASE_PATH || path.resolve(process.cwd(), 'data/shared_brain.db'),
  useMockLLM: forceMock || !hasKey,
  logLevel: (process.env.LOG_LEVEL as any) || 'info',
};

export function getOpenAIClient(): OpenAI | null {
  if (config.useMockLLM || !config.openaiApiKey) {
    return null;
  }
  return new OpenAI({
    apiKey: config.openaiApiKey,
    baseURL: config.openaiBaseUrl,
  });
}
