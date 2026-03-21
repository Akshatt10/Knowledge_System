import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Sparkles,
    ChevronRight,
    FileText,
    Loader2,
    CheckCircle2,
    PlusCircle,
    Folder as FolderIcon,
    ChevronDown,
    Download,
    XCircle,
    FlaskConical,
    X
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { documentService, folderService, queryService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { useTheme } from '../context/ThemeContext';

const DeepResearch: React.FC = () => {
    const {} = useAuth();
    const { 
        selectedFolderId,
        setSelectedFolderId
    } = useChat();
    const { theme } = useTheme();

    const [folders, setFolders] = useState<any[]>([]);
    const [showFolderSelector, setShowFolderSelector] = useState(false);

    // Extraction & Checklist
    const [allDocuments, setAllDocuments] = useState<any[]>([]);
    const [showExtractorModal, setShowExtractorModal] = useState(false);
    const [extractingId, setExtractingId] = useState<string | null>(null);
    const [researchTasks, setResearchTasks] = useState<string[]>([]);
    const [newTaskInput, setNewTaskInput] = useState('');

    // Checklist Execution & Report
    const [batchLoading, setBatchLoading] = useState(false);
    const [batchReport, setBatchReport] = useState<any | null>(null);
    const [batchReportHistory, setBatchReportHistory] = useState<any[]>([]);

    // V3: Dual-Mode Research
    const [researchMode, setResearchMode] = useState<'checklist' | 'report'>('checklist');
    const [reportPrompt, setReportPrompt] = useState<string>('');
    const [reportResult, setReportResult] = useState<any | null>(null);
    const [reportLoading, setReportLoading] = useState(false);
    const [deepReportHistory, setDeepReportHistory] = useState<any[]>([]);
    const [showOnboarding, setShowOnboarding] = useState(false);

    useEffect(() => {
        let isMounted = true;

        const loadGlobalData = async () => {
            try {
                const foldersRes = await folderService.getAll();
                if (isMounted) setFolders(foldersRes.data.folders);
                
                const docsRes = await documentService.getAll();
                if (isMounted) setAllDocuments(docsRes.data.documents || []);
            } catch (err) {
                console.error("Failed to load global data", err);
            }
        };

        const loadSavedReport = () => {
            const savedHistory = localStorage.getItem('nexus_checklist_history');
            if (savedHistory && isMounted) {
                try {
                    const parsed = JSON.parse(savedHistory);
                    if (Array.isArray(parsed)) {
                        setBatchReportHistory(parsed);
                    }
                } catch (e) {
                    console.error("Failed to parse saved checklist history", e);
                }
            }
        };

        const loadDeepReportHistory = () => {
            const saved = localStorage.getItem('nexus_deep_reports_history');
            if (saved && isMounted) {
                try {
                    const parsed = JSON.parse(saved);
                    if (Array.isArray(parsed)) setDeepReportHistory(parsed);
                } catch (e) {
                    console.error("Failed to parse deep report history", e);
                }
            }
        };

        loadGlobalData();
        loadSavedReport();
        loadDeepReportHistory();

        // Show onboarding if user hasn't dismissed it
        if (!localStorage.getItem('nexus_deep_research_onboarded')) {
            setShowOnboarding(true);
        }

        return () => { isMounted = false; };
    }, []);

    const handleBatchResearch = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (researchTasks.length === 0 || batchLoading) return;

        setBatchLoading(true);
        setBatchReport(null);
        try {
            const res = await queryService.batchResearch({
                questions: researchTasks,
                folder_id: selectedFolderId,
            });
            setBatchReport(res.data);
            
            const newHistoryItem = {
                id: Date.now().toString(),
                date: new Date().toISOString(),
                report: res.data
            };
            setBatchReportHistory(prev => {
                const updated = [newHistoryItem, ...prev].slice(0, 20); // Keep last 20
                localStorage.setItem('nexus_checklist_history', JSON.stringify(updated));
                return updated;
            });
            
        } catch (err) {
            console.error('Checklist analysis failed', err);
        } finally {
            setBatchLoading(false);
        }
    };

    const handleDownloadReport = () => {
        if (!batchReport) return;
        let md = `# Deep Research Checklist Report\n\n*Generated on: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}*\n\n---\n\n`;
        
        batchReport.results.forEach((r: any) => {
            md += `## ${r.question}\n**Coverage:** ${r.coverage.toUpperCase()}\n\n${r.answer}\n\n`;
            if (r.sources && r.sources.length > 0) {
                md += `**Sources:**\n` + r.sources.map((s: any) => `- ${s.filename}`).join('\n') + `\n\n`;
            }
            md += `---\n\n`;
        });
        
        md += `\n**Summary:**\n- Strong: ${batchReport.strong_coverage}\n- Partial: ${batchReport.partial_coverage}\n- Gaps: ${batchReport.no_coverage}\n`;
        
        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Checklist_Report_${new Date().toISOString().split('T')[0]}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleClearReport = () => {
        setBatchReport(null);
    };
    
    const handleClearAllHistory = () => {
        setBatchReport(null);
        setBatchReportHistory([]);
        localStorage.removeItem('nexus_checklist_history');
    };

    const handleGenerateReport = async () => {
        if (!reportPrompt.trim() || reportLoading) return;
        setReportLoading(true);
        setReportResult(null);
        try {
            const res = await queryService.deepResearchReport({
                prompt: reportPrompt.trim(),
                folder_id: selectedFolderId,
            });
            setReportResult(res.data);

            // Save to history
            const historyItem = {
                id: Date.now().toString(),
                date: new Date().toISOString(),
                prompt: reportPrompt.trim().substring(0, 120),
                report: res.data,
            };
            setDeepReportHistory(prev => {
                const updated = [historyItem, ...prev].slice(0, 20);
                localStorage.setItem('nexus_deep_reports_history', JSON.stringify(updated));
                return updated;
            });
        } catch (err) {
            console.error('Deep Research Report failed', err);
            alert("Failed to generate report.");
        } finally {
            setReportLoading(false);
        }
    };

    const handleDownloadDeepReport = () => {
        if (!reportResult) return;
        let md = reportResult.report;
        if (reportResult.sources && reportResult.sources.length > 0) {
            md += `\n\n---\n\n## Sources\n\n`;
            reportResult.sources.forEach((s: any) => {
                md += `- ${s.filename}\n`;
            });
        }
        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Deep_Research_Report_${new Date().toISOString().split('T')[0]}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
    
    const handleExtractChecklist = async (documentId: string) => {
        setExtractingId(documentId);
        try {
            const res = await queryService.extractChecklist({ document_id: documentId });
            if (res.data && res.data.length > 0) {
                setResearchTasks(res.data);
            } else {
                alert("No checklist items could be found in this document.");
            }
            setShowExtractorModal(false);
        } catch (err: any) {
            console.error("Failed to extract checklist", err);
            alert("Failed to extract checklist: " + (err.response?.data?.detail || err.message));
        } finally {
            setExtractingId(null);
        }
    };

    const handleAddResearchTask = (e?: React.FormEvent | React.KeyboardEvent) => {
        if (e) e.preventDefault();
        if (!newTaskInput.trim()) return;
        setResearchTasks(prev => [...prev, newTaskInput.trim()]);
        setNewTaskInput('');
    };

    const handleRemoveResearchTask = (index: number) => {
        setResearchTasks(prev => prev.filter((_, i) => i !== index));
    };

    return (
        <div className="flex-1 overflow-y-auto p-4 lg:p-8 w-full max-w-[1200px] mx-auto custom-scrollbar">
            
            {/* Onboarding Snackbar */}
            <AnimatePresence>
                {showOnboarding && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="mb-6 bg-gradient-to-r from-accentGlow/10 via-accentSec/10 to-accentGlow/5 border border-accentGlow/20 rounded-2xl p-5 relative"
                    >
                        <button
                            onClick={() => {
                                setShowOnboarding(false);
                                localStorage.setItem('nexus_deep_research_onboarded', 'true');
                            }}
                            className="absolute top-3 right-3 p-1.5 hover:bg-textMain/10 rounded-lg text-textSec hover:text-textMain transition-colors"
                        >
                            <X size={16} />
                        </button>
                        <h3 className="text-base font-outfit font-bold text-textMain mb-2 flex items-center gap-2">
                            <Sparkles size={18} className="text-accentGlow" />
                            Welcome to Deep Research
                        </h3>
                        <p className="text-sm text-textSec leading-relaxed max-w-3xl">
                            This is your personal research assistant. It has <strong className="text-textMain">two powerful modes</strong> — both work by reading through the documents you’ve already uploaded to your <strong className="text-textMain">Knowledge Base</strong>.
                        </p>
                        <div className="bg-warning/10 border border-warning/20 rounded-lg px-3 py-2 mt-3 flex items-start gap-2">
                            <span className="text-warning text-sm mt-0.5">⚡</span>
                            <p className="text-xs text-warning/90 leading-relaxed">
                                <strong>Before you start:</strong> Make sure you have uploaded the documents or URLs you want to research from in the <strong>Knowledge Base</strong> tab. Both modes pull answers strictly from your uploaded content.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                            <div className="bg-panelBg/10 rounded-xl p-3 border border-border-color/10">
                                <div className="text-xs font-bold text-accentGlow uppercase tracking-wider mb-1">📋 Checklist Analysis</div>
                                <p className="text-xs text-textSec leading-relaxed">
                                    Have a list of requirements or points to verify? Pick a document from your Knowledge Base and Nexus will automatically extract all key items, then check each one against your other documents — showing you what’s covered and what’s missing.
                                </p>
                            </div>
                            <div className="bg-panelBg/10 rounded-xl p-3 border border-border-color/10">
                                <div className="text-xs font-bold text-accentGlow uppercase tracking-wider mb-1">📝 Long-Form Report</div>
                                <p className="text-xs text-textSec leading-relaxed">
                                    Need an in-depth research paper or summary? Describe what you need, select a folder, and Nexus will read through your documents and write a detailed, well-structured report — complete with sources and ready to download.
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="mb-8 flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-outfit font-bold text-textMain tracking-tight flex items-center gap-3">
                        <FlaskConical size={28} className="text-accentGlow drop-shadow-[0_0_12px_rgba(59,130,246,0.6)]" />
                        Deep Research
                    </h2>
                    <p className="text-sm text-textSec mt-2 max-w-2xl leading-relaxed">
                        Leverage your knowledge base to run deep checklist analyses or generate long-form research papers from your secure documents.
                    </p>
                    
                        <div className="flex bg-panelBg/40 border border-border-color/10 rounded-xl p-1 mt-6 max-w-[400px]">
                        <button
                            onClick={() => setResearchMode('checklist')}
                            className={`flex-1 py-1.5 px-4 rounded-lg text-sm font-bold transition-all ${
                                researchMode === 'checklist' 
                                ? 'bg-accentGlow/20 text-accentGlow shadow-[0_0_10px_rgba(59,130,246,0.2)] border border-accentGlow/30' 
                                : 'text-textSec hover:text-textMain hover:bg-panelBg/20'
                            }`}
                        >
                            Checklist Analysis
                        </button>
                        <button
                            onClick={() => setResearchMode('report')}
                            className={`flex-1 py-1.5 px-4 rounded-lg text-sm font-bold transition-all ${
                                researchMode === 'report' 
                                ? 'bg-accentGlow/20 text-accentGlow shadow-[0_0_10px_rgba(59,130,246,0.2)] border border-accentGlow/30' 
                                : 'text-textSec hover:text-textMain hover:bg-panelBg/20'
                            }`}
                        >
                            Long-Form Report
                        </button>
                    </div>
                </div>

                <div className="relative">
                    <button
                        onClick={() => setShowFolderSelector(!showFolderSelector)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
                            selectedFolderId 
                            ? 'bg-accentGlow/10 border-accentGlow/30 text-accentGlow shadow-glow' 
                            : 'bg-panelBg/20 border-border-color/10 text-textSec hover:border-border-color/20'
                        }`}
                    >
                        <FolderIcon size={16} />
                        <span>{selectedFolderId ? folders.find(f => f.id === selectedFolderId)?.name || 'Selected Folder' : 'Scan All Knowledge'}</span>
                        <ChevronDown size={14} className={`transition-transform ${showFolderSelector ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {showFolderSelector && (
                        <>
                            <div className="fixed inset-0 z-20" onClick={() => setShowFolderSelector(false)}></div>
                            <div className="absolute right-0 top-12 z-30 bg-panelBg border border-border-color/10 rounded-xl shadow-2xl p-2 min-w-[200px] animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="text-[0.6rem] uppercase tracking-widest text-textSec/60 mb-2 px-3 pt-1">Target Knowledge Source</div>
                                <button
                                    onClick={() => {
                                        setSelectedFolderId(null);
                                        setShowFolderSelector(false);
                                    }}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                                        selectedFolderId === null 
                                        ? 'bg-accentGlow/10 text-accentGlow' 
                                        : 'text-textSec hover:bg-panelBg/30 hover:text-textMain'
                                    }`}
                                >
                                    All Active Knowledge
                                </button>
                                {folders.map(f => (
                                    <button
                                        key={f.id}
                                        onClick={() => {
                                            setSelectedFolderId(f.id);
                                            setShowFolderSelector(false);
                                        }}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors mt-1 ${
                                            selectedFolderId === f.id 
                                            ? 'bg-accentGlow/10 text-accentGlow font-medium' 
                                            : 'text-textSec hover:bg-panelBg/30 hover:text-textMain'
                                        }`}
                                    >
                                        {f.name}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {researchMode === 'checklist' ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-20">
                    {/* Left Column: Input & Controls */}
                    <div className="lg:col-span-5 flex flex-col gap-6">
                        <div className="glass-panel p-6 rounded-2xl border border-border-color/10 shadow-lg relative overflow-hidden bg-panelBg/40">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-outfit font-bold text-textMain text-lg">Research Checklist</h3>
                                <button
                                    onClick={() => setShowExtractorModal(true)}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-accentGlow/10 text-accentGlow/90 hover:text-accentGlow hover:bg-accentGlow/20 rounded-xl text-xs font-bold border border-accentGlow/20 transition-all font-outfit"
                                >
                                    <Sparkles size={14} className="animate-pulse" />
                                    Extract from Document
                                </button>
                            </div>
                            
                            <div className="flex flex-col gap-2 mb-4 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                                {researchTasks.length === 0 ? (
                                    <div className="text-center py-10 text-textSec/30 text-sm font-medium border border-dashed border-border-color/10 rounded-xl flex flex-col items-center justify-center gap-3">
                                        <FlaskConical size={32} className="opacity-50" />
                                        No requirements added.<br/>Extract from a document or type below.
                                    </div>
                                ) : (
                                    researchTasks.map((task, idx) => (
                                        <div key={idx} className="group flex items-start gap-3 p-3 bg-panelBg/20 hover:bg-panelBg/30 border border-border-color/10 rounded-xl transition-colors">
                                            <div className="mt-0.5 shrink-0 w-4 h-4 rounded-md border border-accentGlow/50 flex items-center justify-center bg-accentGlow/10 shadow-[0_0_8px_rgba(59,130,246,0.3)]">
                                                <CheckCircle2 size={10} className="text-accentGlow" />
                                            </div>
                                            <div className="flex-1 text-sm text-textMain/90 font-medium leading-relaxed break-words">{task}</div>
                                            <button 
                                                onClick={() => handleRemoveResearchTask(idx)}
                                                className="shrink-0 p-1.5 opacity-0 group-hover:opacity-100 text-textSec hover:text-danger hover:bg-danger/20 rounded-md transition-all"
                                                title="Remove requirement"
                                            >
                                                <XCircle size={14} />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                            
                            <div className="w-full relative flex items-center bg-black/50 border border-white/10 rounded-xl px-3 py-3 flex-1 focus-within:border-accentGlow/50 transition-colors">
                                <PlusCircle size={16} className="text-textSec shrink-0" />
                                <input 
                                    value={newTaskInput}
                                    onChange={e => setNewTaskInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAddResearchTask(e)}
                                    placeholder="Add a new requirement to check..."
                                    className="w-full bg-transparent border-none outline-none text-sm text-white px-3 placeholder:text-textSec/50 font-medium"
                                />
                                <button 
                                    onClick={handleAddResearchTask}
                                    disabled={!newTaskInput.trim()}
                                    className="shrink-0 w-6 h-6 rounded-md bg-accentGlow/20 text-accentGlow flex items-center justify-center hover:bg-accentGlow/30 hover:scale-110 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
                                >
                                    <PlusCircle size={12} strokeWidth={3} />
                                </button>
                            </div>
                            
                            <button
                                onClick={handleBatchResearch}
                                disabled={batchLoading || researchTasks.length === 0}
                                className="w-full mt-4 flex items-center justify-center gap-2 px-6 py-3.5 bg-accentGlow text-white rounded-xl font-bold font-outfit shadow-[0_0_20px_rgba(59,130,246,0.4)] hover:shadow-[0_0_30px_rgba(59,130,246,0.6)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed uppercase tracking-wider text-sm"
                            >
                                {batchLoading ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        Analysing Knowledge Base...
                                    </>
                                ) : (
                                    'Run Complete Analysis'
                                )}
                            </button>
                        </div>

                        {/* Report History */}
                        {batchReportHistory.length > 0 && !batchReport && (
                            <div className="glass-panel p-6 rounded-2xl border border-border-color/10 bg-panelBg/20">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-outfit font-bold text-textMain text-sm tracking-wide">Recent Reports</h3>
                                    <button
                                        onClick={handleClearAllHistory}
                                        className="text-[10px] uppercase tracking-wider font-bold text-textSec hover:text-danger flex items-center gap-1 transition-colors"
                                    >
                                        <XCircle size={12} />
                                        Clear History
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {batchReportHistory.map((hist, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setBatchReport(hist.report)}
                                            className="w-full text-left p-3 rounded-xl bg-panelBg/10 hover:bg-panelBg/20 border border-border-color/5 hover:border-accentGlow/30 transition-all flex items-center justify-between group"
                                        >
                                            <div>
                                                <div className="text-xs font-bold text-textMain mb-0.5 font-outfit">{new Date(hist.date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>
                                                <div className="text-[10px] text-textSec font-medium flex items-center gap-2">
                                                    <span className="text-success">{hist.report.strong_coverage} Strong</span>
                                                    <span className="text-warning">{hist.report.partial_coverage} Partial</span>
                                                    <span className="text-danger">{hist.report.no_coverage} Gaps</span>
                                                </div>
                                            </div>
                                            <ChevronRight size={16} className="text-textSec group-hover:text-accentGlow transition-colors" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right Column: Report Display */}
                    <div className="lg:col-span-7">
                        {batchReport ? (
                            <div className="glass-panel rounded-2xl border border-border-color/10 bg-panelBg/20 shadow-2xl overflow-hidden flex flex-col max-h-[800px] animate-in slide-in-from-bottom-4 duration-300">
                                <div className="bg-gradient-to-r from-accentGlow/10 to-transparent border-b border-border-color/10 p-5 shrink-0 flex items-center justify-between">
                                    <div>
                                        <h3 className="text-xl font-outfit font-bold text-textMain flex items-center gap-2">
                                            <CheckCircle2 className="text-accentGlow" size={20} />
                                            Checklist Report
                                        </h3>
                                        <div className="text-xs text-textSec/80 font-medium mt-1 uppercase tracking-widest">{new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={handleDownloadReport}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-panelBg/10 hover:bg-panelBg/20 text-textSec hover:text-textMain rounded-lg border border-border-color/10 transition-colors text-xs font-bold"
                                            title="Download Markdown"
                                        >
                                            <Download size={14} />
                                            Export
                                        </button>
                                        <button 
                                            onClick={handleClearReport}
                                            className="flex items-center justify-center p-2 bg-danger/10 hover:bg-danger/20 text-danger rounded-lg border border-danger/20 transition-colors"
                                            title="Clear Report"
                                        >
                                            <XCircle size={16} />
                                        </button>
                                    </div>
                                </div>
                                
                                <div className="p-5 border-b border-border-color/5 shrink-0 bg-panelBg/10">
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="bg-success/10 border border-success/20 rounded-xl p-3 flex flex-col items-center justify-center backdrop-blur-sm">
                                            <div className="text-2xl font-bold text-success font-outfit">{batchReport.strong_coverage}</div>
                                            <div className="text-[10px] uppercase tracking-widest text-success/70 font-bold">Strong</div>
                                        </div>
                                        <div className="bg-warning/10 border border-warning/20 rounded-xl p-3 flex flex-col items-center justify-center backdrop-blur-sm">
                                            <div className="text-2xl font-bold text-warning font-outfit">{batchReport.partial_coverage}</div>
                                            <div className="text-[10px] uppercase tracking-widest text-warning/70 font-bold">Partial</div>
                                        </div>
                                        <div className="bg-danger/10 border border-danger/20 rounded-xl p-3 flex flex-col items-center justify-center backdrop-blur-sm">
                                            <div className="text-2xl font-bold text-danger font-outfit">{batchReport.no_coverage}</div>
                                            <div className="text-[10px] uppercase tracking-widest text-danger/70 font-bold">Gaps</div>
                                        </div>
                                    </div>
                                    <div className="mt-4 w-full bg-panelBg/10 rounded-full h-1.5 overflow-hidden flex">
                                        <div className="bg-success h-full" style={{width: `${(batchReport.strong_coverage / batchReport.total_checkpoints) * 100}%`}}></div>
                                        <div className="bg-warning h-full" style={{width: `${(batchReport.partial_coverage / batchReport.total_checkpoints) * 100}%`}}></div>
                                        <div className="bg-danger h-full" style={{width: `${(batchReport.no_coverage / batchReport.total_checkpoints) * 100}%`}}></div>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto p-5 custom-scrollbar flex flex-col gap-4">
                                    {batchReport.results.map((result: any, idx: number) => {
                                        const isStrong = result.coverage === 'strong';
                                        const isPartial = result.coverage === 'partial';
                                        
                                        const colorClass = isStrong ? 'text-success' : isPartial ? 'text-warning' : 'text-danger';
                                        const bgClass = isStrong ? 'bg-success/5 border-success/20' : isPartial ? 'bg-warning/5 border-warning/20' : 'bg-danger/5 border-danger/20';

                                        return (
                                            <div key={idx} className={`rounded-xl border p-4 ${bgClass}`}>
                                                <div className="flex items-start gap-3 mb-3">
                                                    <div className={`mt-0.5 shrink-0 w-5 h-5 rounded-full border flex items-center justify-center ${
                                                        isStrong ? 'border-success/50 bg-success/10' : 
                                                        isPartial ? 'border-warning/50 bg-warning/10' : 
                                                        'border-danger/50 bg-danger/10'
                                                    }`}>
                                                        <span className={`text-[10px] font-bold ${colorClass}`}>{idx + 1}</span>
                                                    </div>
                                                    <div className="flex-1">
                                                        <h4 className="text-sm font-bold text-textMain leading-relaxed">{result.question}</h4>
                                                        <p className={`text-[10px] uppercase tracking-wider font-bold mt-1 ${colorClass}`}>Coverage: {result.coverage}</p>
                                                    </div>
                                                </div>
                                                
                                                <div className="pl-8">
                                                    <div className={`text-sm text-textSec/90 leading-relaxed font-medium prose ${theme === 'dark' ? 'prose-invert' : ''} max-w-none prose-p:my-1 prose-strong:text-textMain prose-a:text-accentGlow markdown-body`}>
                                                        <ReactMarkdown>{result.answer}</ReactMarkdown>
                                                    </div>
                                                    
                                                    {result.sources && result.sources.length > 0 && (
                                                        <div className="mt-3 pt-3 border-t border-border-color/5">
                                                            <div className="text-[10px] uppercase tracking-widest text-textSec/50 font-bold mb-2">Sources</div>
                                                            <div className="flex flex-wrap gap-2">
                                                                {result.sources.map((src: any, sIdx: number) => (
                                                                    <div key={sIdx} className="inline-flex items-center gap-1.5 px-2 py-1 bg-panelBg/10 rounded-md border border-border-color/10">
                                                                        <FileText size={10} className="text-accentGlow" />
                                                                        <span className="text-xs text-textSec font-medium truncate max-w-[200px]" title={src.filename}>{src.filename}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div className="h-full border border-dashed border-border-color/10 rounded-2xl flex flex-col items-center justify-center p-12 text-center text-textSec bg-panelBg/10">
                                <FlaskConical size={64} className="opacity-20 mb-6" />
                                <h3 className="text-xl font-bold text-textMain mb-2 font-outfit">Ready to Analyse</h3>
                                <p className="max-w-md text-sm leading-relaxed mb-6">
                                    Create your checklist on the left and hit Run Analysis. Nexus will process every requirement against your knowledge base and compile a full coverage report here.
                                </p>
                                <button
                                    onClick={() => setShowExtractorModal(true)}
                                    className="px-5 py-2.5 bg-panelBg/10 hover:bg-panelBg/20 text-textMain rounded-xl font-bold font-outfit transition-colors flex items-center gap-2 shadow-lg border border-border-color/10"
                                >
                                    <Sparkles size={16} className="text-accentGlow" />
                                    Try Auto-Extract
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-20">
                    {/* Left Column: Output Display */}
                    <div className="lg:col-span-8 flex flex-col gap-6 order-2 lg:order-1">
                        {reportResult ? (
                            <div className="glass-panel rounded-2xl border border-border-color/10 bg-panelBg/20 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-4 duration-300">
                                {/* Report Header */}
                                <div className="bg-gradient-to-r from-accentGlow/10 to-transparent border-b border-border-color/10 p-5 shrink-0 flex items-center justify-between">
                                    <div>
                                        <h3 className="text-xl font-outfit font-bold text-textMain flex items-center gap-2">
                                            <Sparkles className="text-accentGlow" size={20} />
                                            Deep Research Report
                                        </h3>
                                        <div className="text-xs text-textSec/80 font-medium mt-1 uppercase tracking-widest">
                                            Generated {new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} • {reportResult.sources?.length || 0} Sources
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={handleDownloadDeepReport}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-panelBg/10 hover:bg-panelBg/20 text-textSec hover:text-textMain rounded-lg border border-border-color/10 transition-colors text-xs font-bold"
                                            title="Download Markdown"
                                        >
                                            <Download size={14} />
                                            Export
                                        </button>
                                        <button 
                                            onClick={() => setReportResult(null)}
                                            className="flex items-center justify-center p-2 bg-danger/10 hover:bg-danger/20 text-danger rounded-lg border border-danger/20 transition-colors"
                                            title="Close Report"
                                        >
                                            <XCircle size={16} />
                                        </button>
                                    </div>
                                </div>

                                {/* Report Body */}
                                <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                                    <div className="relative">
                                        <div className="absolute top-0 left-0 w-32 h-32 bg-accentGlow/10 rounded-full blur-[60px] -z-10 pointer-events-none"></div>
                                        <div className={`prose ${theme === 'dark' ? 'prose-invert' : ''} max-w-none
                                            prose-headings:font-outfit prose-headings:text-textMain prose-headings:tracking-tight
                                            prose-h1:text-2xl prose-h1:font-bold prose-h1:mb-4 prose-h1:mt-6 prose-h1:border-b prose-border-color/10 prose-h1:pb-3
                                            prose-h2:text-xl prose-h2:font-bold prose-h2:mb-3 prose-h2:mt-6
                                            prose-h3:text-lg prose-h3:font-semibold prose-h3:mb-2 prose-h3:mt-5
                                            prose-p:text-textSec/90 prose-p:leading-[1.8] prose-p:mb-4
                                            prose-strong:text-textMain prose-strong:font-bold
                                            prose-em:text-accentGlow/80
                                            prose-a:text-accentGlow prose-a:no-underline hover:prose-a:underline
                                            prose-ul:my-3 prose-ul:space-y-1
                                            prose-ol:my-3 prose-ol:space-y-1
                                            prose-li:text-textSec/90 prose-li:leading-relaxed prose-li:marker:text-accentGlow/60
                                            prose-blockquote:border-accentGlow/30 prose-blockquote:bg-accentGlow/5 prose-blockquote:rounded-r-lg prose-blockquote:py-1 prose-blockquote:px-4
                                            prose-code:text-accentGlow prose-code:bg-panelBg/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
                                            prose-hr:border-border-color/10 prose-hr:my-6
                                        `}>
                                            <ReactMarkdown>{reportResult.report}</ReactMarkdown>
                                        </div>
                                    </div>

                                    {reportResult.sources && reportResult.sources.length > 0 && (
                                        <div className="mt-8 pt-6 border-t border-border-color/10">
                                            <h4 className="text-sm font-bold text-textMain mb-4 flex items-center gap-2 uppercase tracking-wide">
                                                <FileText size={16} className="text-accentGlow" />
                                                Sources Referenced
                                            </h4>
                                            <div className="flex flex-wrap gap-2">
                                                {reportResult.sources.map((src: any, sIdx: number) => (
                                                    <div key={sIdx} className="inline-flex items-center gap-2 px-3 py-1.5 bg-panelBg/10 hover:bg-panelBg/20 rounded-lg border border-border-color/10 transition-colors">
                                                        <FileText size={12} className="text-accentGlow" />
                                                        <span className="text-xs text-textMain font-medium" title={src.filename}>{src.filename}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="h-[400px] border border-dashed border-border-color/10 rounded-2xl flex flex-col items-center justify-center p-12 text-center text-textSec bg-panelBg/10">
                                <Sparkles size={64} className="opacity-20 mb-6" />
                                <h3 className="text-xl font-bold text-textMain mb-2 font-outfit">Deep Research Report</h3>
                                <p className="max-w-md text-sm leading-relaxed">
                                    Provide a detailed prompt summarizing what you want to research. The AI will ingest a massive context from your target folder and author an extensive, multi-page report.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Right Column: Input prompt */}
                    <div className="lg:col-span-4 flex flex-col gap-4 order-1 lg:order-2">
                        <div className="glass-panel p-6 rounded-2xl border border-border-color/10 bg-panelBg/40 shadow-lg sticky top-6">
                            <h3 className="font-outfit font-bold text-textMain text-lg mb-4 flex items-center gap-2">
                                <Sparkles size={18} className="text-accentGlow" />
                                Report Guidelines
                            </h3>
                            <textarea
                                value={reportPrompt}
                                onChange={(e) => setReportPrompt(e.target.value)}
                                placeholder="E.g., Analyze all Q3 revenue reports and draft a comprehensive performance review comparing them to Q2. Highlight key growth areas and risk factors..."
                                className="w-full h-48 bg-black/50 border border-white/10 rounded-xl p-4 text-white text-sm placeholder:text-textSec/50 outline-none focus:border-accentGlow/50 resize-none transition-colors custom-scrollbar"
                            />
                            <button
                                onClick={handleGenerateReport}
                                disabled={reportLoading || !reportPrompt.trim()}
                                className="w-full mt-4 flex items-center justify-center gap-2 px-6 py-3 bg-accentGlow text-white rounded-xl font-bold font-outfit shadow-[0_0_20px_rgba(59,130,246,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed uppercase tracking-wider text-sm"
                            >
                                {reportLoading ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        Gathering Context & Writing...
                                    </>
                                ) : (
                                    'Generate Research Report'
                                )}
                            </button>
                        </div>

                        {/* Report History */}
                        {deepReportHistory.length > 0 && !reportResult && (
                            <div className="glass-panel p-6 rounded-2xl border border-border-color/10 bg-panelBg/20">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-outfit font-bold text-textMain text-sm tracking-wide">Recent Reports</h3>
                                    <button
                                        onClick={() => {
                                            setDeepReportHistory([]);
                                            localStorage.removeItem('nexus_deep_reports_history');
                                        }}
                                        className="text-[10px] uppercase tracking-wider font-bold text-textSec hover:text-danger flex items-center gap-1 transition-colors"
                                    >
                                        <XCircle size={12} />
                                        Clear All
                                    </button>
                                </div>
                                <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                                    {deepReportHistory.map((hist, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setReportResult(hist.report)}
                                            className="w-full text-left p-3 rounded-xl bg-panelBg/10 hover:bg-panelBg/20 border border-border-color/5 hover:border-accentGlow/30 transition-all flex items-center justify-between group"
                                        >
                                            <div className="overflow-hidden">
                                                <div className="text-xs font-bold text-textMain mb-0.5 font-outfit">{new Date(hist.date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>
                                                <div className="text-[11px] text-textSec font-medium truncate max-w-[220px]">
                                                    {hist.prompt}
                                                </div>
                                            </div>
                                            <ChevronRight size={16} className="text-textSec group-hover:text-accentGlow transition-colors shrink-0" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Extractor Modal */}
            <AnimatePresence>
                {showExtractorModal && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[1000] p-4">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="glass-panel w-full max-w-[480px] p-6 md:p-8 flex flex-col gap-6 relative overflow-hidden shadow-2xl max-h-[85vh]"
                        >
                            <div className="absolute top-0 right-0 w-64 h-64 bg-accentGlow/10 rounded-full blur-[80px] -z-10 pointer-events-none"></div>

                            <div className="flex items-center justify-between shrink-0">
                                <div>
                                    <h3 className="text-2xl font-outfit font-bold text-white flex items-center gap-3">
                                        <Sparkles size={28} className="text-accentGlow drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                                        Extract Checklist
                                    </h3>
                                    <p className="text-sm font-medium text-textSec/90 mt-1">
                                        Select a document to automatically extract requirements from it.
                                    </p>
                                </div>
                                <button 
                                    onClick={() => setShowExtractorModal(false)}
                                    className="p-2 border border-white/5 hover:bg-white/10 rounded-lg text-textSec transition-colors"
                                >
                                    <XCircle size={20} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar pr-2 flex flex-col gap-2">
                                {allDocuments.length === 0 ? (
                                    <div className="text-center p-8 bg-white/5 rounded-xl border border-white/10">
                                        <FileText size={48} className="mx-auto text-white/20 mb-3" />
                                        <p className="text-sm font-medium text-textSec">No documents in your Knowledge Base.</p>
                                    </div>
                                ) : (
                                    allDocuments.map((doc) => (
                                        <div 
                                            key={doc.document_id}
                                            className="group flex flex-col bg-black/40 border border-white/5 hover:border-accentGlow/30 rounded-xl p-3 transition-all cursor-pointer"
                                            onClick={() => handleExtractChecklist(doc.document_id)}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div className="w-10 h-10 rounded-lg bg-accentGlow/10 flex items-center justify-center shrink-0">
                                                        <FileText size={18} className="text-accentGlow" />
                                                    </div>
                                                    <div className="truncate">
                                                        <h4 className="text-sm font-bold text-white truncate break-words" title={doc.filename}>{doc.filename}</h4>
                                                        <p className="text-[10px] text-textSec uppercase font-semibold mt-0.5 tracking-wider">
                                                            {doc.file_type || 'TXT'} • {doc.chunk_count} CHUNKS
                                                        </p>
                                                    </div>
                                                </div>
                                                
                                                <button 
                                                    className="w-8 h-8 rounded-lg bg-white/5 group-hover:bg-accentGlow/20 flex items-center justify-center shrink-0 group-hover:text-accentGlow transition-colors disabled:opacity-50"
                                                    disabled={extractingId === doc.document_id}
                                                >
                                                    {extractingId === doc.document_id ? <Loader2 size={16} className="animate-spin" /> : <ChevronRight size={16} />}
                                                </button>
                                            </div>
                                            {extractingId === doc.document_id && (
                                                <div className="mt-3 bg-accentGlow/5 rounded-md p-2 flex items-center gap-2 border border-accentGlow/20 justify-center">
                                                    <span className="text-xs font-bold text-accentGlow animate-pulse">
                                                        Agents are reading and extracting requirements...
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default DeepResearch;
