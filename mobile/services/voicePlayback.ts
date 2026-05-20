/**
 * Agent TTS playback — uses expo-audio (works in Expo Go SDK 55).
 * expo-av is not loaded here to avoid ExponentAV native module errors in Expo Go.
 */
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio/build/AudioModule.types';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

let _player: AudioPlayer | null = null;
let _statusSub: { remove: () => void } | null = null;
let _webAudio: any = null;

function detachListener() {
  _statusSub?.remove();
  _statusSub = null;
}

export async function playBase64Audio(base64: string, onDone?: () => void): Promise<void> {
  await stopSpeaking();
  if (Platform.OS === 'web') {
    try {
      _webAudio = new Audio(`data:audio/mpeg;base64,${base64}`);
      _webAudio.onended = () => {
        _webAudio = null;
        onDone?.();
      };
      await _webAudio.play();
    } catch (e) {
      console.error('[voicePlayback] Web playBase64Audio error:', e);
      onDone?.();
    }
    return;
  }

  try {
    await setAudioModeAsync({ playsInSilentMode: true });
    const uri = (FileSystem.cacheDirectory ?? '') + 'haazir_conv.mp3';
    await FileSystem.writeAsStringAsync(uri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const player = createAudioPlayer(uri);
    _player = player;

    _statusSub = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) {
        detachListener();
        try {
          player.remove();
        } catch {
          /* ignore */
        }
        if (_player === player) _player = null;
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
  if (Platform.OS === 'web') {
    if (_webAudio) {
      try {
        _webAudio.pause();
      } catch {
        /* ignore */
      }
      _webAudio = null;
    }
    return;
  }

  detachListener();
  if (_player) {
    try {
      _player.pause();
      _player.remove();
    } catch {
      /* ignore */
    }
    _player = null;
  }
}
