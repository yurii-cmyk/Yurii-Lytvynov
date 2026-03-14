import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, Languages, Send, Loader2, Settings2, CheckCircle2, XCircle, RotateCcw, Trash2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { translateText, generateSpeech, analyzeSpeech, fixPunctuation, AVAILABLE_VOICES, LANGUAGES } from './services/geminiService';

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export default function App() {
  const [inputText, setInputText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  // Practice Mode States
  const [isPracticeMode, setIsPracticeMode] = useState(false);
  const [practiceFeedback, setPracticeFeedback] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [targetPhrase, setTargetPhrase] = useState('');

  const [fromLang, setFromLang] = useState(() => {
    const saved = localStorage.getItem('fromLangCode');
    return LANGUAGES.find(l => l.code === saved) || LANGUAGES[1];
  });
  const [toLang, setToLang] = useState(() => {
    const saved = localStorage.getItem('toLangCode');
    return LANGUAGES.find(l => l.code === saved) || LANGUAGES[6];
  });
  const [selectedVoice, setSelectedVoice] = useState(() => {
    return localStorage.getItem('selectedVoice') || AVAILABLE_VOICES[2];
  });
  const [isSmartPunctuationEnabled, setIsSmartPunctuationEnabled] = useState(() => {
    return localStorage.getItem('smartPunctuation') === 'true';
  });
  const [isFixingPunctuation, setIsFixingPunctuation] = useState(false);

  const recognitionRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputText, isPracticeMode]);

  useEffect(() => {
    localStorage.setItem('fromLangCode', fromLang.code);
    localStorage.setItem('toLangCode', toLang.code);
    localStorage.setItem('selectedVoice', selectedVoice);
    localStorage.setItem('smartPunctuation', String(isSmartPunctuationEnabled));
  }, [fromLang, toLang, selectedVoice, isSmartPunctuationEnabled]);

  // Handle Smart Punctuation when recording stops
  useEffect(() => {
    if (!isListening && inputText && isSmartPunctuationEnabled && !isFixingPunctuation) {
      const fix = async () => {
        setIsFixingPunctuation(true);
        try {
          const fixed = await fixPunctuation(inputText, fromLang.name);
          setInputText(fixed);
        } catch (error) {
          console.error("Failed to fix punctuation:", error);
        } finally {
          setIsFixingPunctuation(false);
        }
      };
      fix();
    }
  }, [isListening]);

  useEffect(() => {
    // Initialize Web Speech API
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onresult = (event: any) => {
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        
        if (finalTranscript) {
          setInputText(prev => (prev ? prev + ' ' : '') + finalTranscript);
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onstart = () => {
        setIsListening(true);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.lang = fromLang.code;
        try {
          recognitionRef.current.start();
        } catch (e) {
          console.error("Recognition already started or error:", e);
        }
      } else {
        alert('Speech recognition is not supported in this browser.');
      }
    }
  };

  const handleTranslate = async () => {
    if (!inputText.trim()) return;
    
    setIsTranslating(true);
    try {
      const translation = await translateText(inputText, fromLang.name, toLang.name);
      setTranslatedText(translation);
    } catch (error) {
      console.error('Translation error:', error);
    } finally {
      setIsTranslating(false);
    }
  };

  const swapLanguages = () => {
    const temp = fromLang;
    setFromLang(toLang);
    setToLang(temp);
    setInputText(translatedText);
    setTranslatedText('');
    setPracticeFeedback('');
  };

  const startPracticeMode = () => {
    if (!translatedText) return;
    
    const originalInput = inputText;
    const originalTranslation = translatedText;
    
    // Swap languages
    const oldFrom = fromLang;
    const oldTo = toLang;
    setFromLang(oldTo);
    setToLang(oldFrom);
    
    // Set target
    setTargetPhrase(originalTranslation);
    setInputText(''); // Clear for student input
    setTranslatedText(originalInput); // Show original as reference
    setIsPracticeMode(true);
    setPracticeFeedback('');
  };

  const exitPracticeMode = () => {
    setIsPracticeMode(false);
    setPracticeFeedback('');
    setTargetPhrase('');
  };

  const handleCheckSpeech = async () => {
    if (!inputText.trim() || !targetPhrase) return;
    
    setIsAnalyzing(true);
    try {
      const feedback = await analyzeSpeech(targetPhrase, inputText, fromLang.name);
      setPracticeFeedback(feedback);
    } catch (error) {
      console.error('Analysis error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSpeak = async (text: string) => {
    if (!text) return;

    setIsSpeaking(true);
    try {
      const audioUrl = await generateSpeech(text, selectedVoice);
      const audio = new Audio(audioUrl);
      audio.onended = () => setIsSpeaking(false);
      audio.onerror = () => {
        console.error('Audio playback error');
        setIsSpeaking(false);
      };
      await audio.play();
    } catch (error) {
      console.error('TTS error:', error);
      setIsSpeaking(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#1A1A1A] font-sans p-4 md:p-6 flex flex-col items-center">
      <motion.header 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-4xl flex justify-between items-center mb-8"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#5A5A40] rounded-full flex items-center justify-center text-white">
            <Languages size={24} />
          </div>
          <h1 className="text-2xl font-serif italic font-semibold">LingoVoice</h1>
        </div>
        
        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full shadow-sm border border-black/5">
            <Settings2 size={16} className="text-[#5A5A40]" />
            <select 
              value={selectedVoice} 
              onChange={(e) => setSelectedVoice(e.target.value)}
              className="text-xs font-medium bg-transparent outline-none cursor-pointer"
            >
              {AVAILABLE_VOICES.map(v => <option key={v} value={v}>{v} Voice</option>)}
            </select>
          </div>
        </div>
      </motion.header>

      <main className="w-full max-w-4xl flex flex-col gap-4">
        {isPracticeMode && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center text-white">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <p className="text-sm font-bold text-amber-800">Режим перевірки</p>
                <p className="text-xs text-amber-700">Повторіть фразу: <span className="text-xl font-serif font-bold text-amber-900 ml-2">"{targetPhrase}"</span></p>
              </div>
            </div>
            <button 
              onClick={exitPracticeMode}
              className="flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-800 rounded-full font-bold text-xs hover:bg-amber-200 transition-all shadow-sm border border-amber-200"
              title="Вийти з режиму перевірки"
            >
              <XCircle size={16} />
              <span>Вийти</span>
            </button>
          </motion.div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 md:gap-4 items-stretch">
          {/* Input Section */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-[32px] p-6 shadow-sm border border-black/5 flex flex-col min-h-[250px] h-fit"
          >
            <div className="flex justify-between items-center mb-4">
              <select 
                value={fromLang.code} 
                onChange={(e) => setFromLang(LANGUAGES.find(l => l.code === e.target.value) || LANGUAGES[0])}
                className="text-sm font-medium text-[#5A5A40] bg-transparent outline-none cursor-pointer uppercase tracking-wider"
              >
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
              </select>
              <div className="flex gap-2">
                <button 
                  onClick={() => setIsSmartPunctuationEnabled(!isSmartPunctuationEnabled)}
                  className={`p-2.5 rounded-full transition-all ${isSmartPunctuationEnabled ? 'bg-amber-100 text-amber-600 shadow-sm' : 'bg-[#F5F5F0] text-black/20 hover:bg-[#EBEBE5]'}`}
                  title={isSmartPunctuationEnabled ? "Розумна пунктуація увімкнена" : "Увімкнути розумну пунктуацію"}
                >
                  <Sparkles size={18} className={isFixingPunctuation ? "animate-pulse" : ""} />
                </button>
                <button 
                  onClick={() => { setInputText(''); setTranslatedText(''); setPracticeFeedback(''); }}
                  className="p-2.5 rounded-full bg-[#F5F5F0] text-black/40 hover:text-red-500 hover:bg-red-50 transition-all"
                  title="Очистити"
                >
                  <Trash2 size={18} />
                </button>
                <button 
                  onClick={toggleListening}
                  className={`p-3 rounded-full transition-all duration-300 ${isListening ? 'bg-red-500 text-white scale-110 shadow-md' : 'bg-[#F5F5F0] text-[#5A5A40] hover:bg-[#EBEBE5]'}`}
                >
                  <Mic size={isListening ? 24 : 20} className="transition-all" />
                </button>
              </div>
            </div>
            
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={isPracticeMode ? "Скажіть фразу..." : "Введіть текст або говоріть..."}
              className="w-full resize-none outline-none text-lg leading-relaxed placeholder:text-black/20 min-h-[120px] overflow-hidden bg-transparent"
            />
            
            <div className="mt-4 flex justify-end gap-2">
              {isPracticeMode ? (
                <button 
                  onClick={handleCheckSpeech}
                  disabled={isAnalyzing || !inputText}
                  className="bg-emerald-600 text-white rounded-full px-6 py-2.5 flex items-center gap-2 hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  {isAnalyzing ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                  <span>Перевірити</span>
                </button>
              ) : (
                <button 
                  onClick={handleTranslate}
                  disabled={isTranslating || !inputText}
                  className="bg-[#5A5A40] text-white rounded-full px-6 py-2.5 flex items-center gap-2 hover:bg-[#4A4A35] transition-colors disabled:opacity-50"
                >
                  {isTranslating ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  <span>Translate</span>
                </button>
              )}
            </div>
          </motion.div>

          {/* Center Actions */}
          <div className="flex flex-row md:flex-col gap-3 justify-center items-center">
            <button 
              onClick={swapLanguages}
              disabled={isPracticeMode}
              className="p-3 bg-white rounded-full shadow-sm border border-black/5 text-[#5A5A40] hover:bg-[#F5F5F0] transition-colors disabled:opacity-30"
              title="Поміняти мови"
            >
              <Languages size={20} className="rotate-90 md:rotate-0" />
            </button>
            {!isPracticeMode && (
              <button 
                onClick={startPracticeMode}
                disabled={!translatedText}
                className="p-3 bg-emerald-50 rounded-full shadow-sm border border-emerald-100 text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-30"
                title="Режим перевірки"
              >
                <CheckCircle2 size={20} />
              </button>
            )}
          </div>

          {/* Output Section */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className={`${isPracticeMode ? 'bg-white border border-black/5 text-[#1A1A1A]' : 'bg-[#5A5A40] text-white'} rounded-[32px] p-6 shadow-lg flex flex-col min-h-[250px] h-fit`}
          >
            <div className="flex justify-between items-center mb-4">
              <select 
                value={toLang.code} 
                onChange={(e) => setToLang(LANGUAGES.find(l => l.code === e.target.value) || LANGUAGES[1])}
                className={`text-sm font-medium bg-transparent outline-none cursor-pointer uppercase tracking-wider ${isPracticeMode ? 'text-[#5A5A40]' : 'text-white/80'}`}
              >
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
              </select>
              <button 
                onClick={() => handleSpeak(translatedText)}
                disabled={!translatedText || isSpeaking}
                className={`p-3 rounded-full transition-all ${isPracticeMode ? 'bg-[#F5F5F0] text-[#5A5A40] hover:bg-[#EBEBE5]' : 'bg-white/10 text-white hover:bg-white/20'} disabled:opacity-30`}
              >
                <Volume2 size={20} />
              </button>
            </div>

            <div className="flex-1">
              <AnimatePresence mode="wait">
                {translatedText ? (
                  <motion.div 
                    key={translatedText}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <p className="text-xl font-serif italic leading-relaxed">
                      {translatedText}
                    </p>
                  </motion.div>
                ) : (
                  <p className={`${isPracticeMode ? 'text-black/20' : 'text-white/30'} italic`}>
                    {isPracticeMode ? "Тут буде ваш оригінал для довідки..." : "Переклад з'явиться тут..."}
                  </p>
                )}
              </AnimatePresence>
            </div>
            
            {!isPracticeMode && (
              <div className="mt-4 pt-4 border-t border-white/10 flex items-center gap-2 text-xs text-white/50 uppercase tracking-widest">
                <Volume2 size={12} />
                <span>Натисніть динамік, щоб почути вимову</span>
              </div>
            )}
          </motion.div>
        </div>

        {/* Feedback Section - Full Width Bottom */}
        <AnimatePresence>
          {isPracticeMode && practiceFeedback && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="w-full bg-white rounded-[32px] p-8 shadow-lg border border-emerald-100 mt-4"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center text-white">
                  <CheckCircle2 size={24} />
                </div>
                <h2 className="text-lg font-bold text-emerald-900 uppercase tracking-widest">Аналіз вчителя</h2>
              </div>
              <p className="text-lg text-emerald-900 leading-relaxed font-serif italic">
                {practiceFeedback}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="mt-12 text-center text-xs text-black/40 uppercase tracking-[0.2em]">
        Powered by Gemini AI • High Fidelity Voice Synthesis
      </footer>
    </div>
  );
}

