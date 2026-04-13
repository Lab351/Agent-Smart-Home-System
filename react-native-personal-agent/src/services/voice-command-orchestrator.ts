import { appEnv, getRoomDisplayName } from '@/config/env';
import type {
  ParsedIntent,
  RoomBinding,
  VoiceCommandExecutionResult,
} from '@/types';
import { buildRoomTaskDispatchPresentation } from '@/features/voice-control/task-state';

import { A2AHttpControlTransport } from './transports/a2a-http-control-transport';
import { ControlService } from './control-service';
import { DiscoveryService } from './discovery-service';
import { HomeAgentService } from './home-agent-service';
import { IntentService } from './intent-service';

type VoiceCommandExecutionContext = {
  currentRoomBinding?: RoomBinding | null;
};

export class VoiceCommandOrchestrator {
  constructor(
    private readonly intentService = new IntentService(),
    private readonly discoveryService = new DiscoveryService(),
    private readonly controlService = new ControlService(
      appEnv.personalAgentId,
      new A2AHttpControlTransport()
    ),
    private readonly homeAgentService = new HomeAgentService()
  ) {}

  async execute(
    input: string,
    context: VoiceCommandExecutionContext = {}
  ): Promise<VoiceCommandExecutionResult> {
    const text = input.trim();
    const fallbackRoomId = context.currentRoomBinding?.roomId ?? null;
    const fallbackRoomName = context.currentRoomBinding?.roomName ?? null;
    let intent: ParsedIntent = {
      text,
      device: null,
      action: null,
      room: fallbackRoomId,
      parameters: {},
      confidence: 0,
      source: 'fallback',
    };

    if (!text) {
      return this.createResult(
        intent,
        {
          success: false,
          status: '请输入调试指令',
          detail: '当前没有可执行的文本指令。',
          route: 'unresolved',
          roomId: fallbackRoomId,
          roomName: fallbackRoomName,
        }
      );
    }

    try {
      intent = await this.intentService.parse(text, {
        currentRoom: fallbackRoomId,
        currentBeaconId: context.currentRoomBinding?.beaconId ?? null,
      });

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
        intent.parameters
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
    } catch (error) {
      console.warn('[VoiceCommandOrchestrator] Command execution failed', error);

      const route = intent.routing?.target ?? (intent.device || intent.room || fallbackRoomId ? 'room-agent' : 'unresolved');
      return this.createResult(intent, {
        success: false,
        status: route === 'home-agent' ? 'Home-Agent 调用异常' : '控制链路异常',
        detail:
          route === 'home-agent'
            ? '调用 home-agent 时发生异常，请检查后端服务、接口映射和网络连通性。'
            : '语音控制链路出现异常，已中止本次下发，请检查 discovery、A2A 服务和网络状态。',
        route,
        roomId: intent.routing?.roomId ?? intent.room ?? fallbackRoomId,
        roomName: this.resolveRoomName(intent.routing?.roomId ?? intent.room ?? fallbackRoomId, fallbackRoomName),
        agentId: intent.routing?.agentId ?? null,
      });
    }
  }

  async destroy(): Promise<void> {
    await this.controlService.destroy();
    this.discoveryService.destroy();
  }

  private createResult(
    intent: ParsedIntent,
    payload: Omit<VoiceCommandExecutionResult, 'executedAt' | 'input' | 'intent'>
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
