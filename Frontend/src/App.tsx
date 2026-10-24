import { StoreProvider } from './lib/store';
import Ribbon from './components/Ribbon';
import Sidebar from './components/Sidebar';
import TabBar from './components/TabBar';
import EditorArea from './components/EditorArea';
import RightPane from './components/RightPane';
import StatusBar from './components/StatusBar';
import QuickSwitcher from './components/QuickSwitcher';
import CommandPalette from './components/CommandPalette';

function Shell() {
  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-1 min-h-0">
        <Ribbon />
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0">
          <TabBar />
          <div className="flex flex-1 min-h-0">
            <EditorArea />
            <RightPane />
          </div>
        </main>
      </div>
      <StatusBar />
      <QuickSwitcher />
      <CommandPalette />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
