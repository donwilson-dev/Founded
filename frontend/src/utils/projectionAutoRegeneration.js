import { useCallback, useRef, useState } from 'react';

export function useProjectionAutoRegeneration({ setStatus }) {
  const runningRef = useRef(false);
  const queuedRef = useRef(null);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const runAutoRegeneration = useCallback(async ({ task, successMessage = 'Projection regenerated and saved.' }) => {
    if (typeof task !== 'function') return null;

    const request = { task, successMessage };
    if (runningRef.current) {
      queuedRef.current = request;
      setStatus?.('Projection refresh queued.');
      return null;
    }

    runningRef.current = true;
    setIsRegenerating(true);
    let result = null;

    try {
      let current = request;
      while (current) {
        queuedRef.current = null;
        const notify = (message) => setStatus?.(message);
        result = await current.task(notify);
        setStatus?.(current.successMessage);
        current = queuedRef.current;
        if (current) setStatus?.('Applying latest projection changes...');
      }
      return result;
    } finally {
      runningRef.current = false;
      setIsRegenerating(false);
    }
  }, [setStatus]);

  return { isRegenerating, runAutoRegeneration };
}
