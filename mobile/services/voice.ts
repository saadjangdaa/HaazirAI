import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import axios from 'axios';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080';

// ─── Recording ────────────────────────────────────────────────────────────────

let _recording: Audio.Recording | null = null;

export async function requestMicPermission(): Promise<boolean> {
  const { status } = await Audio.requestPermissionsAsync();
  return status === 'granted';
}

export async function startRecording(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });
  const recording = new Audio.Recording();
  await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
  await recording.startAsync();
  _recording = recording;
}

export async function stopAndTranscribe(): Promise<{ text: string; language: string }> {
  if (!_recording) throw new Error('No active recording');

  await _recording.stopAndUnloadAsync();
  const uri = _recording.getURI();
  _recording = null;

  await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

  if (!uri) throw new Error('Recording URI missing');

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const { data } = await axios.post(`${BASE_URL}/api/voice/transcribe`, {
    audio_base64: base64,
    mime_type: 'audio/m4a',
  }).catch((e) => {
    console.error('[voice] transcribe API failed:', BASE_URL, e?.message, e?.code);
    throw e;
  });

  return {
    text: data.text || '',
    language: data.detected_language || 'roman_urdu',
  };
}

// ─── TTS via Uplift AI ────────────────────────────────────────────────────────

let _currentSound: Audio.Sound | null = null;

export async function speakText(text: string, onDone?: () => void): Promise<void> {
  // Stop any ongoing playback first
  await stopSpeaking();

  try {
    const { data } = await axios.post(`${BASE_URL}/api/voice/tts`, {
      text,
      voice_id: 'v_meklc281',
      translate: true,
    });

    if (!data.success || !data.audio_base64) {
      onDone?.();
      return;
    }

    const uri = (FileSystem.cacheDirectory ?? '') + 'haazir_tts.mp3';
    await FileSystem.writeAsStringAsync(uri, data.audio_base64, {
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
    console.error('Uplift TTS error:', e);
    onDone?.();
  }
}

export async function playBase64Audio(base64: string, onDone?: () => void): Promise<void> {
  await stopSpeaking();
  try {
    const uri = (FileSystem.cacheDirectory ?? '') + 'haazir_conv.mp3';
    await FileSystem.writeAsStringAsync(uri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
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
    console.error('[voice] playBase64Audio error:', e);
    onDone?.();
  }
}

export async function stopSpeaking(): Promise<void> {
  if (_currentSound) {
    try {
      await _currentSound.stopAsync();
      await _currentSound.unloadAsync();
    } catch {}
    _currentSound = null;
  }
}

export async function getIsSpeaking(): Promise<boolean> {
  if (!_currentSound) return false;
  try {
    const status = await _currentSound.getStatusAsync();
    return status.isLoaded && status.isPlaying;
  } catch {
    return false;
  }
}
