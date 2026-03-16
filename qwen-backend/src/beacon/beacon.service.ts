import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BeaconRegistrationDto, BeaconInfo } from './dto/beacon.dto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class BeaconService implements OnModuleInit {
  private readonly logger = new Logger(BeaconService.name);

  // 内存存储 Beacon 映射（作为缓存）
  private beaconMap: Map<string, BeaconInfo> = new Map();

  // JSON 文件存储路径
  private readonly storageDir = path.join(process.cwd(), 'data');
  private readonly storageFile = path.join(this.storageDir, 'beacons.json');

  /**
   * 模块初始化时加载数据
   */
  async onModuleInit() {
    await this.loadFromFile();
    this.logger.log(`BeaconService initialized with ${this.beaconMap.size} beacons`);
  }

  /**
   * 注册或更新 Beacon 信息
   */
  async registerBeacon(dto: BeaconRegistrationDto): Promise<BeaconInfo> {
    const now = new Date().toISOString();

    const beaconInfo: BeaconInfo = {
      ...dto,
      registered_at: now,
      last_heartbeat: now,
    };

    this.beaconMap.set(dto.beacon_id, beaconInfo);
    await this.saveToFile();
    this.logger.log(`Beacon registered: ${dto.beacon_id} -> ${dto.room_id}`);

    return beaconInfo;
  }

  /**
   * 根据 Beacon ID 获取 Room-Agent 信息
   */
  async getBeaconInfo(beaconId: string): Promise<BeaconInfo | null> {
    const info = this.beaconMap.get(beaconId);
    if (info) {
      // 更新心跳时间并保存
      info.last_heartbeat = new Date().toISOString();
      await this.saveToFile();
    }
    return info || null;
  }

  /**
   * 根据 Room ID 获取 Room-Agent 信息
   */
  async getByRoomId(roomId: string): Promise<BeaconInfo | null> {
    for (const info of this.beaconMap.values()) {
      if (info.room_id === roomId) {
        info.last_heartbeat = new Date().toISOString();
        await this.saveToFile();
        return info;
      }
    }
    return null;
  }

  /**
   * 获取所有 Beacon 映射
   */
  getAllBeacons(): Record<string, BeaconInfo> {
    return Object.fromEntries(this.beaconMap);
  }

  /**
   * 更新心跳时间
   */
  async updateHeartbeat(beaconId: string): Promise<boolean> {
    const info = this.beaconMap.get(beaconId);
    if (info) {
      info.last_heartbeat = new Date().toISOString();
      await this.saveToFile();
      this.logger.log(`Heartbeat updated for beacon: ${beaconId}`);
      return true;
    }
    return false;
  }

  /**
   * 删除 Beacon（超时或主动注销）
   */
  async removeBeacon(beaconId: string): Promise<boolean> {
    const deleted = this.beaconMap.delete(beaconId);
    if (deleted) {
      await this.saveToFile();
      this.logger.log(`Beacon removed: ${beaconId}`);
    }
    return deleted;
  }

  /**
   * 清理超时的 Beacon（可定时调用）
   */
  async cleanupStaleBeacons(timeoutMs: number = 300000): Promise<number> {
    const now = Date.now();
    let cleaned = 0;

    for (const [beaconId, info] of this.beaconMap.entries()) {
      const lastHeartbeat = new Date(info.last_heartbeat).getTime();
      if (now - lastHeartbeat > timeoutMs) {
        this.beaconMap.delete(beaconId);
        this.logger.warn(`Beacon ${beaconId} timed out, removed`);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      await this.saveToFile();
    }

    return cleaned;
  }

  /**
   * 获取统计信息
   */
  getStats(): { total: number; rooms: string[] } {
    const rooms = new Set<string>();
    for (const info of this.beaconMap.values()) {
      rooms.add(info.room_id);
    }

    return {
      total: this.beaconMap.size,
      rooms: Array.from(rooms),
    };
  }

  /**
   * 从 JSON 文件加载 Beacon 数据
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
        this.logger.log(`No existing beacon data file, starting fresh`);
        return;
      }

      // 读取并解析 JSON
      const data = fs.readFileSync(this.storageFile, 'utf-8');
      const beacons: Record<string, BeaconInfo> = JSON.parse(data);

      // 加载到内存
      this.beaconMap.clear();
      for (const [beaconId, info] of Object.entries(beacons)) {
        this.beaconMap.set(beaconId, info);
      }

      this.logger.log(`Loaded ${this.beaconMap.size} beacons from ${this.storageFile}`);
    } catch (error) {
      this.logger.error(`Failed to load beacon data: ${error.message}`);
      // 出错时继续使用空内存存储
    }
  }

  /**
   * 保存 Beacon 数据到 JSON 文件
   */
  private async saveToFile(): Promise<void> {
    try {
      // 确保目录存在
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }

      // 转换为普通对象
      const beacons: Record<string, BeaconInfo> = Object.fromEntries(this.beaconMap);

      // 写入文件（格式化 JSON，便于阅读）
      fs.writeFileSync(
        this.storageFile,
        JSON.stringify(beacons, null, 2),
        'utf-8'
      );
    } catch (error) {
      this.logger.error(`Failed to save beacon data: ${error.message}`);
    }
  }
}
