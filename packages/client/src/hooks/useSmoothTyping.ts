import { useEffect, useRef, useState } from 'react';

export const useSmoothTyping = (targetText: string, isStreaming: boolean) => {
  const [displayedText, setDisplayedText] = useState(isStreaming ? '' : targetText);
  const targetTextRef = useRef(targetText);
  const displayedTextRef = useRef(isStreaming ? '' : targetText);
  const lastUpdateTimeRef = useRef(performance.now());
  const requestRef = useRef<number | null>(null);

  // Sync refs with props
  useEffect(() => {
    targetTextRef.current = targetText;
    // If not streaming, jump immediately to the target text
    if (!isStreaming) {
      setDisplayedText(targetText);
      displayedTextRef.current = targetText;
    }
  }, [targetText, isStreaming]);

  useEffect(() => {
    if (!isStreaming) {
      if (requestRef.current !== null) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }
      return;
    }

    const animate = (time: number) => {
      const target = targetTextRef.current;
      const current = displayedTextRef.current;

      if (current.length < target.length) {
        const diff = target.length - current.length;
        const elapsed = time - lastUpdateTimeRef.current;

        // Base speed logic:
        // We want to catch up with the target length.
        // If diff is small, we type at a "natural" pace.
        // If diff is large (e.g., several words arrived at once), we increase speed.

        // We target to catch up within 100ms for responsiveness.
        const speedMultiplier = Math.max(1, diff / 50); // More aggressive if far behind
        const targetRate = 60 * speedMultiplier; // chars per second
        const charsToAdd = Math.ceil((targetRate * elapsed) / 1000);

        if (charsToAdd > 0) {
          const nextText = target.slice(0, Math.min(target.length, current.length + charsToAdd));
          setDisplayedText(nextText);
          displayedTextRef.current = nextText;
          lastUpdateTimeRef.current = time;
        }
      }

      requestRef.current = requestAnimationFrame(animate);
    };

    lastUpdateTimeRef.current = performance.now();
    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current !== null) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [isStreaming]);

  return displayedText;
};
