import { useState, useEffect, useRef } from 'react';
import { ConfigurationPanel } from './components/ConfigurationPanel';
import { ReviewResult } from './components/ReviewResult';
import { CodeResult, type CodeAnalysisResponse } from './components/CodeResult';
import { Modal } from './components/Modal';
import { ChecklistFilterModal } from './components/ChecklistFilterModal';
import { analyzeDocument, analyzeCode, fetchChecklistCategories, fetchChecklistItems, type ReviewResponse } from './api';
import { Loader2, Settings, ArrowLeft, ListChecks, Upload, FileText, UploadCloud, FileCode2, Code2, Trash2, X, AlertTriangle, FileUp, HelpCircle, Lightbulb } from 'lucide-react';
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
  const [showOnboarding, setShowOnboarding] = useState(false);
  
  // Checklist filter state
  const [showChecklistFilter, setShowChecklistFilter] = useState(false);
  const [checklistItems, setChecklistItems] = useState<{ index: number; section: string; checklist_item: string; original: Record<string, unknown> }[]>([]);
  const [pendingFile, setPendingFile] = useState<{ file: File, category: string } | null>(null);
  const [_enabledChecks, _setEnabledChecks] = useState<string[]>([]); // Track for future use

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

  // Animate loading text - fixed dependency array
  useEffect(() => {
    if (!uploading) {
      setLoadingStage(0);
      return;
    }
    
    const interval = setInterval(() => {
      setLoadingStage((prev) => (prev + 1) % loadingStages.length);
    }, 3500);
    
    return () => clearInterval(interval);
  }, [uploading]); // Removed loadingStages.length - not needed

  // Manage body scroll lock for home page
  useEffect(() => {
    const isHome = !currentFile && !uploading && !docReviewResult && !codeReviewResult;
    
    if (isHome) {
      document.body.classList.add('no-scroll');
    } else {
      document.body.classList.remove('no-scroll');
    }
    
    return () => {
      document.body.classList.remove('no-scroll');
    };
  }, [currentFile, uploading, docReviewResult, codeReviewResult]);

  // Add keyboard shortcut for settings
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setIsSettingsOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Check if first-time user with safe localStorage access
    try {
      const hasVisited = localStorage.getItem('hasVisited');
      if (!hasVisited) {
        setShowOnboarding(true);
        localStorage.setItem('hasVisited', 'true');
      }
    } catch {
      // localStorage unavailable (private browsing, disabled, etc.), skip onboarding
      console.warn('localStorage unavailable, skipping onboarding check');
    }

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleFileProcessed = async (content: string, filename: string, category: string, images?: string[], fileType?: string, checks?: string[]) => {
    setCurrentFile({ content, filename });
    setDocReviewResult(null);
    setCodeReviewResult(null);
    setUploading(true);

    try {
      const result = await analyzeDocument(content, "", category, images, fileType, checks);
      setDocReviewResult({ ...result, filename });
    } catch (err) {
      console.error('Document analysis error:', err);
      setUploadError("Analysis failed. Please check the backend and configuration.");
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (file: File, category: string) => {
    console.log('[handleFileUpload] Starting...', { file: file.name, category });
    // Fetch checklist items and show filter modal
    try {
      console.log('[handleFileUpload] Fetching checklist items...');
      const items = await fetchChecklistItems(category);
      console.log('[handleFileUpload] Received items:', items.length);
      // Add empty original object to match the type
      const itemsWithOriginal = items.map(item => ({
        ...item,
        original: {} as Record<string, unknown>
      }));
      console.log('[handleFileUpload] Setting state...');
      setChecklistItems(itemsWithOriginal);
      setPendingFile({ file, category });
      setShowChecklistFilter(true);
      console.log('[handleFileUpload] Modal should be open now');
    } catch (err) {
      console.error('[handleFileUpload] Error:', err);
      setUploadError("Failed to load checklist items. Please try again.");
      setTimeout(() => setUploadError(null), 5000);
    }
  };

  const handleChecklistApply = async (selectedChecks: string[]) => {
    console.log('[handleChecklistApply] Received', selectedChecks.length, 'selected checks:', selectedChecks);
    _setEnabledChecks(selectedChecks);
    setShowChecklistFilter(false);

    // Now process the file with the selected checks
    if (pendingFile) {
      const { file, category } = pendingFile;
      const fileType = file.name.split('.').pop()?.toLowerCase() || '';

      // Show loading immediately before async upload starts
      setCurrentFile({ content: '', filename: file.name });
      setUploading(true);

      // Read file and upload
      const { uploadFile } = await import('./api');
      uploadFile(file)
        .then(data => {
          console.log('[handleChecklistApply] File uploaded, sending to analyze with', selectedChecks.length, 'checks');
          handleFileProcessed(data.text, data.filename || file.name, category, data.images, fileType, selectedChecks);
        })
        .catch(err => {
          console.error('Upload error:', err);
          setUploadError(`Upload Failed: ${err instanceof Error ? err.message : String(err)}`);
          setUploading(false);
          setCurrentFile(null);
        })
        .finally(() => {
          setPendingFile(null);
        });
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
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(errorMessage);
      setUploadError(errorMessage || "Code analysis failed. Please check the backend and configuration.");
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
    <div className={`flex flex-col min-h-screen overflow-x-hidden bg-gradient-to-br from-[#F8FAFC] via-white to-[#F1F5F9] text-slate-900 font-sans selection:bg-[#1E40AF]/10 selection:text-[#1E40AF] ${
      !currentFile && !uploading && !docReviewResult && !codeReviewResult ? 'home-page-no-scroll' : ''
    }`}>
      {/* Settings Modal */}
      <Modal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} title="System Preferences">
        <ConfigurationPanel />
      </Modal>

      {/* Header with consistent padding and height */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/60 sticky top-0 z-50 transition-all h-20 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/ritelogo.png" alt="RITE Logo" className="w-12 h-12 object-contain" />
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Inspectra AI
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {import.meta.env.VITE_HIDE_SETTINGS_BUTTON !== 'true' && (
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-[#1E40AF] hover:border-[#1E40AF]/30 transition-all focus:outline-none focus:ring-4 focus:ring-[#3B82F6]/20 shadow-sm"
                title="Settings (Cmd/Ctrl + ,)"
              >
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline">Settings</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className={`max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 py-12 flex-1 flex flex-col ${
        !currentFile && !uploading && !docReviewResult && !codeReviewResult ? 'justify-center' : 'justify-start'
      }`}>
        <AnimatePresence mode="wait">
          {!currentFile && !uploading && !docReviewResult && !codeReviewResult && (
            // Upload view container with entrance animation
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20, filter: "blur(10px)" }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="flex items-center justify-center py-4"
            >
              {/* Two-pane layout with aligned elements */}
              <div className="flex w-full gap-16">
                {/* Left Pane - Info & Controls */}
                <motion.div
                  className="flex-1 min-w-[380px] max-w-[480px]"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <div className="w-full h-[580px] flex flex-col justify-between">
                    {/* App Mode Toggle - centered at the top */}
                    <div className="flex justify-center">
                      <div className="flex bg-slate-200/50 p-1.5 rounded-full relative border border-slate-200 shadow-inner w-fit">
                        <div
                          className="absolute inset-y-1.5 left-1.5 w-[calc(50%-6px)] bg-white rounded-full shadow-sm transition-transform duration-300 ease-in-out"
                          style={{ transform: `translateX(${appMode === 'code' ? '100%' : '0'})` }}
                        />
                        <button
                          onClick={() => setAppMode('document')}
                          className={`flex-1 py-2.5 px-8 text-sm font-bold relative z-10 transition-colors rounded-full ${
                            appMode === 'document'
                              ? 'text-[#1E40AF]'
                              : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          Document Audit
                        </button>
                        <button
                          onClick={() => setAppMode('code')}
                          className={`flex-1 py-2.5 px-8 text-sm font-bold relative z-10 transition-colors rounded-full ${
                            appMode === 'code'
                              ? 'text-[#1E40AF]'
                              : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          Code Review
                        </button>
                      </div>
                    </div>

                    {/* Title & Description centered vertically */}
                    <div className="text-center py-8">
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[#3B82F6]/5 rounded-full blur-[80px] pointer-events-none"></div>
                      <h2 className="text-4xl lg:text-5xl font-black text-slate-900 mb-4 tracking-tighter relative z-10 leading-[1.2]">
                        {appMode === 'document' ? 'Intelligent Document' : 'Automated Code'} <br />
                        {appMode === 'document' ? 'Quality Assurance' : 'Review & Scoring'}
                      </h2>
                      <p className="text-lg text-slate-600 leading-relaxed relative z-10 font-medium max-w-xl mx-auto">
                        {appMode === 'document'
                          ? 'Instantly validate functional designs, requirements, and test scripts against strict enterprise compliance frameworks using AI.'
                          : 'Analyze source code for formatting correctness, modularity, error handling, and language-specific best practices.'}
                      </p>
                    </div>

                    {/* Framework/Checklist Selector (Document mode only) - at the bottom */}
                    <div className="h-[150px] flex flex-col justify-end">
                      {appMode === 'document' && (
                        <FileUploadSelector
                          selectedCategory={selectedCategory}
                          onCategoryChange={setSelectedCategory}
                          categories={categories}
                        />
                      )}
                    </div>
                  </div>
                </motion.div>

                {/* Right Pane - Upload Area */}
                <motion.div
                  className="flex-1 min-w-[380px] max-w-[480px]"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="w-full h-[580px] flex flex-col justify-center">
                    <AnimatePresence mode="wait">
                      {appMode === 'document' ? (
                        <motion.div
                          key="doc-upload"
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          className="h-full"
                        >
                          <FileUploadDropzone
                            onFileProcessed={handleFileProcessed}
                            onFileUpload={handleFileUpload}
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
                          className="h-full"
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
                <div className="absolute inset-0 bg-[#3B82F6]/10 rounded-full blur-xl opacity-20 animate-pulse"></div>
                <div className="bg-white p-6 rounded-full shadow-xl relative z-10 mb-8 border border-[#3B82F6]/10">
                  <Loader2 className="w-12 h-12 text-[#1E40AF] animate-spin" />
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

              {/* Enhanced Progress Bar with brand colors */}
              <div className="w-full max-w-xs mt-8 h-1.5 bg-slate-100 rounded-full overflow-hidden relative">
                <div className="absolute inset-0 bg-[#3B82F6]/10 animate-pulse"></div>
                <motion.div
                  initial={{ width: "0%" }}
                  animate={{ width: "90%" }}
                  transition={{ duration: 25, ease: "circOut" }}
                  className="h-full bg-gradient-to-r from-[#1E3A8A] via-[#3B82F6] to-[#06B6D4] rounded-full relative"
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

      {/* Onboarding Modal for First-Time Users */}
      <Modal isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} title="Welcome to Inspectra AI!">
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-[#1E40AF]/5 to-[#06B6D4]/5 rounded-xl border border-[#1E40AF]/10">
            <Lightbulb className="w-6 h-6 text-[#1E40AF] flex-shrink-0" />
            <div>
              <h4 className="font-bold text-slate-800 text-sm">AI-Powered Document Auditing</h4>
              <p className="text-xs text-slate-600 mt-1">Validate functional designs, requirements, and test scripts against enterprise compliance frameworks.</p>
            </div>
          </div>

          <div className="space-y-3">
            <h5 className="font-bold text-slate-700 text-sm">How it works:</h5>
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[#1E40AF] text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</div>
                <p className="text-sm text-slate-600">Select a compliance framework from the dropdown</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[#1E40AF] text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</div>
                <p className="text-sm text-slate-600">Drag & drop your document or click to browse</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[#1E40AF] text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</div>
                <p className="text-sm text-slate-600">Get instant AI-powered quality assessment and feedback</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <FileText className="w-5 h-5 text-[#3B82F6] flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-slate-700">Supported Formats</p>
              <p className="text-xs text-slate-500">PDF, DOCX, XLSX, CSV, PPTX</p>
            </div>
          </div>

          <button
            onClick={() => setShowOnboarding(false)}
            className="w-full py-3 bg-gradient-to-r from-[#1E3A8A] via-[#3B82F6] to-[#06B6D4] text-white font-bold rounded-xl hover:shadow-lg hover:shadow-[#3B82F6]/30 transition-all"
          >
            Get Started
          </button>
        </div>
      </Modal>

      {/* Checklist Filter Modal */}
      <ChecklistFilterModal
        isOpen={showChecklistFilter}
        onClose={() => setShowChecklistFilter(false)}
        onApply={handleChecklistApply}
        checklistItems={checklistItems.map(item => ({
          index: item.index,
          section: item.section,
          checklist_item: item.checklist_item,
          ...item.original
        }))}
        categoryName={pendingFile?.category || selectedCategory}
      />
    </div>
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
      whileHover={{ y: -4, boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)" }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="relative"
    >
      {/* Subtle gradient background using brand colors */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#1E40AF]/5 to-[#06B6D4]/5 rounded-2xl blur-xl" />
      <div className="relative bg-white/90 backdrop-blur-xl p-6 rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-200 border border-slate-200/60">
        <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-3 tracking-wide normal-case">
          <ListChecks className="w-5 h-5 text-[#1E40AF]" />
          Target Framework / Checklist
        </label>
        <div className="relative">
          <select
            value={selectedCategory}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="w-full px-5 py-3.5 bg-slate-50/50 border-2 border-slate-200 rounded-xl focus:ring-4 focus:ring-[#3B82F6]/20 focus:border-[#3B82F6] outline-none transition-all shadow-inner text-slate-700 font-medium appearance-none cursor-pointer hover:border-[#3B82F6]/50"
            aria-label="Select audit framework or checklist"
          >
            <option value="" disabled>Select a compliance framework or checklist</option>
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
        <p className="text-xs text-slate-500 mt-2.5 flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5" />
          Choose the compliance framework to validate your document against
        </p>
      </div>
    </motion.div>
  );
};

// FileUploadDropzone Component - Right pane document upload
interface FileUploadDropzoneProps {
  onFileProcessed: (content: string, filename: string, category: string, images?: string[], fileType?: string, checks?: string[]) => void;
  onFileUpload: (file: File, category: string) => void;
  uploading: boolean;
  setUploading: (uploading: boolean) => void;
  error: string | null;
  onErrorChange: (error: string | null) => void;
  selectedCategory: string;
}

const FileUploadDropzone: React.FC<FileUploadDropzoneProps> = ({
  onFileUpload,
  uploading,
  error,
  onErrorChange,
  selectedCategory,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDisabled = !selectedCategory;

  const handleFile = async (file: File) => {
    if (!selectedCategory) {
      onErrorChange("Please select an audit document category before uploading.");
      setTimeout(() => onErrorChange(null), 5000);
      return;
    }
    // Call parent handler to show checklist filter modal
    onFileUpload(file, selectedCategory);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isDisabled) setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isDisabled) return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="w-full min-w-[420px] h-[580px] bg-white rounded-2xl shadow-lg border border-slate-100 p-6 flex flex-col relative overflow-hidden group">
      {/* Dashed upload zone fills entire card */}
      <motion.div
        className={`flex flex-col items-center justify-center relative overflow-hidden border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-300 h-full ${
          isDragging
            ? 'border-[#3B82F6] bg-gradient-to-br from-[#1E40AF]/5 via-[#3B82F6]/5 to-[#06B6D4]/5 shadow-2xl shadow-[#1E40AF]/20 scale-[1.02]'
            : isDisabled
              ? 'border-slate-200 bg-slate-50/50 cursor-not-allowed opacity-60'
              : 'border-slate-200 hover:border-[#3B82F6] hover:bg-gradient-to-br hover:from-[#1E40AF]/5 hover:via-[#3B82F6]/5 hover:to-[#06B6D4]/5 hover:shadow-lg hover:shadow-[#3B82F6]/10'
        }`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !isDisabled && fileInputRef.current?.click()}
        whileHover={!isDisabled ? { y: -3 } : {}}
        whileTap={!isDisabled ? { scale: 0.98 } : {}}
        role="button"
        tabIndex={isDisabled ? -1 : 0}
        aria-label={isDisabled ? "Please select a compliance framework first" : "Upload document area. Drag and drop or click to browse files."}
        aria-disabled={isDisabled}
      >
        <input
          type="file"
          className="hidden"
          ref={fileInputRef}
          accept=".pdf,.docx,.txt,.md,.py,.js,.ts,.json,.html,.css,.xlsx,.csv,.xls,.pptx,.car,application/zip,application/octet-stream"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />

        {uploading ? (
          <div className="flex flex-col items-center animate-pulse relative z-10">
            <FileText className="w-16 h-16 text-[#1E40AF] mb-4 drop-shadow-lg" />
            <p className="text-slate-600 font-semibold tracking-wide">Processing Document...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center relative z-10">
            {/* Icon container with brand gradient and enhanced shadow */}
            <motion.div
              className={`p-4 rounded-full shadow-lg mb-5 transition-all duration-300 ${
                isDisabled
                  ? 'bg-slate-200 shadow-none'
                  : 'bg-gradient-to-br from-[#1E3A8A] via-[#3B82F6] to-[#06B6D4] shadow-lg shadow-[#3B82F6]/30 group-hover:shadow-xl group-hover:shadow-[#3B82F6]/40'
              }`}
              animate={!isDisabled && !uploading ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              whileHover={!isDisabled ? { scale: 1.1, boxShadow: "0 25px 50px -12px rgb(59 130 246 / 0.5)" } : {}}
            >
              <Upload className={`w-14 h-14 ${isDisabled ? 'text-slate-400' : 'text-white drop-shadow-md'}`} />
            </motion.div>

            {/* Bold "Drag & drop" text */}
            <p className={`text-lg font-bold mb-2 tracking-tight ${isDisabled ? 'text-slate-400' : 'text-slate-700'}`}>
              Drag & drop your document here
            </p>

            {/* "or browse" with brand color link */}
            <p className={`text-slate-500 mb-4 ${isDisabled ? 'opacity-50' : ''}`}>
              or{' '}
              <span className={`inline-flex items-center gap-1.5 font-semibold transition-colors duration-200 relative group/link ${
                isDisabled
                  ? 'text-slate-400 cursor-not-allowed'
                  : 'text-[#3B82F6] hover:text-[#1E40AF] cursor-pointer'
              }`}>
                <span className="relative">
                  browse from your computer
                  {!isDisabled && (
                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-[#1E3A8A] via-[#3B82F6] to-[#06B6D4] rounded-full opacity-70 group-hover/link:opacity-100 transition-opacity duration-200" />
                  )}
                </span>
              </span>
            </p>

            {/* File format icons with labels */}
            <div className="flex gap-3 justify-center flex-wrap max-w-xs mx-auto mb-3">
              {[
                { ext: 'PDF', color: 'text-red-600', bg: 'bg-red-50' },
                { ext: 'DOCX', color: 'text-blue-600', bg: 'bg-blue-50' },
                { ext: 'XLSX', color: 'text-green-600', bg: 'bg-green-50' },
                { ext: 'PPTX', color: 'text-orange-600', bg: 'bg-orange-50' },
                { ext: 'CAR', color: 'text-purple-600', bg: 'bg-purple-50' },
              ].map((format) => (
                <motion.div
                  key={format.ext}
                  className={`px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm transition-all duration-300 ${
                    isDisabled
                      ? 'bg-slate-100 opacity-50'
                      : `${format.bg} ${format.color}`
                  }`}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: isDisabled ? 0.5 : 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <span className={`text-xs font-bold ${isDisabled ? 'text-slate-400' : format.color}`}>{format.ext}</span>
                </motion.div>
              ))}
            </div>

            {/* File size hint */}
            <p className={`text-xs font-medium flex items-center gap-1.5 mb-1.5 ${isDisabled ? 'text-slate-400' : 'text-slate-500'}`}>
              <FileUp className="w-3.5 h-3.5" />
              Max file size: 50MB
            </p>

            {/* Note - text-xs to be slightly smaller */}
            <p className="text-slate-400 text-[11px]">
              Embedded flowcharts and screenshots are automatically graded via AI Vision.
            </p>

            {/* Disabled overlay message */}
            {isDisabled && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-[1px] rounded-2xl z-20"
              >
                <div className="bg-white px-6 py-3 rounded-xl shadow-lg border-2 border-slate-200 flex items-center gap-2">
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className="text-sm font-semibold text-slate-600">Select a framework to enable upload</span>
                </div>
              </motion.div>
            )}
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="absolute top-0 left-0 right-0 z-50 p-4 pointer-events-none"
          >
            <div className="bg-rose-50 border-2 border-rose-200 rounded-xl p-4 shadow-lg flex items-start gap-3 pointer-events-auto">
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
    <div className="w-full min-w-[420px] h-[580px] bg-white rounded-2xl shadow-lg border border-slate-100 p-6 flex flex-col relative overflow-hidden group">
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="absolute top-0 left-0 right-0 z-50 p-4 pointer-events-none"
          >
            <div className="bg-rose-50 border-2 border-rose-200 rounded-xl p-4 shadow-lg flex items-start gap-3 pointer-events-auto">
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

      {/* Tab switcher with brand colors and icons - improved differentiation */}
      <div className="flex bg-slate-100 p-1 rounded-xl mb-4 relative flex-shrink-0 z-10 h-[48px]">
        <div
          className="absolute inset-y-1 w-1/2 bg-white rounded-lg shadow-sm transition-transform duration-300 ease-in-out border border-slate-200/50"
          style={{ transform: `translateX(${activeTab === 'paste' ? 'calc(100% - 4px)' : '4px'})` }}
        />
        <button
          onClick={() => setActiveTab('files')}
          className={`flex-1 py-2 text-sm font-bold relative z-10 transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'files' ? 'text-[#1E40AF]' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <FileCode2 className="w-4 h-4" />
          Upload Files
        </button>
        <button
          onClick={() => setActiveTab('paste')}
          className={`flex-1 py-2 text-sm font-bold relative z-10 transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'paste' ? 'text-[#1E40AF]' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Code2 className="w-4 h-4" />
          Paste Code
        </button>
      </div>

      <div className="flex-1 relative overflow-hidden z-0">
        <AnimatePresence mode="wait">
          {activeTab === 'files' ? (
            <motion.div
              key="files"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 flex flex-col overflow-hidden"
            >
              <div
                className={`h-full flex flex-col items-center relative border-2 border-dashed rounded-2xl p-0 text-center transition-all duration-300 ease-out cursor-pointer overflow-hidden
                ${isDragging
                    ? 'border-[#3B82F6] bg-gradient-to-br from-[#1E40AF]/5 via-[#3B82F6]/5 to-[#06B6D4]/5 scale-[1.01] shadow-lg shadow-[#3B82F6]/20'
                    : 'border-slate-200 hover:border-[#3B82F6] hover:bg-slate-50/70'}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="Upload code files area. Drag and drop or click to browse files."
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileInput}
                />

                <div className={`flex-1 flex flex-col items-center justify-center relative z-10 w-full p-6 ${selectedFiles.length > 0 ? 'pb-2' : ''}`}>
                  {/* Icon container with brand colors and animation - scaled down if files exist */}
                  <motion.div
                    className={`mx-auto rounded-full flex items-center justify-center transition-all duration-300
                  ${selectedFiles.length > 0 ? 'w-12 h-12 mb-3' : 'w-20 h-20 mb-5'}
                  ${isDragging ? 'bg-[#3B82F6]/10 text-[#1E40AF] scale-110' : 'bg-slate-100 text-slate-400 group-hover:bg-[#1E40AF]/5 group-hover:text-[#1E40AF]'}`}
                    animate={!isDragging ? { scale: [1, 1.05, 1] } : {}}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <FileCode2 className={`${selectedFiles.length > 0 ? 'w-6 h-6' : 'w-10 h-10'} ${isDragging ? 'animate-bounce' : ''}`} />
                  </motion.div>

                  <h3 className={`${selectedFiles.length > 0 ? 'text-base' : 'text-xl'} font-bold text-slate-800 tracking-tight mb-1`}>
                    {selectedFiles.length > 0 ? 'Add more files' : 'Drop code files here'}
                  </h3>
                  {!selectedFiles.length && (
                    <p className="text-slate-500 mb-5 font-medium">
                      or click to browse from your computer
                    </p>
                  )}

                  {/* File type badges - hidden if files exist to save space */}
                  {!selectedFiles.length && (
                    <motion.div
                      className="flex gap-2 justify-center flex-wrap max-w-sm mx-auto mb-4"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                    >
                      {['.py', '.js', '.ts', '.java', '.cpp', '.cs', '.go', '.html', '.css'].map((ext, index) => (
                        <motion.span
                          key={ext}
                          className="px-3 py-1.5 bg-[#F1F5F9] text-[#475569] rounded-lg text-xs font-semibold tracking-wide border border-[#E2E8F0] shadow-sm transition-colors"
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.04, duration: 0.2 }}
                        >
                          {ext}
                        </motion.span>
                      ))}
                    </motion.div>
                  )}
                  
                  {!selectedFiles.length && (
                    <p className="text-slate-400 text-xs font-medium flex items-center gap-1.5 justify-center">
                      <FileUp className="w-3.5 h-3.5" />
                      Max 5MB per file
                    </p>
                  )}
                </div>

                {/* Selected Files List - Inside the dashed box at the bottom */}
                {selectedFiles.length > 0 && (
                  <div className="w-full mt-auto bg-white/50 backdrop-blur-sm border-t border-slate-100 p-4 relative z-20">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Selected Files ({selectedFiles.length})</h4>
                    </div>
                    <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1 custom-scrollbar">
                      {selectedFiles.map((f, i) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200 group/item hover:border-[#3B82F6]/30 transition-colors">
                          <div className="flex items-center gap-2.5 overflow-hidden">
                            <Code2 className="w-3.5 h-3.5 text-[#3B82F6] flex-shrink-0" />
                            <span className="text-xs font-bold text-slate-700 truncate">{f.file.name}</span>
                            <span className="text-[10px] text-slate-400 font-medium">({(f.file.size / 1024).toFixed(1)} KB)</span>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                            className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="paste"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 flex flex-col overflow-hidden"
            >
              <div className="flex-1 flex flex-col items-center relative border-2 border-dashed rounded-2xl transition-all duration-300 border-slate-200 bg-slate-50/50 overflow-hidden">
                <textarea
                  value={pastedCode}
                  onChange={(e) => setPastedCode(e.target.value)}
                  placeholder="Paste your source code here for analysis..."
                  className="w-full h-full min-w-full bg-transparent border-0 p-6 font-mono text-sm text-slate-700 focus:outline-none focus:ring-0 resize-none custom-scrollbar"
                  spellCheck={false}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Submit button with brand colors */}
      <div className="mt-3 flex justify-end relative z-10 flex-shrink-0">
        <button
          onClick={handleSubmit}
          disabled={activeTab === 'files' ? selectedFiles.length === 0 : pastedCode.trim().length === 0}
          className="flex items-center gap-2 bg-gradient-to-r from-[#1E3A8A] via-[#3B82F6] to-[#06B6D4] text-white px-6 py-2.5 rounded-xl font-bold hover:shadow-lg hover:shadow-[#3B82F6]/30 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:translate-y-0"
        >
          <UploadCloud className="w-4 h-4" />
          Analyze Code
        </button>
      </div>
    </div>
  );
};

export default App;
