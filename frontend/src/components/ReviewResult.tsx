import { useState, useMemo } from 'react';
import { type ReviewResponse } from '../api';
import { CheckCircle, XCircle, AlertTriangle, FileText, ChevronDown, ChevronUp, Edit3, ListChecks } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

interface ReviewResultProps {
    result: ReviewResponse;
}

export const ReviewResult: React.FC<ReviewResultProps> = ({ result }) => {
    const [showRewritten, setShowRewritten] = useState(false);

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-emerald-500 bg-emerald-50 ring-emerald-100 shadow-emerald-500/20';
        if (score >= 50) return 'text-amber-500 bg-amber-50 ring-amber-100 shadow-amber-500/20';
        return 'text-rose-500 bg-rose-50 ring-rose-100 shadow-rose-500/20';
    };

    const groupedChecklist = useMemo(() => {
        return result.checklist.reduce((acc, current) => {
            const section = current.section || 'General';
            if (!acc[section]) acc[section] = [];
            acc[section].push(current);
            return acc;
        }, {} as Record<string, typeof result.checklist>);
    }, [result.checklist]);

    return (
        <div className="space-y-8">
            {/* Score Card */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 p-10 text-center border border-slate-100 relative overflow-hidden"
            >
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
                <div className="flex flex-col items-center">
                    <div className={clsx("w-40 h-40 rounded-full flex items-center justify-center border-[6px] border-white shadow-2xl text-6xl font-black ring-8 ring-offset-4 mb-6 transition-all", getScoreColor(result.score))}>
                        {result.score}
                    </div>
                    <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">Compliance Score</h2>
                    <p className="text-slate-500 mt-2 max-w-md mx-auto line-clamp-2">Aggregated quality rating based on structural integrity, strict checklist compliance, and industry best practices.</p>
                </div>
            </motion.div>

            {/* Checklist items - Full Width */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 p-8 sm:p-10 border border-slate-100"
            >
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4 border-b border-slate-100 pb-6">
                    <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-3 tracking-tight">
                        <div className="p-2 bg-indigo-50 rounded-lg">
                            <ListChecks className="w-7 h-7 text-indigo-600" />
                        </div>
                        Compliance Audit
                    </h3>
                    <span className="px-4 py-1.5 bg-slate-100 text-slate-700 text-sm font-bold rounded-full border border-slate-200">
                        {result.checklist.length} Checks Validated
                    </span>
                </div>

                <div className="space-y-8">
                    {Object.entries(groupedChecklist).map(([section, items], idx) => (
                        <div key={idx} className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm bg-slate-50/30">
                            <div className="bg-slate-50/80 px-5 py-4 border-b border-slate-200/80 backdrop-blur-sm relative">
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-400" />
                                <h4 className="font-bold text-slate-800 pl-2 tracking-wide uppercase text-sm">{section}</h4>
                            </div>
                            <div className="divide-y divide-slate-100/80">
                                {items.map((item, i) => (
                                    <div key={i} className="flex flex-col sm:flex-row items-start gap-4 p-5 bg-white hover:bg-slate-50/80 transition-colors w-full">
                                        <div className="mt-1 flex-shrink-0">
                                            {item.status === 'Pass' && <CheckCircle className="w-6 h-6 text-emerald-500 drop-shadow-sm" />}
                                            {item.status === 'Fail' && <XCircle className="w-6 h-6 text-rose-500 drop-shadow-sm" />}
                                            {item.status === 'Warning' && <AlertTriangle className="w-6 h-6 text-amber-500 drop-shadow-sm" />}
                                        </div>
                                        <div className="flex-1 w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                            <div className="flex-1 max-w-xl">
                                                <h5 className="font-bold text-slate-800 text-[15px] leading-snug">{item.item}</h5>
                                                {item.comment && <p className="text-[14px] text-slate-600 mt-1.5 leading-relaxed">{item.comment}</p>}
                                            </div>
                                            <div className="flex-shrink-0">
                                                <span className={clsx(
                                                    "px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase shadow-sm border",
                                                    item.status === 'Pass' && "bg-emerald-50 text-emerald-700 border-emerald-200",
                                                    item.status === 'Fail' && "bg-rose-50 text-rose-700 border-rose-200",
                                                    item.status === 'Warning' && "bg-amber-50 text-amber-700 border-amber-200"
                                                )}>
                                                    {item.status}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </motion.div>

            {/* Suggestions */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 rounded-3xl shadow-2xl p-8 sm:p-10 border border-indigo-500/20 text-indigo-50 relative overflow-hidden"
            >
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl" />
                <h3 className="text-2xl font-bold text-white mb-8 flex items-center gap-3 relative z-10 tracking-tight">
                    <div className="p-2 bg-indigo-500/20 rounded-lg backdrop-blur-sm border border-indigo-400/30">
                        <Edit3 className="w-6 h-6 text-indigo-300" />
                    </div>
                    Key Improvements & Suggestions
                </h3>
                <ul className="space-y-4 relative z-10">
                    {result.suggestions.map((suggestion, idx) => (
                        <li key={idx} className="flex gap-4 text-indigo-100 bg-white/5 backdrop-blur-md p-5 rounded-xl border border-white/10 hover:bg-white/10 transition-colors">
                            <span className="font-black text-indigo-400 text-lg">{idx + 1}.</span>
                            <span className="leading-relaxed">{suggestion}</span>
                        </li>
                    ))}
                </ul>
            </motion.div>

            {/* Rewritten Content Expander */}
            {result.rewritten_content && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="bg-slate-900 rounded-3xl shadow-xl border border-slate-700 overflow-hidden"
                >
                    <button
                        onClick={() => setShowRewritten(!showRewritten)}
                        className="w-full flex items-center justify-between p-6 bg-slate-800 hover:bg-slate-700/80 transition-colors group"
                    >
                        <div className="flex items-center gap-3 font-bold text-slate-100">
                            <div className="p-2 bg-slate-700/50 rounded-lg group-hover:bg-slate-600/50 transition-colors">
                                <FileText className="w-5 h-5 text-indigo-400" />
                            </div>
                            View AI Rewritten Version
                        </div>
                        <div className="p-2 bg-slate-900/50 rounded-full text-slate-400 group-hover:bg-slate-900 group-hover:text-slate-200 transition-colors">
                            {showRewritten ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </div>
                    </button>
                    <AnimatePresence>
                        {showRewritten && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="p-8 bg-slate-900 text-slate-300 font-mono text-sm overflow-x-auto whitespace-pre-wrap border-t border-slate-800 leading-relaxed selection:bg-indigo-500/30">
                                    {result.rewritten_content}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            )}
        </div>
    );
};

