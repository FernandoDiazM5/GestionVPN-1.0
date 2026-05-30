import React, { createContext } from 'react';
import type { VpnContextType } from './types';

export const VpnContext = createContext<VpnContextType | null>(null);
