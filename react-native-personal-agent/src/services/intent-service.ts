import { appEnv } from '@/config/env';
import { HttpClient } from '@/platform/network/http-client';
import type { IntentKind, ParsedIntent, ParsedIntentQuery } from '@/types';

type IntentContext = {
  currentRoom?: string | null;
  currentBeaconId?: string | null;
  availableDevices?: { id: string; name?: string; type?: string }[];
  conversationHistory?: { role: 'user' | 'assistant'; content: string }[];
};

type IntentApiResponse = {
  success?: boolean;
  data?: {
    kind?: IntentKind | 'query' | 'action';
    reply?: string | null;
    query?: {
      type?: 'room_devices' | 'room_state';
      room_id?: string | null;
      reason?: string;
    } | null;
    intent?: {
      device?: string | null;
      action?: string | null;
      parameters?: Record<string, unknown>;
      confidence?: number;
    } | null;
    routing?: {
      target?: 'room-agent' | 'home-agent' | null;
      room_id?: string | null;
      agent_id?: string | null;
      reason?: string;
    } | null;
  };
};

const DEFAULT_CHAT_REPLY = '我先陪你聊聊，当前没有识别到控制或查询请求。';

export class IntentService {
  private readonly http: HttpClient;

  private readonly deviceAliases = {
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
  } as const;

  private readonly actionPatterns = {
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
  } as const;

  private readonly roomMapping = {
    客厅: 'livingroom',
    卧室: 'bedroom',
    书房: 'study',
    厨房: 'kitchen',
    浴室: 'bathroom',
    卫生间: 'bathroom',
  } as const;

  private readonly roomDevicesQueryPatterns = [
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
  ] as const;

  private readonly roomStateQueryPatterns = [
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
  ] as const;

  constructor(http = new HttpClient(appEnv.backendUrl)) {
    this.http = http;
  }

  async parse(text: string, context: IntentContext = {}): Promise<ParsedIntent> {
    const cleanText = text.trim();

    try {
      const response = await this.http.post<IntentApiResponse>('/api/intent/parse', {
        text: cleanText,
        context: {
          current_room: context.currentRoom ?? null,
          current_beacon_id: context.currentBeaconId ?? null,
          available_devices: context.availableDevices ?? [],
          conversation_history: this.limitConversationHistory(context.conversationHistory ?? []),
        },
      });

      if (response.success && response.data) {
        return this.mapApiResult(cleanText, response.data, context.currentRoom ?? null);
      }
    } catch (error) {
      console.warn('[IntentService] Falling back to local intent parsing', error);
    }

    return this.mapLocalResult(cleanText, context.currentRoom ?? null);
  }

  parseLocal(text: string): Omit<ParsedIntent, 'source'> {
    const cleanText = text.trim();
    const room = this.extractValue(cleanText, this.roomMapping);

    if (this.isRoomDevicesQuery(cleanText)) {
      return {
        text: cleanText,
        kind: 'agent_message',
        device: null,
        action: null,
        room,
        parameters: {},
        confidence: 0.7,
        reply: null,
        query: {
          type: 'room_devices',
          roomId: room,
          reason: '本地关键词识别为房间设备查询',
        },
        routing: {
          target: 'room-agent',
          roomId: room,
          reason: '本地回退到房间设备查询',
        },
      };
    }

    if (this.isRoomStateQuery(cleanText)) {
      return {
        text: cleanText,
        kind: 'agent_message',
        device: null,
        action: null,
        room,
        parameters: {},
        confidence: 0.72,
        reply: null,
        query: {
          type: 'room_state',
          roomId: room,
          reason: '本地关键词识别为房间状态查询',
        },
        routing: {
          target: 'room-agent',
          roomId: room,
          reason: '本地回退到房间状态查询',
        },
      };
    }

    const parameters = this.extractParameters(cleanText);
    const device = this.extractValue(cleanText, this.deviceAliases);
    const action = this.extractValue(cleanText, this.actionPatterns);

    if (action) {
      let confidence = 0.4;

      if (device) {
        confidence += 0.3;
      }

      if (room) {
        confidence += 0.1;
      }

      if (Object.keys(parameters).length > 0) {
        confidence += 0.1;
      }

      return {
        text: cleanText,
        kind: 'agent_message',
        device,
        action,
        room,
        parameters,
        confidence: Math.min(confidence, 1),
        reply: null,
        query: null,
        routing: {
          target: room ? 'room-agent' : 'home-agent',
          roomId: room,
          reason: '本地关键词识别为设备控制',
        },
      };
    }

    return {
      text: cleanText,
      kind: 'chat',
      device: null,
      action: null,
      room,
      parameters: {},
      confidence: 0.4,
      reply: DEFAULT_CHAT_REPLY,
      query: null,
      routing: {
        target: null,
        roomId: null,
        reason: '本地回退到聊天回复',
      },
    };
  }

  private mapApiResult(
    text: string,
    data: NonNullable<IntentApiResponse['data']>,
    fallbackRoom: string | null,
  ): ParsedIntent {
    const kind = this.normalizeKind(data);
    const query = this.mapQuery(data.query);
    const room =
      query?.roomId ??
      data.routing?.room_id ??
      fallbackRoom ??
      null;

    return {
      text,
      kind,
      device: data.intent?.device ?? null,
      action: data.intent?.action ?? null,
      room,
      parameters: data.intent?.parameters ?? {},
      confidence: data.intent?.confidence ?? this.defaultConfidenceForKind(kind),
      source: 'llm',
      reply: kind === 'chat' ? data.reply ?? DEFAULT_CHAT_REPLY : null,
      query:
        kind === 'agent_message' && query
          ? {
              type: query.type,
              roomId: query.roomId ?? room,
              reason:
                query.reason ??
                (query.type === 'room_state' ? '后端识别为房间状态查询' : '后端识别为房间设备查询'),
            }
          : null,
      routing: {
        target: this.resolveRoutingTarget(kind, data, query, room),
        roomId:
          kind === 'chat'
            ? null
            : data.routing?.room_id ?? query?.roomId ?? room,
        agentId: data.routing?.agent_id ?? null,
        reason:
          data.routing?.reason ??
          query?.reason ??
          (kind === 'chat' ? '这是聊天回复' : '后端要求把原话转发给目标 agent'),
      },
    };
  }

  private mapLocalResult(text: string, fallbackRoom: string | null): ParsedIntent {
    const localIntent = this.parseLocal(text);
    const resolvedRoom = localIntent.query?.roomId ?? localIntent.room ?? fallbackRoom;

    return {
      ...localIntent,
      room: resolvedRoom,
      query: localIntent.query
        ? {
            ...localIntent.query,
            roomId: localIntent.query.roomId ?? resolvedRoom,
          }
        : null,
      routing: localIntent.routing
        ? {
            ...localIntent.routing,
            roomId:
              localIntent.routing.target === null
                ? null
                : localIntent.routing.roomId ?? resolvedRoom,
          }
        : undefined,
      source: 'fallback',
    };
  }

  private mapQuery(
    query: NonNullable<IntentApiResponse['data']>['query'],
  ): ParsedIntentQuery | null {
    if (!query || (query.type !== 'room_devices' && query.type !== 'room_state')) {
      return null;
    }

    return {
      type: query.type,
      roomId: query.room_id ?? null,
      reason: query.reason,
    };
  }

  private normalizeKind(data: NonNullable<IntentApiResponse['data']>): IntentKind {
    if (data.kind === 'chat' || data.kind === 'agent_message') {
      return data.kind;
    }

    if (data.kind === 'query' || data.kind === 'action') {
      return 'agent_message';
    }

    if (data.query?.type === 'room_devices' || data.query?.type === 'room_state') {
      return 'agent_message';
    }

    if (typeof data.reply === 'string' && data.reply.trim().length > 0) {
      return 'chat';
    }

    return 'agent_message';
  }

  private defaultConfidenceForKind(kind: IntentKind): number {
    switch (kind) {
      case 'agent_message':
        return 0.75;
      case 'chat':
      default:
        return 0.6;
    }
  }

  private resolveRoutingTarget(
    kind: IntentKind,
    data: NonNullable<IntentApiResponse['data']>,
    query: ParsedIntentQuery | null,
    room: string | null,
  ): 'room-agent' | 'home-agent' | null {
    if (kind === 'chat') {
      return null;
    }

    if (data.routing?.target === 'room-agent' || data.routing?.target === 'home-agent') {
      return data.routing.target;
    }

    if (query) {
      return 'room-agent';
    }

    if (room) {
      return 'room-agent';
    }

    return 'home-agent';
  }

  private isRoomDevicesQuery(text: string): boolean {
    return this.roomDevicesQueryPatterns.some(pattern => text.includes(pattern));
  }

  private isRoomStateQuery(text: string): boolean {
    const hasStateKeyword = this.roomStateQueryPatterns.some(pattern => text.includes(pattern));
    if (!hasStateKeyword) {
      return false;
    }

    const hasDeviceKeyword = this.extractValue(text, this.deviceAliases) !== null;
    const hasRoomKeyword = this.extractValue(text, this.roomMapping) !== null || text.includes('房间');

    return hasDeviceKeyword || hasRoomKeyword;
  }

  private extractParameters(text: string): Record<string, unknown> {
    const parameters: Record<string, unknown> = {};

    const temperatureMatch = text.match(/(\d+)度/);
    if (temperatureMatch) {
      parameters.temperature = Number(temperatureMatch[1]);
    }

    const percentMatch = text.match(/(\d+)%/);
    if (percentMatch) {
      parameters.percent = Number(percentMatch[1]);
    }

    const brightnessMatch = text.match(/亮度(?:调到)?(\d+)/);
    if (brightnessMatch) {
      parameters.brightness = Number(brightnessMatch[1]);
    }

    const volumeMatch = text.match(/音量(?:调到)?(\d+)/);
    if (volumeMatch) {
      parameters.volume = Number(volumeMatch[1]);
    }

    if (Object.keys(parameters).length === 0) {
      const valueMatch = text.match(/(\d+)/);
      if (valueMatch) {
        parameters.value = Number(valueMatch[1]);
      }
    }

    return parameters;
  }

  private extractValue<T extends Record<string, string>>(text: string, patterns: T): string | null {
    const entries = Object.entries(patterns).sort(([left], [right]) => right.length - left.length);

    for (const [pattern, value] of entries) {
      if (text.includes(pattern)) {
        return value;
      }
    }

    return null;
  }

  private limitConversationHistory(history: IntentContext['conversationHistory']) {
    if (!history || history.length <= 6) {
      return history;
    }

    return history.slice(-6);
  }
}
