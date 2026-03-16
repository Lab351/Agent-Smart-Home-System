export class ChatDto {
  message: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  systemPrompt?: string;
}

export interface ChatResponseDto {
  success: boolean;
  data: {
    message: string;
  };
}
