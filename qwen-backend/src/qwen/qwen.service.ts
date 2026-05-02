import { BadRequestException, Injectable, Logger } from '@nestjs/common';
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
      this.logger.log(`Messages count: ${messages.length}`);
      this.logger.log(`Model: ${this.model}`);

      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: messages as any,
      });

      // 添加详细日志
      this.logger.log(`Raw response: ${JSON.stringify(completion)}`);
      this.logger.log(`Choices exists: ${!!completion.choices}`);
      this.logger.log(`Choices length: ${completion.choices?.length}`);
      this.logger.log('Chat completion created successfully');

      return completion;
    } catch (error) {
      this.logger.error('Failed to create chat completion', error.stack);
      this.logger.error(`Error message: ${error.message}`);
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
    if (typeof userMessage !== 'string' || userMessage.trim().length === 0) {
      this.logger.warn('Rejected empty user message before calling model');
      throw new BadRequestException('message/text is required');
    }

    if (typeof conversationHistory === 'string') {
      conversationHistory = JSON.parse(conversationHistory);
    }

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: userMessage.trim() },
    ];

    this.logger.log(`Starting chat with ${messages.length} messages`);

    const completion = await this.createChatCompletion(messages);

    // 安全检查
    if (!completion) {
      this.logger.error('Completion is null or undefined');
      throw new Error('API returned null response');
    }

    if (!completion.choices || completion.choices.length === 0) {
      this.logger.error(`No choices in response. Full response: ${JSON.stringify(completion)}`);
      throw new Error('API returned no choices');
    }

    if (!completion.choices[0]) {
      this.logger.error(`First choice is null. Choices length: ${completion.choices.length}`);
      throw new Error('API returned empty choice');
    }

    if (!completion.choices[0].message) {
      this.logger.error(`Message is null. Choice: ${JSON.stringify(completion.choices[0])}`);
      throw new Error('API returned choice without message');
    }

    const content = completion.choices[0].message.content;

    if (!content) {
      this.logger.warn('Message content is empty, returning empty string');
    }

    this.logger.log(`Successfully extracted response content, length: ${content?.length || 0}`);

    return content || '';
  }
}
