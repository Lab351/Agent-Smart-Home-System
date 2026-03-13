import { Controller, Post, Body, Logger } from '@nestjs/common';
import { QwenService } from '../qwen/qwen.service';
import { ChatDto } from './dto/chat.dto';

@Controller('chat')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(private readonly qwenService: QwenService) {}

  @Post()
  async chat(@Body() chatDto: ChatDto) {
    try {
      const response = await this.qwenService.chat(
        chatDto.message,
        (chatDto.conversationHistory || []) as any,
        chatDto.systemPrompt || 'You are a helpful assistant.',
      );

      if (!response) {
        this.logger.error('qwenService.chat returned undefined or null');
        throw new Error('Failed to get response from Qwen API');
      }

      this.logger.log('Chat response sent successfully');

      return {
        success: true,
        data: {
          message: response,
        },
      };
    } catch (error) {
      this.logger.error(`Chat error: ${error.message}`);
      throw error;
    }
  }
}
