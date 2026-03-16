import { Module } from '@nestjs/common';
import { BeaconController } from './beacon.controller';
import { BeaconService } from './beacon.service';

@Module({
  controllers: [BeaconController],
  providers: [BeaconService],
  exports: [BeaconService],
})
export class BeaconModule {}
