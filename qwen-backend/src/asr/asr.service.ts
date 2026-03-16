import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

interface DashScopeASRConfig {
  apiKey: string;
  baseURL: string;
}

@Injectable()
export class AsrService {
  private readonly logger = new Logger(AsrService.name);
  private openai: OpenAI;

  constructor(private readonly configService: ConfigService) {
    // 从环境变量读取 DashScope 配置
    const apiKey = this.configService.get('DASHSCOPE_API_KEY');
    const baseURL = this.configService.get('DASHSCOPE_BASE_URL') || 'https://dashscope.aliyuncs.com/compatible-mode/v1';

    if (!apiKey) {
      this.logger.warn('DASHSCOPE_API_KEY 未配置，语音识别功能将无法使用');
    }

    this.openai = new OpenAI({
      apiKey,
      baseURL,
    });
  }

  /**
   * 语音识别
   * @param fileBuffer 音频文件 Buffer
   * @param format 音频格式
   * @param sampleRate 采样率
   * @returns 识别的文本
   */
  async recognize(fileBuffer: Buffer, format: string = 'aac', sampleRate: number = 16000): Promise<{ text: string; confidence?: number }> {
    this.logger.log(`开始语音识别，格式: ${format}, 采样率: ${sampleRate}, 文件大小: ${fileBuffer.length} bytes`);

    try {
      // 将 Buffer 转换为 base64 data URL
      const base64Audio = fileBuffer.toString('base64');
      const audioUrl = `data:audio/${format};base64,${base64Audio}`;

      this.logger.log(`调用 qwen3-asr-flash 模型进行识别`);

      // 使用类型断言，因为阿里云 API 支持更多格式
      const requestBody = {
        model: 'qwen3-asr-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'input_audio',
                input_audio: {
                  data: audioUrl,
                  format: format as any,
                },
              },
            ],
          },
        ],
        stream: false,
        extra_body: {
          asr_options: {
            enable_itn: false,
          },
        },
      } as any;

      const completion = await this.openai.chat.completions.create(requestBody);

      const text = completion.choices[0]?.message?.content || '';
      this.logger.log(`识别成功: ${text}`);

      return {
        text,
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
