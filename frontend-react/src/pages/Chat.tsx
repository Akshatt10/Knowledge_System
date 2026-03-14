import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Send,
    Sparkles,
    ChevronRight,
    FileText,
    Loader2,
    Trash2,
    Users,
    Copy,
    CheckCircle2,
    User as UserIcon,
    PlusCircle,
    FileBox,
    Video,
    VideoOff,
    Folder as FolderIcon,
    ChevronDown
} from 'lucide-react';
import VideoRoom from '../components/Video/VideoRoom';
import ReactMarkdown from 'react-markdown';
import { queryService, roomService, documentService, folderService } from '../services/api';
import { useSearchParams } from 'react-router-dom';
import { useWebSocket } from '../context/WebSocketContext';
import { useAuth } from '../context/AuthContext';

interface Message {
    role: 'user' | 'ai' | 'system';
    content: string;
    sources?: any[];
    id?: string;
    sender?: string;
}

const Chat: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const roomId = searchParams.get('room');

    const { user } = useAuth();

    const {
        connectToRoom,
        disconnect,
        messages: wsMessages,
        isConnected,
        error: wsError,
        sendMessage: sendWsMessage,
        setInitialHistory
    } = useWebSocket();

    const [localMessages, setLocalMessages] = useState<Message[]>(() => {
        const saved = sessionStorage.getItem('chat_messages');
        return saved ? JSON.parse(saved) : [
            { role: 'ai', content: "Hello! I am your advanced RAG Intelligence Agent. I can analyze documents from our secure knowledge base. What would you like to know?" }
        ];
    });
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [provider, setProvider] = useState(() => {
        return sessionStorage.getItem('chat_provider') || 'gemini';
    });
    const [history, setHistory] = useState<any[]>(() => {
        const saved = sessionStorage.getItem('chat_history');
        return saved ? JSON.parse(saved) : [];
    });
    const [copied, setCopied] = useState(false);

    const [showVault, setShowVault] = useState(false);
    const [myDocuments, setMyDocuments] = useState<any[]>([]);
    const [roomDocuments, setRoomDocuments] = useState<any[]>([]);
    const [addingDoc, setAddingDoc] = useState<string | null>(null);

    const [showRoomModal, setShowRoomModal] = useState(false);
    const [newRoomName, setNewRoomName] = useState('');
    const [activeRoomName, setActiveRoomName] = useState<string | null>(null);
    const [showVideo, setShowVideo] = useState(false);
    const [creatingRoom, setCreatingRoom] = useState(false);
    
    const [folders, setFolders] = useState<any[]>([]);
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
    const [showFolderSelector, setShowFolderSelector] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const isMultiplayer = !!roomId;
    const displayMessages = isMultiplayer ? wsMessages : localMessages as any[];

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(scrollToBottom, [displayMessages]);

    useEffect(() => {
        if (!isMultiplayer) {
            sessionStorage.setItem('chat_messages', JSON.stringify(localMessages));
            sessionStorage.setItem('chat_history', JSON.stringify(history));
            sessionStorage.setItem('chat_provider', provider);
        }
    }, [localMessages, history, provider, isMultiplayer]);

    useEffect(() => {
        let isMounted = true;

        const loadGlobalData = async () => {
            try {
                const foldersRes = await folderService.getAll();
                if (isMounted) setFolders(foldersRes.data.folders);
            } catch (err) {
                console.error("Failed to load folders", err);
            }
        };

        const initRoom = async () => {
            if (!roomId) {
                disconnect();
                return;
            }

            setLoading(true);
            try {
                const res = await roomService.getHistory(roomId);
                if (isMounted) setInitialHistory(res.data.messages);

                const roomsRes = await roomService.getUserRooms();
                const roomInfo = roomsRes.data.rooms.find((r: any) => r.id === roomId);
                if (isMounted && roomInfo) setActiveRoomName(roomInfo.name);
                
                if (isMounted) connectToRoom(roomId);
            } catch (err) {
                console.error("Failed to load room data", err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        loadGlobalData();
        initRoom();

        return () => {
            isMounted = false;
            disconnect();
        };
    }, [roomId, connectToRoom, disconnect, setInitialHistory]);

    const handleClearChat = () => {
        if (isMultiplayer) return; // Cannot clear server history from here
        const initialMessage: Message = { role: 'ai', content: "Hello! I am your advanced RAG Intelligence Agent. I can analyze documents from our secure knowledge base. What would you like to know?" };
        setLocalMessages([initialMessage]);
        setHistory([]);
        sessionStorage.removeItem('chat_messages');
        sessionStorage.removeItem('chat_history');
    };

    const handleOpenRoomModal = () => {
        setNewRoomName('');
        setShowRoomModal(true);
    };

    const handleCreateGlobalRoom = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (creatingRoom) return;

        const finalName = newRoomName.trim() || 'My Collaboration Room';
        setCreatingRoom(true);
        try {
            const res = await roomService.createRoom("", finalName);
            window.dispatchEvent(new Event('rooms-updated'));
            setSearchParams({ room: res.data.room_id });
            setShowRoomModal(false);
        } catch (err) {
            console.error("Failed to create unified room", err);
        } finally {
            setCreatingRoom(false);
        }
    };

    const handleCopyLink = () => {
        const url = window.location.href;
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const fetchVaultData = async () => {
        if (!roomId) return;
        try {
            const [myDocsRes, roomDocsRes] = await Promise.all([
                documentService.getAll(),
                roomService.getRoomDocuments(roomId)
            ]);
            setMyDocuments(myDocsRes.data.documents);
            setRoomDocuments(roomDocsRes.data.documents);
        } catch (err) {
            console.error(err);
        }
    };

    const handleShareDocument = async (docId: string) => {
        if (!roomId) return;
        setAddingDoc(docId);
        try {
            const res = await roomService.addDocumentToRoom(roomId, docId);
            if (res.data.status === 'success' || res.data.status === 'already_added') {
                // Optimistically update roomDocuments to prevent state flickers
                setRoomDocuments(prev => {
                    if (prev.some(d => d.document_id === docId)) return prev;
                    return [...prev, { document_id: docId, filename: res.data.filename }];
                });
            }
            fetchVaultData();
        } catch (err) {
            console.error("Failed to share document to room", err);
        } finally {
            setAddingDoc(null);
        }
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || loading) return;

        const question = input.trim();
        setInput('');

        // --- MULTIPLAYER MODE ROUTING ---
        if (isMultiplayer) {
            sendWsMessage(question, provider);
            return;
        }

        // --- SINGLE PLAYER LOCAL MODE ROUTING ---
        setLocalMessages(prev => [...prev, { role: 'user', content: question }]);
        setLoading(true);

        try {
            const res = await queryService.ask({
                question,
                chat_history: history,
                provider,
                folder_id: selectedFolderId
            });

            const data = res.data;
            setLocalMessages(prev => [...prev, {
                role: 'ai',
                content: data.answer,
                sources: data.sources
            }]);

            setHistory(prev => [
                ...prev,
                { role: 'user', content: question },
                { role: 'assistant', content: data.answer }
            ]);
        } catch {
            setLocalMessages(prev => [...prev, {
                role: 'ai',
                content: "⚠️ Error contacting the intelligence engine. Please check your connection or API keys."
            }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex-1 flex flex-row h-screen p-4 lg:p-6 overflow-hidden max-w-full">
            <div className="glass-panel flex-1 flex flex-col h-full overflow-hidden shadow-2xl relative z-10 w-full">
                {/* Chat Header */}
                <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-black/20 backdrop-blur-md z-20 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-success shadow-[0_0_10px_rgba(16,185,129,0.8)] animate-pulse"></div>
                        <h3 className="text-lg font-outfit font-semibold flex items-center gap-2 text-textMain">
                            Nexus Intelligence
                            {isMultiplayer && activeRoomName && (
                                <>
                                    <ChevronRight size={16} className="text-textSec" />
                                    <span className="text-accentGlow font-bold decoration-accentGlow/30 underline decoration-2 underline-offset-4">{activeRoomName}</span>
                                </>
                            )}
                        </h3>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Folder Selection for Querying */}
                        {!isMultiplayer && (
                            <div className="relative">
                                <button
                                    onClick={() => setShowFolderSelector(!showFolderSelector)}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                                        selectedFolderId 
                                        ? 'bg-accentGlow/10 border-accentGlow/30 text-accentGlow shadow-glow' 
                                        : 'bg-white/5 border-white/5 text-textSec hover:border-white/10'
                                    }`}
                                >
                                    <FolderIcon size={14} />
                                    {selectedFolderId ? folders.find(f => f.id === selectedFolderId)?.name : 'All Knowledge'}
                                    <ChevronDown size={14} className={`transition-transform ${showFolderSelector ? 'rotate-180' : ''}`} />
                                </button>
                                
                                {showFolderSelector && (
                                    <>
                                        <div className="fixed inset-0 z-20" onClick={() => setShowFolderSelector(false)}></div>
                                        <div className="absolute right-0 top-10 z-30 bg-panelBg border border-white/10 rounded-xl shadow-2xl p-2 min-w-[200px] animate-in fade-in slide-in-from-top-2 duration-200">
                                            <div className="text-[0.6rem] uppercase tracking-widest text-textSec/60 mb-2 px-3 pt-1">Target Knowledge Source</div>
                                            <button
                                                onClick={() => {
                                                    setSelectedFolderId(null);
                                                    setShowFolderSelector(false);
                                                }}
                                                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                                                    selectedFolderId === null 
                                                    ? 'bg-accentGlow/10 text-accentGlow' 
                                                    : 'text-textSec hover:bg-white/5 hover:text-textMain'
                                                }`}
                                            >
                                                Whole Knowledge Base
                                            </button>
                                            {folders.map(folder => (
                                                <button
                                                    key={folder.id}
                                                    onClick={() => {
                                                        setSelectedFolderId(folder.id);
                                                        setShowFolderSelector(false);
                                                    }}
                                                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                                                        selectedFolderId === folder.id 
                                                        ? 'bg-accentGlow/10 text-accentGlow' 
                                                        : 'text-textSec hover:bg-white/5 hover:text-textMain'
                                                    }`}
                                                >
                                                    {folder.name}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        <div className="flex items-center gap-2 bg-black/40 p-1.5 rounded-xl border border-white/5 shadow-inner">
                            <button
                                onClick={() => setProvider('openai')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 ${provider === 'openai' ? 'bg-accent-gradient text-white shadow-glow' : 'text-textSec hover:text-textMain hover:bg-white/5'}`}
                            >
                                OPENAI
                            </button>
                            <button
                                onClick={() => setProvider('gemini')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 ${provider === 'gemini' ? 'bg-accent-gradient text-white shadow-glow' : 'text-textSec hover:text-textMain hover:bg-white/5'} mr-1`}
                            >
                                GEMINI
                            </button>

                            {!isMultiplayer && (
                                <button
                                    onClick={handleOpenRoomModal}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-accentSec/10 text-accentSec border border-accentSec/20 hover:bg-accentSec/20 hover:border-accentSec/40 transition-all duration-300 ml-1"
                                >
                                    <Users size={14} /> Invite Friends
                                </button>
                            )}

                            {!isMultiplayer && (
                                <button
                                    onClick={handleClearChat}
                                    title="Clear Chat"
                                    className="text-textSec hover:text-danger p-2 rounded-lg hover:bg-danger/10 transition-colors ml-1"
                                >
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Multiplayer Status Banner */}
                {isMultiplayer && (
                    <div className="bg-accentSec/5 border-b border-accentSec/10 px-6 py-2.5 flex justify-between items-center backdrop-blur-sm z-10 shrink-0">
                        <div className={`flex items-center gap-2 text-sm font-medium ${isConnected ? 'text-success' : 'text-danger'}`}>
                            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-success shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-danger shadow-[0_0_8px_rgba(244,63,94,0.8)]'} animate-pulse`}></div>
                            <span>Collaborative Session {isConnected ? '(Live)' : '(Connecting...)'}</span>
                            {wsError && <span className="text-danger ml-2">{wsError}</span>}
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleCopyLink}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-accentSec/10 text-accentSec rounded-lg text-xs font-bold border border-accentSec/20 hover:bg-accentSec/20 transition-all"
                            >
                                {copied ? <CheckCircle2 size={14} className="text-success" /> : <Copy size={14} />}
                                {copied ? 'Copied URL' : 'Invite'}
                            </button>
                            <button
                                onClick={() => {
                                    setShowVault(!showVault);
                                    if (!showVault) fetchVaultData();
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${showVault ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 shadow-[0_0_10px_rgba(168,85,247,0.2)]' : 'bg-purple-500/10 text-purple-400 border-purple-500/20 hover:bg-purple-500/20'}`}
                            >
                                <FileBox size={14} /> Shared Vault
                            </button>
                            <button
                                onClick={() => setShowVideo(!showVideo)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all duration-500 relative group overflow-hidden ${
                                    showVideo 
                                    ? 'bg-danger/20 text-danger border-danger/30 shadow-[0_0_20px_rgba(239,68,68,0.2)]' 
                                    : 'bg-success/10 text-success border-success/20 hover:bg-success/20 hover:border-success/40'
                                }`}
                            >
                                {!showVideo && <div className="absolute inset-0 bg-success/20 animate-ping opacity-20 pointer-events-none"></div>}
                                {showVideo ? (
                                    <motion.div initial={{ rotate: 0 }} animate={{ rotate: 180 }} transition={{ duration: 0.5 }}>
                                        <VideoOff size={16} />
                                    </motion.div>
                                ) : (
                                    <Video size={16} className="group-hover:scale-110 transition-transform" />
                                )}
                                <span className="relative z-10">{showVideo ? 'End Call' : 'Join Video'}</span>
                            </button>
                            <button
                                onClick={async () => {
                                    if (roomId) {
                                        try {
                                            await roomService.leaveRoom(roomId);
                                        } catch (e) {
                                            console.error(e);
                                        }
                                    }
                                    setSearchParams({});
                                    window.dispatchEvent(new Event('rooms-updated'));
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-danger/10 text-danger rounded-lg text-xs font-bold border border-danger/20 hover:bg-danger/20 transition-all"
                            >
                                Leave
                            </button>
                        </div>
                    </div>
                )}

                {/* Messages Container */}
                <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 lg:px-12 flex flex-col gap-6 custom-scrollbar relative z-0">
                    <AnimatePresence initial={false}>
                        {displayMessages.map((msg, i) => {
                            const isUser = msg.role === 'user';
                            const isSystem = msg.role === 'system';
                            const content = msg.content;
                            const isMe = msg.sender === user?.email.split('@')[0];
                            const senderName = isUser ? (isMe ? 'You' : msg.sender) : (isSystem ? 'System' : 'Intelligence Agent');
                            const isRightSide = isUser && (!isMultiplayer || isMe);

                            if (isSystem) {
                                return (
                                    <motion.div key={msg.id || i}
                                        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                                        className="flex justify-center w-full my-2"
                                    >
                                        <div className="bg-white/5 backdrop-blur-sm px-4 py-1.5 rounded-full text-xs font-medium text-textSec border border-white/10 shadow-sm">
                                            {content}
                                        </div>
                                    </motion.div>
                                );
                            }

                            return (
                                <motion.div
                                    key={msg.id || i}
                                    initial={{ opacity: 0, y: 15 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`flex flex-col gap-2 max-w-[85%] lg:max-w-[75%] ${isRightSide ? 'self-end' : 'self-start'}`}
                                >
                                    {isMultiplayer && (
                                        <div className={`text-xs font-bold px-1 ${isRightSide ? 'self-end' : 'self-start'} ${isUser ? (isMe ? 'text-accentSec' : 'text-purple-400') : 'text-accentGlow'}`}>
                                            {senderName}
                                        </div>
                                    )}

                                    <div className={`flex gap-3 md:gap-4 ${isRightSide ? 'flex-row-reverse' : 'flex-row'}`}>
                                        <div className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center shadow-md ${!isUser ? 'bg-accentGlow/10 border border-accentGlow/30' : 'bg-white/5 border border-white/10'}`}>
                                            {!isUser ? <Sparkles size={20} className="text-accentGlow drop-shadow-glow" /> : <UserIcon size={20} className="text-textMain/80" />}
                                        </div>

                                        <div className={`group relative p-5 rounded-2xl border ${isRightSide ? 'bg-accentSec/10 border-accentSec/30 rounded-tr-sm backdrop-blur-md' : 'bg-black/40 border-white/10 rounded-tl-sm backdrop-blur-md hover:border-white/20 transition-colors'}`}>
                                            <div className="markdown-content text-[0.95rem] text-textMain/90 leading-relaxed">
                                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                                            </div>

                                            {msg.sources && msg.sources.length > 0 && (
                                                <details className="mt-5 border-t border-white/10 pt-4 cursor-pointer group/details">
                                                    <summary className="list-none text-xs text-accentGlow font-bold flex items-center gap-2 uppercase tracking-wider select-none hover:text-accentGlow/80 transition-colors">
                                                        <ChevronRight size={14} className="transition-transform group-open/details:rotate-90" />
                                                        Sources Cited ({msg.sources.length})
                                                    </summary>
                                                    <div className="flex flex-col gap-3 mt-4">
                                                        {msg.sources.map((src: any, j: number) => (
                                                            <div key={j} className="bg-black/50 p-3.5 border-l-2 border-accentGlow rounded-r-lg text-sm border-t border-b border-r border-white/5 hover:bg-black/70 transition-colors">
                                                                <div className="flex justify-between items-center mb-2">
                                                                    <strong className="flex items-center gap-2 text-textMain/80 shrink-0 min-w-0 pr-2">
                                                                        <FileText size={14} className="shrink-0 text-textSec" />
                                                                        <span className="truncate">{src.filename}</span>
                                                                    </strong>
                                                                    <span className="text-xs font-semibold px-2 py-0.5 bg-accentGlow/10 text-accentGlow rounded-md shrink-0">
                                                                        {Math.round(src.relevance_score * 100)}% Match
                                                                    </span>
                                                                </div>
                                                                <div className="text-textSec/90 italic text-[0.85rem] leading-relaxed border-t border-white/5 pt-2 mt-1">
                                                                    "{src.chunk_excerpt}"
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </details>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            )
                        })}
                    </AnimatePresence>

                    {loading && (
                        <div className="flex gap-4 max-w-[85%] self-start mt-2">
                            <div className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center bg-accentGlow/10 border border-accentGlow/30 shadow-glow">
                                <Loader2 size={20} className="text-accentGlow animate-spin" />
                            </div>
                            <div className="bg-black/40 p-4 rounded-2xl rounded-tl-sm border border-white/10 flex items-center gap-3 backdrop-blur-md">
                                <span className="text-sm font-medium text-textSec animate-pulse">Agent is researching knowledge base...</span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} className="h-4 shrink-0" />
                </div>

                {/* Chat Input Area */}
                <div className="p-4 md:p-6 border-t border-white/10 bg-black/20 backdrop-blur-xl shrink-0 z-20">
                    <form onSubmit={handleSend} className="max-w-[1000px] mx-auto relative group">
                        <div className="absolute -inset-1 bg-accent-gradient rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
                        <div className="relative flex gap-3 items-end bg-panelBg rounded-xl p-2 border border-white/10 focus-within:border-accentGlow/50 transition-colors shadow-lg">
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend(e);
                                    }
                                }}
                                disabled={isMultiplayer && !isConnected}
                                placeholder={isMultiplayer && !isConnected ? "Connecting to multiplayer room..." : isMultiplayer ? "Type @ai to ask the Agent... or just chat here" : "Query the knowledge base..."}
                                className="flex-1 bg-transparent border-none text-textMain p-3 resize-none h-14 max-h-[200px] text-[0.95rem] outline-none placeholder:text-textSec/50 custom-scrollbar disabled:opacity-50"
                            />
                            <button
                                type="submit"
                                disabled={loading || !input.trim() || (isMultiplayer && !isConnected)}
                                className="w-12 h-12 shrink-0 rounded-lg bg-accent-gradient flex items-center justify-center cursor-pointer transition-all duration-300 hover:shadow-glow disabled:opacity-50 disabled:hover:shadow-none disabled:cursor-not-allowed shrink-0"
                            >
                                <Send size={20} className="text-white ml-0.5" />
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* Expandable Document Vault Sidebar (Multiplayer Only) */}
            <AnimatePresence>
                {isMultiplayer && showVault && (
                    <motion.div
                        initial={{ width: 0, opacity: 0, marginLeft: 0 }}
                        animate={{ width: 340, opacity: 1, marginLeft: 24 }}
                        exit={{ width: 0, opacity: 0, marginLeft: 0 }}
                        className="glass-panel flex flex-col overflow-hidden shadow-2xl z-20 shrink-0 h-full border-l border-white/10 relative"
                    >
                        <div className="absolute top-0 right-0 w-48 h-48 bg-purple-500/10 rounded-full blur-[60px] -z-10 pointer-events-none"></div>

                        <div className="p-5 border-b border-white/10 bg-black/20 backdrop-blur-md">
                            <h3 className="text-lg font-outfit font-bold text-purple-400 flex items-center gap-2 drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]">
                                <FileBox size={20} /> Shared Vault
                            </h3>
                            <p className="text-xs text-textSec mt-1.5 leading-relaxed font-medium">
                                Select documents from your Knowledge Base to make them accessible to everyone in this room.
                            </p>
                        </div>
                        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 custom-scrollbar relative z-10">
                            {myDocuments.length === 0 ? (
                                <div className="text-center text-textSec text-sm mt-10 p-6 border border-white/5 rounded-2xl bg-black/20 flex flex-col items-center">
                                    <FileText size={32} className="mb-3 opacity-30" />
                                    Your personal Knowledge Base is empty. Upload files in the Knowledge Base tab first.
                                </div>
                            ) : (
                                myDocuments.map(doc => {
                                    const isAdded = roomDocuments.some(rd => rd.document_id === doc.document_id);
                                    return (
                                        <div key={doc.document_id} className={`p-4 rounded-xl border transition-all duration-300 flex flex-col gap-3 ${isAdded ? 'bg-purple-500/10 border-purple-500/30' : 'bg-black/30 border-white/5 hover:border-white/20'}`}>
                                            <div className="text-sm font-semibold text-white/90 break-words leading-tight flex items-start gap-2">
                                                <FileText size={16} className={`shrink-0 mt-0.5 ${isAdded ? 'text-purple-400' : 'text-textSec'}`} />
                                                <span>{doc.filename}</span>
                                            </div>
                                            <button
                                                onClick={() => handleShareDocument(doc.document_id)}
                                                disabled={addingDoc === doc.document_id || isAdded}
                                                className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${isAdded || addingDoc === doc.document_id
                                                    ? 'bg-success/20 text-success border border-success/30 cursor-default shadow-[inset_0_0_10px_rgba(16,185,129,0.1)]'
                                                    : 'bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 hover:border-purple-500/40 cursor-pointer shadow-[inset_0_0_10px_rgba(168,85,247,0.05)]'
                                                    }`}
                                            >
                                                {(isAdded || addingDoc === doc.document_id) ? <CheckCircle2 size={16} /> : <PlusCircle size={16} />}
                                                {addingDoc === doc.document_id ? 'Adding...' : (isAdded ? 'Shared in Room' : 'Add to Room Vault')}
                                            </button>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Create Room Modal */}
            <AnimatePresence>
                {showRoomModal && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[1000] p-4">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="glass-panel w-full max-w-[420px] p-8 flex flex-col gap-6 relative overflow-hidden shadow-2xl"
                        >
                            <div className="absolute top-0 right-0 w-48 h-48 bg-accentSec/10 rounded-full blur-[50px] -z-10"></div>

                            <h3 className="text-2xl font-outfit font-bold text-white flex items-center gap-3">
                                <Users size={28} className="text-accentSec drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                                Create Room
                            </h3>
                            <p className="text-sm font-medium text-textSec/90 leading-relaxed -mt-2">
                                Give your team's workspace a name. You can invite friends and collaborate on shared documents once inside.
                            </p>
                            <form onSubmit={handleCreateGlobalRoom} className="flex flex-col gap-6 relative z-10">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-textSec uppercase tracking-wider pl-1">Workspace Name</label>
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder="e.g. Project Phoenix"
                                        value={newRoomName}
                                        onChange={(e) => setNewRoomName(e.target.value)}
                                        className="w-full bg-black/40 border border-white/10 px-4 py-3.5 rounded-xl text-white text-[0.95rem] outline-none focus:border-accentSec/50 focus:ring-4 focus:ring-accentSec/10 transition-all placeholder:text-white/20"
                                    />
                                </div>
                                <div className="flex gap-3 justify-end pt-2 border-t border-white/10 mt-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowRoomModal(false)}
                                        className="px-5 py-2.5 rounded-xl bg-transparent border border-white/10 text-textSec hover:text-white hover:bg-white/5 font-semibold text-sm transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={creatingRoom || !newRoomName.trim()}
                                        className="px-6 py-2.5 rounded-xl bg-accentSec text-white font-bold text-sm shadow-[0_0_20px_rgba(59,130,246,0.4)] hover:shadow-[0_0_25px_rgba(59,130,246,0.6)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        {creatingRoom ? (
                                            <>
                                                <Loader2 size={16} className="animate-spin" />
                                                Creating...
                                            </>
                                        ) : (
                                            'Create Room'
                                        )}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Video Overlay */}
            {isMultiplayer && showVideo && roomId && (
                <VideoRoom 
                    roomName={roomId} 
                    onClose={() => setShowVideo(false)} 
                />
            )}
        </div>
    );
};

export default Chat;


