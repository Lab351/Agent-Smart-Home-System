import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

type ChatCompletionMessageParam = OpenAI.ChatCompletionMessageParam;

@Injectable()
export class QwenService {
  private readonly logger = new Logger(QwenService.name);
  private openai: OpenAI;
  private model: string;

  constructor() {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    const baseUrl = process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    this.model = process.env.DASHSCOPE_MODEL || 'qwen-plus';

    if (!apiKey) {
      throw new Error('DASHSCOPE_API_KEY is not set in environment variables');
    }

    this.openai = new OpenAI({
      apiKey,
      baseURL: baseUrl,
    });

    this.logger.log('QwenService initialized');
  }

  /**
   * 创建聊天完成
   * @param messages 对话消息数组
   * @param options 可选参数
   */
  async createChatCompletion(
    messages: ChatCompletionMessageParam[],
    options?: { temperature?: number; maxTokens?: number },
  ) {
    try {
      this.logger.log('Creating chat completion');

      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages,
        temperature: options?.temperature || 0.7,
        max_tokens: options?.maxTokens || 2000,
      });

      this.logger.log('Chat completion created successfully');

      return completion;
    } catch (error) {
      this.logger.error('Failed to create chat completion', error.stack);
      throw error;
    }
  }

  /**
   * 简化的聊天接口，直接返回消息内容
   * @param userMessage 用户消息
   * @param conversationHistory 对话历史
   * @param systemPrompt 系统提示词
   */
  async chat(
    userMessage: string,
    conversationHistory: ChatCompletionMessageParam[] = [],
    systemPrompt: string = 'You are a helpful assistant.',
  ): Promise<string> {
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: userMessage },
    ];

    const completion = await this.createChatCompletion(messages);

    return completion.choices[0].message.content || '';
  }
}
