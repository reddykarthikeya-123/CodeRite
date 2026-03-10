import React, { useState, useRef, useCallback } from 'react';
import { UploadCloud, FileCode2, Code2, Trash2, AlertTriangle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CodeUploadProps {
    onCodeProcessed: (files: { filename: string, content: string }[]) => void;
}

export const CodeUpload: React.FC<CodeUploadProps> = ({ onCodeProcessed }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [activeTab, setActiveTab] = useState<'files' | 'paste'>('files');
    const [pastedCode, setPastedCode] = useState('');
    const [selectedFiles, setSelectedFiles] = useState<{ file: File, content: string }[]>([]);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const codeExtensions = ['.py', '.js', '.ts', '.jsx', '.tsx', '.java', '.c', '.cpp', '.h', '.hpp', 
                          '.cs', '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.scala', '.r', 
                          '.m', '.mm', '.sql', '.sh', '.bash', '.zsh', '.ps1', '.html', '.css', 
                          '.scss', '.sass', '.less', '.vue', '.svelte', '.json', '.xml', '.yaml', 
                          '.yml', '.toml', '.ini', '.cfg', '.conf', '.md', '.rst', '.txt'];
    
    const nonCodeExtensions = ['.xlsx', '.xls', '.csv', '.pdf', '.docx', '.doc', '.pptx', '.ppt',
                              '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.ico', '.webp',
                              '.mp3', '.mp4', '.avi', '.mov', '.zip', '.rar', '.tar', '.gz'];

    const processFiles = async (files: File[]) => {
        const newFiles: { file: File, content: string }[] = [];

        for (const file of files) {
            const filename = file.name.toLowerCase();
            
            // Block non-code files immediately at frontend
            const isNonCode = nonCodeExtensions.some(ext => filename.endsWith(ext));
            if (isNonCode) {
                setError(`This is not a code document. The file '${file.name}' is not suitable for code review. Please upload source code files only.`);
                setTimeout(() => setError(null), 5000); // Auto-dismiss after 5 seconds
                continue;
            }
            
            // Warn if file extension is not recognized
            const isKnownCode = codeExtensions.some(ext => filename.endsWith(ext));
            if (!isKnownCode) {
                const confirmUpload = confirm(`The file '${file.name}' has an unrecognized extension. Do you want to proceed?`);
                if (!confirmUpload) continue;
            }

            if (file.size > 5 * 1024 * 1024) { // 5MB limit per file for code
                setError(`File '${file.name}' is too large. Max size is 5MB for code files.`);
                setTimeout(() => setError(null), 5000);
                continue;
            }

            try {
                const text = await file.text();
                newFiles.push({ file, content: text });
            } catch (err) {
                console.error(`Error reading ${file.name}:`, err);
                setError(`Failed to read ${file.name}. Please try again.`);
                setTimeout(() => setError(null), 5000);
            }
        }

        setSelectedFiles(prev => [...prev, ...newFiles]);
    };

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files);
        await processFiles(files);
    }, []);

    const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.length) {
            const files = Array.from(e.target.files);
            await processFiles(files);
        }
        // Reset input so the same files can be selected again if needed
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const removeFile = (index: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = () => {
        if (activeTab === 'files' && selectedFiles.length > 0) {
            onCodeProcessed(selectedFiles.map(f => ({ filename: f.file.name, content: f.content })));
        } else if (activeTab === 'paste' && pastedCode.trim()) {
            onCodeProcessed([{ filename: 'pasted_code.txt', content: pastedCode }]);
        }
    };

    return (
        <div className="w-full bg-white rounded-3xl shadow-xl border border-slate-100 p-8 relative overflow-hidden group">
            {/* Error Notification */}
            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: -20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -20, scale: 0.95 }}
                        className="absolute top-0 left-0 right-0 z-50 mb-4"
                    >
                        <div className="bg-rose-50 border-2 border-rose-200 rounded-xl p-4 shadow-lg flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                            <p className="text-rose-800 text-sm font-medium flex-1">{error}</p>
                            <button
                                onClick={() => setError(null)}
                                className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-100 rounded-lg transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="flex bg-slate-100 p-1 rounded-xl mb-6 relative">
                <div
                    className="absolute inset-y-1 w-1/2 bg-white rounded-lg shadow-sm transition-transform duration-300 ease-in-out"
                    style={{ transform: `translateX(${activeTab === 'paste' ? 'calc(100% - 4px)' : '4px'})` }}
                />
                <button
                    onClick={() => setActiveTab('files')}
                    className={`flex-1 py-2 text-sm font-bold relative z-10 transition-colors ${activeTab === 'files' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Upload Files
                </button>
                <button
                    onClick={() => setActiveTab('paste')}
                    className={`flex-1 py-2 text-sm font-bold relative z-10 transition-colors ${activeTab === 'paste' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Paste Code
                </button>
            </div>

            <AnimatePresence mode="wait">
                {activeTab === 'files' ? (
                    <motion.div
                        key="files"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ duration: 0.2 }}
                    >
                        <div
                            className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 ease-out cursor-pointer
                ${isDragging
                                    ? 'border-indigo-400 bg-indigo-50/50 scale-[1.02] shadow-inner'
                                    : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50/50'}`}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                className="hidden"
                                onChange={handleFileInput}
                            />
                            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white/20 pointer-events-none rounded-2xl" />

                            <div className="relative z-10">
                                <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-6 transition-all duration-300
                  ${isDragging ? 'bg-indigo-100 text-indigo-600 scale-110' : 'bg-slate-100 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-500'}`}>
                                    <FileCode2 className={`w-10 h-10 ${isDragging ? 'animate-bounce' : ''}`} />
                                </div>

                                <h3 className="text-xl font-bold text-slate-800 tracking-tight mb-2">
                                    Drop code files here
                                </h3>
                                <p className="text-slate-500 mb-6 font-medium">
                                    or click to browse from your computer
                                </p>

                                <div className="flex gap-2 justify-center flex-wrap max-w-sm mx-auto">
                                    {['.py', '.js', '.ts', '.java', '.cpp', '.cs', '.go', '.html', '.css', '...'].map((ext) => (
                                        <span key={ext} className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-semibold tracking-wide border border-slate-200/60 shadow-sm">
                                            {ext}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {selectedFiles.length > 0 && (
                            <div className="mt-6">
                                <h4 className="text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">Selected Files</h4>
                                <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                                    {selectedFiles.map((f, i) => (
                                        <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 group/item">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <Code2 className="w-5 h-5 text-indigo-400 flex-shrink-0" />
                                                <span className="text-sm font-medium text-slate-700 truncate">{f.file.name}</span>
                                                <span className="text-xs text-slate-400">({(f.file.size / 1024).toFixed(1)} KB)</span>
                                            </div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover/item:opacity-100"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </motion.div>
                ) : (
                    <motion.div
                        key="paste"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                        className="flex flex-col h-64"
                    >
                        <textarea
                            value={pastedCode}
                            onChange={(e) => setPastedCode(e.target.value)}
                            placeholder="Paste your source code here for analysis..."
                            className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-mono text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none custom-scrollbar"
                            spellCheck={false}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="mt-8 flex justify-end relative z-10">
                <button
                    onClick={handleSubmit}
                    disabled={activeTab === 'files' ? selectedFiles.length === 0 : pastedCode.trim().length === 0}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-8 py-3.5 rounded-xl font-bold hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-500/30 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-indigo-600 disabled:hover:shadow-none disabled:hover:translate-y-0"
                >
                    <UploadCloud className="w-5 h-5" />
                    Analyze Code
                </button>
            </div>
        </div>
    );
};
