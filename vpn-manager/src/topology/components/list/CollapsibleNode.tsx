import React, { useState } from 'react';
import { Plus, Minus } from 'lucide-react';

export interface CollapsibleNodeProps {
  title: string | React.ReactNode;
  levelLabel: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function CollapsibleNode({ title, levelLabel, children, defaultOpen = false }: CollapsibleNodeProps) {
  const [isOpen, setIsOpen] = useState<boolean>(defaultOpen);

  return (
    <div className="flex flex-col w-full mb-2">
      <div className="flex items-center gap-3 w-full">
        <div className="flex-1">
          {title}
        </div>
        
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors focus:outline-none"
          title={isOpen ? "Ocultar" : "Expandir"}
        >
          {isOpen ? <Minus size={16} /> : <Plus size={16} />}
          <span>{levelLabel}</span>
        </button>
      </div>

      {isOpen && (
        <div className="flex flex-col gap-4 mt-3 pl-8 relative">
          <div className="absolute left-[1rem] top-0 bottom-4 w-px bg-slate-200" />
          
          <div className="flex flex-col gap-3 w-full">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
