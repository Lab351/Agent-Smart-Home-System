import { VoiceControlScreen } from '@/features/voice-control/voice-control-screen';

export default function VoiceControlRoute() {
  return (
    <VoiceControlScreen
      currentRoomName={null}
      isConnected={false}
      isRecording={false}
      statusText="点击麦克风开始录音，首版会优先接通录音、ASR 和意图解析。"
      transcript="等待录音输入"
      responsePreview="待接入 room-agent / home-agent 执行结果"
    />
  );
}
