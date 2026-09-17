"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Flipbook playback over receipt frames: play/pause/step/scrub/speed. */
export function useReplay(frameCount: number) {
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(8); // ticks per second
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setPlaying(false);
  }, []);

  useEffect(() => stop, [stop]);

  // Clamp when the frame list shrinks (new run).
  useEffect(() => {
    if (at > frameCount - 1) setAt(Math.max(0, frameCount - 1));
  }, [frameCount, at]);

  const play = useCallback(() => {
    if (frameCount <= 1 || playing) return;
    setPlaying(true);
    timer.current = setInterval(() => {
      setAt((current) => {
        if (current >= frameCount - 1) {
          if (timer.current) clearInterval(timer.current);
          timer.current = null;
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 1000 / speed);
  }, [frameCount, playing, speed]);

  // Restart interval when speed changes mid-play.
  useEffect(() => {
    if (!playing) return;
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setAt((current) => {
        if (current >= frameCount - 1) {
          if (timer.current) clearInterval(timer.current);
          timer.current = null;
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 1000 / speed);
  }, [speed, playing, frameCount]);

  const reset = useCallback(() => {
    stop();
    setAt(0);
  }, [stop]);

  return { at, setAt, playing, play, stop, speed, setSpeed, reset };
}
