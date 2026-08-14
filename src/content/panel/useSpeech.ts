import { useCallback, useEffect, useState } from "react";

export type SpeechChannel = "source" | "translation";

export function useSpeech() {
  const [speaking, setSpeaking] = useState<SpeechChannel | null>(null);
  const supported = typeof speechSynthesis !== "undefined" && typeof SpeechSynthesisUtterance !== "undefined";

  const stop = useCallback(() => {
    if (supported) speechSynthesis.cancel();
    setSpeaking(null);
  }, [supported]);

  const toggle = useCallback((channel: SpeechChannel, text: string, language?: string) => {
    if (!supported || !text.trim()) return;
    if (speaking === channel) {
      stop();
      return;
    }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (language) utterance.lang = language;
    utterance.onend = () => setSpeaking(null);
    utterance.onerror = () => setSpeaking(null);
    setSpeaking(channel);
    speechSynthesis.speak(utterance);
  }, [speaking, stop, supported]);

  useEffect(() => stop, [stop]);

  return { supported, speaking, toggle, stop };
}
