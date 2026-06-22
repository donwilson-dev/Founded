import { useEffect, useState } from 'react';

export function useSessionState(key, initialValue) {
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const stored = window.sessionStorage.getItem(key);
      return stored ? JSON.parse(stored) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Session persistence is a convenience; runtime state remains authoritative.
    }
  }, [key, value]);

  return [value, setValue];
}

export function useLocalState(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => ({
    key,
    value: readLocalState(key, initialValue),
  }));

  const value = storedValue.key === key ? storedValue.value : readLocalState(key, initialValue);

  useEffect(() => {
    if (storedValue.key === key) return;
    setStoredValue({ key, value: readLocalState(key, initialValue) });
  }, [key, storedValue.key]);

  useEffect(() => {
    if (storedValue.key !== key) return;
    writeLocalState(key, storedValue.value);
  }, [key, storedValue]);

  function setValue(nextValue) {
    setStoredValue((current) => {
      const currentValue = current.key === key ? current.value : readLocalState(key, initialValue);
      return {
        key,
        value: typeof nextValue === 'function' ? nextValue(currentValue) : nextValue,
      };
    });
  }

  return [value, setValue];
}

function readLocalState(key, initialValue) {
  if (typeof window === 'undefined') return initialValue;
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? JSON.parse(stored) : initialValue;
  } catch {
    return initialValue;
  }
}

function writeLocalState(key, value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local persistence is a convenience; runtime state remains authoritative.
  }
}
