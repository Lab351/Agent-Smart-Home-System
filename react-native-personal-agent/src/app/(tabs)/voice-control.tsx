import { VoiceControlScreen } from '@/features/voice-control/voice-control-screen';
import { useAppState } from '@/store';

export default function VoiceControlRoute() {
  const {
    currentRoomBinding,
    controlStatus,
    recorderState,
    transcript,
    responsePreview,
    voiceStatusText,
    commandDraft,
    isExecutingCommand,
    lastCommandExecution,
    toggleRecording,
    updateCommandDraft,
    submitCommandDraft,
  } = useAppState();

  return (
    <VoiceControlScreen
      currentRoomName={currentRoomBinding?.roomName ?? null}
      isConnected={controlStatus === 'connected'}
      isRecording={Boolean(recorderState?.isRecording)}
      statusText={voiceStatusText}
      transcript={transcript}
      responsePreview={responsePreview}
      commandDraft={commandDraft}
      isSubmittingCommand={isExecutingCommand}
      lastCommandExecution={lastCommandExecution}
      onChangeCommandDraft={updateCommandDraft}
      onSubmitCommandDraft={submitCommandDraft}
      onToggleRecording={toggleRecording}
    />
  );
}
