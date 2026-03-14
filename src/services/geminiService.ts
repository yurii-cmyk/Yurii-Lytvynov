import { GoogleGenAI, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function pcmToWav(pcmBase64: string, sampleRate: number = 24000): string {
  const binaryString = window.atob(pcmBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);

  // RIFF identifier
  view.setUint32(0, 0x52494646, false); // "RIFF"
  // file length
  view.setUint32(4, 36 + len, true);
  // RIFF type
  view.setUint32(8, 0x57415645, false); // "WAVE"
  // format chunk identifier
  view.setUint32(12, 0x666d7420, false); // "fmt "
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw PCM)
  view.setUint16(20, 1, true);
  // channel count
  view.setUint16(22, 1, true); // mono
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * 2, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  view.setUint32(36, 0x64617461, false); // "data"
  // data chunk length
  view.setUint32(40, len, true);

  const blob = new Blob([wavHeader, bytes], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

export async function translateText(text: string, fromLang: string, toLang: string) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Translate the following text from ${fromLang} to ${toLang}. Only provide the translation, nothing else.\n\nText: ${text}`,
  });
  return response.text?.trim() || "";
}

export async function generateSpeech(text: string, voiceName: string = 'Kore') {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      },
    },
  });

  const part = response.candidates?.[0]?.content?.parts?.[0];
  if (part?.inlineData?.data) {
    // Gemini TTS returns raw PCM 24kHz. We wrap it in a WAV header for browser playback.
    return pcmToWav(part.inlineData.data, 24000);
  }
  throw new Error("Failed to generate speech");
}

export async function analyzeSpeech(targetText: string, studentText: string, language: string) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `You are a language teacher. Compare the student's spoken text with the target text in ${language}. 
    Target: "${targetText}"
    Student spoke: "${studentText}"
    
    Provide a brief, encouraging feedback in Ukrainian. Point out any missing words, wrong words, or pronunciation hints if the text suggests them. Keep it concise.`,
  });
  return response.text?.trim() || "Не вдалося проаналізувати відповідь.";
}

export async function fixPunctuation(text: string, language: string) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Fix the punctuation and capitalization of the following text in ${language}. 
    Do not change the words, only add punctuation marks like periods, commas, question marks, and exclamation marks based on the context. 
    Return only the fixed text, nothing else.
    
    Text: ${text}`,
  });
  return response.text?.trim() || text;
}

export const AVAILABLE_VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];

export const LANGUAGES = [
  { code: 'en-US', name: 'English' },
  { code: 'uk-UA', name: 'Ukrainian' },
  { code: 'es-ES', name: 'Spanish' },
  { code: 'fr-FR', name: 'French' },
  { code: 'de-DE', name: 'German' },
  { code: 'it-IT', name: 'Italian' },
  { code: 'pl-PL', name: 'Polish' },
];
