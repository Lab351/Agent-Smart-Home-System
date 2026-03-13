import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatModule } from './chat/chat.module';
import { QwenModule } from './qwen/qwen.module';
import { BeaconModule } from './beacon/beacon.module';
import { AsrModule } from './asr/asr.module';
import { IntentModule } from './intent/intent.module';
import { RegistryModule } from './registry/registry.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    QwenModule,
    ChatModule,
    BeaconModule,
    AsrModule,
    IntentModule,
    RegistryModule,
  ],
})
export class AppModule {}
