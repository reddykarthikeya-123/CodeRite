import { useState, useEffect, useRef } from 'react';
import { ConfigurationPanel } from './components/ConfigurationPanel';
import { ReviewResult } from './components/ReviewResult';
import { CodeResult, type CodeAnalysisResponse } from './components/CodeResult';
import { Modal } from './components/Modal';
import { analyzeDocument, analyzeCode, fetchChecklistCategories, type ReviewResponse } from './api';
import { Loader2, Settings, ArrowLeft, ListChecks, Upload, FileText, AlertCircle, UploadCloud, FileCode2, Code2, Trash2, X, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const [docReviewResult, setDocReviewResult] = useState<ReviewResponse | null>(null);
  const [codeReviewResult, setCodeReviewResult] = useState<CodeAnalysisResponse | null>(null);
  const [currentFile, setCurrentFile] = useState<{ content: string, filename: string } | null>(null);
  const [rawCodeFiles, setRawCodeFiles] = useState<{ filename: string, content: string }[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [loadingStage, setLoadingStage] = useState(0);
  const [appMode, setAppMode] = useState<'document' | 'code'>('document');
  
  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [categories, setCategories] = useState<string[]>([]);

  // Load categories on mount
  useEffect(() => {
    fetchChecklistCategories()
      .then(cats => {
        setCategories(cats);
      })
      .catch(err => console.error("Failed to load categories", err));
  }, []);

  const loadingStages = [
    "Extracting text and structure...",
    "Scanning embedded diagrams using Vision AI...",
    "Cross-referencing enterprise compliance hooks...",
    "Generating actionable feedback..."
  ];

  // Animate loading text
  useEffect(() => {
    if (uploading) {
      const interval = setInterval(() => {
        setLoadingStage((prev) => (prev + 1) % loadingStages.length);
      }, 3500);
      return () => clearInterval(interval);
    } else {
      setLoadingStage(0);
    }
  }, [uploading, loadingStages.length]);

  // Add keyboard shortcut for settings
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setIsSettingsOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleFileProcessed = async (content: string, filename: string, category: string, images?: string[]) => {
    setCurrentFile({ content, filename });
    setDocReviewResult(null);
    setCodeReviewResult(null);
    setUploading(true);

    try {
      const result = await analyzeDocument(content, "", category, images);
      setDocReviewResult({ ...result, filename });
    } catch (err) {
      console.error(err);
      setUploadError("Analysis failed. Please check the backend and configuration.");
    } finally {
      setUploading(false);
    }
  };

  const handleCodeProcessed = async (files: { filename: string, content: string }[]) => {
    setCurrentFile({ content: `${files.length} files selected`, filename: files.length === 1 ? files[0].filename : 'Multiple Files' });
    setRawCodeFiles(files);
    setDocReviewResult(null);
    setCodeReviewResult(null);
    setUploading(true);

    try {
      const result = await analyzeCode(files);
      setCodeReviewResult(result);
    } catch (err: any) {
      console.error(err);
      setUploadError(err.message || "Code analysis failed. Please check the backend and configuration.");
    } finally {
      setUploading(false);
    }
  };

  const resetState = () => {
    setDocReviewResult(null);
    setCodeReviewResult(null);
    setCurrentFile(null);
    setRawCodeFiles([]);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Settings Modal */}
      <Modal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} title="System Preferences">
        <ConfigurationPanel />
      </Modal>

      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/60 sticky top-0 z-50 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/ritelogo.png" alt="RITE Logo" className="w-12 h-12 object-contain" />
            <h1 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-900 tracking-tight">
              Inspectra AI
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {import.meta.env.VITE_HIDE_SETTINGS_BUTTON !== 'true' && (
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-indigo-600 hover:border-indigo-200 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-sm"
                title="Settings (Cmd/Ctrl + ,)"
              >
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline">Settings</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <AnimatePresence mode="wait">
          {!currentFile && !uploading && !docReviewResult && !codeReviewResult && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20, filter: "blur(10px)" }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="flex items-start justify-center py-8"
            >
              {/* Two-pane layout with separator */}
              <div className="flex w-full gap-8 max-w-6xl items-stretch">
                {/* Left Pane - Info & Controls */}
                <motion.div
                  className="flex-1 min-w-[380px] max-w-[520px]"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <div className="sticky top-32">
                    {/* App Mode Toggle */}
                    <div className="flex justify-center mb-10">
                      <div className="flex bg-slate-200/50 p-1.5 rounded-full relative border border-slate-200 shadow-inner w-fit">
                        <div
                          className="absolute inset-y-1.5 left-1.5 w-[calc(50%-6px)] bg-white rounded-full shadow-sm transition-transform duration-300 ease-in-out"
                          style={{ transform: `translateX(${appMode === 'code' ? '100%' : '0'})` }}
                        />
                        <button
                          onClick={() => setAppMode('document')}
                          className={`flex-1 py-2.5 px-6 text-sm font-bold relative z-10 transition-colors rounded-full ${appMode === 'document' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                          Document Audit
                        </button>
                        <button
                          onClick={() => setAppMode('code')}
                          className={`flex-1 py-2.5 px-6 text-sm font-bold relative z-10 transition-colors rounded-full ${appMode === 'code' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                          Code Review
                        </button>
                      </div>
                    </div>

                    {/* Title & Description */}
                    <div className="text-center mb-10">
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none"></div>
                      <h2 className="text-4xl lg:text-5xl font-black text-slate-900 mb-6 tracking-tighter relative z-10 leading-[1.15]">
                        {appMode === 'document' ? 'Intelligent Document' : 'Automated Code'} <br /> {appMode === 'document' ? 'Quality Assurance' : 'Review & Scoring'}
                      </h2>
                      <p className="text-lg text-slate-500 leading-relaxed relative z-10 font-medium max-w-xl mx-auto">
                        {appMode === 'document'
                          ? 'Instantly validate functional designs, requirements, and test scripts against strict enterprise compliance frameworks using AI.'
                          : 'Analyze source code for formatting correctness, modularity, error handling, and language-specific best practices.'}
                      </p>
                    </div>

                    {/* Framework/Checklist Selector (Document mode only) */}
                    {appMode === 'document' && (
                      <div className="mt-10">
                        <FileUploadSelector
                          selectedCategory={selectedCategory}
                          onCategoryChange={setSelectedCategory}
                          categories={categories}
                        />
                      </div>
                    )}
                  </div>
                </motion.div>

                {/* Vertical Dotted Separator */}
                <div className="relative flex items-stretch justify-center px-4">
                  <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 flex flex-col items-center justify-center gap-1">
                    {Array.from({ length: 40 }).map((_, i) => (
                      <div key={i} className="w-px h-2 bg-slate-300 rounded-full"></div>
                    ))}
                  </div>
                </div>

                {/* Right Pane - Upload Area */}
                <motion.div
                  className="flex-1 min-w-[380px]"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="sticky top-32 flex items-center h-full">
                    <AnimatePresence mode="wait">
                      {appMode === 'document' ? (
                        <motion.div
                          key="doc-upload"
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                        >
                          <FileUploadDropzone
                            onFileProcessed={handleFileProcessed}
                            uploading={uploading}
                            setUploading={setUploading}
                            error={uploadError}
                            onErrorChange={setUploadError}
                            selectedCategory={selectedCategory}
                          />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="code-upload"
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                        >
                          <CodeUploadDropzone
                            onCodeProcessed={handleCodeProcessed}
                            error={uploadError}
                            onErrorChange={setUploadError}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}

          {(currentFile || uploading) && !docReviewResult && !codeReviewResult && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="flex flex-col items-center justify-center min-h-[60vh]"
            >
              <div className="relative">
                <div className="absolute inset-0 bg-indigo-500 rounded-full blur-xl opacity-20 animate-pulse"></div>
                <div className="bg-white p-6 rounded-full shadow-xl relative z-10 mb-8 border border-indigo-50">
                  <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-slate-800 tracking-tight">Auditing {currentFile?.filename}...</h3>

              <AnimatePresence mode="wait">
                <motion.p
                  key={loadingStage}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="text-slate-500 mt-3 text-center max-w-md h-6 font-medium"
                >
                  {loadingStages[loadingStage]}
                </motion.p>
              </AnimatePresence>

              {/* Enhanced Progress Bar */}
              <div className="w-full max-w-xs mt-8 h-1.5 bg-slate-100 rounded-full overflow-hidden relative">
                <div className="absolute inset-0 bg-indigo-500/10 animate-pulse"></div>
                <motion.div
                  initial={{ width: "0%" }}
                  animate={{ width: "90%" }}
                  transition={{ duration: 25, ease: "circOut" }}
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full relative"
                >
                  <div className="absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-r from-transparent to-white/40 animate-[shimmer_2s_infinite]"></div>
                </motion.div>
              </div>
            </motion.div>
          )}

          {docReviewResult && (
            <motion.div
              key="doc-results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Audit Report</h2>
                  <p className="text-slate-500 mt-1">Evaluating <span className="font-semibold text-slate-700">{currentFile?.filename}</span></p>
                </div>

                <button
                  onClick={resetState}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Review Another Document
                </button>
              </div>
              <ReviewResult result={docReviewResult} />
            </motion.div>
          )}

          {codeReviewResult && (
            <motion.div
              key="code-results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full"
            >
              <CodeResult result={codeReviewResult} rawFiles={rawCodeFiles} onReset={resetState} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div >
  );
}

// FileUploadSelector Component - Left pane category selector
interface FileUploadSelectorProps {
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  categories: string[];
}

const FileUploadSelector: React.FC<FileUploadSelectorProps> = ({
  selectedCategory,
  onCategoryChange,
  categories,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative"
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
            onChange={(e) => onCategoryChange(e.target.value)}
            className="w-full px-5 py-3.5 bg-slate-50/50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-inner text-slate-700 font-medium appearance-none cursor-pointer"
          >
            <option value="" disabled>Select the audit document</option>
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
  );
};

// FileUploadDropzone Component - Right pane document upload
interface FileUploadDropzoneProps {
  onFileProcessed: (content: string, filename: string, category: string, images?: string[]) => void;
  uploading: boolean;
  setUploading: (uploading: boolean) => void;
  error: string | null;
  onErrorChange: (error: string | null) => void;
  selectedCategory: string;
}

const FileUploadDropzone: React.FC<FileUploadDropzoneProps> = ({
  onFileProcessed,
  uploading,
  setUploading,
  error,
  onErrorChange,
  selectedCategory,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!selectedCategory) {
      onErrorChange("Please select an audit document category before uploading.");
      setTimeout(() => onErrorChange(null), 5000);
      return;
    }
    setUploading(true);
    onErrorChange(null);
    try {
      const { uploadFile } = await import('./api');
      const data = await uploadFile(file);
      onFileProcessed(data.content, data.filename, selectedCategory, data.images);
    } catch (err: any) {
      onErrorChange(`Upload Failed: ${err.message || 'Unknown error. Please check backend logs.'}`);
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
    <div className="w-full">
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
          accept=".pdf,.docx,.txt,.md,.py,.js,.ts,.json,.html,.css,.xlsx,.csv,.xls,.pptx"
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
            <p className="text-slate-500 text-sm mt-3 font-medium">
              Supports PDFs, Word Docs (.docx), Excel (.xlsx, .csv), and PowerPoint (.pptx)
            </p>
            <p className="text-slate-400 text-xs mt-1">
              Embedded flowcharts and screenshots are automatically graded via AI Vision.
            </p>
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

// CodeUploadDropzone Component - Right pane code upload
interface CodeUploadDropzoneProps {
  onCodeProcessed: (files: { filename: string, content: string }[]) => void;
  error: string | null;
  onErrorChange: (error: string | null) => void;
}

const CodeUploadDropzone: React.FC<CodeUploadDropzoneProps> = ({
  onCodeProcessed,
  error,
  onErrorChange,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState<'files' | 'paste'>('files');
  const [pastedCode, setPastedCode] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<{ file: File, content: string }[]>([]);
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

      const isNonCode = nonCodeExtensions.some(ext => filename.endsWith(ext));
      if (isNonCode) {
        onErrorChange(`This is not a code document. The file '${file.name}' is not suitable for code review. Please upload source code files only.`);
        setTimeout(() => onErrorChange(null), 5000);
        continue;
      }

      const isKnownCode = codeExtensions.some(ext => filename.endsWith(ext));
      if (!isKnownCode) {
        const confirmUpload = confirm(`The file '${file.name}' has an unrecognized extension. Do you want to proceed?`);
        if (!confirmUpload) continue;
      }

      if (file.size > 5 * 1024 * 1024) {
        onErrorChange(`File '${file.name}' is too large. Max size is 5MB for code files.`);
        setTimeout(() => onErrorChange(null), 5000);
        continue;
      }

      try {
        const text = await file.text();
        newFiles.push({ file, content: text });
      } catch (err) {
        console.error(`Error reading ${file.name}:`, err);
        onErrorChange(`Failed to read ${file.name}. Please try again.`);
        setTimeout(() => onErrorChange(null), 5000);
      }
    }

    setSelectedFiles(prev => [...prev, ...newFiles]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    processFiles(files);
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      const files = Array.from(e.target.files);
      await processFiles(files);
    }
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
                onClick={() => onErrorChange(null)}
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

export default App;
