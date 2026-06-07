import { anthropic } from '@ai-sdk/anthropic';

// チャット応答に使うClaudeモデル。
// Task 9のチャットAPIで streamText() に渡す。
export const chatModel = anthropic('claude-3-5-sonnet-20241022');
