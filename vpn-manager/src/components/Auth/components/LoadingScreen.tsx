import { Loader2 } from 'lucide-react';

export function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-blue-50">
      <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
    </div>
  );
}
