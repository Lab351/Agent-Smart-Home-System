import type {
  RoomAgentSnapshot,
  RoomAgentSnapshotDevice,
  RoomAgentSnapshotSkill,
} from '@/types';

type SnapshotContext = {
  roomId?: string | null;
  roomName?: string | null;
  updatedAt?: number;
};

type SnapshotDescription = {
  room_id?: unknown;
  room_name?: unknown;
  agent_id?: unknown;
  agent_name?: unknown;
  agent_type?: unknown;
  agent_description?: unknown;
  agent_version?: unknown;
  devices?: unknown;
  capabilities?: unknown;
  skills?: unknown;
  raw_agent_card?: unknown;
};

export function buildRoomAgentSnapshot(
  description: unknown,
  context: SnapshotContext = {}
): RoomAgentSnapshot | null {
  if (!description || typeof description !== 'object') {
    return null;
  }

  const payload = description as SnapshotDescription;
  const rawAgentCard = asRecord(payload.raw_agent_card) ?? asRecord(description);
  const metadata = asRecord(rawAgentCard?.metadata);
  const devices = normalizeDevices(payload.devices ?? rawAgentCard?.devices);
  const skills = normalizeSkills(payload.skills ?? rawAgentCard?.skills);
  const capabilities = normalizeCapabilities({
    capabilities: payload.capabilities ?? rawAgentCard?.capabilities,
    skills,
  });

  return {
    roomId: context.roomId ?? resolveString(payload.room_id) ?? null,
    roomName: context.roomName ?? resolveString(payload.room_name) ?? null,
    agentId: resolveString(payload.agent_id) ?? resolveString(rawAgentCard?.id) ?? null,
    agentName: resolveString(payload.agent_name) ?? resolveString(rawAgentCard?.name) ?? null,
    agentType:
      resolveString(payload.agent_type) ??
      resolveString(rawAgentCard?.agent_type) ??
      resolveString(metadata?.agent_type) ??
      null,
    agentDescription:
      resolveString(payload.agent_description) ?? resolveString(rawAgentCard?.description) ?? null,
    agentVersion: resolveString(payload.agent_version) ?? resolveString(rawAgentCard?.version) ?? null,
    devices,
    capabilities,
    skills,
    note: buildSnapshotNote(devices.length, capabilities.length, skills.length),
    updatedAt: context.updatedAt ?? Date.now(),
    raw: description,
  };
}

function normalizeDevices(devices: unknown): RoomAgentSnapshotDevice[] {
  if (!Array.isArray(devices)) {
    return [];
  }

  return devices
    .map(device => {
      if (!device || typeof device !== 'object') {
        return null;
      }

      const candidate = device as Record<string, unknown>;
      const id = typeof candidate.id === 'string' ? candidate.id : null;
      const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
      const type = typeof candidate.type === 'string' ? candidate.type.trim() : null;

      if (!id && !name) {
        return null;
      }

      return {
        id: id ?? name,
        name: name || id || '未命名设备',
        type,
      };
    })
    .filter((device): device is RoomAgentSnapshotDevice => Boolean(device));
}

function normalizeSkills(skills: unknown): RoomAgentSnapshotSkill[] {
  if (!Array.isArray(skills)) {
    return [];
  }

  return skills
    .map(skill => {
      if (!skill || typeof skill !== 'object') {
        return null;
      }

      const candidate = skill as Record<string, unknown>;
      const id = resolveString(candidate.id);
      const name = resolveString(candidate.name) ?? id;

      if (!id && !name) {
        return null;
      }

      return {
        id: id ?? name ?? 'unknown-skill',
        name: name ?? id ?? '未命名技能',
        description: resolveString(candidate.description) ?? null,
        tags: normalizeStringArray(candidate.tags),
      };
    })
    .filter((skill): skill is RoomAgentSnapshotSkill => Boolean(skill));
}

function normalizeCapabilities(options: {
  capabilities: unknown;
  skills: RoomAgentSnapshotSkill[];
}): string[] {
  const capabilitySet = new Set<string>();
  const directCapabilities = options.capabilities;

  if (Array.isArray(directCapabilities)) {
    normalizeStringArray(directCapabilities).forEach(capability => capabilitySet.add(capability));
  } else if (directCapabilities && typeof directCapabilities === 'object') {
    const candidate = directCapabilities as Record<string, unknown>;
    if (candidate.streaming === true) {
      capabilitySet.add('streaming');
    }
    if (candidate.pushNotifications === true) {
      capabilitySet.add('push-notifications');
    }
    if (candidate.stateTransitionHistory === true) {
      capabilitySet.add('state-transition-history');
    }
  }

  options.skills.forEach(skill => {
    capabilitySet.add(skill.id);
    skill.tags.forEach(tag => capabilitySet.add(tag));
  });

  return Array.from(capabilitySet);
}

function buildSnapshotNote(deviceCount: number, capabilityCount: number, skillCount: number): string {
  if (!deviceCount && !capabilityCount && !skillCount) {
    return '已连接 Room-Agent，但当前 agent-card 没有返回可展示的设备或能力信息。';
  }

  return `已从 agent-card 读取 ${deviceCount} 个设备、${capabilityCount} 类能力、${skillCount} 个技能；这是一份代理描述快照，不等于实时设备状态。`;
}

function normalizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function resolveString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}
