import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { connectorService } from '../services/api';
import {
    Trash2,
    ExternalLink,
    CheckCircle2,
    AlertCircle,
    Loader2,
    CloudCog,
    FolderSync,
    HardDrive,
    FileText,
    Check,
    BookOpen,
    MessageSquare,
    Github,
    Sparkles
} from 'lucide-react';

interface ConnectedAccount {
    id: string;
    provider: string;
    connected_at: string;
    last_synced_at: string | null;
}

interface RemoteFile {
    id: string;
    name: string;
    mimeType: string;
    modifiedTime: string;
    size?: string;
}

interface SyncResult {
    synced_count: number;
    new_documents: string[];
    errors: string[];
}

const FILE_TYPE_LABELS: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    'text/plain': 'TXT',
    'application/json': 'JSON',
    'application/vnd.google-apps.document': 'Google Doc',
    'notion_page': 'Notion Page',
    'slack_channel': 'Slack Channel',
    'github_file': 'GitHub Doc',
};

type ActivePicker = 'google_drive' | 'notion' | 'slack' | 'github' | null;

const Connectors: React.FC = () => {
    const [searchParams] = useSearchParams();
    const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    const [remoteFiles, setRemoteFiles] = useState<RemoteFile[]>([]);
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
    const [loadingFiles, setLoadingFiles] = useState(false);
    const [activePicker, setActivePicker] = useState<ActivePicker>(null);

    const status = searchParams.get('status');

    useEffect(() => {
        if (status === 'connected' || status === 'notion_connected' || status === 'slack_connected' || status === 'github_connected') {
            const providerMap: Record<string, string> = {
                'connected': 'Google Drive',
                'notion_connected': 'Notion',
                'slack_connected': 'Slack',
                'github_connected': 'GitHub',
            };
            setSuccessMsg(`${providerMap[status] || 'Provider'} connected successfully!`);
            setTimeout(() => setSuccessMsg(null), 5000);
        }
        fetchConnections();
    }, [status]);

    const fetchConnections = async () => {
        try {
            const res = await connectorService.listConnections();
            setAccounts(res.data.accounts);
        } catch {
            setError('Failed to load connections.');
        } finally {
            setLoading(false);
        }
    };

    const handleConnect = async (provider: 'google' | 'notion' | 'slack' | 'github') => {
        try {
            let res;
            switch (provider) {
                case 'google': res = await connectorService.getGoogleAuthUrl(); break;
                case 'notion': res = await connectorService.getNotionAuthUrl(); break;
                case 'slack': res = await connectorService.getSlackAuthUrl(); break;
                case 'github': res = await connectorService.getGitHubAuthUrl(); break;
            }
            window.location.href = res.data.auth_url;
        } catch {
            const labels: Record<string, string> = { google: 'Google', notion: 'Notion', slack: 'Slack', github: 'GitHub' };
            setError(`Failed to start ${labels[provider]} authentication.`);
        }
    };

    const handleBrowseFiles = async (provider: ActivePicker) => {
        setActivePicker(provider);
        setLoadingFiles(true);
        setRemoteFiles([]);
        setError(null);
        setSyncResult(null);
        try {
            let res;
            switch (provider) {
                case 'google_drive': res = await connectorService.listDriveFiles(); break;
                case 'notion': res = await connectorService.listNotionPages(); break;
                case 'slack': res = await connectorService.listSlackChannels(); break;
                case 'github': res = await connectorService.listGitHubFiles(); break;
                default: return;
            }
            setRemoteFiles(res.data.files);
            setSelectedFiles(new Set());
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to load files.');
            setActivePicker(null);
        } finally {
            setLoadingFiles(false);
        }
    };

    const toggleFile = (fileId: string) => {
        setSelectedFiles(prev => {
            const next = new Set(prev);
            if (next.has(fileId)) next.delete(fileId);
            else next.add(fileId);
            return next;
        });
    };

    const toggleAll = () => {
        if (selectedFiles.size === remoteFiles.length) {
            setSelectedFiles(new Set());
        } else {
            setSelectedFiles(new Set(remoteFiles.map(f => f.id)));
        }
    };

    const handleSyncSelected = async () => {
        if (selectedFiles.size === 0 || !activePicker) return;
        setSyncing(true);
        setSyncResult(null);
        setError(null);
        try {
            const ids = Array.from(selectedFiles);
            let res;
            switch (activePicker) {
                case 'google_drive': res = await connectorService.syncGoogle(ids); break;
                case 'notion': res = await connectorService.syncNotion(ids); break;
                case 'slack': res = await connectorService.syncSlack(ids); break;
                case 'github': res = await connectorService.syncGitHub(ids); break;
                default: return;
            }
            setSyncResult(res.data);
            setActivePicker(null);
            setSelectedFiles(new Set());
            await fetchConnections();
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Sync failed.');
        } finally {
            setSyncing(false);
        }
    };

    const handleDisconnect = async (accountId: string) => {
        try {
            await connectorService.disconnect(accountId);
            setAccounts(prev => prev.filter(a => a.id !== accountId));
            setActivePicker(null);
            setRemoteFiles([]);
            setSuccessMsg('Account disconnected.');
            setTimeout(() => setSuccessMsg(null), 3000);
        } catch {
            setError('Failed to disconnect account.');
        }
    };

    const isConnected = (provider: string) => accounts.some(a => a.provider === provider);
    const getAccount = (provider: string) => accounts.find(a => a.provider === provider);

    const renderConnectorCard = (
        provider: string,
        providerKey: 'google' | 'notion' | 'slack' | 'github',
        label: string,
        description: string,
        icon: React.ReactNode,
        iconBg: string,
    ) => {
        const connected = isConnected(provider);
        const account = getAccount(provider);
        const pickerProvider = provider as ActivePicker;

        return (
            <div className="glass-panel p-6 rounded-2xl">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
                            {icon}
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-lg font-semibold text-textMain">{label}</h3>
                                {provider === 'google_drive' && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase tracking-tighter font-bold flex items-center gap-1">
                                        <Sparkles size={10} /> Beta
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-textSec leading-tight sm:max-w-xs">{description}</p>
                        </div>
                    </div>

                    {connected ? (
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-success bg-success/10 px-4 py-2 rounded-full border border-success/20 w-full sm:w-auto justify-center">
                            <CheckCircle2 size={16} />
                            Connected
                        </span>
                    ) : (
                        <button
                            onClick={() => handleConnect(providerKey)}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-accent-gradient text-white text-sm font-semibold shadow-glow hover:opacity-90 transition-all w-full sm:w-auto justify-center"
                        >
                            <ExternalLink size={18} />
                            Connect Account
                        </button>
                    )}
                </div>

                {connected && account && (
                    <div className="mt-4 pt-4 border-t border-border space-y-4">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-textSec">
                                Last synced:{' '}
                                <span className="text-textMain/80">
                                    {account.last_synced_at
                                        ? new Date(account.last_synced_at).toLocaleString()
                                        : 'Never'}
                                </span>
                            </span>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3">
                            <button
                                onClick={() => handleBrowseFiles(pickerProvider)}
                                disabled={loadingFiles}
                                className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accentGlow/10 text-accentGlow text-sm font-semibold hover:bg-accentGlow/20 transition-all disabled:opacity-50 justify-center"
                            >
                                {loadingFiles && activePicker === pickerProvider ? (
                                    <Loader2 size={18} className="animate-spin" />
                                ) : (
                                    <FolderSync size={18} />
                                )}
                                Browse & Sync
                            </button>

                            {provider === 'notion' && (
                                <button
                                    onClick={() => handleConnect('notion')}
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 text-textSec text-sm font-semibold hover:bg-white/10 hover:text-textMain transition-all justify-center sm:w-auto"
                                    title="Add or remove pages Nexus can access"
                                >
                                    <ExternalLink size={18} />
                                    Manage Pages
                                </button>
                            )}

                            <button
                                onClick={() => handleDisconnect(account.id)}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-danger/10 text-danger text-sm font-semibold hover:bg-danger/20 transition-all justify-center sm:w-auto"
                            >
                                <Trash2 size={18} />
                                <span className="sm:hidden">Disconnect Account</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Inlined File Picker */}
                <AnimatePresence mode="wait">
                    {activePicker === provider && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden border-t border-white/5 mt-4"
                        >
                            <div className="pt-6 space-y-4">
                                {remoteFiles.length > 0 ? (
                                    <>
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <h3 className="text-textMain text-sm font-semibold flex items-center gap-2 shrink-0">
                                                <FileText size={16} className="text-accentGlow" />
                                                Available Files ({remoteFiles.length})
                                                <button
                                                    onClick={() => handleBrowseFiles(pickerProvider)}
                                                    disabled={loadingFiles}
                                                    className="ml-2 flex items-center gap-1 text-[10px] text-textSec hover:text-accentGlow transition-colors uppercase tracking-widest font-bold"
                                                    title="Re-fetch latest pages from source"
                                                >
                                                    <FolderSync size={12} className={loadingFiles && activePicker === pickerProvider ? 'animate-spin' : ''} />
                                                    Refresh
                                                </button>
                                            </h3>
                                            <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto">
                                                <button
                                                    onClick={toggleAll}
                                                    className="text-[10px] text-textSec hover:text-textMain transition-colors uppercase tracking-widest font-bold"
                                                >
                                                    {selectedFiles.size === remoteFiles.length ? 'None' : 'All'}
                                                </button>
                                                <button
                                                    onClick={handleSyncSelected}
                                                    disabled={selectedFiles.size === 0 || syncing}
                                                    className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-accent-gradient text-white text-xs font-bold shadow-glow hover:opacity-90 transition-all disabled:opacity-40"
                                                >
                                                    {syncing ? <Loader2 size={14} className="animate-spin" /> : <FolderSync size={14} />}
                                                    Import {selectedFiles.size > 0 ? `(${selectedFiles.size})` : ''}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                                            {remoteFiles.map(file => (
                                                <button
                                                    key={file.id}
                                                    onClick={() => toggleFile(file.id)}
                                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${selectedFiles.has(file.id)
                                                        ? 'bg-accentGlow/10 border border-accentGlow/20'
                                                        : 'hover:bg-white/5 border border-transparent'
                                                        }`}
                                                >
                                                    <div className={`w-4 h-4 rounded-sm flex items-center justify-center border transition-all ${selectedFiles.has(file.id)
                                                        ? 'bg-accentGlow border-accentGlow'
                                                        : 'border-white/20'
                                                        }`}>
                                                        {selectedFiles.has(file.id) && <Check size={10} className="text-darkBg" />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-xs text-textMain truncate font-medium">{file.name}</div>
                                                        <div className="text-[0.6rem] text-textSec flex items-center gap-1.5">
                                                            <span className="opacity-60">{FILE_TYPE_LABELS[file.mimeType] || 'File'}</span>
                                                            {file.size && <span className="w-1 h-1 rounded-full bg-white/10" />}
                                                            {file.size && <span>{file.size}</span>}
                                                        </div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                ) : !loadingFiles ? (
                                    <div className="text-center py-4 text-xs text-textSec italic">
                                        No compatible documents found.
                                    </div>
                                ) : (
                                    <div className="flex justify-center py-8">
                                        <Loader2 size={24} className="animate-spin text-accentGlow opacity-50" />
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Inlined Sync Results */}
                <AnimatePresence>
                    {syncResult && activePicker === provider && (
                        <motion.div
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="mt-4 p-4 rounded-xl bg-white/5 border border-white/5"
                        >
                            <h4 className="text-xs font-bold text-textMain mb-2 flex items-center gap-1.5">
                                <CheckCircle2 size={14} className="text-success" />
                                Success: {syncResult.synced_count} Documents
                            </h4>

                            {syncResult.errors.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-white/5">
                                    {syncResult.errors.map((err, i) => (
                                        <div key={i} className="flex items-center gap-2 text-[0.65rem] text-danger">
                                            <AlertCircle size={10} />
                                            {err}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    };

    return (
        <div className="flex-1 p-4 md:p-8 overflow-y-auto w-full h-full">
            <div className="max-w-3xl mx-auto">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4">
                    <CloudCog size={32} className="text-accentGlow" />
                    <div>
                        <h1 className="text-2xl md:text-3xl font-outfit font-bold text-textMain">Connectors</h1>
                        <p className="text-textSec text-xs md:text-sm">Connect sources and browse documents for your RAG pipeline.</p>
                    </div>
                </div>

                <AnimatePresence>
                    {successMsg && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center gap-2 p-4 mb-6 rounded-xl bg-success/10 border border-success/20 text-success"
                        >
                            <CheckCircle2 size={18} />
                            <span className="text-sm font-medium">{successMsg}</span>
                        </motion.div>
                    )}
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center gap-2 p-4 mb-6 rounded-xl bg-danger/10 border border-danger/20 text-danger"
                        >
                            <AlertCircle size={18} />
                            <span className="text-sm font-medium">{error}</span>
                        </motion.div>
                    )}
                </AnimatePresence>

                {loading ? (
                    <div className="flex justify-center py-20">
                        <Loader2 size={32} className="animate-spin text-accentGlow" />
                    </div>
                ) : (
                    <div className="space-y-6">
                        {renderConnectorCard(
                            'google_drive', 'google',
                            'Google Drive',
                            'Sync PDFs, Docs, and text files from your Drive',
                            <HardDrive size={24} className="text-blue-400" />,
                            'bg-blue-500/10',
                        )}

                        {renderConnectorCard(
                            'notion', 'notion',
                            'Notion',
                            'Import pages and notes from your Notion workspace',
                            <BookOpen size={24} className="text-white/80" />,
                            'bg-white/5',
                        )}

                        {renderConnectorCard(
                            'slack', 'slack',
                            'Slack',
                            'Mine channel conversations as searchable knowledge',
                            <MessageSquare size={24} className="text-green-400" />,
                            'bg-green-500/10',
                        )}

                        {renderConnectorCard(
                            'github', 'github',
                            'GitHub',
                            'Import READMEs, docs, and markdown from repositories',
                            <Github size={24} className="text-purple-400" />,
                            'bg-purple-500/10',
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Connectors;
