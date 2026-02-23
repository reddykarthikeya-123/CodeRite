import { useState, useEffect } from 'react';
import { ConfigurationPanel } from './components/ConfigurationPanel';
import { FileUpload } from './components/FileUpload';
import { CodeUpload } from './components/CodeUpload';
import { ReviewResult } from './components/ReviewResult';
import { CodeResult, type CodeAnalysisResponse } from './components/CodeResult';
import { Modal } from './components/Modal';
import { analyzeDocument, analyzeCode, type ReviewResponse } from './api';
import { Loader2, Settings, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const [docReviewResult, setDocReviewResult] = useState<ReviewResponse | null>(null);
  const [codeReviewResult, setCodeReviewResult] = useState<CodeAnalysisResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [currentFile, setCurrentFile] = useState<{ content: string, filename: string } | null>(null);
  const [rawCodeFiles, setRawCodeFiles] = useState<{ filename: string, content: string }[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [loadingStage, setLoadingStage] = useState(0);
  const [appMode, setAppMode] = useState<'document' | 'code'>('document');

  const loadingStages = [
    "Extracting text and structure...",
    "Scanning embedded diagrams using Vision AI...",
    "Cross-referencing enterprise compliance hooks...",
    "Generating actionable feedback..."
  ];

  // Animate loading text
  useEffect(() => {
    if (analyzing) {
      const interval = setInterval(() => {
        setLoadingStage((prev) => (prev + 1) % loadingStages.length);
      }, 3500);
      return () => clearInterval(interval);
    } else {
      setLoadingStage(0);
    }
  }, [analyzing, loadingStages.length]);

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
    setAnalyzing(true);

    try {
      const result = await analyzeDocument(content, "", category, images);
      setDocReviewResult(result);
    } catch (err) {
      console.error(err);
      alert("Analysis failed. Please check the backend and configuration.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCodeProcessed = async (files: { filename: string, content: string }[]) => {
    setCurrentFile({ content: `${files.length} files selected`, filename: files.length === 1 ? files[0].filename : 'Multiple Files' });
    setRawCodeFiles(files);
    setDocReviewResult(null);
    setCodeReviewResult(null);
    setAnalyzing(true);

    try {
      const result = await analyzeCode(files);
      setCodeReviewResult(result);
    } catch (err) {
      console.error(err);
      alert("Code analysis failed. Please check the backend and configuration.");
    } finally {
      setAnalyzing(false);
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
              CodeRite Auditor
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-indigo-600 hover:border-indigo-200 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-sm"
              title="Settings (Cmd/Ctrl + ,)"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Settings</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <AnimatePresence mode="wait">
          {!currentFile && !analyzing && !docReviewResult && !codeReviewResult && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20, filter: "blur(10px)" }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="flex flex-col items-center justify-center py-12 md:py-24"
            >
              {/* Hero Section */}
              <div className="text-center mb-12 relative flex flex-col items-center">

                {/* App Mode Toggle */}
                <div className="flex bg-slate-200/50 p-1.5 rounded-full mb-8 relative border border-slate-200 shadow-inner w-72">
                  <div
                    className="absolute inset-y-1.5 left-1.5 w-[calc(50%-6px)] bg-white rounded-full shadow-sm transition-transform duration-300 ease-in-out"
                    style={{ transform: `translateX(${appMode === 'code' ? '100%' : '0'})` }}
                  />
                  <button
                    onClick={() => setAppMode('document')}
                    className={`flex-1 py-2 text-sm font-bold relative z-10 transition-colors rounded-full ${appMode === 'document' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Document Audit
                  </button>
                  <button
                    onClick={() => setAppMode('code')}
                    className={`flex-1 py-2 text-sm font-bold relative z-10 transition-colors rounded-full ${appMode === 'code' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Code Review
                  </button>
                </div>

                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none"></div>
                <h2 className="text-5xl md:text-6xl font-black text-slate-900 mb-8 tracking-tighter relative z-10 leading-[1.1]">
                  {appMode === 'document' ? 'Intelligent Document' : 'Automated Code'} <br className="hidden md:block" /> {appMode === 'document' ? 'Quality Assurance' : 'Review & Scoring'}
                </h2>
                <p className="text-xl text-slate-500 max-w-2xl mx-auto leading-relaxed relative z-10 font-medium h-14">
                  {appMode === 'document'
                    ? 'Instantly validate functional designs, requirements, and test scripts against strict enterprise compliance frameworks using AI.'
                    : 'Analyze source code for formatting correctness, modularity, error handling, and language-specific best practices.'}
                </p>
              </div>

              <div className="w-full max-w-2xl relative z-10">
                <AnimatePresence mode="wait">
                  {appMode === 'document' ? (
                    <motion.div key="doc-upload" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                      <FileUpload onFileProcessed={handleFileProcessed} />
                    </motion.div>
                  ) : (
                    <motion.div key="code-upload" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                      <CodeUpload onCodeProcessed={handleCodeProcessed} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {(currentFile || analyzing) && !docReviewResult && !codeReviewResult && (
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

export default App;
