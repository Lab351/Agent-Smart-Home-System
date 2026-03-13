import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { AsrController } from './asr.controller';
import { AsrService } from './asr.service';

@Module({
  imports: [
    ConfigModule,
    MulterModule.register({
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    }),
  ],
  controllers: [AsrController],
  providers: [AsrService],
  exports: [AsrService],
})
export class AsrModule {}
