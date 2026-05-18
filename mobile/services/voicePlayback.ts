import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

let _currentSound: Audio.Sound | null = null;

export async function playBase64Audio(base64: string, onDone?: () => void): Promise<void> {
  await stopSpeaking();
  try {
    const uri = (FileSystem.cacheDirectory ?? '') + 'haazir_conv.mp3';
    await FileSystem.writeAsStringAsync(uri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });
    const { sound } = await Audio.Sound.createAsync({ uri });
    _currentSound = sound;
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync();
        _currentSound = null;
        onDone?.();
      }
    });
    await sound.playAsync();
  } catch (e) {
    console.error('[voicePlayback] playBase64Audio error:', e);
    onDone?.();
  }
}

export async function stopSpeaking(): Promise<void> {
  if (_currentSound) {
    try {
      await _currentSound.stopAsync();
      await _currentSound.unloadAsync();
    } catch {
      /* ignore */
    }
    _currentSound = null;
  }
}
