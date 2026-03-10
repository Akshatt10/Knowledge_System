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
            // Sequential ingestion progress simulation
            let completed = 0;
            for (const file of fileList) {
                setBatchCurrent(completed + 1);
                setCurrentFileName(file.name);
                setUploadProgress(10);

                // Simulate progress for current file
                const interval = setInterval(() => {
                    setUploadProgress(prev => prev < 90 ? prev + 15 : prev);
                }, 400);

                // We send all files at once, but backend processes them sequentially
                // For a truly granular progress we would send them one by one, 
                // but let's stick to the multi-part list for efficiency.
                if (completed === 0) {
                    await documentService.upload(formData);
                }

                clearInterval(interval);
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
            setError(err.response?.data?.detail || 'Bulk upload failed');
            setUploading(false);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to delete ${name}?`)) return;
        try {
            await documentService.delete(id);
            loadData();
        } catch (err) {
            alert('Delete failed');
        }
    };

    return (
        <div style={{ flex: 1, padding: '40px', overflowY: 'auto' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                    <div>
                        <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Knowledge Base</h1>
                        <p style={{ color: 'var(--text-secondary)' }}>Securely ingest and manage your research documents.</p>
                    </div>
                    <button
                        onClick={loadData}
                        className="glass-panel"
                        style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--panel-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        Refresh Library
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                    <div className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', height: 'fit-content' }}>
                        <h3 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <CloudUpload size={20} color="var(--accent-glow)" /> Ingest Documents
                        </h3>

                        {!uploading ? (
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    if (e.dataTransfer.files.length > 0) handleFileUploads(e.dataTransfer.files);
                                }}
                                style={{
                                    border: '2px dashed var(--panel-border)', borderRadius: 'var(--radius-md)',
                                    padding: '48px', textAlign: 'center', cursor: 'pointer',
                                    transition: '0.3s', background: 'rgba(0,0,0,0.1)'
                                }}
                            >
                                <CloudUpload size={48} color="var(--text-secondary)" style={{ marginBottom: '16px' }} />
                                <h4 style={{ marginBottom: '8px' }}>Drag & Drop Files</h4>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                    Supports multiple PDF, TXT, DOCX, JSON files
                                </p>
                                <input
                                    type="file" ref={fileInputRef} hidden accept=".pdf,.txt,.docx,.json" multiple
                                    onChange={(e) => e.target.files && handleFileUploads(e.target.files)}
                                />
                            </div>
                        ) : (
                            <div style={{ padding: '40px', textAlign: 'center' }}>
                                <Loader2 size={48} className="animate-spin" color="var(--accent-glow)" style={{ marginBottom: '20px' }} />
                                <h4 style={{ marginBottom: '8px' }}>
                                    Ingesting File {batchCurrent} of {batchTotal}
                                </h4>
                                <p style={{ fontSize: '0.85rem', opacity: 0.7, marginBottom: '24px' }}>
                                    {currentFileName}
                                </p>
                                <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${uploadProgress}%` }}
                                        style={{ height: '100%', background: 'var(--accent-gradient)' }}
                                    />
                                </div>
                                <p style={{ marginTop: '12px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                    Building semantic embeddings...
                                </p>
                            </div>
                        )}

                        {error && (
                            <div style={{ marginTop: '20px', padding: '12px', background: 'rgba(255, 77, 77, 0.1)', color: 'var(--danger)', borderRadius: 'var(--radius-sm)', display: 'flex', gap: '8px', fontSize: '0.9rem' }}>
                                <AlertCircle size={18} /> {error}
                            </div>
                        )}
                    </div>

                    <div className="glass-panel" style={{ padding: '32px', minHeight: '400px', maxHeight: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <FileText size={20} color="var(--accent-glow)" /> Knowledge Library
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', flex: 1, paddingRight: '12px' }}>
                            {documents.length === 0 && !loading ? (
                                <div style={{ textAlign: 'center', padding: '100px 0', opacity: 0.5 }}>
                                    No documents in library.
                                </div>
                            ) : (
                                documents.map(doc => (
                                    <motion.div
                                        key={doc.document_id}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="glass-panel"
                                        style={{
                                            background: 'rgba(0,0,0,0.2)', padding: '16px',
                                            display: 'flex', flexDirection: 'column', gap: '12px'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                                <div style={{ padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px' }}>
                                                    <FileText size={20} color="var(--text-secondary)" />
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: '600', fontSize: '0.95rem' }}>{doc.filename}</div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                                        {doc.chunk_count} semantic chunks • Indexed {new Date(doc.uploaded_at).toLocaleDateString()}
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleDelete(doc.document_id, doc.filename)}
                                                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: '8px', transition: '0.3s' }}
                                                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--danger)')}
                                                onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                        <div style={{ display: 'flex', width: '100%', gap: '8px', marginTop: '16px' }}>
                                            <button
                                                onClick={() => handleCreateRoom(doc)}
                                                style={{
                                                    flex: 1,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    padding: '10px 16px',
                                                    background: 'rgba(59, 130, 246, 0.2)',
                                                    color: '#60a5fa',
                                                    borderRadius: '8px',
                                                    fontSize: '0.875rem',
                                                    fontWeight: '500',
                                                    border: '1px solid rgba(59, 130, 246, 0.3)',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.3)';
                                                    e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.5)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)';
                                                    e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.3)';
                                                }}
                                                title="Create Multiplayer Room"
                                            >
                                                <Users size={16} style={{ marginRight: '8px' }} />
                                                Create Multiplayer Room
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
