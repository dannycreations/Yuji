import { ChatInterface } from '../components/ChatInterface';
import { SettingsDialog } from '../components/SettingsDialog';
import { Sidebar } from '../components/Sidebar';

function App() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-zinc-100 font-sans">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 relative h-full">
        <ChatInterface />
      </main>
      <SettingsDialog />
    </div>
  );
}

export default App;
