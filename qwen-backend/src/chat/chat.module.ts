import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { QwenModule } from '../qwen/qwen.module';

@Module({
  imports: [QwenModule],
  controllers: [ChatController],
})
export class ChatModule {}
