import { useRef, useState, useEffect } from 'react';
import { Upload, FileText, AlertCircle, ListChecks } from 'lucide-react';
import { uploadFile, fetchChecklistCategories } from '../api';
import { motion } from 'framer-motion';

interface FileUploadProps {
    onFileProcessed: (content: string, filename: string, category: string) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileProcessed }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [categories, setCategories] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchChecklistCategories()
            .then(cats => {
                setCategories(cats);
                if (cats.length > 0) setSelectedCategory(cats[0]); // Default to first proper checklist
            })
            .catch(err => console.error("Failed to load categories", err));
    }, []);

    const handleFile = async (file: File) => {
        setUploading(true);
        setError(null);
        try {
            const data = await uploadFile(file);
            onFileProcessed(data.content, data.filename, selectedCategory);
        } catch (err: unknown) {
            setError("Failed to upload file. Please try again.");
            console.error(err);
        } finally {
            setUploading(false);
        }
    };

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const onDragLeave = () => {
        setIsDragging(false);
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    };

    return (
        <div className="mb-8 w-full max-w-2xl mx-auto">
            {categories.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-8 relative"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 rounded-2xl blur-xl" />
                    <div className="relative bg-white/80 backdrop-blur-xl p-5 rounded-2xl shadow-xl shadow-slate-200/50 border border-white/60">
                        <label className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-3 tracking-wide uppercase">
                            <ListChecks className="w-5 h-5 text-indigo-600" />
                            Target Framework / Checklist
                        </label>
                        <div className="relative">
                            <select
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                className="w-full px-5 py-3.5 bg-slate-50/50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-inner text-slate-700 font-medium appearance-none cursor-pointer"
                            >
                                {categories.map((cat, idx) => (
                                    <option key={idx} value={cat}>{cat}</option>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                                </svg>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}

            <motion.div
                className={`relative overflow-hidden border-2 border-dashed rounded-3xl p-12 text-center cursor-pointer transition-all duration-300 ${isDragging
                        ? 'border-indigo-500 bg-indigo-50/80 shadow-[inset_0_0_50px_rgba(99,102,241,0.1)] scale-[1.02]'
                        : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50 hover:shadow-xl hover:shadow-indigo-500/10'
                    }`}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
            >
                <input
                    type="file"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />

                {uploading ? (
                    <div className="flex flex-col items-center animate-pulse relative z-10">
                        <FileText className="w-16 h-16 text-indigo-500 mb-4 drop-shadow-lg" />
                        <p className="text-slate-600 font-semibold tracking-wide">Processing Document...</p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center relative z-10">
                        <div className="p-4 bg-white rounded-full shadow-sm mb-6 border border-slate-100 group-hover:scale-110 transition-transform">
                            <Upload className="w-10 h-10 text-indigo-500" />
                        </div>
                        <p className="text-xl font-bold text-slate-700 mb-2 tracking-tight">
                            Drag & drop your document here
                        </p>
                        <p className="text-slate-500 mb-6">
                            or <span className="text-indigo-600 hover:text-indigo-700 underline underline-offset-4 cursor-pointer">browse from your computer</span>
                        </p>
                        <div className="flex items-center gap-3 text-xs font-semibold text-slate-400 uppercase tracking-widest">
                            <span>PDF</span>•<span>DOCX</span>•<span>MARKDOWN</span>•<span>CODE</span>
                        </div>
                    </div>
                )}
            </motion.div>

            {error && (
                <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    {error}
                </div>
            )}
        </div>
    );
};
