import { GoogleGenAI, Modality } from "@google/genai";

// Ініціалізація AI
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

/**
 * Допоміжна функція для конвертації PCM у WAV
 */
function pcmToWav(pcmBase64: string, sampleRate: number = 24000): string {
  const binaryString = window.atob(pcmBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);

  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + len, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); 
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint40(40, len, true);

  const blob = new Blob([wavHeader, bytes], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

/**
 * ПЕРЕКЛАД (Звичайний)
 */
export async function translateText(text: string, fromLang: string, toLang: string) {
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [{ role: "user", parts: [{ text: `Translate from ${fromLang} to ${toLang}: ${text}` }] }],
  });
  return response.text?.trim() || "";
}

/**
 * ПЕРЕКЛАД (Потоковий - STREAMING)
 * Використовується в App.tsx
 */
export async function* translateTextStream(text: string, fromLang: string, toLang: string) {
  const result = await ai.models.generateContentStream({
    model: "gemini-2.0-flash",
    contents: [{ 
      role: "user", 
      parts: [{ text: `Translate the following text from ${fromLang} to ${toLang}. Only provide the translation, nothing else.\n\nText: ${text}` }] 
    }],
  });

  for await (const chunk of result.stream) {
    const chunkText = chunk.text;
    if (chunkText) yield chunkText;
  }
}

/**
 * ОЗВУЧКА (TTS)
 */
export async function generateSpeech(text: string, voiceName: string = 'Kore') {
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash-exp", // Переконайтеся, що модель підтримує TTS
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
    return pcmToWav(part.inlineData.data, 24000);
  }
  throw new Error("Failed to generate speech");
}

/**
 * АНАЛІЗ МОВЛЕННЯ (Звичайний)
 */
export async function analyzeSpeech(targetText: string, studentText: string, language: string) {
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [{ 
      role: "user", 
      parts: [{ text: `You are a language teacher. Compare target: "${targetText}" and student: "${studentText}" in ${language}. Feedback in Ukrainian, concise.` }] 
    }],
  });
  return response.text?.trim() || "Не вдалося проаналізувати.";
}

/**
 * АНАЛІЗ МОВЛЕННЯ (Потоковий)
 * Використовується в App.tsx для режиму практики
 */
export async function* analyzeSpeechStream(targetText: string, studentText: string, language: string) {
  const result = await ai.models.generateContentStream({
    model: "gemini-2.0-flash",
    contents: [{ 
      role: "user", 
      parts: [{ text: `You are a language teacher. Compare the student's spoken text with the target text in ${language}. 
      Target: "${targetText}"
      Student spoke: "${studentText}"
      Provide a brief, encouraging feedback in Ukrainian. Point out errors. Keep it concise.` }] 
    }],
  });

  for await (const chunk of result.stream) {
    const chunkText = chunk.text;
    if (chunkText) yield chunkText;
  }
}

/**
 * ВИПРАВЛЕННЯ ПУНКТУАЦІЇ
 */
export async function fixPunctuation(text: string, language: string) {
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [{ 
      role: "user", 
      parts: [{ text: `Fix punctuation and capitalization in ${language} (return only text): ${text}` }] 
    }],
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