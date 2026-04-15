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
    isRecognizingSpeech,
    commandDraft,
    taskFollowUpDraft,
    isExecutingCommand,
    isAwaitingCommandResult,
    lastCommandExecution,
    isRecoveredInterruptedTask,
    recoveredInterruptedTaskAt,
    commandExecutionHistory,
    roomAgentSnapshot,
    latestTaskActionCallback,
    toggleRecording,
    updateCommandDraft,
    updateTaskFollowUpDraft,
    submitCommandDraft,
    submitTaskFollowUp,
    openCurrentTaskAction,
  } = useAppState();

  return (
    <VoiceControlScreen
      currentRoomName={currentRoomBinding?.roomName ?? null}
      isConnected={controlStatus === 'connected'}
      isRecording={Boolean(recorderState?.isRecording)}
      statusText={voiceStatusText}
      transcript={transcript}
      responsePreview={responsePreview}
      isRecognizingSpeech={isRecognizingSpeech}
      commandDraft={commandDraft}
      taskFollowUpDraft={taskFollowUpDraft}
      isExecutingCommand={isExecutingCommand}
      isAwaitingCommandResult={isAwaitingCommandResult}
      lastCommandExecution={lastCommandExecution}
      isRecoveredInterruptedTask={isRecoveredInterruptedTask}
      recoveredInterruptedTaskAt={recoveredInterruptedTaskAt}
      commandExecutionHistory={commandExecutionHistory}
      roomAgentSnapshot={roomAgentSnapshot}
      latestTaskActionCallback={latestTaskActionCallback}
      onChangeCommandDraft={updateCommandDraft}
      onChangeTaskFollowUpDraft={updateTaskFollowUpDraft}
      onSubmitCommandDraft={submitCommandDraft}
      onSubmitTaskFollowUp={submitTaskFollowUp}
      onOpenTaskAction={openCurrentTaskAction}
      onToggleRecording={toggleRecording}
    />
  );
}
