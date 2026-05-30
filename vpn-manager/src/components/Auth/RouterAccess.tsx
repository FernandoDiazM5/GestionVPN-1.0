import { useState } from 'react';
import { useAuthStatus } from './hooks/useAuthStatus';
import { useAuthSubmit } from './hooks/useAuthSubmit';
import { LoadingScreen } from './components/LoadingScreen';
import { BackgroundDecorations } from './components/BackgroundDecorations';
import { RouterAccessHeader } from './components/RouterAccessHeader';
import { SyncStatusMessage } from './components/SyncStatusMessage';
import { CredentialsForm } from './components/CredentialsForm';

export default function RouterAccess() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const needsSetup = useAuthStatus();
  const { isConnecting, syncStatus, errorDetail, handleSubmit } = useAuthSubmit(needsSetup);

  if (needsSetup === null) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50 flex items-center justify-center p-4">
      <BackgroundDecorations />

      <div className="w-full max-w-md relative z-10">
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/80 border border-slate-200 overflow-hidden">
          <RouterAccessHeader needsSetup={needsSetup} />

          <div className="px-8 py-8 -mt-4 relative">
            <SyncStatusMessage syncStatus={syncStatus} errorDetail={errorDetail} />

            <CredentialsForm
              username={username}
              setUsername={setUsername}
              password={password}
              setPassword={setPassword}
              onSubmit={(e) => handleSubmit(e, username, password)}
              isConnecting={isConnecting}
              needsSetup={needsSetup}
            />
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 font-medium mt-6">
          Microservicios encriptados AES-256-GCM.
        </p>
      </div>
    </div>
  );
}
