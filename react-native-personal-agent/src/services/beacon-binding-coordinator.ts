import { BleBeaconService } from '@/platform/ble/ble-beacon-service';
import { AsyncStorageService } from '@/platform/storage/async-storage-service';
import type { BeaconScanStopReason, IBleBeaconService, IStorageService, RoomBinding } from '@/types';

const STORAGE_KEY = 'bound-room';

export class BeaconBindingCoordinator {
  private readonly listeners = new Set<(binding: RoomBinding | null) => void>();
  private unsubscribeFromBeacon: (() => void) | null = null;
  private currentBinding: RoomBinding | null = null;

  constructor(
    private readonly bleBeaconService: IBleBeaconService = new BleBeaconService(),
    private readonly storage: IStorageService = new AsyncStorageService()
  ) {}

  async hydrate(): Promise<RoomBinding | null> {
    this.currentBinding = await this.storage.getJson<RoomBinding>(STORAGE_KEY);
    return this.currentBinding;
  }

  async start(): Promise<void> {
    console.debug('[BeaconBindingCoordinator] Start requested', {
      hasBindingSubscription: Boolean(this.unsubscribeFromBeacon),
    });

    if (this.unsubscribeFromBeacon) {
      console.debug('[BeaconBindingCoordinator] Start skipped because coordinator is already subscribed');
      return;
    }

    this.unsubscribeFromBeacon = this.bleBeaconService.subscribeToRoomBinding(async binding => {
      this.currentBinding = binding;

      if (binding) {
        await this.storage.setJson(STORAGE_KEY, binding);
      } else {
        await this.storage.remove(STORAGE_KEY);
      }

      this.listeners.forEach(listener => {
        listener(binding);
      });
    });

    await this.bleBeaconService.startScanning();
  }

  async stop(reason: BeaconScanStopReason = 'coordinator-stop'): Promise<void> {
    console.debug('[BeaconBindingCoordinator] Stop requested', {
      reason,
      hasBindingSubscription: Boolean(this.unsubscribeFromBeacon),
    });
    this.unsubscribeFromBeacon?.();
    this.unsubscribeFromBeacon = null;
    await this.bleBeaconService.stopScanning(reason);
  }

  subscribe(listener: (binding: RoomBinding | null) => void): () => void {
    this.listeners.add(listener);

    if (this.currentBinding) {
      listener(this.currentBinding);
    }

    return () => {
      this.listeners.delete(listener);
    };
  }

  async unbind(): Promise<void> {
    this.currentBinding = null;
    await this.storage.remove(STORAGE_KEY);
    this.listeners.forEach(listener => {
      listener(null);
    });
  }

  getCurrentBinding(): RoomBinding | null {
    return this.currentBinding;
  }

  async destroy(): Promise<void> {
    console.debug('[BeaconBindingCoordinator] Destroy requested');
    await this.stop('coordinator-destroy');
    this.listeners.clear();
    await this.bleBeaconService.destroy();
  }
}
