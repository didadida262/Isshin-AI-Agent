import { Sidebar } from "./components/Sidebar";
import { ChatArea } from "./components/ChatArea";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { useAppState } from "./hooks/useAppState";

export default function App() {
  const {
    config,
    sessions,
    activeSession,
    activeSessionId,
    setActiveSessionId,
    selectedModel,
    setSelectedModel,
    settingsOpen,
    setSettingsOpen,
    agentRunning,
    isLoading,
    configError,
    setConfigError,
    handleSaveConfig,
    sendMessage,
    stopGeneration,
    newSession,
    deleteSession,
    chatMode,
    setChatMode,
  } = useAppState();

  return (
    <div className="flex h-screen min-h-0 bg-black">
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        agentRunning={agentRunning}
        onSelectSession={setActiveSessionId}
        onNewSession={newSession}
        onDeleteSession={deleteSession}
        onOpenSettings={() => {
          setConfigError(null);
          setSettingsOpen(true);
        }}
      />
      <ChatArea
        messages={activeSession.messages}
        activeSessionId={activeSessionId}
        models={config.models}
        selectedModel={selectedModel}
        onSelectModel={setSelectedModel}
        onSend={sendMessage}
        isLoading={isLoading}
        onStop={stopGeneration}
        configError={configError}
        chatMode={chatMode}
        onChatModeChange={setChatMode}
      />
      <SettingsDrawer
        open={settingsOpen}
        config={config}
        selectedModel={selectedModel}
        onSelectModel={setSelectedModel}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveConfig}
      />
    </div>
  );
}
