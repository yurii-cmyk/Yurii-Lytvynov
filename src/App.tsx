import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, Languages, Send, Loader2, Settings2, CheckCircle2, XCircle, RotateCcw, Trash2, Sparkles, ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    translateText,
    translateTextStream,
    generateSpeech,
    analyzeSpeech,
    analyzeSpeechStream,
    fixPunctuation,
    AVAILABLE_VOICES,
    LANGUAGES
} from './services/geminiService';

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const CustomSelect = ({
    value,
    options,
    onChange,
    label,
    dark = false,
    width = "w-48"
}: {
    value: string,
    options: { value: string, label: string }[],
    onChange: (val: string) => void,
    label?: string,
    dark?: boolean,
    width?: string
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = options.find(o => o.value === value);

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-1.5 text-sm font-bold transition-colors uppercase tracking-wider ${dark ? 'text-white/80 hover:text-white' : 'text-[#5A5A40] hover:text-black'}`}
            >
                <span>{label ? `${label}: ` : ''}{selectedOption?.label}</span>
                <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className={`absolute top-full left-0 mt-2 ${width} bg-white rounded-2xl shadow-xl border border-black/5 py-2 z-50 overflow-hidden`}
                    >
                        {options.map((opt) => (
                            <button
                                key={opt.value}
                                onClick={() => {
                                    onChange(opt.value);
                                    setIsOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${value === opt.value
                                        ? 'bg-emerald-50 text-emerald-700 font-semibold'
                                        : 'text-black/60 hover:bg-[#F5F5F0] hover:text-black'
                                    }`}
                            >
                                <span>{opt.label}</span>
                                {value === opt.value && <Check size={14} className="text-emerald-600" />}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

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
        return LANGUAGES.find(l => l.code === saved) || LANGUAGES[0];
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
    const lastProcessedIndexRef = useRef(-1);

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
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
            const isAndroid = /Android/i.test(navigator.userAgent);
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = true;
            recognitionRef.current.interimResults = !isAndroid;

            recognitionRef.current.onresult = (event: any) => {
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal && i > lastProcessedIndexRef.current) {
                        const transcript = event.results[i][0].transcript.trim();
                        if (transcript) {
                            setInputText(prev => {
                                const currentText = prev.trim();
                                if (currentText.endsWith(transcript)) return prev;
                                return currentText ? currentText + ' ' + transcript : transcript;
                            });
                            lastProcessedIndexRef.current = i;
                        }
                    }
                }
            };

            recognitionRef.current.onerror = (event: any) => {
                console.error('Speech recognition error', event.error);
                setIsListening(false);
            };

            recognitionRef.current.onstart = () => setIsListening(true);
            recognitionRef.current.onend = () => setIsListening(false);
        }
    }, []);

    const toggleListening = () => {
        if (isListening) {
            recognitionRef.current?.stop();
        } else {
            if (recognitionRef.current) {
                lastProcessedIndexRef.current = -1;
                recognitionRef.current.lang = fromLang.code;
                try {
                    recognitionRef.current.start();
                } catch (e) {
                    console.error("Recognition error:", e);
                }
            } else {
                alert('Speech recognition is not supported in this browser.');
            }
        }
    };

    const handleTranslate = async () => {
        if (!inputText.trim()) return;

        setIsTranslating(true);
        setTranslatedText('');
        try {
            const stream = translateTextStream(inputText, fromLang.name, toLang.name);
            let fullText = '';
            for await (const chunk of stream) {
                fullText += chunk;
                setTranslatedText(fullText);
            }
        } catch (error) {
            console.error('Streaming error, falling back:', error);
            try {
                const translation = await translateText(inputText, fromLang.name, toLang.name);
                setTranslatedText(translation);
            } catch (e) {
                console.error('Critical translation error:', e);
            }
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
        const oldFrom = fromLang;
        const oldTo = toLang;

        setFromLang(oldTo);
        setToLang(oldFrom);
        setTargetPhrase(originalTranslation);
        setInputText('');
        setTranslatedText(originalInput);
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
        setPracticeFeedback('');
        try {
            const stream = analyzeSpeechStream(targetPhrase, inputText, fromLang.name);
            let fullFeedback = '';
            for await (const chunk of stream) {
                fullFeedback += chunk;
                setPracticeFeedback(fullFeedback);
            }
        } catch (error) {
            console.error('Streaming analysis error:', error);
            try {
                const feedback = await analyzeSpeech(targetPhrase, inputText, fromLang.name);
                setPracticeFeedback(feedback);
            } catch (e) {
                console.error('Fallback analysis error:', e);
            }
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
                        <CustomSelect
                            value={selectedVoice}
                            options={AVAILABLE_VOICES.map(v => ({ value: v, label: `${v} Voice` }))}
                            onChange={setSelectedVoice}
                            width="w-40"
                        />
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
                                <p className="text-xs text-amber-700">Повторіть: <span className="text-xl font-serif font-bold text-amber-900 ml-2">"{targetPhrase}"</span></p>
                            </div>
                        </div>
                        <button
                            onClick={exitPracticeMode}
                            className="flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-800 rounded-full font-bold text-xs hover:bg-amber-200 transition-all border border-amber-200"
                        >
                            <XCircle size={16} />
                            <span>Вийти</span>
                        </button>
                    </motion.div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-stretch">
                    <motion.div
                        className="bg-white rounded-[32px] p-6 shadow-sm border border-black/5 flex flex-col min-h-[250px]"
                    >
                        <div className="flex justify-between items-center mb-4">
                            <CustomSelect
                                value={fromLang.code}
                                options={LANGUAGES.map(l => ({ value: l.code, label: l.name }))}
                                onChange={(val) => setFromLang(LANGUAGES.find(l => l.code === val) || LANGUAGES[0])}
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setIsSmartPunctuationEnabled(!isSmartPunctuationEnabled)}
                                    className={`p-2.5 rounded-full transition-all ${isSmartPunctuationEnabled ? 'bg-amber-100 text-amber-600' : 'bg-[#F5F5F0] text-black/20'}`}
                                >
                                    <Sparkles size={18} className={isFixingPunctuation ? "animate-pulse" : ""} />
                                </button>
                                <button onClick={() => { setInputText(''); setTranslatedText(''); setPracticeFeedback(''); }} className="p-2.5 rounded-full bg-[#F5F5F0] text-black/40 hover:text-red-500">
                                    <Trash2 size={18} />
                                </button>
                                <button
                                    onClick={toggleListening}
                                    className={`p-3 rounded-full transition-all ${isListening ? 'bg-red-500 text-white scale-110' : 'bg-[#F5F5F0] text-[#5A5A40]'}`}
                                >
                                    <Mic size={isListening ? 24 : 20} />
                                </button>
                            </div>
                        </div>

                        <textarea
                            ref={textareaRef}
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder={isPracticeMode ? "Скажіть фразу..." : "Введіть текст..."}
                            className="w-full resize-none outline-none text-lg leading-relaxed bg-transparent min-h-[120px]"
                        />

                        <div className="mt-4 flex justify-end">
                            <button
                                onClick={isPracticeMode ? handleCheckSpeech : handleTranslate}
                                disabled={(isPracticeMode ? isAnalyzing : isTranslating) || !inputText}
                                className="bg-[#5A5A40] text-white rounded-full px-6 py-2.5 flex items-center gap-2 disabled:opacity-50"
                            >
                                {(isPracticeMode ? isAnalyzing : isTranslating) ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                                <span>{isPracticeMode ? 'Перевірити' : 'Translate'}</span>
                            </button>
                        </div>
                    </motion.div>

                    <div className="flex flex-row md:flex-col gap-3 justify-center items-center">
                        <button onClick={swapLanguages} disabled={isPracticeMode} className="p-3 bg-white rounded-full shadow-sm border border-black/5 text-[#5A5A40]">
                            <Languages size={20} className="rotate-90 md:rotate-0" />
                        </button>
                        {!isPracticeMode && (
                            <button onClick={startPracticeMode} disabled={!translatedText} className="p-3 bg-emerald-50 rounded-full border border-emerald-100 text-emerald-700">
                                <CheckCircle2 size={20} />
                            </button>
                        )}
                    </div>

                    <motion.div
                        className={`${isPracticeMode ? 'bg-white border border-black/5 text-[#1A1A1A]' : 'bg-[#5A5A40] text-white'} rounded-[32px] p-6 shadow-lg flex flex-col min-h-[250px]`}
                    >
                        <div className="flex justify-between items-center mb-4">
                            <CustomSelect
                                value={toLang.code}
                                options={LANGUAGES.map(l => ({ value: l.code, label: l.name }))}
                                onChange={(val) => setToLang(LANGUAGES.find(l => l.code === val) || LANGUAGES[1])}
                                dark={!isPracticeMode}
                            />
                            <button onClick={() => handleSpeak(translatedText)} disabled={!translatedText || isSpeaking} className="p-3 rounded-full bg-white/10 text-white">
                                <Volume2 size={20} />
                            </button>
                        </div>

                        <div className="flex-1">
                            <AnimatePresence mode="wait">
                                {translatedText ? (
                                    <motion.p key={translatedText} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xl font-serif italic leading-relaxed">
                                        {translatedText}
                                    </motion.p>
                                ) : (
                                    <p className="opacity-30 italic">Переклад з'явиться тут...</p>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                </div>

                <AnimatePresence>
                    {isPracticeMode && practiceFeedback && (
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full bg-white rounded-[32px] p-8 shadow-lg border border-emerald-100 mt-4">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center text-white">
                                    <CheckCircle2 size={24} />
                                </div>
                                <h2 className="text-lg font-bold text-emerald-900 uppercase tracking-widest">Аналіз вчителя</h2>
                            </div>
                            <p className="text-lg text-emerald-900 leading-relaxed font-serif italic">{practiceFeedback}</p>
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