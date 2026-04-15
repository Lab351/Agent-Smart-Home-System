import {
  buildRoomBindingScanStatus,
  formatBeaconDiagnosticPreview,
} from '@/features/room-binding/scan-feedback';
import { RoomBindingScreen } from '@/features/room-binding/room-binding-screen';
import { useAppState } from '@/store';

export default function RoomBindingRoute() {
  const {
    currentRoomBinding,
    discoveredBeacons,
    beaconDiagnostics,
    beaconScanIssue,
    isScanningBeacon,
    isStartingBeaconScan,
    toggleBeaconScanning,
    unbindRoom,
  } = useAppState();

  const scanStatusText = buildRoomBindingScanStatus({
    currentRoomName: currentRoomBinding?.roomName ?? null,
    discoveredBeaconCount: discoveredBeacons.length,
    isScanning: isScanningBeacon,
    isStarting: isStartingBeaconScan,
    issue: beaconScanIssue,
  });

  return (
    <RoomBindingScreen
      currentRoomName={currentRoomBinding?.roomName ?? null}
      scanning={isScanningBeacon}
      scanStatusText={scanStatusText}
      scanIssue={beaconScanIssue}
      diagnostics={beaconDiagnostics.map(formatBeaconDiagnosticPreview)}
      scanBusy={isStartingBeaconScan}
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
