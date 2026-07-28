import { useEffect, useState, useCallback } from 'react';
import type { InputMode } from '@/types';
import { getInputMode, setInputMode } from '@/lib/storage';

export function useInputMode() {
  const [mode, setModeState] = useState<InputMode>('solo');

  useEffect(() => {
    setModeState(getInputMode());
  }, []);

  const setMode = useCallback((m: InputMode) => {
    setModeState(m);
    setInputMode(m);
  }, []);

  return { mode, setMode };
}
