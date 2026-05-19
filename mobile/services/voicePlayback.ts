import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio/build/AudioModule.types';
import * as FileSystem from 'expo-file-system/legacy';

let _currentPlayer: AudioPlayer | null = null;

export async function playBase64Audio(base64: string, onDone?: () => void): Promise<void> {
  await stopSpeaking();
  try {
    const uri = (FileSystem.cacheDirectory ?? '') + 'haazir_conv.mp3';
    await FileSystem.writeAsStringAsync(uri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
    });
    const player = createAudioPlayer({ uri });
    _currentPlayer = player;
    player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) {
        player.remove();
        _currentPlayer = null;
        onDone?.();
      }
    });
    player.play();
  } catch (e) {
    console.error('[voicePlayback] playBase64Audio error:', e);
    onDone?.();
  }
}

export async function stopSpeaking(): Promise<void> {
  if (_currentPlayer) {
    try {
      _currentPlayer.pause();
      _currentPlayer.remove();
    } catch {
      /* ignore */
    }
    _currentPlayer = null;
  }
}
