import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AgentCardDto, AgentRegistrationDto, DiscoverAgentDto } from './dto/registry.dto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class RegistryService implements OnModuleInit {
  private readonly logger = new Logger(RegistryService.name);
  
  // 内存存储Agent注册信息
  private agents: Map<string, AgentRegistrationDto> = new Map();
  
  // JSON文件存储路径
  private readonly storageDir = path.join(process.cwd(), 'data');
  private readonly storageFile = path.join(this.storageDir, 'agents.json');

  /**
   * 模块初始化时加载数据
   */
  async onModuleInit() {
    await this.loadFromFile();
    this.logger.log(`RegistryService initialized with ${this.agents.size} agents`);
  }

  /**
   * 注册Agent
   */
  async registerAgent(card: AgentCardDto): Promise<AgentRegistrationDto> {
    const now = new Date().toISOString();
    
    const registration: AgentRegistrationDto = {
      ...card,
      registered_at: now,
      last_heartbeat: now,
    };
    
    this.agents.set(card.id, registration);
    await this.saveToFile();
    
    this.logger.log(`Agent registered: ${card.id} (${card.agent_type})`);
    
    return registration;
  }

  /**
   * 发现Agent
   * 
   * 支持按条件过滤：
   * - agent_id: 精确匹配
   * - agent_type: 类型过滤
   * - capability: 能力过滤
   */
  async discoverAgents(query?: DiscoverAgentDto): Promise<AgentRegistrationDto[]> {
    let results = Array.from(this.agents.values());
    
    // 精确匹配Agent ID
    if (query?.agent_id) {
      const agent = this.agents.get(query.agent_id);
      return agent ? [agent] : [];
    }
    
    // 按类型过滤
    if (query?.agent_type) {
      results = results.filter(a => a.agent_type === query.agent_type);
    }
    
    // 按能力过滤
    if (query?.capability) {
      results = results.filter(a => 
        a.capabilities?.includes(query.capability) ||
        a.skills?.some(s => s.tags?.includes(query.capability))
      );
    }
    
    return results;
  }

  /**
   * 获取指定Agent
   */
  async getAgent(agentId: string): Promise<AgentRegistrationDto | null> {
    return this.agents.get(agentId) || null;
  }

  /**
   * 更新心跳
   */
  async updateHeartbeat(agentId: string): Promise<boolean> {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.last_heartbeat = new Date().toISOString();
      await this.saveToFile();
      this.logger.debug(`Heartbeat updated for agent: ${agentId}`);
      return true;
    }
    return false;
  }

  /**
   * 注销Agent
   */
  async unregisterAgent(agentId: string): Promise<boolean> {
    const deleted = this.agents.delete(agentId);
    if (deleted) {
      await this.saveToFile();
      this.logger.log(`Agent unregistered: ${agentId}`);
    }
    return deleted;
  }

  /**
   * 清理超时Agent
   * 
   * @param timeoutMs 超时时间（毫秒），默认5分钟
   */
  async cleanupStaleAgents(timeoutMs: number = 300000): Promise<number> {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [agentId, agent] of this.agents.entries()) {
      const lastHeartbeat = new Date(agent.last_heartbeat).getTime();
      if (now - lastHeartbeat > timeoutMs) {
        this.agents.delete(agentId);
        this.logger.warn(`Agent ${agentId} timed out, removed`);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      await this.saveToFile();
      this.logger.log(`Cleaned ${cleaned} stale agents`);
    }
    
    return cleaned;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const byType: Record<string, number> = {};
    const byCapability: Record<string, number> = {};
    
    for (const agent of this.agents.values()) {
      // 按类型统计
      byType[agent.agent_type] = (byType[agent.agent_type] || 0) + 1;
      
      // 按能力统计
      for (const cap of agent.capabilities || []) {
        byCapability[cap] = (byCapability[cap] || 0) + 1;
      }
    }
    
    return {
      total: this.agents.size,
      by_type: byType,
      by_capability: byCapability,
    };
  }

  /**
   * 从JSON文件加载Agent数据
   */
  private async loadFromFile(): Promise<void> {
    try {
      // 确保目录存在
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
        this.logger.log(`Created storage directory: ${this.storageDir}`);
      }
      
      // 检查文件是否存在
      if (!fs.existsSync(this.storageFile)) {
        this.logger.log('No existing agent data file, starting fresh');
        return;
      }
      
      // 读取并解析JSON
      const data = fs.readFileSync(this.storageFile, 'utf-8');
      const agents: Record<string, AgentRegistrationDto> = JSON.parse(data);
      
      // 加载到内存
      this.agents.clear();
      for (const [agentId, agent] of Object.entries(agents)) {
        this.agents.set(agentId, agent);
      }
      
      this.logger.log(`Loaded ${this.agents.size} agents from ${this.storageFile}`);
    } catch (error) {
      this.logger.error(`Failed to load agent data: ${error.message}`);
      // 出错时继续使用空内存存储
    }
  }

  /**
   * 保存Agent数据到JSON文件
   */
  private async saveToFile(): Promise<void> {
    try {
      // 确保目录存在
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
      
      // 转换为普通对象
      const agents: Record<string, AgentRegistrationDto> = Object.fromEntries(this.agents);
      
      // 写入文件（格式化JSON，便于阅读）
      fs.writeFileSync(
        this.storageFile,
        JSON.stringify(agents, null, 2),
        'utf-8'
      );
    } catch (error) {
      this.logger.error(`Failed to save agent data: ${error.message}`);
    }
  }
}