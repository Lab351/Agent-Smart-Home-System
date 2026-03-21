import { useRouter } from 'expo-router';

import { appEnv } from '@/config/env';
import { HomeScreen } from '@/features/home/home-screen';
import { useAppState } from '@/store';

export default function HomeRoute() {
  const router = useRouter();
  const { currentRoomBinding, isScanningBeacon, mqttStatus } = useAppState();

  return (
    <HomeScreen
      currentRoomName={currentRoomBinding?.roomName ?? null}
      mqttStatus={mqttStatus}
      isScanningBeacon={isScanningBeacon}
      backendLabel={appEnv.backendUrl}
      quickActions={[
        {
          label: '语音控制',
          description: '开始录音、ASR 和意图解析链路',
          onPress: () => router.navigate('/voice-control'),
        },
        {
          label: '房间绑定',
          description: '查看 Beacon 扫描与当前房间状态',
          onPress: () => router.navigate('/room-binding'),
        },
        {
          label: '偏好设置',
          description: '维护默认房间、亮度、温度与习惯',
          onPress: () => router.navigate('/preferences'),
        },
      ]}
    />
  );
}
