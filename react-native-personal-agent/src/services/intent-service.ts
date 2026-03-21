import { appEnv } from '@/config/env';
import { HttpClient } from '@/platform/network/http-client';
import type { ParsedIntent } from '@/types';

type IntentContext = {
  currentRoom?: string | null;
  currentBeaconId?: string | null;
  availableDevices?: { id: string; name?: string; type?: string }[];
  conversationHistory?: { role: 'user' | 'assistant'; content: string }[];
};

type IntentApiResponse = {
  success?: boolean;
  data?: {
    intent?: {
      device?: string | null;
      action?: string | null;
      parameters?: Record<string, unknown>;
      confidence?: number;
    };
    routing?: {
      target?: 'room-agent' | 'home-agent';
      room_id?: string | null;
      agent_id?: string | null;
      reason?: string;
    };
  };
};

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
    打开窗帘: 'curtain_open',
    关闭窗帘: 'curtain_close',
    拉开窗帘: 'curtain_open',
    拉上窗帘: 'curtain_close',
  } as const;

  private readonly roomMapping = {
    客厅: 'livingroom',
    卧室: 'bedroom',
    书房: 'study',
    厨房: 'kitchen',
    浴室: 'bathroom',
    卫生间: 'bathroom',
  } as const;

  constructor(http = new HttpClient(appEnv.backendUrl)) {
    this.http = http;
  }

  async parse(text: string, context: IntentContext = {}): Promise<ParsedIntent> {
    try {
      const response = await this.http.post<IntentApiResponse>('/api/intent/parse', {
        text: text.trim(),
        context: {
          current_room: context.currentRoom ?? null,
          current_beacon_id: context.currentBeaconId ?? null,
          available_devices: context.availableDevices ?? [],
          conversation_history: this.limitConversationHistory(context.conversationHistory ?? []),
        },
      });

      if (response.success && response.data?.intent) {
        return {
          text: text.trim(),
          device: response.data.intent.device ?? null,
          action: response.data.intent.action ?? null,
          parameters: response.data.intent.parameters ?? {},
          room: response.data.routing?.room_id ?? context.currentRoom ?? null,
          confidence: response.data.intent.confidence ?? 0.8,
          source: 'llm',
          routing: response.data.routing?.target
            ? {
                target: response.data.routing.target,
                roomId: response.data.routing.room_id,
                agentId: response.data.routing.agent_id,
                reason: response.data.routing.reason,
              }
            : undefined,
        };
      }
    } catch (error) {
      console.warn('[IntentService] Falling back to local intent parsing', error);
    }

    return {
      ...this.parseLocal(text),
      source: 'fallback',
    };
  }

  parseLocal(text: string): Omit<ParsedIntent, 'source'> {
    const cleanText = text.trim();
    const parameters = this.extractParameters(cleanText);

    const intent = {
      text: cleanText,
      device: this.extractValue(cleanText, this.deviceAliases),
      action: this.extractValue(cleanText, this.actionPatterns),
      room: this.extractValue(cleanText, this.roomMapping),
      parameters,
      confidence: 0.3,
    };

    if (intent.device) {
      intent.confidence += 0.3;
    }

    if (intent.action) {
      intent.confidence += 0.3;
    }

    if (intent.room) {
      intent.confidence += 0.1;
    }

    if (Object.keys(parameters).length > 0) {
      intent.confidence += 0.1;
    }

    return {
      ...intent,
      confidence: Math.min(intent.confidence, 1),
    };
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

    const brightnessMatch = text.match(/亮度[调到]?(\d+)/);
    if (brightnessMatch) {
      parameters.brightness = Number(brightnessMatch[1]);
    }

    const volumeMatch = text.match(/音量[调到]?(\d+)/);
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
    for (const [pattern, value] of Object.entries(patterns)) {
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
