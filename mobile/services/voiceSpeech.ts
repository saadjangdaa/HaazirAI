import * as Speech from 'expo-speech';

export function speakText(text: string, onDone?: () => void): void {
  Speech.stop();
  Speech.speak(text, {
    language: 'en-US',
    pitch: 1.0,
    rate: 0.88,
    onDone,
    onError: onDone,
  });
}

export function stopSpeaking(): void {
  Speech.stop();
}

export async function getIsSpeaking(): Promise<boolean> {
  return Speech.isSpeakingAsync();
}
