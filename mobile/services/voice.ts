import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system';
import axios from 'axios';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080';

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
  });

  return {
    text: data.text || '',
    language: data.detected_language || 'roman_urdu',
  };
}

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
