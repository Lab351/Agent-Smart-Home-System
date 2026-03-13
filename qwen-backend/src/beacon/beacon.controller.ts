import { Controller, Post, Get, Delete, Param, Body, Logger, HttpCode, HttpStatus } from '@nestjs/common';
import { BeaconService } from './beacon.service';
import { BeaconRegistrationDto } from './dto/beacon.dto';

@Controller('api/beacon')
export class BeaconController {
  private readonly logger = new Logger(BeaconController.name);

  constructor(private readonly beaconService: BeaconService) {}

  @Post('register')
  @HttpCode(HttpStatus.OK)
  async registerBeacon(@Body() dto: BeaconRegistrationDto) {
    try {
      this.logger.log(`Registering beacon: ${dto.beacon_id} for room: ${dto.room_id}`);

      const beaconInfo = await this.beaconService.registerBeacon(dto);

      return {
        success: true,
        data: beaconInfo,
      };
    } catch (error) {
      this.logger.error(`Failed to register beacon: ${error.message}`);
      throw error;
    }
  }

  @Get('room/:room_id')
  async getByRoomId(@Param('room_id') roomId: string) {
    try {
      this.logger.log(`Querying beacon by room: ${roomId}`);

      const info = await this.beaconService.getByRoomId(roomId);

      if (!info) {
        return {
          success: false,
          message: `No beacon found for room: ${roomId}`,
        };
      }

      return {
        success: true,
        data: info,
      };
    } catch (error) {
      this.logger.error(`Failed to get beacon by room: ${error.message}`);
      throw error;
    }
  }

  @Get(':beacon_id')
  async getBeaconInfo(@Param('beacon_id') beaconId: string) {
    try {
      this.logger.log(`Querying beacon: ${beaconId}`);

      const info = await this.beaconService.getBeaconInfo(beaconId);

      if (!info) {
        return {
          success: false,
          message: `Beacon ${beaconId} not found`,
        };
      }

      return {
        success: true,
        data: info,
      };
    } catch (error) {
      this.logger.error(`Failed to get beacon info: ${error.message}`);
      throw error;
    }
  }

  @Get('list')
  getAllBeacons() {
    try {
      this.logger.log('Listing all beacons');

      const beacons = this.beaconService.getAllBeacons();

      return {
        success: true,
        data: beacons,
      };
    } catch (error) {
      this.logger.error(`Failed to list beacons: ${error.message}`);
      throw error;
    }
  }

  @Post(':beacon_id/heartbeat')
  @HttpCode(HttpStatus.OK)
  async updateHeartbeat(@Param('beacon_id') beaconId: string) {
    try {
      this.logger.log(`Heartbeat for beacon: ${beaconId}`);

      const updated = await this.beaconService.updateHeartbeat(beaconId);

      return {
        success: updated,
        message: updated ? 'Heartbeat updated' : 'Beacon not found',
      };
    } catch (error) {
      this.logger.error(`Failed to update heartbeat: ${error.message}`);
      throw error;
    }
  }

  @Delete(':beacon_id')
  async removeBeacon(@Param('beacon_id') beaconId: string) {
    try {
      this.logger.log(`Removing beacon: ${beaconId}`);

      const removed = await this.beaconService.removeBeacon(beaconId);

      return {
        success: removed,
        message: removed ? 'Beacon removed' : 'Beacon not found',
      };
    } catch (error) {
      this.logger.error(`Failed to remove beacon: ${error.message}`);
      throw error;
    }
  }

  @Get('stats')
  getStats() {
    try {
      const stats = this.beaconService.getStats();

      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      this.logger.error(`Failed to get stats: ${error.message}`);
      throw error;
    }
  }
}
