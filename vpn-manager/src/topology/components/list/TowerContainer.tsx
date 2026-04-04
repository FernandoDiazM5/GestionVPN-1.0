import React, { useState } from 'react';

export interface TowerContainerProps {
  towerName: string;
  ptpDevice?: React.ReactNode;
  nodeDevice?: React.ReactNode;
  children?: React.ReactNode;
}

export function TowerContainer({ towerName, ptpDevice, nodeDevice, children }: TowerContainerProps) {
  const [medium, setMedium] = useState<'Wireless' | 'UTP' | 'Fiber'>('Wireless');

  return (
    <div className="flex flex-col border border-slate-200 rounded-xl p-4 mb-6 bg-white shadow-sm">
      <div className="font-bold text-lg mb-4 text-slate-800 border-b border-slate-100 pb-2">
        {towerName}
      </div>
      
      {/* Level 1: PTP */}
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg mb-2">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Level 1 (PTP Sender/Receiver)</div>
        <div className="text-sm font-medium text-slate-700 w-full">
          {ptpDevice || 'No PTP Device Assigned'}
        </div>
      </div>

      {/* Connection Medium Selector */}
      <div className="flex items-center gap-3 my-3 pl-4 border-l-2 border-slate-200 ml-4 py-1">
        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
          Physical Medium
        </label>
        <select 
          value={medium}
          onChange={(e) => setMedium(e.target.value as any)}
          className="text-sm border-slate-200 text-slate-700 rounded-md py-1.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
        >
          <option value="Wireless">Wireless</option>
          <option value="UTP">UTP</option>
          <option value="Fiber">Fiber</option>
        </select>
      </div>

      {/* Level 2: Node */}
      <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg mb-4">
        <div className="text-xs font-semibold text-indigo-500 uppercase tracking-wider mb-1">Level 2 (Node)</div>
        <div className="text-sm font-medium text-indigo-900 w-full">
          {nodeDevice || 'No Node Assigned'}
        </div>
      </div>

      {/* Level 3 & 4 Container */}
      {children && (
        <div className="mt-2 pt-4 border-t border-slate-100 flex flex-col gap-2">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Attached Devices</div>
          {children}
        </div>
      )}
    </div>
  );
}
