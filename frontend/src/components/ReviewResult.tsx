import { useState, useMemo, useEffect } from 'react';
import { type ReviewResponse } from '../api';
import { CheckCircle, XCircle, AlertTriangle, FileText, ChevronDown, ChevronUp, Edit3, ListChecks, Download, Filter } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { motion, AnimatePresence, useSpring, useTransform, useMotionValue } from 'framer-motion';
import type { Variants } from 'framer-motion';
import clsx from 'clsx';

interface ReviewResultProps {
    result: ReviewResponse;
}

export const ReviewResult: React.FC<ReviewResultProps> = ({ result }) => {
    const [showRewritten, setShowRewritten] = useState(false);
    const [selectedFilters, setSelectedFilters] = useState<Set<string>>(new Set(['pass', 'fail', 'warning']));

    // Animated Score Logic
    const animatedScore = useMotionValue(0);
    const springScore = useSpring(animatedScore, { duration: 2500, bounce: 0.2 });
    const displayScore = useTransform(springScore, (latest) => Math.round(latest));

    useEffect(() => {
        animatedScore.set(result.score);
    }, [result.score, animatedScore]);

    // Calculate counts for each status (case-insensitive, trimmed)
    const statusCounts = useMemo(() => {
        const counts = { Pass: 0, Fail: 0, Warning: 0 };
        result.checklist.forEach(item => {
            const status = (item.status || '').trim().toLowerCase();
            if (status === 'pass') counts.Pass++;
            else if (status === 'fail') counts.Fail++;
            else if (status === 'warning') counts.Warning++;
        });
        return counts;
    }, [result.checklist]);

    // Toggle filter selection
    const toggleFilter = (status: string) => {
        setSelectedFilters(prev => {
            const next = new Set(prev);
            if (next.has(status)) {
                next.delete(status);
                // Prevent empty filter state - revert if no filters left
                if (next.size === 0) {
                    return prev; // Keep previous state unchanged
                }
                return next;
            } else {
                next.add(status);
                return next;
            }
        });
    };

    // Filter checklist items based on selected filters (case-insensitive)
    const filteredChecklist = useMemo(() => {
        return result.checklist.filter(item => {
            const itemStatus = (item.status || '').trim().toLowerCase();
            // Match against lowercase filter keys
            return selectedFilters.has(itemStatus);
        });
    }, [result.checklist, selectedFilters]);

    // Group filtered checklist by section
    const groupedChecklist = useMemo(() => {
        return filteredChecklist.reduce((acc, current) => {
            const section = current.section || 'General';
            if (!acc[section]) acc[section] = [];
            acc[section].push(current);
            return acc;
        }, {} as Record<string, typeof filteredChecklist>);
    }, [filteredChecklist]);

    const handleDownloadReport = () => {
        const doc = new jsPDF();

        doc.setFontSize(20);
        doc.setTextColor(30, 41, 59);
        doc.text("Compliance Audit Report", 14, 22);

        doc.setFontSize(12);
        doc.setTextColor(71, 85, 105);
        doc.text(`Overall Score: ${result.score}/100`, 14, 32);

        const tableData = result.checklist.map(item => [
            item.section || 'General',
            item.item,
            item.status,
            item.comment || ''
        ]);

        autoTable(doc, {
            startY: 40,
            head: [['Section', 'Checklist Item', 'Status', 'Remarks']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229] },
            styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak' },
            columnStyles: {
                0: { cellWidth: 35 },
                1: { cellWidth: 60 },
                2: { cellWidth: 20, fontStyle: 'bold' },
                3: { cellWidth: 'auto' }
            },
            didParseCell: function (data) {
                if (data.section === 'body' && data.column.index === 2) {
                    const status = data.cell.raw as string;
                    if (status === 'Pass') {
                        data.cell.styles.textColor = [16, 185, 129];
                    } else if (status === 'Fail') {
                        data.cell.styles.textColor = [244, 63, 94];
                    } else if (status === 'Warning') {
                        data.cell.styles.textColor = [245, 158, 11];
                    }
                }
            }
        });

        const finalY = (doc as any).lastAutoTable?.finalY || 40;
        let currentY = finalY + 15;

        if (result.suggestions && result.suggestions.length > 0) {
            doc.setFontSize(14);
            doc.setTextColor(30, 41, 59);
            doc.text("Key Improvements & Suggestions", 14, currentY);
            currentY += 8;

            doc.setFontSize(10);
            doc.setTextColor(71, 85, 105);

            result.suggestions.forEach((suggestion: { type: string; text: string } | string, idx) => {
                const suggestionText = typeof suggestion === 'string' ? suggestion : suggestion.text;
                const text = `${idx + 1}. ${suggestionText}`;
                const splitText = doc.splitTextToSize(text, 180);

                if (currentY + (splitText.length * 5) > 280) {
                    doc.addPage();
                    currentY = 20;
                }

                doc.text(splitText, 14, currentY);
                currentY += splitText.length * 5 + 3;
            });
        }

        // Remove any file extension from the original filename, then append _Audit_Report.pdf
        const baseFilename = (result.filename || 'Audit_Report').replace(/\.[^/.]+$/g, '');
        doc.save(`${baseFilename}_Audit_Report.pdf`);
    };

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-emerald-500 bg-emerald-50 ring-emerald-100 shadow-emerald-500/20';
        if (score >= 50) return 'text-amber-500 bg-amber-50 ring-amber-100 shadow-amber-500/20';
        return 'text-rose-500 bg-rose-50 ring-rose-100 shadow-rose-500/20';
    };

    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const itemVariants: Variants = {
        hidden: { opacity: 0, x: -20 },
        show: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
    };

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
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.1 }}
                        className={clsx("w-40 h-40 rounded-full flex items-center justify-center border-[6px] border-white shadow-2xl text-6xl font-black ring-8 ring-offset-4 mb-6 transition-colors duration-1000", getScoreColor(result.score))}
                    >
                        <motion.span>{displayScore}</motion.span>
                    </motion.div>
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
                <div className="flex items-center justify-between gap-6 border-b border-slate-100 pb-6">
                    <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-3 tracking-tight">
                        <div className="p-2.5 bg-indigo-50 rounded-xl">
                            <ListChecks className="w-7 h-7 text-indigo-600" />
                        </div>
                        Compliance Audit
                    </h3>
                    <div className="flex items-center gap-4">
                        {/* Status Filter Pills */}
                        <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-full border border-slate-200">
                            <Filter className="w-3.5 h-3.5 text-slate-400 mr-1" />
                            <button
                                onClick={() => toggleFilter('pass')}
                                className={clsx(
                                    "px-3.5 py-1.5 rounded-full text-xs font-bold transition-all border shadow-sm",
                                    selectedFilters.has('pass')
                                        ? "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white border-emerald-600"
                                        : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-600"
                                )}
                            >
                                Pass ({statusCounts.Pass})
                            </button>
                            <button
                                onClick={() => toggleFilter('fail')}
                                className={clsx(
                                    "px-3.5 py-1.5 rounded-full text-xs font-bold transition-all border shadow-sm",
                                    selectedFilters.has('fail')
                                        ? "bg-gradient-to-r from-rose-500 to-rose-600 text-white border-rose-600"
                                        : "bg-white text-slate-600 border-slate-200 hover:border-rose-300 hover:text-rose-600"
                                )}
                            >
                                Fail ({statusCounts.Fail})
                            </button>
                            <button
                                onClick={() => toggleFilter('warning')}
                                className={clsx(
                                    "px-3.5 py-1.5 rounded-full text-xs font-bold transition-all border shadow-sm",
                                    selectedFilters.has('warning')
                                        ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white border-amber-600"
                                        : "bg-white text-slate-600 border-slate-200 hover:border-amber-300 hover:text-amber-600"
                                )}
                            >
                                Warning ({statusCounts.Warning})
                            </button>
                        </div>
                        <div className="h-6 w-px bg-slate-200" />
                        <span className="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-bold rounded-lg border border-slate-200 text-center flex items-center justify-center min-w-[100px]">
                            {filteredChecklist.length} / {result.checklist.length}<br />Items
                        </span>
                        <div className="h-6 w-px bg-slate-200" />
                        <button
                            onClick={handleDownloadReport}
                            className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white text-sm font-semibold rounded-lg hover:from-indigo-700 hover:to-indigo-800 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
                        >
                            <Download className="w-4 h-4" /> Download Report
                        </button>
                    </div>
                </div>

                <div className="space-y-6" key={Array.from(selectedFilters).sort().join('-')}>
                    {Object.entries(groupedChecklist).length === 0 ? (
                        <div className="text-center py-16">
                            <Filter className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                            <p className="text-slate-500 font-medium">No items match the selected filters</p>
                            <p className="text-slate-400 text-sm mt-1">Select a filter above to view items</p>
                        </div>
                    ) : (
                        Object.entries(groupedChecklist).map(([section, items], idx) => (
                            <motion.div key={`${section}-${idx}`} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm bg-slate-50/30">
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
                                                    {item.comment && (
                                                        <p className="text-[14px] text-slate-600 mt-1.5 leading-relaxed">
                                                            {/* Only show Page and Slide references for non-Fail items (exclude Section references) */}
                                                            {item.status !== 'Fail' ? (
                                                                item.comment.split(/(\[Page \d+\]|\[Slide \d+\])/g).map((part, index) => {
                                                                    if (part.match(/\[Page \d+\]|\[Slide \d+\]/)) {
                                                                        return (
                                                                            <span key={index} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 mr-1 shadow-sm">
                                                                                {part.replace(/[\[\]]/g, '')}
                                                                            </span>
                                                                        );
                                                                    }
                                                                    return part;
                                                                })
                                                            ) : (
                                                                // For Fail items, remove all references and show only the comment text
                                                                item.comment.replace(/\[Page \d+\]|\[Slide \d+\]|\[Section \d+\]/g, '').trim()
                                                            )}
                                                        </p>
                                                    )}
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
                            </motion.div>
                        )))}
                </div>
            </motion.div>

            {/* Suggestions - Only show if there are suggestions AND score is not 100 */}
            {result.suggestions && result.suggestions.length > 0 && result.score < 100 && (
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
                    <motion.ul
                        variants={containerVariants}
                        initial="hidden"
                        animate="show"
                        className="space-y-4 relative z-10"
                    >
                        {result.suggestions.map((suggestion: { type: string; text: string } | string, idx) => {
                            const isObj = typeof suggestion !== 'string';
                            const type = isObj ? (suggestion as { type: string; text: string }).type : 'Unknown';
                            const text = isObj ? (suggestion as { type: string; text: string }).text : (suggestion as string);

                            let borderClass = 'border-white/10';
                            let iconClass = 'text-indigo-400';
                            let bgClass = 'bg-white/5 hover:bg-white/10';

                            if (type === 'Fail') {
                                borderClass = 'border-rose-500/40';
                                iconClass = 'text-rose-400';
                                bgClass = 'bg-rose-500/10 hover:bg-rose-500/20';
                            } else if (type === 'Warning') {
                                borderClass = 'border-amber-500/40';
                                iconClass = 'text-amber-400';
                                bgClass = 'bg-amber-500/10 hover:bg-amber-500/20';
                            }

                            return (
                                <motion.li variants={itemVariants} key={idx} className={clsx("flex gap-4 text-indigo-50 backdrop-blur-md p-5 rounded-xl border transition-colors", borderClass, bgClass)}>
                                    <span className={clsx("font-black text-lg", iconClass)}>{idx + 1}.</span>
                                    <span className="leading-relaxed">{text}</span>
                                </motion.li>
                            );
                        })}
                    </motion.ul>
                </motion.div>
            )}

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

