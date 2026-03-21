import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
    CloudUpload,
    FileText,
    Trash2,
    RefreshCw,
    Loader2,
    AlertCircle,
    Users,
    Folder as FolderIcon,
    ChevronRight,
    FolderPlus,
    Link,
    CheckCircle2,
} from 'lucide-react';
import { documentService, roomService, folderService } from '../services/api';
import { useNavigate } from 'react-router-dom';

interface Document {
    document_id: string;
    filename: string;
    chunk_count: number;
    uploaded_at: string;
    folder_id: string | null;
    summary?: string | null;
}

interface Folder {
    id: string;
    name: string;
    created_at: string;
}

const KnowledgeBase: React.FC = () => {
    const [documents, setDocuments] = useState<Document[]>([]);
    const [folders, setFolders] = useState<Folder[]>([]);
    const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [currentFileName, setCurrentFileName] = useState('');
    const [batchTotal, setBatchTotal] = useState(0);
    const [batchCurrent, setBatchCurrent] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [isSubmittingFolder, setIsSubmittingFolder] = useState(false);
    const [movingDocId, setMovingDocId] = useState<string | null>(null);
    const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());

    // URL Ingestion state
    const [urlInput, setUrlInput] = useState('');
    const [urlIngesting, setUrlIngesting] = useState(false);
    const [urlSuccess, setUrlSuccess] = useState(false);

    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            const [docsRes, foldersRes] = await Promise.all([
                documentService.getAll(),
                folderService.getAll()
            ]);
            setDocuments(docsRes.data.documents);
            setFolders(foldersRes.data.folders);
        } catch (err) {
            console.error('Failed to load data', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateFolder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newFolderName.trim() || isSubmittingFolder) return;
        
        setIsSubmittingFolder(true);
        try {
            await folderService.create(newFolderName);
            setNewFolderName('');
            setIsCreatingFolder(false);
            loadData();
        } catch (err) {
            setError("Failed to create folder");
        } finally {
            setIsSubmittingFolder(false);
        }
    };

    const handleDeleteFolder = async (id: string, name: string) => {
        if (!window.confirm(`Delete folder "${name}"? Documents will be moved to root.`)) return;
        try {
            await folderService.delete(id);
            if (activeFolderId === id) setActiveFolderId(null);
            loadData();
        } catch (err) {
            alert("Delete failed");
        }
    };

    const toggleDocSummary = (docId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedDocs(prev => {
            const next = new Set(prev);
            if (next.has(docId)) next.delete(docId);
            else next.add(docId);
            return next;
        });
    };

    const handleMoveDocument = async (docId: string, folderId: string | null) => {
        try {
            await folderService.moveDocuments([docId], folderId);
            setMovingDocId(null);
            loadData();
        } catch (err) {
            alert("Move failed");
        }
    };

    const handleCreateRoom = async (doc: Document) => {
        try {
            const res = await roomService.createRoom(doc.document_id, `${doc.filename} Room`);
            window.dispatchEvent(new Event('rooms-updated'));
            navigate(`/chat?room=${res.data.room_id}`);
        } catch (err) {
            console.error("Failed to create room", err);
            setError("Failed to create collaboration room. Try again.");
        }
    };

    useEffect(() => { loadData(); }, []);

    const handleFileUploads = async (files: FileList) => {
        const fileList = Array.from(files);
        if (fileList.length === 0) return;

        setUploading(true);
        setError(null);
        setBatchTotal(fileList.length);

        const formData = new FormData();
        fileList.forEach(file => formData.append('files', file));

        try {
            setBatchCurrent(1);
            setCurrentFileName(fileList[0].name);
            setUploadProgress(10);

            const res = await documentService.upload(formData);
            const jobs = res.data;

            let completed = 0;
            for (const job of jobs) {
                setBatchCurrent(completed + 1);
                setCurrentFileName(job.filename);
                setUploadProgress(20);

                const progressInterval = setInterval(() => {
                    setUploadProgress(prev => prev < 85 ? prev + 10 : prev);
                }, 1500);

                try {
                    const result = await documentService.pollJobUntilDone(job.job_id);
                    clearInterval(progressInterval);

                    if (result.status === 'failed') {
                        setError(`Failed to process ${job.filename}: ${result.error}`);
                    }
                } catch {
                    clearInterval(progressInterval);
                    setError(`Timed out processing ${job.filename}`);
                }

                setUploadProgress(100);
                completed++;
            }

            setTimeout(() => {
                setUploading(false);
                setUploadProgress(0);
                setBatchCurrent(0);
                setBatchTotal(0);
                loadData();
            }, 800);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Upload failed');
            setUploading(false);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!window.confirm(`Are you sure you want to delete ${name}?`)) return;
        try {
            await documentService.delete(id);
            loadData();
        } catch (err) {
            alert('Delete failed');
        }
    };

    return (
        <div className="flex-1 p-4 md:p-8 lg:p-12 overflow-y-auto relative z-10 w-full h-full">
            <div className="max-w-[1400px] mx-auto">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 mt-4 gap-6">
                    <div>
                        <h1 className="text-3xl lg:text-4xl font-outfit font-bold text-textMain mb-2 tracking-tight">Knowledge Base</h1>
                        <p className="text-textSec text-[0.95rem]">Securely ingest, manage, and collaborate on your organizational intelligence.</p>
                    </div>
                    <button
                        onClick={loadData}
                        className="glass-panel px-5 py-2.5 flex items-center gap-2 hover:bg-panelBg/20 transition-colors duration-300 text-sm font-medium border-border-color/10 w-full sm:w-auto justify-center text-textMain"
                    >
                        {loading ? <Loader2 size={16} className="animate-spin text-accentGlow" /> : <RefreshCw size={16} className="text-accentGlow" />}
                        Refresh Library
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Upload Section */}
                    <div className="glass-panel p-8 flex flex-col h-fit relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-accentGlow/5 rounded-full blur-[80px] -z-10 group-hover:bg-accentGlow/10 transition-colors duration-500 pointer-events-none"></div>

                        <h3 className="text-xl font-outfit font-semibold text-textMain mb-6 flex items-center gap-3">
                            <CloudUpload size={22} className="text-accentGlow drop-shadow-glow" />
                            Ingest Documents
                        </h3>

                        {!uploading ? (
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    if (e.dataTransfer.files.length > 0) handleFileUploads(e.dataTransfer.files);
                                }}
                                className="border-[3px] border-dashed border-border-color/20 rounded-[20px] p-8 md:p-16 text-center cursor-pointer transition-all duration-300 hover:border-accentGlow/50 hover:bg-accentGlow/5 flex flex-col items-center justify-center min-h-[280px] md:min-h-[340px]"
                            >
                                <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-panelBg/10 flex items-center justify-center mb-6 shadow-inner ring-4 ring-border-color/5">
                                    <CloudUpload size={32} className="text-textSec" />
                                </div>
                                <h4 className="text-lg font-semibold text-textMain mb-2">Drag & Drop Files</h4>
                                <p className="text-textSec text-sm">Or tap to browse</p>
                                <div className="mt-8 flex gap-2 justify-center flex-wrap">
                                    {['PDF', 'TXT', 'DOCX', 'JSON'].map(ext => (
                                        <span key={ext} className="px-3 py-1 bg-panelBg/10 border border-border-color/10 rounded-md text-[0.7rem] uppercase tracking-widest font-semibold text-textSec">
                                            {ext}
                                        </span>
                                    ))}
                                </div>
                                <input
                                    type="file" ref={fileInputRef} hidden accept=".pdf,.txt,.docx,.json" multiple
                                    onChange={(e) => e.target.files && handleFileUploads(e.target.files)}
                                />
                            </div>
                        ) : (
                            <div className="p-8 md:p-12 text-center flex flex-col items-center justify-center min-h-[280px] md:min-h-[340px] border border-border-color/10 rounded-2xl bg-panelBg/20 relative overflow-hidden">
                                <div className="absolute inset-0 bg-accent-gradient opacity-5 animate-pulse"></div>
                                <Loader2 size={48} className="animate-spin text-accentGlow mb-6 drop-shadow-glow relative z-10" />
                                <h4 className="text-lg font-semibold text-textMain mb-2 relative z-10">
                                    Ingesting File {batchCurrent} of {batchTotal}
                                </h4>
                                <p className="text-textSec text-xs md:text-sm mb-8 truncate w-full max-w-[260px] relative z-10">
                                    {currentFileName}
                                </p>
                                <div className="w-full max-w-[260px] h-2 bg-panelBg/30 rounded-full overflow-hidden shadow-inner relative z-10">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${uploadProgress}%` }}
                                        className="h-full bg-accent-gradient shadow-[0_0_10px_rgba(0,240,255,0.8)]"
                                    />
                                </div>
                            </div>
                        )}

                        {/* URL Ingestion Input */}
                        {!uploading && (
                            <div className="mt-5">
                                <form
                                    onSubmit={async (e) => {
                                        e.preventDefault();
                                        if (!urlInput.trim() || urlIngesting) return;
                                        setUrlIngesting(true);
                                        setUrlSuccess(false);
                                        setError(null);
                                        try {
                                            const res = await documentService.ingestUrl({
                                                url: urlInput.trim(),
                                                folder_id: activeFolderId,
                                            });
                                            // Poll for completion
                                            await documentService.pollJobUntilDone(res.data.job_id);
                                            setUrlInput('');
                                            setUrlSuccess(true);
                                            setTimeout(() => setUrlSuccess(false), 3000);
                                            loadData();
                                        } catch (err: any) {
                                            setError(err?.response?.data?.detail || 'Failed to ingest URL');
                                        } finally {
                                            setUrlIngesting(false);
                                        }
                                    }}
                                    className="flex gap-2 items-center"
                                >
                                    <div className="relative flex-1">
                                        <Link size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-textSec" />
                                        <input
                                            type="url"
                                            value={urlInput}
                                            onChange={(e) => setUrlInput(e.target.value)}
                                            placeholder="Paste a URL to ingest as a document..."
                                            className="w-full bg-panelBg/30 border border-border-color/10 pl-10 pr-4 py-3 rounded-xl text-sm text-textMain outline-none focus:border-accentGlow/50 focus:ring-2 focus:ring-accentGlow/10 transition-all placeholder:text-textSec/60 font-medium"
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={urlIngesting || !urlInput.trim()}
                                        className="px-5 py-3 rounded-xl bg-accent-gradient text-white text-sm font-bold whitespace-nowrap transition-all hover:shadow-glow disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        {urlIngesting ? (
                                            <><Loader2 size={16} className="animate-spin" /> Ingesting...</>
                                        ) : urlSuccess ? (
                                            <><CheckCircle2 size={16} /> Done!</>
                                        ) : (
                                            'Ingest URL'
                                        )}
                                    </button>
                                </form>
                            </div>
                        )}

                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                className="mt-6 p-4 bg-danger/10 text-danger border border-danger/20 rounded-xl flex items-start gap-3 text-sm font-medium"
                            >
                                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                                <span>{error}</span>
                            </motion.div>
                        )}
                    </div>

                    {/* Document Library Section */}
                    <div className="glass-panel p-6 md:p-8 flex flex-col h-fit lg:h-full lg:max-h-[calc(100vh-160px)] relative overflow-hidden">
                        <div className="absolute bottom-0 left-0 w-64 h-64 bg-accentSec/5 rounded-full blur-[80px] -z-10 pointer-events-none"></div>

                        <h3 className="text-xl font-outfit font-semibold text-textMain mb-6 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <FileText size={22} className="text-accentGlow drop-shadow-glow" />
                                Knowledge Library
                            </div>
                            <button 
                                onClick={() => setIsCreatingFolder(true)}
                                className="p-2 hover:bg-panelBg/10 rounded-lg text-textSec hover:text-accentGlow transition-colors"
                                title="Create New Folder"
                            >
                                <FolderPlus size={18} />
                            </button>
                        </h3>

                        {/* Folder Navigation */}
                        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 custom-scrollbar shrink-0">
                            <button
                                onClick={() => setActiveFolderId(null)}
                                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                                    activeFolderId === null 
                                    ? 'bg-accentGlow/10 border-accentGlow/30 text-accentGlow' 
                                    : 'bg-panelBg/10 border-border-color/10 text-textSec hover:bg-panelBg/20'
                                }`}
                            >
                                All Documents
                            </button>
                            {folders.map(folder => (
                                <div key={folder.id} className="relative group/folder">
                                    <button
                                        onClick={() => setActiveFolderId(folder.id)}
                                        className={`px-4 py-2 pr-10 rounded-xl text-sm font-medium transition-all border whitespace-nowrap ${
                                            activeFolderId === folder.id 
                                            ? 'bg-accentGlow/10 border-accentGlow/30 text-accentGlow' 
                                            : 'bg-panelBg/10 border-border-color/10 text-textSec hover:bg-panelBg/20'
                                        }`}
                                    >
                                        <FolderIcon size={14} className="inline mr-2 mt-[-2px]" />
                                        {folder.name}
                                    </button>
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteFolder(folder.id, folder.name);
                                        }}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 opacity-0 group-hover/folder:opacity-100 hover:text-danger hover:bg-danger/10 rounded transition-all"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* Create Folder Modal / Overlay */}
                        {isCreatingFolder && (
                            <div className="absolute inset-x-8 top-16 z-20 bg-panelBg border border-border-color/10 p-6 rounded-2xl shadow-2xl animate-in fade-in zoom-in duration-200 backdrop-blur-xl">
                                <h4 className="text-textMain font-bold mb-4 flex items-center gap-2">
                                    <FolderPlus size={18} className="text-accentGlow" />
                                    New Knowledge Container
                                </h4>
                                <form onSubmit={handleCreateFolder} className="flex gap-2">
                                    <input 
                                        autoFocus
                                        type="text" 
                                        value={newFolderName}
                                        onChange={(e) => setNewFolderName(e.target.value)}
                                        placeholder="e.g. Research Papers..."
                                        className="flex-1 bg-panelBg/20 border border-border-color/10 rounded-xl px-4 py-2.5 text-textMain outline-none focus:border-accentGlow/50 transition-all font-medium placeholder:text-textSec/40"
                                        disabled={isSubmittingFolder}
                                    />
                                    <button 
                                        type="submit" 
                                        disabled={isSubmittingFolder || !newFolderName.trim()}
                                        className="bg-accentGlow text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-glow hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {isSubmittingFolder ? <Loader2 size={16} className="animate-spin" /> : 'Create'}
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={() => setIsCreatingFolder(false)} 
                                        className="px-4 py-2 text-sm text-textSec font-semibold hover:text-textMain transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </form>
                            </div>
                        )}

                        <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar pb-4 min-h-[340px]">
                            {documents
                                .filter(doc => activeFolderId === null || doc.folder_id === activeFolderId)
                                .length === 0 && !loading ? (
                                <div className="text-center py-20 text-textSec flex flex-col items-center justify-center h-full">
                                    <div className="w-24 h-24 mb-6 rounded-full bg-panelBg/10 flex items-center justify-center">
                                        <FileText size={40} className="opacity-20" />
                                    </div>
                                    <p className="font-medium text-lg text-textMain">No documents here</p>
                                    <p className="text-sm mt-2 opacity-60 max-w-[250px]">{activeFolderId ? "This folder is empty." : "Upload documents to start."}</p>
                                </div>
                            ) : (
                                documents
                                    .filter(doc => activeFolderId === null || doc.folder_id === activeFolderId)
                                    .map((doc, idx) => (
                                    <motion.div
                                        key={doc.document_id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        className="bg-panelBg/40 border border-border-color/5 p-5 rounded-[16px] flex flex-col gap-4 hover:border-border-color/10 hover:bg-panelBg/60 transition-all group"
                                    >
                                        <div className="flex justify-between items-start w-full gap-4">
                                            <div className="flex items-start gap-4 flex-1 min-w-0">
                                                <div className="p-3 bg-panelBg/10 rounded-xl shadow-[inset_0_2px_10px_rgba(255,255,255,0.02)] group-hover:bg-accentGlow/10 group-hover:text-accentGlow transition-colors text-textSec shrink-0 border border-border-color/5">
                                                    <FileText size={24} />
                                                </div>
                                                 <div className="flex-1 min-w-0">
                                                     <div className="font-semibold text-[0.95rem] text-textMain truncate w-full" title={doc.filename}>{doc.filename}</div>
                                                     {doc.summary && (
                                                         <div className="mt-1">
                                                             <p className={`text-xs text-textSec/70 leading-relaxed transition-all duration-300 ${expandedDocs.has(doc.document_id) ? '' : 'line-clamp-2'}`}>
                                                                 {doc.summary}
                                                             </p>
                                                             <button 
                                                                 onClick={(e) => toggleDocSummary(doc.document_id, e)}
                                                                 className="text-[10px] text-accentGlow/70 hover:text-accentGlow font-semibold mt-1 transition-colors flex items-center gap-1"
                                                             >
                                                                 {expandedDocs.has(doc.document_id) ? 'Show less' : 'Read more'}
                                                             </button>
                                                         </div>
                                                     )}
                                                     <div className="text-xs text-textSec mt-2 flex items-center gap-2 flex-wrap">
                                                        <span className="px-2 py-0.5 bg-panelBg/20 rounded-md font-bold text-textMain/80 border border-border-color/5">{doc.chunk_count} chunks</span>
                                                        <span className="opacity-30">•</span>
                                                        <span className="opacity-70">{new Date(doc.uploaded_at).toLocaleDateString()}</span>
                                                        <span className="opacity-30">•</span>
                                                        <div className="relative">
                                                            <button 
                                                                onClick={() => setMovingDocId(movingDocId === doc.document_id ? null : doc.document_id)}
                                                                className="flex items-center gap-1 hover:text-accentGlow transition-colors"
                                                            >
                                                                <FolderIcon size={12} />
                                                                {folders.find(f => f.id === doc.folder_id)?.name || 'Root'}
                                                                <ChevronRight size={10} className={`transform transition-transform ${movingDocId === doc.document_id ? 'rotate-90' : ''}`} />
                                                            </button>
                                                            
                                                            {movingDocId === doc.document_id && (
                                                                <div className="absolute left-0 top-6 z-30 bg-panelBg border border-border-color/10 rounded-lg shadow-xl p-2 min-w-[140px] animate-in fade-in slide-in-from-top-2 duration-150 backdrop-blur-xl">
                                                                    <div className="text-[0.6rem] uppercase tracking-widest text-textSec/50 mb-2 px-2 font-bold">Move to</div>
                                                                    <button 
                                                                        onClick={() => handleMoveDocument(doc.document_id, null)}
                                                                        className="w-full text-left px-3 py-1.5 hover:bg-panelBg/20 rounded text-xs text-textSec hover:text-textMain transition-all"
                                                                    >
                                                                        All Documents (Root)
                                                                    </button>
                                                                    {folders.filter(f => f.id !== doc.folder_id).map(f => (
                                                                        <button 
                                                                            key={f.id}
                                                                            onClick={() => handleMoveDocument(doc.document_id, f.id)}
                                                                            className="w-full text-left px-3 py-1.5 hover:bg-panelBg/20 rounded text-xs text-textSec hover:text-textMain transition-all"
                                                                        >
                                                                            {f.name}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleDelete(doc.document_id, doc.filename)}
                                                className="p-2 text-textSec/50 hover:text-danger hover:bg-danger/10 rounded-lg transition-colors shrink-0"
                                                title="Delete Document"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                        <div className="w-full pt-1">
                                            <button
                                                onClick={() => handleCreateRoom(doc)}
                                                className="w-full flex items-center justify-center gap-2 py-3 bg-accentGlow/10 text-accentGlow border border-accentGlow/20 hover:bg-accentGlow/20 hover:border-accentGlow/40 rounded-xl text-sm font-semibold transition-all shadow-[inset_0_0_15px_rgba(0,240,255,0.05)]"
                                                title="Create Multiplayer Room"
                                            >
                                                <Users size={16} />
                                                Launch Collaboration Room
                                            </button>
                                        </div>
                                    </motion.div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default KnowledgeBase;
