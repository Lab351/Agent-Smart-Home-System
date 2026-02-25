import { Module } from '@nestjs/common';
import { ChatModule } from './chat/chat.module';
import { QwenModule } from './qwen/qwen.module';

@Module({
  imports: [ChatModule, QwenModule],
})
export class AppModule {}
