import { appEnv, getRoomDisplayName } from '@/config/env';
import { buildRoomAgentSnapshot } from '@/features/voice-control/room-agent-snapshot';
import { buildRoomTaskDispatchPresentation } from '@/features/voice-control/task-state';
import type {
  ParsedIntent,
  RoomAgentSnapshot,
  RoomBinding,
  VoiceCommandExecutionResult,
} from '@/types';

import { A2AHttpControlTransport } from './transports/a2a-http-control-transport';
import { ControlService } from './control-service';
import { DiscoveryService } from './discovery-service';
import { HomeAgentService } from './home-agent-service';
import { IntentService } from './intent-service';

type VoiceCommandExecutionContext = {
  currentRoomBinding?: RoomBinding | null;
};

const DEFAULT_CHAT_REPLY = '我先陪你聊聊，当前没有识别到控制或查询请求。';

export class VoiceCommandOrchestrator {
  constructor(
    private readonly intentService = new IntentService(),
    private readonly discoveryService = new DiscoveryService(),
    private readonly controlService = new ControlService(
      appEnv.personalAgentId,
      new A2AHttpControlTransport(),
    ),
    private readonly homeAgentService = new HomeAgentService(),
  ) {}

  async execute(
    input: string,
    context: VoiceCommandExecutionContext = {},
  ): Promise<VoiceCommandExecutionResult> {
    const text = input.trim();
    const fallbackRoomId = context.currentRoomBinding?.roomId ?? null;
    const fallbackRoomName = context.currentRoomBinding?.roomName ?? null;
    let intent: ParsedIntent = {
      text,
      kind: 'chat',
      device: null,
      action: null,
      room: fallbackRoomId,
      parameters: {},
      confidence: 0,
      source: 'fallback',
      reply: null,
      query: null,
    };

    if (!text) {
      return this.createResult(intent, {
        success: false,
        status: '请输入调试指令',
        detail: '当前没有可执行的文本指令。',
        route: 'unresolved',
        roomId: fallbackRoomId,
        roomName: fallbackRoomName,
      });
    }

    try {
      intent = await this.intentService.parse(text, {
        currentRoom: fallbackRoomId,
        currentBeaconId: context.currentRoomBinding?.beaconId ?? null,
      });

      switch (intent.kind) {
        case 'chat':
          return this.executeChat(intent, fallbackRoomId, fallbackRoomName);
        case 'query':
          return await this.executeQuery(intent, text, fallbackRoomId, fallbackRoomName);
        case 'action':
          return await this.executeAction(intent, text, fallbackRoomId, fallbackRoomName);
        default:
          return this.createResult(intent, {
            success: false,
            status: '意图未识别',
            detail: '当前没有识别到可执行的聊天、查询或控制意图。',
            route: 'unresolved',
            roomId: intent.room ?? fallbackRoomId,
            roomName: this.resolveRoomName(intent.room ?? fallbackRoomId, fallbackRoomName),
          });
      }
    } catch (error) {
      console.warn('[VoiceCommandOrchestrator] Command execution failed', error);

      const route = this.resolveErrorRoute(intent, fallbackRoomId);
      return this.createResult(intent, {
        success: false,
        status: this.resolveErrorStatus(route),
        detail: this.resolveErrorDetail(route),
        route,
        roomId: intent.query?.roomId ?? intent.routing?.roomId ?? intent.room ?? fallbackRoomId,
        roomName: this.resolveRoomName(
          intent.query?.roomId ?? intent.routing?.roomId ?? intent.room ?? fallbackRoomId,
          fallbackRoomName,
        ),
        agentId: intent.routing?.agentId ?? null,
      });
    }
  }

  async destroy(): Promise<void> {
    await this.controlService.destroy();
    this.discoveryService.destroy();
  }

  private async executeAction(
    intent: ParsedIntent,
    text: string,
    fallbackRoomId: string | null,
    fallbackRoomName: string | null,
  ): Promise<VoiceCommandExecutionResult> {
    if (!intent.action) {
      return this.createResult(intent, {
        success: false,
        status: '意图未识别',
        detail: '未能从文本中识别出可执行动作，建议补充“打开/关闭/调到多少”等动作词。',
        route: 'unresolved',
        roomId: intent.room ?? fallbackRoomId,
        roomName: this.resolveRoomName(intent.room ?? fallbackRoomId, fallbackRoomName),
      });
    }

    if (intent.routing?.target === 'home-agent') {
      const success = await this.homeAgentService.sendTask(intent);
      return this.createResult(intent, {
        success,
        status: success ? '已转交 Home-Agent' : 'Home-Agent 调用失败',
        detail: success
          ? '跨房间或全局任务已发送到 home-agent，等待后端结果回流。'
          : 'home-agent 任务发送失败，请检查后端服务与接口映射。',
        route: 'home-agent',
        roomId: intent.room ?? fallbackRoomId,
        roomName: this.resolveRoomName(intent.room ?? fallbackRoomId, fallbackRoomName),
      });
    }

    const roomId = intent.routing?.roomId ?? intent.room ?? fallbackRoomId;
    if (!roomId) {
      return this.createResult(intent, {
        success: false,
        status: '缺少房间上下文',
        detail: '当前既没有房间绑定，也没有在文本里识别到房间，无法路由到 room-agent。',
        route: 'unresolved',
        roomId: null,
        roomName: null,
      });
    }

    if (!intent.device) {
      return this.createResult(intent, {
        success: false,
        status: '缺少设备目标',
        detail: '动作已识别，但目标设备不明确，建议补充“主灯/空调/窗帘”等设备词。',
        route: 'unresolved',
        roomId,
        roomName: this.resolveRoomName(roomId, fallbackRoomName),
      });
    }

    const agentInfo = await this.discoveryService.getRoomAgentByRoomId(roomId);
    if (!agentInfo) {
      return this.createResult(intent, {
        success: false,
        status: '未发现 Room-Agent',
        detail: `尚未获取到房间 ${roomId} 的代理映射，无法下发控制命令。`,
        route: 'room-agent',
        roomId,
        roomName: this.resolveRoomName(roomId, fallbackRoomName),
      });
    }

    this.controlService.setRoomAgent(agentInfo.roomId, agentInfo.agentId);
    const connected = await this.controlService.connect(agentInfo, agentInfo.roomId);
    if (!connected) {
      const connectionError = this.controlService.getLastError();
      return this.createResult(intent, {
        success: false,
        status: '控制通道连接失败',
        detail: connectionError
          ? `已经发现目标 room-agent，但 A2A 控制通道未连通。${connectionError}`
          : '已经发现目标 room-agent，但 A2A 控制通道未连通。',
        route: 'room-agent',
        roomId: agentInfo.roomId,
        roomName: agentInfo.roomName,
        agentId: agentInfo.agentId,
      });
    }

    const dispatch = await this.controlService.sendControl(
      agentInfo.roomId,
      text,
      intent.device,
      intent.action,
      intent.parameters,
    );

    return this.createResult(intent, {
      success: dispatch.success,
      ...buildRoomTaskDispatchPresentation(dispatch, {
        roomName: agentInfo.roomName,
        targetDevice: intent.device,
        action: intent.action,
      }),
      route: 'room-agent',
      roomId: agentInfo.roomId,
      roomName: agentInfo.roomName,
      agentId: agentInfo.agentId,
      taskId: dispatch.taskId,
      taskContextId: dispatch.contextId,
      taskState: dispatch.state,
      taskTerminal: dispatch.isTerminal,
      taskInterrupted: dispatch.isInterrupted,
      taskAction: dispatch.action,
    });
  }

  private executeChat(
    intent: ParsedIntent,
    fallbackRoomId: string | null,
    fallbackRoomName: string | null,
  ): VoiceCommandExecutionResult {
    return this.createResult(intent, {
      success: true,
      status: '已生成对话回复',
      detail: intent.reply ?? DEFAULT_CHAT_REPLY,
      route: 'chat',
      roomId: intent.room ?? fallbackRoomId,
      roomName: this.resolveRoomName(intent.room ?? fallbackRoomId, fallbackRoomName),
    });
  }

  private async executeQuery(
    intent: ParsedIntent,
    text: string,
    fallbackRoomId: string | null,
    fallbackRoomName: string | null,
  ): Promise<VoiceCommandExecutionResult> {
    if (intent.query?.type === 'room_state') {
      return this.executeRoomStateQuery(intent, text, fallbackRoomId, fallbackRoomName);
    }

    return this.executeRoomDevicesQuery(intent, fallbackRoomId, fallbackRoomName);
  }

  private async executeRoomDevicesQuery(
    intent: ParsedIntent,
    fallbackRoomId: string | null,
    fallbackRoomName: string | null,
  ): Promise<VoiceCommandExecutionResult> {
    const roomId = intent.query?.roomId ?? intent.routing?.roomId ?? intent.room ?? fallbackRoomId;

    if (!roomId) {
      return this.createResult(intent, {
        success: false,
        status: '缺少房间上下文',
        detail: '当前既没有房间绑定，也没有在文本里识别到房间，无法查询房间设备清单。',
        route: 'unresolved',
        roomId: null,
        roomName: null,
      });
    }

    const agentInfo = await this.discoveryService.getRoomAgentByRoomId(roomId);
    if (!agentInfo) {
      return this.createResult(intent, {
        success: false,
        status: '未发现 Room-Agent',
        detail: `尚未获取到房间 ${roomId} 的代理映射，暂时无法查询设备清单。`,
        route: 'query',
        roomId,
        roomName: this.resolveRoomName(roomId, fallbackRoomName),
      });
    }

    this.controlService.setRoomAgent(agentInfo.roomId, agentInfo.agentId);
    const connected = await this.controlService.connect(agentInfo, agentInfo.roomId);
    if (!connected) {
      const connectionError = this.controlService.getLastError();
      return this.createResult(intent, {
        success: false,
        status: '查询通道连接失败',
        detail: connectionError
          ? `已经发现目标 room-agent，但查询链路未连通。${connectionError}`
          : '已经发现目标 room-agent，但查询链路未连通。',
        route: 'query',
        roomId: agentInfo.roomId,
        roomName: agentInfo.roomName,
        agentId: agentInfo.agentId,
      });
    }

    const description = await this.controlService.queryCapabilities(agentInfo.roomId, agentInfo);
    const snapshot = buildRoomAgentSnapshot(description, {
      roomId: agentInfo.roomId,
      roomName: agentInfo.roomName,
    });

    const presentation = this.buildRoomDevicesQueryPresentation(snapshot, agentInfo.roomName);
    return this.createResult(intent, {
      success: true,
      status: presentation.status,
      detail: presentation.detail,
      route: 'query',
      roomId: agentInfo.roomId,
      roomName: agentInfo.roomName,
      agentId: agentInfo.agentId,
    });
  }

  private async executeRoomStateQuery(
    intent: ParsedIntent,
    text: string,
    fallbackRoomId: string | null,
    fallbackRoomName: string | null,
  ): Promise<VoiceCommandExecutionResult> {
    const roomId = intent.query?.roomId ?? intent.routing?.roomId ?? intent.room ?? fallbackRoomId;

    if (!roomId) {
      return this.createResult(intent, {
        success: false,
        status: '缺少房间上下文',
        detail: '当前既没有房间绑定，也没有在文本里识别到房间，无法查询房间状态。',
        route: 'unresolved',
        roomId: null,
        roomName: null,
      });
    }

    const agentInfo = await this.discoveryService.getRoomAgentByRoomId(roomId);
    if (!agentInfo) {
      return this.createResult(intent, {
        success: false,
        status: '未发现 Room-Agent',
        detail: `尚未获取到房间 ${roomId} 的代理映射，暂时无法查询当前状态。`,
        route: 'query',
        roomId,
        roomName: this.resolveRoomName(roomId, fallbackRoomName),
      });
    }

    this.controlService.setRoomAgent(agentInfo.roomId, agentInfo.agentId);
    const connected = await this.controlService.connect(agentInfo, agentInfo.roomId);
    if (!connected) {
      const connectionError = this.controlService.getLastError();
      return this.createResult(intent, {
        success: false,
        status: '查询通道连接失败',
        detail: connectionError
          ? `已经发现目标 room-agent，但查询链路未连通。${connectionError}`
          : '已经发现目标 room-agent，但查询链路未连通。',
        route: 'query',
        roomId: agentInfo.roomId,
        roomName: agentInfo.roomName,
        agentId: agentInfo.agentId,
      });
    }

    const dispatch = await this.controlService.queryRoomState(agentInfo.roomId, text, {
      metadata: {
        queryType: 'room_state',
      },
    });

    return this.createResult(intent, {
      success: dispatch.success,
      status: this.resolveRoomStateQueryStatus(dispatch),
      detail: dispatch.detail,
      route: 'query',
      roomId: agentInfo.roomId,
      roomName: agentInfo.roomName,
      agentId: agentInfo.agentId,
      taskId: dispatch.taskId,
      taskContextId: dispatch.contextId,
      taskState: dispatch.state,
      taskTerminal: dispatch.isTerminal,
      taskInterrupted: dispatch.isInterrupted,
      taskAction: dispatch.action,
    });
  }

  private buildRoomDevicesQueryPresentation(
    snapshot: RoomAgentSnapshot | null,
    fallbackRoomName: string | null,
  ): { status: string; detail: string } {
    const roomName =
      snapshot?.roomName ?? this.resolveRoomName(snapshot?.roomId ?? null, fallbackRoomName) ?? '当前房间';

    if (!snapshot) {
      return {
        status: '已连上 Room-Agent',
        detail: `${roomName}已连上 Room-Agent，但暂未获取到设备描述。`,
      };
    }

    if (snapshot.devices.length > 0) {
      const deviceNames = snapshot.devices
        .map(device => device.name?.trim() || device.id)
        .filter(name => name.length > 0)
        .join('、');

      return {
        status: '已获取房间设备清单',
        detail: `${roomName}里目前登记了 ${snapshot.devices.length} 个设备：${deviceNames}。`,
      };
    }

    if (snapshot.capabilities.length > 0) {
      return {
        status: '已获取房间能力摘要',
        detail: `${roomName}暂未登记可展示的设备清单，但当前可见 ${snapshot.capabilities.length} 类能力：${snapshot.capabilities.join('、')}。`,
      };
    }

    return {
      status: '已连上 Room-Agent',
      detail: `${roomName}已连上 Room-Agent，但暂未获取到设备描述。`,
    };
  }

  private resolveRoomStateQueryStatus(dispatch: {
    success: boolean;
    state: VoiceCommandExecutionResult['taskState'];
    isTerminal: boolean;
    isInterrupted: boolean;
  }): string {
    if (dispatch.isInterrupted) {
      return dispatch.state === 'auth-required'
        ? '房间状态查询等待鉴权'
        : '房间状态查询等待补充输入';
    }

    if (!dispatch.success) {
      return '房间状态查询失败';
    }

    if (!dispatch.isTerminal) {
      return '房间状态查询已提交';
    }

    return '已收到房间状态';
  }

  private resolveErrorRoute(
    intent: ParsedIntent,
    fallbackRoomId: string | null,
  ): VoiceCommandExecutionResult['route'] {
    if (intent.kind === 'chat') {
      return 'chat';
    }

    if (intent.kind === 'query') {
      return intent.query?.roomId ?? intent.room ?? fallbackRoomId ? 'query' : 'unresolved';
    }

    return intent.routing?.target ?? (intent.device || intent.room || fallbackRoomId ? 'room-agent' : 'unresolved');
  }

  private resolveErrorStatus(route: VoiceCommandExecutionResult['route']): string {
    switch (route) {
      case 'home-agent':
        return 'Home-Agent 调用异常';
      case 'query':
        return '设备查询链路异常';
      case 'chat':
        return '对话回复异常';
      case 'room-agent':
        return '控制链路异常';
      default:
        return '意图解析异常';
    }
  }

  private resolveErrorDetail(route: VoiceCommandExecutionResult['route']): string {
    switch (route) {
      case 'home-agent':
        return '调用 home-agent 时发生异常，请检查后端服务、接口映射和网络连通性。';
      case 'query':
        return '设备查询链路出现异常，已中止本次查询，请检查 discovery、A2A 服务和网络状态。';
      case 'chat':
        return '生成对话回复时发生异常，请检查后端大模型服务状态。';
      case 'room-agent':
        return '语音控制链路出现异常，已中止本次下发，请检查 discovery、A2A 服务和网络状态。';
      default:
        return '当前无法确定请求类型，请稍后重试。';
    }
  }

  private createResult(
    intent: ParsedIntent,
    payload: Omit<VoiceCommandExecutionResult, 'executedAt' | 'input' | 'intent'>,
  ): VoiceCommandExecutionResult {
    return {
      executedAt: Date.now(),
      input: intent.text,
      intent,
      ...payload,
    };
  }

  private resolveRoomName(roomId: string | null, fallbackRoomName: string | null): string | null {
    if (!roomId) {
      return fallbackRoomName;
    }

    return getRoomDisplayName(roomId) || fallbackRoomName;
  }
}
