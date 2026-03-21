import { RoomBindingScreen } from '@/features/room-binding/room-binding-screen';

export default function RoomBindingRoute() {
  return (
    <RoomBindingScreen
      currentRoomName={null}
      scanning={false}
      discoveredBeacons={[
        {
          roomName: '客厅',
          rssi: -62,
          distance: 1.4,
        },
        {
          roomName: '卧室',
          rssi: -71,
          distance: 3.2,
        },
      ]}
    />
  );
}
