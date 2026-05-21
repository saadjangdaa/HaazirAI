import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@haazir_mock_mode';

interface MockDataContextType {
  isMockMode: boolean;
  toggleMockMode: () => void;
}

const MockDataContext = createContext<MockDataContextType>({
  isMockMode: false,
  toggleMockMode: () => {},
});

export function MockDataProvider({ children }: { children: React.ReactNode }) {
  const [isMockMode, setIsMockMode] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val === 'true') setIsMockMode(true);
    });
  }, []);

  const toggleMockMode = useCallback(() => {
    setIsMockMode((prev) => {
      const next = !prev;
      AsyncStorage.setItem(STORAGE_KEY, next ? 'true' : 'false');
      return next;
    });
  }, []);

  return (
    <MockDataContext.Provider value={{ isMockMode, toggleMockMode }}>
      {children}
    </MockDataContext.Provider>
  );
}

export function useMockData() {
  return useContext(MockDataContext);
}
