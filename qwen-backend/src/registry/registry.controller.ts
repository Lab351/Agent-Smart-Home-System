import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  Body,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RegistryService } from './registry.service';
import { AgentCardDto, DiscoverAgentDto } from './dto/registry.dto';

@ApiTags('registry')
@Controller('api/registry')
export class RegistryController {
  private readonly logger = new Logger(RegistryController.name);

  constructor(private readonly registryService: RegistryService) {}

  /**
   * 注册Agent
   */
  @Post('register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '注册Agent', description: '向服务注册中心注册Agent' })
  @ApiResponse({ status: 200, description: '注册成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async registerAgent(@Body() card: AgentCardDto) {
    try {
      this.logger.log(`Registering agent: ${card.id} (${card.agent_type})`);
      
      const registered = await this.registryService.registerAgent(card);
      
      return {
        success: true,
        data: registered,
      };
    } catch (error) {
      this.logger.error(`Failed to register agent: ${error.message}`);
      throw error;
    }
  }

  /**
   * 发现Agent
   */
  @Get('discover')
  @ApiOperation({ summary: '发现Agent', description: '根据条件发现Agent' })
  @ApiResponse({ status: 200, description: '查询成功' })
  async discoverAgents(
    @Query('agent_id') agentId?: string,
    @Query('agent_type') agentType?: string,
    @Query('capability') capability?: string,
  ) {
    try {
      this.logger.log(
        `Discovering agents: ${agentId || agentType || capability || 'all'}`
      );
      
      const query: DiscoverAgentDto = { agent_id: agentId, agent_type: agentType as any, capability };
      const agents = await this.registryService.discoverAgents(query);
      
      return {
        success: true,
        data: agents,
      };
    } catch (error) {
      this.logger.error(`Failed to discover agents: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取指定Agent
   */
  @Get(':agent_id')
  @ApiOperation({ summary: '获取指定Agent', description: '根据Agent ID获取详细信息' })
  @ApiResponse({ status: 200, description: '查询成功' })
  @ApiResponse({ status: 404, description: 'Agent不存在' })
  async getAgent(@Param('agent_id') agentId: string) {
    try {
      this.logger.log(`Getting agent: ${agentId}`);
      
      const agent = await this.registryService.getAgent(agentId);
      
      if (!agent) {
        return {
          success: false,
          message: `Agent ${agentId} not found`,
        };
      }
      
      return {
        success: true,
        data: agent,
      };
    } catch (error) {
      this.logger.error(`Failed to get agent: ${error.message}`);
      throw error;
    }
  }

  /**
   * 列出所有Agent
   */
  @Get('list')
  @ApiOperation({ summary: '列出所有Agent', description: '获取所有已注册的Agent列表' })
  @ApiResponse({ status: 200, description: '查询成功' })
  async listAgents() {
    try {
      this.logger.log('Listing all agents');
      
      const agents = await this.registryService.discoverAgents();
      
      return {
        success: true,
        data: agents,
      };
    } catch (error) {
      this.logger.error(`Failed to list agents: ${error.message}`);
      throw error;
    }
  }

  /**
   * 更新心跳
   */
  @Post(':agent_id/heartbeat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新心跳', description: '更新Agent心跳时间' })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: 'Agent不存在' })
  async updateHeartbeat(@Param('agent_id') agentId: string) {
    try {
      this.logger.log(`Heartbeat for agent: ${agentId}`);
      
      const updated = await this.registryService.updateHeartbeat(agentId);
      
      return {
        success: updated,
        message: updated ? 'Heartbeat updated' : 'Agent not found',
      };
    } catch (error) {
      this.logger.error(`Failed to update heartbeat: ${error.message}`);
      throw error;
    }
  }

  /**
   * 注销Agent
   */
  @Delete(':agent_id')
  @ApiOperation({ summary: '注销Agent', description: '从服务注册中心移除Agent' })
  @ApiResponse({ status: 200, description: '注销成功' })
  @ApiResponse({ status: 404, description: 'Agent不存在' })
  async unregisterAgent(@Param('agent_id') agentId: string) {
    try {
      this.logger.log(`Unregistering agent: ${agentId}`);
      
      const removed = await this.registryService.unregisterAgent(agentId);
      
      return {
        success: removed,
        message: removed ? 'Agent unregistered' : 'Agent not found',
      };
    } catch (error) {
      this.logger.error(`Failed to unregister agent: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取统计信息
   */
  @Get('stats')
  @ApiOperation({ summary: '获取统计信息', description: '获取Agent注册统计信息' })
  @ApiResponse({ status: 200, description: '查询成功' })
  async getStats() {
    try {
      const stats = this.registryService.getStats();
      
      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      this.logger.error(`Failed to get stats: ${error.message}`);
      throw error;
    }
  }

  /**
   * 清理超时Agent
   */
  @Post('cleanup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '清理超时Agent', description: '清理超时未心跳的Agent' })
  @ApiResponse({ status: 200, description: '清理成功' })
  async cleanupStaleAgents(@Query('timeout') timeout?: number) {
    try {
      this.logger.log(`Cleaning up stale agents (timeout: ${timeout || 300000}ms)`);
      
      const cleaned = await this.registryService.cleanupStaleAgents(timeout);
      
      return {
        success: true,
        cleaned,
        message: `Cleaned ${cleaned} stale agents`,
      };
    } catch (error) {
      this.logger.error(`Failed to cleanup stale agents: ${error.message}`);
      throw error;
    }
  }
}