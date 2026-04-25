import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class ChatMessageDto {
  @IsIn(['system', 'user', 'assistant', 'tool'])
  role: 'system' | 'user' | 'assistant' | 'tool';

  @IsString()
  @IsNotEmpty()
  content: string;
}

export class ChatDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  conversationHistory?: ChatMessageDto[];

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  systemPrompt?: string;
}

export interface ChatResponseDto {
  success: boolean;
  data: {
    message: string;
  };
}
