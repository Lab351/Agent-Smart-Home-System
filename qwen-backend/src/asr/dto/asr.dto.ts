import { ApiProperty } from '@nestjs/swagger';

export class AsrDto {
  @ApiProperty({ description: '音频文件（Base64 或 multipart）' })
  file: any;

  @ApiProperty({ description: '音频格式（aac/mp3/wav）', required: false, default: 'aac' })
  format?: string;

  @ApiProperty({ description: '采样率（默认 16000）', required: false, default: 16000 })
  sampleRate?: number;

  @ApiProperty({ description: '是否 Base64 编码', required: false, default: false })
  isBase64?: boolean;
}

export class AsrResponseDto {
  @ApiProperty({ description: '识别的文本' })
  text: string;

  @ApiProperty({ description: '置信度', required: false })
  confidence?: number;
}
