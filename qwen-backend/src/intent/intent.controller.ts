import { Controller, Post, Body, Logger } from '@nestjs/common';
import { IntentService } from './intent.service';
import {
  IntentParseDto,
  IntentParseResponseDto,
} from './dto/intent.dto';

@Controller('api/intent')
export class IntentController {
  private readonly logger = new Logger(IntentController.name);

  constructor(private readonly intentService: IntentService) {}

  @Post('parse')
  async parseIntent(@Body() dto: IntentParseDto): Promise<IntentParseResponseDto> {
    try {
      this.logger.log(`Received intent parse request: "${dto.text}"`);

      const result = await this.intentService.parseIntent(dto);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error(`Intent parse failed: ${error.message}`);
      return {
        success: false,
        message: error.message,
      };
    }
  }
}