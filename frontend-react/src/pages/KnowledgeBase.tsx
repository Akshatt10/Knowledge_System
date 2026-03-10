import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
    CloudUpload,
    FileText,
    Trash2,
    RefreshCw,
    Loader2,
    AlertCircle,
    Users
} from 'lucide-react';
import { documentService, roomService } from '../services/api';
import { useNavigate } from 'react-router-dom';

interface Document {
    document_id: string;
    filename: string;
    chunk_count: number;
    uploaded_at: string;
}

const KnowledgeBase: React.FC = () => {
    const [documents, setDocuments] = useState<Document[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [currentFileName, setCurrentFileName] = useState('');
    const [batchTotal, setBatchTotal] = useState(0);
    const [batchCurrent, setBatchCurrent] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            const res = await documentService.getAll();
            setDocuments(res.data.documents);
        } catch (err) {
            console.error('Failed to load documents', err);
        } finally {
            setLoading(false);
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
            // Upload returns instantly with job IDs
            setBatchCurrent(1);
            setCurrentFileName(fileList[0].name);
            setUploadProgress(10);

            const res = await documentService.upload(formData);
            const jobs = res.data; // Array of { job_id, filename, status }

            // Poll each job until done
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
        <div className="flex-1 p-8 lg:p-12 overflow-y-auto relative z-10 w-full h-full">
            <div className="max-w-[1400px] mx-auto">
                <div className="flex justify-between items-center mb-10 mt-4">
                    <div>
                        <h1 className="text-3xl lg:text-4xl font-outfit font-bold text-white mb-2 tracking-tight">Knowledge Base</h1>
                        <p className="text-textSec text-[0.95rem]">Securely ingest, manage, and collaborate on your organizational intelligence.</p>
                    </div>
                    <button
                        onClick={loadData}
                        className="glass-panel px-5 py-2.5 flex items-center gap-2 hover:bg-white/10 transition-colors duration-300 text-sm font-medium border-white/20 hover:border-white/30"
                    >
                        {loading ? <Loader2 size={16} className="animate-spin text-accentGlow" /> : <RefreshCw size={16} className="text-accentGlow" />}
                        Refresh Library
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Upload Section */}
                    <div className="glass-panel p-8 flex flex-col h-fit relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-accentGlow/5 rounded-full blur-[80px] -z-10 group-hover:bg-accentGlow/10 transition-colors duration-500 pointer-events-none"></div>

                        <h3 className="text-xl font-outfit font-semibold text-white mb-6 flex items-center gap-3">
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
                                className="border-[3px] border-dashed border-white/20 rounded-[20px] p-16 text-center cursor-pointer transition-all duration-300 hover:border-accentGlow/50 hover:bg-accentGlow/5 flex flex-col items-center justify-center min-h-[340px]"
                            >
                                <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6 shadow-inner ring-4 ring-white/5">
                                    <CloudUpload size={36} className="text-textSec" />
                                </div>
                                <h4 className="text-lg font-semibold text-white mb-2">Drag & Drop Files Here</h4>
                                <p className="text-textSec text-sm">Or click to browse from your computer</p>
                                <div className="mt-8 flex gap-2 justify-center flex-wrap">
                                    {['PDF', 'TXT', 'DOCX', 'JSON'].map(ext => (
                                        <span key={ext} className="px-3 py-1 bg-white/5 border border-white/10 rounded-md text-[0.7rem] uppercase tracking-widest font-semibold text-white/50">
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
                            <div className="p-12 text-center flex flex-col items-center justify-center min-h-[340px] border border-white/5 rounded-2xl bg-black/20 relative overflow-hidden">
                                <div className="absolute inset-0 bg-accent-gradient opacity-5 animate-pulse"></div>
                                <Loader2 size={56} className="animate-spin text-accentGlow mb-6 drop-shadow-glow relative z-10" />
                                <h4 className="text-lg font-semibold text-white mb-2 relative z-10">
                                    Ingesting File {batchCurrent} of {batchTotal}
                                </h4>
                                <p className="text-textSec text-sm mb-8 truncate w-full max-w-[300px] relative z-10">
                                    {currentFileName}
                                </p>
                                <div className="w-full max-w-[300px] h-2.5 bg-white/10 rounded-full overflow-hidden shadow-inner relative z-10">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${uploadProgress}%` }}
                                        className="h-full bg-accent-gradient shadow-[0_0_10px_rgba(0,240,255,0.8)]"
                                    />
                                </div>
                                <p className="mt-6 text-accentGlow/80 text-xs font-semibold uppercase tracking-widest animate-pulse relative z-10">
                                    Building Semantic Embeddings...
                                </p>
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
                    <div className="glass-panel p-8 flex flex-col h-fit lg:h-full lg:max-h-[calc(100vh-160px)] relative overflow-hidden">
                        <div className="absolute bottom-0 left-0 w-64 h-64 bg-accentSec/5 rounded-full blur-[80px] -z-10 pointer-events-none"></div>

                        <h3 className="text-xl font-outfit font-semibold text-white mb-6 flex items-center gap-3 shrink-0">
                            <FileText size={22} className="text-accentGlow drop-shadow-glow" />
                            Knowledge Library
                        </h3>

                        <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar pb-4 min-h-[340px]">
                            {documents.length === 0 && !loading ? (
                                <div className="text-center py-20 text-textSec flex flex-col items-center justify-center h-full">
                                    <div className="w-24 h-24 mb-6 rounded-full bg-white/5 flex items-center justify-center">
                                        <FileText size={40} className="opacity-20" />
                                    </div>
                                    <p className="font-medium text-lg text-white">Your library is empty</p>
                                    <p className="text-sm mt-2 opacity-60 max-w-[250px]">Upload documents on the left to start collaborating with AI.</p>
                                </div>
                            ) : (
                                documents.map((doc, idx) => (
                                    <motion.div
                                        key={doc.document_id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        className="bg-black/40 border border-white/5 p-5 rounded-[16px] flex flex-col gap-4 hover:border-white/10 hover:bg-black/60 transition-colors group"
                                    >
                                        <div className="flex justify-between items-start w-full gap-4">
                                            <div className="flex items-start gap-4 flex-1 min-w-0">
                                                <div className="p-3 bg-white/5 rounded-xl shadow-[inset_0_2px_10px_rgba(255,255,255,0.02)] group-hover:bg-accentGlow/10 group-hover:text-accentGlow transition-colors text-textSec shrink-0">
                                                    <FileText size={24} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-semibold text-[0.95rem] text-white truncate w-full" title={doc.filename}>{doc.filename}</div>
                                                    <div className="text-xs text-textSec mt-2 flex items-center gap-2 flex-wrap">
                                                        <span className="px-2 py-0.5 bg-white/10 rounded-md font-medium text-white/70">{doc.chunk_count} chunks</span>
                                                        <span className="opacity-30">•</span>
                                                        <span className="opacity-70">{new Date(doc.uploaded_at).toLocaleDateString()}</span>
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
