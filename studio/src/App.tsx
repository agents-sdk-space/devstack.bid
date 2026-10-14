import { lazy, Suspense } from 'react';
import { AgentChat } from '@/components/AgentChat';
import { AssetPanel } from '@/components/AssetPanel';
import { EditorPanel } from '@/components/EditorPanel';
import { Header } from '@/components/Header';
import { PreviewTerminal } from '@/components/PreviewTerminal';
import { DevstackProvider } from '@/context/DevstackProvider';

// Heavy panels are code-split.
const DataInspector = lazy(() => import('@/components/DataInspector'));
const ExportModal = lazy(() => import('@/components/ExportModal'));

function Workspace() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-devstack-bg">
      <Header />
      <div className="divider-gradient" />
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
        <div className="relative flex min-h-0 flex-1 gap-2">
          <AgentChat />
          <main className="flex min-w-0 flex-1 flex-col gap-2">
            <EditorPanel />
            <PreviewTerminal />
          </main>
          <AssetPanel />
        </div>
        <Suspense fallback={null}>
          <DataInspector />
        </Suspense>
      </div>
      <Suspense fallback={null}>
        <ExportModal />
      </Suspense>
    </div>
  );
}

export default function App() {
  return (
    <DevstackProvider>
      <Workspace />
    </DevstackProvider>
  );
}
