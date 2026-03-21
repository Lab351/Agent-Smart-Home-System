import { VoiceControlScreen } from '@/features/voice-control/voice-control-screen';
import { useAppState } from '@/store';

export default function VoiceControlRoute() {
  const {
    currentRoomBinding,
    mqttStatus,
    recorderState,
    transcript,
    responsePreview,
    voiceStatusText,
    toggleRecording,
  } = useAppState();

  return (
    <VoiceControlScreen
      currentRoomName={currentRoomBinding?.roomName ?? null}
      isConnected={mqttStatus === 'connected'}
      isRecording={Boolean(recorderState?.isRecording)}
      statusText={voiceStatusText}
      transcript={transcript}
      responsePreview={responsePreview}
      onToggleRecording={toggleRecording}
    />
  );
}
