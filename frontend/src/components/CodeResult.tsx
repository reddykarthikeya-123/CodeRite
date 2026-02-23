import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, FileCode2, ChevronRight, Sparkles, AlertTriangle, Download, Loader2, Copy } from 'lucide-react';
import { autoFixCode } from '../api';

export interface CodeAnalysisResponse {
    overall_score: number;
    files: {
        filename: string;
        score: number;
        highlights: string[];
        suggestions: string[];
    }[];
}

export interface RawFile {
    filename: string;
    content: string;
}

interface CodeResultProps {
    result: CodeAnalysisResponse;
    rawFiles: RawFile[];
    onReset: () => void;
}

export const CodeResult: React.FC<CodeResultProps> = ({ result, rawFiles, onReset }) => {
    // Track selected suggestions per file index
    const [selectedSuggestions, setSelectedSuggestions] = useState<Record<number, Set<number>>>({});
    const [fixingFileIndex, setFixingFileIndex] = useState<number | null>(null);
    const [fixedCodes, setFixedCodes] = useState<Record<number, string>>({});
    const [downloadNames, setDownloadNames] = useState<Record<number, string>>({});

    const toggleSuggestion = (fileIdx: number, sugIdx: number) => {
        setSelectedSuggestions(prev => {
            const currentSet = prev[fileIdx] ? new Set(prev[fileIdx]) : new Set<number>();
            if (currentSet.has(sugIdx)) {
                currentSet.delete(sugIdx);
            } else {
                currentSet.add(sugIdx);
            }
            return { ...prev, [fileIdx]: currentSet };
        });
    };

    const handleAutoFix = async (fileIdx: number, filename: string) => {
        const selectedIndices = selectedSuggestions[fileIdx];
        if (!selectedIndices || selectedIndices.size === 0) return;

        const rawFile = rawFiles.find(f => f.filename === filename);
        if (!rawFile) {
            alert("Could not find original source code for " + filename);
            return;
        }

        const fileResult = result.files[fileIdx];
        const suggestionsToApply = Array.from(selectedIndices).map(idx => fileResult.suggestions[idx]);

        setFixingFileIndex(fileIdx);
        try {
            const response = await autoFixCode(filename, rawFile.content, suggestionsToApply);

            // Set the fixed code in state for review/copy/download
            setFixedCodes(prev => ({ ...prev, [fileIdx]: response.fixed_code }));

            // Default download name logic
            const parts = filename.split('.');
            const ext = parts.length > 1 ? parts.pop() : 'txt';
            const newName = `${parts.join('.')}_fixed.${ext}`;
            setDownloadNames(prev => ({ ...prev, [fileIdx]: newName }));

            // Clear selections after success
            setSelectedSuggestions(prev => {
                const next = { ...prev };
                delete next[fileIdx];
                return next;
            });

        } catch (err) {
            console.error(err);
            alert("Failed to auto-fix code. Please check console.");
        } finally {
            setFixingFileIndex(null);
        }
    };

    const getScoreColor = (score: number) => {
        if (score >= 90) return 'text-emerald-500';
        if (score >= 70) return 'text-amber-500';
        return 'text-rose-500';
    };

    const getScoreGradient = (score: number) => {
        if (score >= 90) return 'from-emerald-400 to-emerald-600';
        if (score >= 70) return 'from-amber-400 to-amber-600';
        return 'from-rose-400 to-rose-600';
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
    };

    return (
        <div className="w-full max-w-4xl mx-auto space-y-8">
            {/* Header & Overall Score */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden"
            >
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

                <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Code Analysis Complete</h2>
                    <p className="text-slate-500 text-lg">Reviewed {result.files.length} {result.files.length === 1 ? 'file' : 'files'}. Here is your code quality breakdown.</p>
                </div>

                <div className="flex flex-col items-center">
                    <div className="relative w-32 h-32 flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                            <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-100" />
                            <motion.circle
                                initial={{ strokeDashoffset: 283 }}
                                animate={{ strokeDashoffset: 283 - (283 * result.overall_score) / 100 }}
                                transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
                                cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round"
                                className={`${getScoreColor(result.overall_score)}`}
                                style={{ strokeDasharray: 283 }}
                            />
                        </svg>
                        <div className="absolute flex flex-col items-center">
                            <span className={`text-4xl font-black ${getScoreColor(result.overall_score)}`}>{result.overall_score}</span>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Score</span>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* File Results */}
            <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-4">
                {result.files.map((file, idx) => (
                    <motion.div key={idx} variants={itemVariants} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        {/* File Header */}
                        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${file.score >= 90 ? 'bg-emerald-100 text-emerald-600' :
                                    file.score >= 70 ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600'
                                    }`}>
                                    <FileCode2 className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800">{file.filename}</h3>
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{file.suggestions.length} remarks</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-slate-500">Score</span>
                                <span className={`px-3 py-1 rounded-full text-sm font-black text-white bg-gradient-to-r ${getScoreGradient(file.score)} shadow-sm`}>
                                    {file.score}/100
                                </span>
                            </div>
                        </div>

                        {/* File Feedback */}
                        <div className="p-6 space-y-6">

                            {/* Highlights Section */}
                            {file.highlights && file.highlights.length > 0 && (
                                <div className="space-y-3">
                                    <h4 className="text-sm font-bold tracking-wider text-emerald-600 uppercase flex items-center gap-2">
                                        <Sparkles className="w-4 h-4" /> What's Good
                                    </h4>
                                    <ul className="space-y-2">
                                        {file.highlights.map((highlight, hIdx) => (
                                            <li key={hIdx} className="flex items-start gap-3">
                                                <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                                                <span className="text-slate-700 leading-relaxed font-medium">{highlight}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Suggestions Section */}
                            {file.suggestions && file.suggestions.length > 0 ? (
                                <div className="space-y-3">
                                    <h4 className="text-sm font-bold tracking-wider text-amber-600 uppercase flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4" /> Areas for Improvement
                                    </h4>
                                    <ul className="space-y-2">
                                        {file.suggestions.map((suggestion, sIdx) => (
                                            <li
                                                key={sIdx}
                                                className="flex items-start gap-4 p-3 rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer group"
                                                onClick={() => toggleSuggestion(idx, sIdx)}
                                            >
                                                <div className="mt-0.5 flex-shrink-0 relative flex items-center justify-center">
                                                    <div className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${selectedSuggestions[idx]?.has(sIdx)
                                                        ? 'bg-indigo-600 border-indigo-600'
                                                        : 'border-slate-300 bg-white group-hover:border-indigo-400'
                                                        }`}>
                                                        {selectedSuggestions[idx]?.has(sIdx) && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                                                    </div>
                                                </div>
                                                <span className={`text-slate-700 leading-relaxed transition-opacity ${selectedSuggestions[idx]?.has(sIdx) ? 'opacity-100 font-medium' : 'opacity-80'}`}>
                                                    {suggestion}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>

                                    <AnimatePresence>
                                        {selectedSuggestions[idx] && selectedSuggestions[idx].size > 0 && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="mt-6 pt-6 border-t border-slate-100 flex justify-between items-center"
                                            >
                                                <span className="text-sm font-medium text-slate-500">
                                                    {selectedSuggestions[idx].size} suggestion{selectedSuggestions[idx].size > 1 ? 's' : ''} selected
                                                </span>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleAutoFix(idx, file.filename); }}
                                                    disabled={fixingFileIndex === idx}
                                                    className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-indigo-700 hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {fixingFileIndex === idx ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <Sparkles className="w-4 h-4" />
                                                    )}
                                                    {fixingFileIndex === idx ? 'Fixing Code...' : 'Auto-Fix Selected'}
                                                </button>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* Fixed Code Output Container */}
                                    <AnimatePresence>
                                        {fixedCodes[idx] && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="mt-6 border border-emerald-200 rounded-xl overflow-hidden shadow-sm"
                                            >
                                                <div className="bg-emerald-50 px-4 py-3 border-b border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                    <h4 className="text-sm font-bold text-emerald-700 flex items-center gap-2">
                                                        <CheckCircle2 className="w-4 h-4" /> Fixed Code Ready
                                                    </h4>
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="text"
                                                            value={downloadNames[idx] || ''}
                                                            onChange={(e) => setDownloadNames(prev => ({ ...prev, [idx]: e.target.value }))}
                                                            className="bg-white text-slate-700 text-sm px-3 py-1.5 rounded-lg border border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-32 sm:w-auto"
                                                            placeholder="filename.ext"
                                                        />
                                                        <button
                                                            onClick={() => {
                                                                const blob = new Blob([fixedCodes[idx]], { type: 'text/plain' });
                                                                const url = window.URL.createObjectURL(blob);
                                                                const a = document.createElement('a');
                                                                a.href = url;
                                                                a.download = downloadNames[idx] || 'fixed_code.txt';
                                                                document.body.appendChild(a);
                                                                a.click();
                                                                window.URL.revokeObjectURL(url);
                                                                document.body.removeChild(a);
                                                            }}
                                                            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
                                                        >
                                                            <Download className="w-4 h-4" /> <span className="hidden sm:inline">Download</span>
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(fixedCodes[idx]);
                                                                /* Optional: Add a brief copy success toast here if desired */
                                                            }}
                                                            className="flex items-center gap-2 bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-700 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
                                                        >
                                                            <Copy className="w-4 h-4" /> <span className="hidden sm:inline">Copy</span>
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="bg-slate-900 p-4 overflow-x-auto max-h-96 overflow-y-auto">
                                                    <pre className="text-sm text-emerald-400 font-mono leading-relaxed">
                                                        <code>{fixedCodes[idx]}</code>
                                                    </pre>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 text-emerald-600 font-medium bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                                    <CheckCircle2 className="w-5 h-5" />
                                    <span>Code looks extremely great! No specific issues found to improve.</span>
                                </div>
                            )}
                        </div>
                    </motion.div>
                ))}
            </motion.div>

            {/* Actions */}
            <motion.div variants={itemVariants} className="flex gap-4 justify-end mt-8">
                <button
                    onClick={onReset}
                    className="px-6 py-3 font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                >
                    Analyze Another
                </button>
            </motion.div>
        </div>
    );
};
