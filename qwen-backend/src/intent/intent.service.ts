import { Injectable, Logger } from '@nestjs/common';
import { QwenService } from '../qwen/qwen.service';
import {
  IntentParseDto,
  IntentParseResult,
  ParsedIntent,
  RoutingDecision,
} from './dto/intent.dto';

const ROOM_NAMES: Record<string, string> = {
  livingroom: '客厅',
  bedroom: '卧室',
  study: '书房',
  kitchen: '厨房',
  bathroom: '浴室',
};

const ROOM_MAPPING: Record<string, string> = {
  客厅: 'livingroom',
  卧室: 'bedroom',
  书房: 'study',
  厨房: 'kitchen',
  浴室: 'bathroom',
  卫生间: 'bathroom',
};

const DEVICE_ALIASES: Record<string, string> = {
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
  电视机: 'tv',
};

const ACTION_PATTERNS: Record<string, string> = {
  打开窗帘: 'curtain_open',
  关闭窗帘: 'curtain_close',
  拉开窗帘: 'curtain_open',
  拉上窗帘: 'curtain_close',
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
  除湿: 'mode_dry',
};

const ROOM_DEVICES_QUERY_PATTERNS = [
  '房间里有什么设备',
  '房间里有哪些设备',
  '有什么设备',
  '有哪些设备',
  '有什么家电',
  '有哪些家电',
  '支持什么设备',
  '支持哪些设备',
  '有哪些能力',
  '有什么能力',
];

const ROOM_STATE_QUERY_PATTERNS = [
  '现在开着吗',
  '现在关着吗',
  '现在亮着吗',
  '还开着吗',
  '还关着吗',
  '还亮着吗',
  '现在是什么状态',
  '现在状态怎么样',
  '状态怎么样',
  '是什么状态',
];

const DEFAULT_CHAT_REPLY = '我先陪你聊聊，当前没有识别到控制或查询请求。';

const SYSTEM_PROMPT_TEMPLATE = `你是智能家居系统的意图解析和路由决策助手。

## 任务
根据用户输入和当前上下文，把输入归类成以下三种结果之一：
1. chat：简单交流、寒暄、解释、介绍、开放式问答，不需要访问 agent 执行
2. query：查询房间设备/能力清单或当前状态，支持 room_devices 与 room_state
3. action：明确的设备控制或跨房间任务，需要路由到 room-agent 或 home-agent

你必须返回严格的 JSON，不要包含任何其他文字。

## 当前上下文
- 用户所在房间：{{current_room}}
- 可用设备列表：
{{available_devices}}

## 输出格式
返回 JSON，格式如下：
{
  "kind": "chat | query | action",
  "reply": "仅 chat 时填写，其余为 null",
  "query": {
    "type": "room_devices | room_state",
    "room_id": "房间ID，不确定时为 null",
    "reason": "为什么判定为查询"
  },
  "intent": {
    "device": "设备ID（从可用设备中选择，不确定则为 null）",
    "action": "动作ID",
    "parameters": {}
  },
  "routing": {
    "target": "room-agent | home-agent | null",
    "room_id": "目标房间ID，不确定时为 null",
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

## 关键规则
1. 像“房间里有什么设备”“有哪些能力”“客厅灯现在开着吗”这类查询，必须返回 kind="query"，不能错误写成 action
2. 简单聊天、介绍、解释、问答，返回 kind="chat"
3. 只有明确控制设备或执行场景时，才返回 kind="action"
4. chat 时 routing.target 必须为 null
5. query 时：
   - 设备/能力清单查询返回 query.type = "room_devices"
   - 当前状态查询返回 query.type = "room_state"
   - routing.target 默认填 "room-agent"
6. action 路由规则：
   - 如果目标设备在当前房间，target 为 "room-agent"，room_id 为当前房间
   - 如果用户指定了其他房间或需要跨房间控制，target 为 "home-agent"
   - 如果无法确定目标房间，target 为 "home-agent"

## 示例
用户输入："房间里有什么设备"
输出：
{
  "kind": "query",
  "reply": null,
  "query": {
    "type": "room_devices",
    "room_id": "livingroom",
    "reason": "用户在询问当前房间已登记的设备清单"
  },
  "intent": null,
  "routing": {
    "target": "room-agent",
    "room_id": "livingroom",
    "reason": "该请求需要查询当前房间的代理描述信息"
  }
}

用户输入："客厅灯现在开着吗"
输出：
{
  "kind": "query",
  "reply": null,
  "query": {
    "type": "room_state",
    "room_id": "livingroom",
    "reason": "用户在询问当前房间设备的实时状态"
  },
  "intent": null,
  "routing": {
    "target": "room-agent",
    "room_id": "livingroom",
    "reason": "该请求需要查询当前房间代理可访问的设备状态"
  }
}

用户输入："你好，介绍一下你能做什么"
输出：
{
  "kind": "chat",
  "reply": "你好，我可以帮你回答问题，也可以帮你查询房间设备和控制家居设备。",
  "query": null,
  "intent": null,
  "routing": {
    "target": null,
    "room_id": null,
    "reason": "这是聊天和能力介绍，不需要访问 agent"
  }
}

用户输入："把客厅主灯打开"
输出：
{
  "kind": "action",
  "reply": null,
  "query": null,
  "intent": {
    "device": "main_light",
    "action": "turn_on",
    "parameters": {}
  },
  "routing": {
    "target": "room-agent",
    "room_id": "livingroom",
    "reason": "用户请求控制客厅主灯"
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
      const response = await this.qwenService.chat(userMessage, [], systemPrompt);
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
    const availableDevices = this.formatAvailableDevices(context?.available_devices || []);

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

    return devices
      .map((room) => {
        const roomName = ROOM_NAMES[room.room] || room.room;
        const deviceList = room.devices.map((d) => `${d.name}(${d.id})`).join(', ');
        return `- ${roomName}：${deviceList}`;
      })
      .join('\n');
  }

  private getRoomDisplayName(roomId: string): string {
    return ROOM_NAMES[roomId] || roomId;
  }

  private parseResponse(response: string): IntentParseResult | null {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.logger.warn('No JSON found in response');
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const kind = this.normalizeKind(parsed);
      if (!kind) {
        this.logger.warn('Unable to infer intent kind from parsed response');
        return null;
      }

      if (kind === 'chat') {
        return {
          kind,
          reply: this.resolveString(parsed.reply) || DEFAULT_CHAT_REPLY,
          intent: null,
          query: null,
          routing: this.normalizeRouting(parsed.routing, kind, null),
          raw_response: response,
        };
      }

      if (kind === 'query') {
        const queryType = parsed.query?.type === 'room_state' ? 'room_state' : 'room_devices';
        const queryReason =
          this.resolveString(parsed.query?.reason) ||
          this.resolveString(parsed.routing?.reason) ||
          (queryType === 'room_state' ? '用户在查询房间当前状态' : '用户在查询房间设备清单');
        const roomId =
          this.resolveString(parsed.query?.room_id) ||
          this.resolveString(parsed.routing?.room_id) ||
          null;

        return {
          kind,
          reply: null,
          intent: null,
          query: {
            type: queryType,
            room_id: roomId,
            reason: queryReason,
          },
          routing: this.normalizeRouting(parsed.routing, kind, queryReason, roomId),
          raw_response: response,
        };
      }

      if (!parsed.intent) {
        this.logger.warn('Missing intent payload for action response');
        return null;
      }

      const intent = {
        device: this.resolveString(parsed.intent.device),
        action: this.resolveString(parsed.intent.action),
        parameters: this.resolveParameters(parsed.intent.parameters),
        confidence:
          this.resolveString(parsed.intent.device) && this.resolveString(parsed.intent.action)
            ? 0.9
            : 0.5,
      };

      if (!intent.action) {
        this.logger.warn('Action response does not include an action');
        return null;
      }

      return {
        kind,
        reply: null,
        query: null,
        intent,
        routing: this.normalizeRouting(parsed.routing, kind, null),
        raw_response: response,
      };
    } catch (error) {
      this.logger.error(`Failed to parse JSON: ${error.message}`);
      return null;
    }
  }

  private normalizeKind(value: any): IntentParseResult['kind'] | null {
    if (value?.kind === 'chat' || value?.kind === 'query' || value?.kind === 'action') {
      return value.kind;
    }

    if (value?.query?.type === 'room_devices' || value?.query?.type === 'room_state') {
      return 'query';
    }

    if (typeof value?.reply === 'string' && value.reply.trim().length > 0) {
      return 'chat';
    }

    if (value?.intent?.action || value?.intent?.device) {
      return 'action';
    }

    return null;
  }

  private normalizeRouting(
    routing: any,
    kind: IntentParseResult['kind'],
    fallbackReason: string | null,
    fallbackRoomId?: string | null,
  ): RoutingDecision {
    if (kind === 'chat') {
      return {
        target: null,
        room_id: null,
        agent_id: null,
        reason:
          this.resolveString(routing?.reason) ||
          fallbackReason ||
          '这是聊天消息，不需要访问 agent',
      };
    }

    if (kind === 'query') {
      return {
        target: 'room-agent',
        room_id: this.resolveString(routing?.room_id) || fallbackRoomId || null,
        agent_id: this.resolveString(routing?.agent_id) || null,
        reason:
          this.resolveString(routing?.reason) ||
          fallbackReason ||
          '需要查询当前房间的代理描述信息',
      };
    }

    return {
      target: routing?.target === 'room-agent' ? 'room-agent' : 'home-agent',
      room_id: this.resolveString(routing?.room_id) || null,
      agent_id: this.resolveString(routing?.agent_id) || null,
      reason: this.resolveString(routing?.reason) || 'LLM 解析结果',
    };
  }

  private getFallbackResult(dto: IntentParseDto): IntentParseResult {
    const cleanText = dto.text.trim();
    const currentRoom = dto.context?.current_room || null;
    const parsedRoom = this.extractRoomId(cleanText);
    const resolvedRoom = parsedRoom || currentRoom;

    if (this.isRoomDevicesQuery(cleanText)) {
      return {
        kind: 'query',
        reply: null,
        intent: null,
        query: {
          type: 'room_devices',
          room_id: resolvedRoom,
          reason: 'LLM 解析失败，使用本地关键词识别为房间设备查询',
        },
        routing: {
          target: 'room-agent',
          room_id: resolvedRoom,
          agent_id: null,
          reason: 'LLM 解析失败，回退到房间设备查询',
        },
      };
    }

    if (this.isRoomStateQuery(cleanText)) {
      return {
        kind: 'query',
        reply: null,
        intent: null,
        query: {
          type: 'room_state',
          room_id: resolvedRoom,
          reason: 'LLM 解析失败，使用本地关键词识别为房间状态查询',
        },
        routing: {
          target: 'room-agent',
          room_id: resolvedRoom,
          agent_id: null,
          reason: 'LLM 解析失败，回退到房间状态查询',
        },
      };
    }

    const fallbackIntent = this.localKeywordMatch(cleanText);
    if (fallbackIntent.action) {
      return {
        kind: 'action',
        reply: null,
        query: null,
        intent: fallbackIntent,
        routing: {
          target: resolvedRoom ? 'room-agent' : 'home-agent',
          room_id: resolvedRoom,
          agent_id: null,
          reason: 'LLM 解析失败，使用本地关键词匹配动作意图',
        },
      };
    }

    return {
      kind: 'chat',
      reply: DEFAULT_CHAT_REPLY,
      intent: null,
      query: null,
      routing: {
        target: null,
        room_id: null,
        agent_id: null,
        reason: 'LLM 解析失败，回退到聊天回复',
      },
    };
  }

  private localKeywordMatch(text: string): ParsedIntent {
    const params = this.extractParameters(text);

    return {
      device: this.extractMappedValue(text, DEVICE_ALIASES),
      action: this.extractMappedValue(text, ACTION_PATTERNS),
      parameters: params,
      confidence: 0.6,
    };
  }

  private isRoomDevicesQuery(text: string): boolean {
    return ROOM_DEVICES_QUERY_PATTERNS.some((pattern) => text.includes(pattern));
  }

  private isRoomStateQuery(text: string): boolean {
    const hasStateKeyword = ROOM_STATE_QUERY_PATTERNS.some((pattern) => text.includes(pattern));
    if (!hasStateKeyword) {
      return false;
    }

    const hasDeviceKeyword = this.extractMappedValue(text, DEVICE_ALIASES) !== null;
    const hasRoomKeyword = this.extractMappedValue(text, ROOM_MAPPING) !== null || text.includes('房间');

    return hasDeviceKeyword || hasRoomKeyword;
  }

  private extractRoomId(text: string): string | null {
    return this.extractMappedValue(text, ROOM_MAPPING);
  }

  private extractMappedValue(text: string, mapping: Record<string, string>): string | null {
    const entries = Object.entries(mapping).sort(
      ([left], [right]) => right.length - left.length,
    );

    for (const [pattern, value] of entries) {
      if (text.includes(pattern)) {
        return value;
      }
    }

    return null;
  }

  private extractParameters(text: string): Record<string, any> {
    const params: Record<string, any> = {};
    const tempMatch = text.match(/(\d+)度/);
    if (tempMatch) {
      params.temperature = parseInt(tempMatch[1], 10);
    }

    const brightnessMatch = text.match(/亮度(?:调到)?(\d+)/);
    if (brightnessMatch) {
      params.brightness = parseInt(brightnessMatch[1], 10);
    }

    const percentMatch = text.match(/(\d+)%/);
    if (percentMatch) {
      params.percent = parseInt(percentMatch[1], 10);
    }

    return params;
  }

  private resolveParameters(value: unknown): Record<string, any> {
    return value && typeof value === 'object' ? (value as Record<string, any>) : {};
  }

  private resolveString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }
}
