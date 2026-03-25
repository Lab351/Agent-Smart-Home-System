import { RoomBindingScreen } from '@/features/room-binding/room-binding-screen';
import { useAppState } from '@/store';

export default function RoomBindingRoute() {
  const {
    currentRoomBinding,
    discoveredBeacons,
    isScanningBeacon,
    toggleBeaconScanning,
    unbindRoom,
  } = useAppState();

  return (
    <RoomBindingScreen
      currentRoomName={currentRoomBinding?.roomName ?? null}
      scanning={isScanningBeacon}
      discoveredBeacons={discoveredBeacons.map(beacon => ({
        roomName: beacon.roomName,
        rssi: beacon.rssi,
        distance: beacon.distance,
      }))}
      onToggleScan={toggleBeaconScanning}
      onUnbind={unbindRoom}
    />
  );
}
