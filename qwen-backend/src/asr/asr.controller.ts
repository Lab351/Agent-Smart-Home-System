import { Controller, Post, Body, UploadedFile, UseInterceptors, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AsrService } from './asr.service';
import { AsrDto, AsrResponseDto } from './dto/asr.dto';

@Controller('asr')
export class AsrController {
  private readonly logger = new Logger(AsrController.name);

  constructor(private readonly asrService: AsrService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async recognize(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: AsrDto,
  ): Promise<{ success: boolean; data: AsrResponseDto }> {
    try {
      if (!file || !file.buffer) {
        throw new HttpException('请上传音频文件', HttpStatus.BAD_REQUEST);
      }

      this.logger.log(`收到语音识别请求，文件名: ${file.originalname}, 大小: ${file.size}`);

      const format = body.format || file.mimetype.split('/')[1] || 'aac';
      const sampleRate = body.sampleRate || 16000;

      const result = await this.asrService.recognize(file.buffer, format, sampleRate);

      this.logger.log(`语音识别成功: ${result.text}`);

      return {
        success: true,
        data: {
          text: result.text,
          confidence: result.confidence,
        },
      };
    } catch (error) {
      this.logger.error(`语音识别失败: ${error.message}`, error.stack);
      throw new HttpException(
        `语音识别失败: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Base64 编码的音频识别
   */
  @Post('base64')
  async recognizeBase64(@Body() body: { audio: string; format?: string; sampleRate?: number }): Promise<{ success: boolean; data: AsrResponseDto }> {
    try {
      const { audio, format = 'aac', sampleRate = 16000 } = body;

      if (!audio) {
        throw new HttpException('请提供音频数据', HttpStatus.BAD_REQUEST);
      }

      this.logger.log(`收到 Base64 语音识别请求，数据大小: ${audio.length}`);

      // 解码 Base64
      const base64Data = audio.replace(/^data:audio\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      const result = await this.asrService.recognize(buffer, format, sampleRate);

      this.logger.log(`语音识别成功: ${result.text}`);

      return {
        success: true,
        data: {
          text: result.text,
          confidence: result.confidence,
        },
      };
    } catch (error) {
      this.logger.error(`语音识别失败: ${error.message}`, error.stack);
      throw new HttpException(
        `语音识别失败: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
