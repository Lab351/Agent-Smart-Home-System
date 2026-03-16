import { Injectable, Logger } from '@nestjs/common';
import { QwenService } from '../qwen/qwen.service';
import {
  IntentParseDto,
  IntentParseResult,
  ParsedIntent,
  RoutingDecision,
} from './dto/intent.dto';

const SYSTEM_PROMPT_TEMPLATE = `你是智能家居系统的意图解析和路由决策助手。

## 任务
根据用户输入和当前上下文，解析用户意图并决定应该将任务路由到哪个 Agent。
你必须返回严格的 JSON 格式，不要包含任何其他文字。

## 当前上下文
- 用户所在房间：{{current_room}}
- 可用设备列表：
{{available_devices}}

## 输出格式
返回 JSON，格式如下：
{
  "intent": {
    "device": "设备ID（从可用设备中选择，如果不确定则为null）",
    "action": "动作ID",
    "parameters": {}
  },
  "routing": {
    "target": "room-agent 或 home-agent",
    "room_id": "目标房间ID",
    "reason": "决策原因（简短说明）"
  }
}

## 支持的动作类型
- turn_on / turn_off：开关设备
- brightness_up / brightness_down / brightness_max / brightness_min：调节亮度
- color_warm / color_cool：色温调节
- play / pause / stop：播放控制
- mode_heat / mode_cool / mode_dry：空调模式
- curtain_open / curtain_close：窗帘控制

## 路由规则
1. 如果目标设备在当前房间，target 为 "room-agent"，room_id 为当前房间
2. 如果用户指定了其他房间或需要跨房间控制，target 为 "home-agent"
3. 如果无法确定目标房间，target 为 "home-agent"
4. 如果用户输入不是设备控制意图（如聊天、问答），intent.device 和 intent.action 都为 null

## 示例
用户输入："把灯打开"
当前房间：livingroom
可用设备：客厅有 ceiling_light, desk_lamp

输出：
{
  "intent": {
    "device": "ceiling_light",
    "action": "turn_on",
    "parameters": {}
  },
  "routing": {
    "target": "room-agent",
    "room_id": "livingroom",
    "reason": "用户在客厅，请求打开灯，默认操作主灯"
  }
}`;

@Injectable()
export class IntentService {
  private readonly logger = new Logger(IntentService.name);

  constructor(private readonly qwenService: QwenService) {}

  async parseIntent(dto: IntentParseDto): Promise<IntentParseResult> {
    this.logger.log(`Parsing intent for: "${dto.text}"`);

    const systemPrompt = this.buildSystemPrompt(dto.context);
    const userMessage = this.buildUserMessage(dto.text, dto.context);

    try {
      const response = await this.qwenService.chat(
        userMessage,
        [],
        systemPrompt,
      );

      const result = this.parseResponse(response);

      if (result) {
        this.logger.log(`Parsed intent: ${JSON.stringify(result)}`);
        return result;
      }

      this.logger.warn('Failed to parse LLM response, using fallback');
      return this.getFallbackResult(dto);
    } catch (error) {
      this.logger.error(`Intent parsing failed: ${error.message}`);
      return this.getFallbackResult(dto);
    }
  }

  private buildSystemPrompt(context?: IntentParseDto['context']): string {
    const currentRoom = context?.current_room || '未知';
    const availableDevices = this.formatAvailableDevices(
      context?.available_devices || [],
    );

    return SYSTEM_PROMPT_TEMPLATE.replace(
      '{{current_room}}',
      this.getRoomDisplayName(currentRoom),
    ).replace('{{available_devices}}', availableDevices);
  }

  private buildUserMessage(
    text: string,
    context?: IntentParseDto['context'],
  ): string {
    let message = `用户输入："${text}"`;

    if (context?.conversation_history && context.conversation_history.length > 0) {
      message += '\n\n对话历史：';
      for (const msg of context.conversation_history) {
        message += `\n${msg.role === 'user' ? '用户' : '助手'}：${msg.content}`;
      }
    }

    return message;
  }

  private formatAvailableDevices(
    devices: Array<{ room: string; devices: any[] }>,
  ): string {
    if (!devices || devices.length === 0) {
      return '- 暂无可用设备信息';
    }

    const roomNames: Record<string, string> = {
      livingroom: '客厅',
      bedroom: '卧室',
      study: '书房',
      kitchen: '厨房',
      bathroom: '浴室',
    };

    return devices
      .map((room) => {
        const roomName = roomNames[room.room] || room.room;
        const deviceList = room.devices
          .map((d) => `${d.name}(${d.id})`)
          .join(', ');
        return `- ${roomName}：${deviceList}`;
      })
      .join('\n');
  }

  private getRoomDisplayName(roomId: string): string {
    const roomNames: Record<string, string> = {
      livingroom: '客厅',
      bedroom: '卧室',
      study: '书房',
      kitchen: '厨房',
      bathroom: '浴室',
    };
    return roomNames[roomId] || roomId;
  }

  private parseResponse(response: string): IntentParseResult | null {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.logger.warn('No JSON found in response');
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (!parsed.intent || !parsed.routing) {
        this.logger.warn('Missing required fields in parsed response');
        return null;
      }

      return {
        intent: {
          device: parsed.intent.device || null,
          action: parsed.intent.action || null,
          parameters: parsed.intent.parameters || {},
          confidence: parsed.intent.device && parsed.intent.action ? 0.9 : 0.3,
        },
        routing: {
          target: parsed.routing.target || 'home-agent',
          room_id: parsed.routing.room_id || null,
          agent_id: parsed.routing.agent_id || null,
          reason: parsed.routing.reason || 'LLM 解析结果',
        },
        raw_response: response,
      };
    } catch (error) {
      this.logger.error(`Failed to parse JSON: ${error.message}`);
      return null;
    }
  }

  private getFallbackResult(dto: IntentParseDto): IntentParseResult {
    const fallbackIntent = this.localKeywordMatch(dto.text);
    const currentRoom = dto.context?.current_room;

    return {
      intent: fallbackIntent,
      routing: {
        target: currentRoom ? 'room-agent' : 'home-agent',
        room_id: currentRoom || null,
        reason: 'LLM 解析失败，使用本地关键词匹配',
      },
    };
  }

  private localKeywordMatch(text: string): ParsedIntent {
    const deviceAliases: Record<string, string> = {
      灯: 'light',
      吊灯: 'ceiling_light',
      顶灯: 'ceiling_light',
      主灯: 'main_light',
      台灯: 'desk_light',
      床头灯: 'bedside_light',
      音乐: 'speaker',
      音响: 'speaker',
      空调: 'ac',
      冷气: 'ac',
      风扇: 'fan',
      窗帘: 'curtain',
      电视: 'tv',
    };

    const actionPatterns: Record<string, string> = {
      打开: 'turn_on',
      开启: 'turn_on',
      开: 'turn_on',
      关闭: 'turn_off',
      关掉: 'turn_off',
      关: 'turn_off',
      调高: 'brightness_up',
      调低: 'brightness_down',
      最亮: 'brightness_max',
      最暗: 'brightness_min',
      暖色: 'color_warm',
      冷色: 'color_cool',
      播放: 'play',
      暂停: 'pause',
      停止: 'stop',
      制热: 'mode_heat',
      制冷: 'mode_cool',
    };

    let device: string | null = null;
    let action: string | null = null;

    for (const [alias, deviceId] of Object.entries(deviceAliases)) {
      if (text.includes(alias)) {
        device = deviceId;
        break;
      }
    }

    for (const [pattern, actionId] of Object.entries(actionPatterns)) {
      if (text.includes(pattern)) {
        action = actionId;
        break;
      }
    }

    const params: Record<string, any> = {};
    const tempMatch = text.match(/(\d+)度/);
    if (tempMatch) {
      params.temperature = parseInt(tempMatch[1]);
    }

    const brightnessMatch = text.match(/亮度[调到]?(\d+)/);
    if (brightnessMatch) {
      params.brightness = parseInt(brightnessMatch[1]);
    }

    return {
      device,
      action,
      parameters: params,
      confidence: device && action ? 0.6 : 0.3,
    };
  }
}