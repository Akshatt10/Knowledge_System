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
    FileBox
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { queryService, roomService, documentService } from '../services/api';
import { useSearchParams } from 'react-router-dom';
import { useWebSocket } from '../context/WebSocketContext';
import { useAuth } from '../context/AuthContext';

interface Message {
    role: 'user' | 'ai';
    content: string;
    sources?: any[];
}

const Chat: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const roomId = searchParams.get('room');

    // Auth context (used for mapping our own username in multiplayer)
    const { user } = useAuth();

    // WebSocket Context hook
    const {
        connectToRoom,
        disconnect,
        messages: wsMessages,
        isConnected,
        error: wsError,
        sendMessage: sendWsMessage,
        setInitialHistory
    } = useWebSocket();

    // --- LOCAL STATE (Single Player Mode) ---
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

    // Document Vault State
    const [showVault, setShowVault] = useState(false);
    const [myDocuments, setMyDocuments] = useState<any[]>([]);
    const [roomDocuments, setRoomDocuments] = useState<any[]>([]);
    const [addingDoc, setAddingDoc] = useState<string | null>(null);

    const [showRoomModal, setShowRoomModal] = useState(false);
    const [newRoomName, setNewRoomName] = useState('');
    const [activeRoomName, setActiveRoomName] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Dynamic resolution based on mode
    const isMultiplayer = !!roomId;
    const displayMessages = isMultiplayer ? wsMessages : localMessages as any[];

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(scrollToBottom, [displayMessages]);

    // Local Storage Effects (Only save if NOT in multiplayer)
    useEffect(() => {
        if (!isMultiplayer) {
            sessionStorage.setItem('chat_messages', JSON.stringify(localMessages));
            sessionStorage.setItem('chat_history', JSON.stringify(history));
            sessionStorage.setItem('chat_provider', provider);
        }
    }, [localMessages, history, provider, isMultiplayer]);

    // WebSocket Mounting Logic
    useEffect(() => {
        let isMounted = true;

        if (!roomId) {
            disconnect();
            return;
        }

        const initRoom = async () => {
            setLoading(true);
            try {
                // Fetch historic persistence from Neon DB
                const res = await roomService.getHistory(roomId);
                if (isMounted) setInitialHistory(res.data.messages);

                // Fetch room name from user rooms
                const roomsRes = await roomService.getUserRooms();
                const roomInfo = roomsRes.data.rooms.find((r: any) => r.id === roomId);
                if (isMounted && roomInfo) setActiveRoomName(roomInfo.name);
            } catch (err) {
                console.error("Failed to load room data", err);
            } finally {
                if (isMounted) {
                    setLoading(false);
                    // Connect to socket stream
                    connectToRoom(roomId);
                }
            }
        };

        initRoom();

        return () => {
            isMounted = false;
            disconnect();
        };
    }, [roomId]);

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
        const finalName = newRoomName.trim() || 'My Collaboration Room';
        try {
            const res = await roomService.createRoom("", finalName);
            window.dispatchEvent(new Event('rooms-updated'));
            setSearchParams({ room: res.data.room_id });
            setShowRoomModal(false);
        } catch (err) {
            console.error("Failed to create unified room", err);
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
                provider
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
        } catch (err) {
            setLocalMessages(prev => [...prev, {
                role: 'ai',
                content: "⚠️ Error contacting the intelligence engine. Please check your connection or API keys."
            }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'row', height: '100vh', padding: '20px' }}>
            <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Chat Header */}
                <div style={{
                    padding: '20px 24px', borderBottom: '1px solid var(--panel-border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 10px var(--success)' }}></div>
                        <h3 style={{ fontSize: '1.2rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            Nexus Intelligence
                            {isMultiplayer && activeRoomName && (
                                <>
                                    <ChevronRight size={16} color="var(--text-secondary)" />
                                    <span style={{ color: 'var(--accent-glow)', fontSize: '1rem' }}>{activeRoomName}</span>
                                </>
                            )}
                        </h3>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '12px', border: '1px solid var(--panel-border)' }}>
                        <button
                            onClick={() => setProvider('openai')}
                            style={{
                                padding: '6px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '600',
                                background: provider === 'openai' ? 'var(--accent-gradient)' : 'transparent',
                                color: provider === 'openai' ? '#fff' : 'var(--text-secondary)',
                                border: 'none', cursor: 'pointer', transition: 'all 0.2s'
                            }}
                        >
                            OPENAI
                        </button>
                        <button
                            onClick={() => setProvider('gemini')}
                            style={{
                                padding: '6px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '600',
                                background: provider === 'gemini' ? 'var(--accent-gradient)' : 'transparent',
                                color: provider === 'gemini' ? '#fff' : 'var(--text-secondary)',
                                border: 'none', cursor: 'pointer', transition: 'all 0.2s', marginRight: '8px'
                            }}
                        >
                            GEMINI
                        </button>

                        {!isMultiplayer && (
                            <button
                                onClick={handleOpenRoomModal}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '6px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '600',
                                    background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa',
                                    border: '1px solid rgba(59, 130, 246, 0.3)', cursor: 'pointer', transition: 'all 0.2s'
                                }}
                            >
                                <Users size={14} /> Invite Friends
                            </button>
                        )}

                        {!isMultiplayer && (
                            <button
                                onClick={handleClearChat}
                                title="Clear Chat"
                                style={{
                                    background: 'transparent', border: 'none', color: 'var(--text-secondary)',
                                    cursor: 'pointer', padding: '6px', borderRadius: '8px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'var(--transition-bounce)'
                                }}
                            >
                                <Trash2 size={18} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Multiplayer Status Banner */}
                {isMultiplayer && (
                    <div style={{
                        background: 'rgba(59, 130, 246, 0.1)', borderBottom: '1px solid rgba(59, 130, 246, 0.2)',
                        padding: '10px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#60a5fa', fontSize: '0.85rem' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isConnected ? '#10b981' : '#f43f5e', boxShadow: isConnected ? '0 0 10px rgba(16,185,129,0.5)' : '' }}></div>
                            <span style={{ fontWeight: '500' }}>Collaborative Session {isConnected ? '(Live)' : '(Connecting...)'}</span>
                            {wsError && <span style={{ color: '#f43f5e', marginLeft: '10px' }}>{wsError}</span>}
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                onClick={handleCopyLink}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                                    background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', borderRadius: '6px',
                                    fontSize: '0.8rem', fontWeight: '500', border: '1px solid rgba(59, 130, 246, 0.3)',
                                    cursor: 'pointer'
                                }}
                            >
                                {copied ? <CheckCircle2 size={14} color="#34d399" /> : <Copy size={14} />}
                                {copied ? 'Copied' : 'Invite'}
                            </button>
                            <button
                                onClick={() => {
                                    setShowVault(!showVault);
                                    if (!showVault) fetchVaultData();
                                }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                                    background: showVault ? 'rgba(168, 85, 247, 0.2)' : 'rgba(168, 85, 247, 0.1)', color: '#c084fc', borderRadius: '6px',
                                    fontSize: '0.8rem', fontWeight: '500', border: '1px solid rgba(168, 85, 247, 0.3)',
                                    cursor: 'pointer'
                                }}
                            >
                                <FileBox size={14} /> Shared Vault
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
                                }} // Exit room
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                                    background: 'rgba(244, 63, 94, 0.1)', color: '#fb7185', borderRadius: '6px',
                                    fontSize: '0.8rem', fontWeight: '500', border: '1px solid rgba(244, 63, 94, 0.2)',
                                    cursor: 'pointer'
                                }}
                            >
                                Leave
                            </button>
                        </div>
                    </div>
                )}

                {/* Messages Container */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <AnimatePresence initial={false}>
                        {displayMessages.map((msg, i) => {
                            // Unified mappings for local vs WS formats
                            const isUser = msg.role === 'user';
                            const isSystem = msg.role === 'system';
                            const content = msg.content;
                            const isMe = msg.sender === user?.email.split('@')[0];
                            const senderName = isUser ? (isMe ? 'You' : msg.sender) : (isSystem ? 'System' : 'Nexus AI');
                            const isRightSide = isUser && (!isMultiplayer || isMe);

                            if (isSystem) {
                                return (
                                    <motion.div key={msg.id || i}
                                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                        style={{ display: 'flex', justifyContent: 'center', width: '100%' }}
                                    >
                                        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '20px', fontSize: '0.8rem', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.1)' }}>
                                            {content}
                                        </div>
                                    </motion.div>
                                );
                            }

                            return (
                                <motion.div
                                    key={msg.id || i}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    style={{
                                        display: 'flex', gap: '16px', flexDirection: 'column',
                                        maxWidth: '85%', alignSelf: isRightSide ? 'flex-end' : 'flex-start',
                                    }}
                                >
                                    {isMultiplayer && (
                                        <div style={{
                                            color: isUser ? (isMe ? '#60a5fa' : '#818cf8') : '#34d399',
                                            fontWeight: '600', fontSize: '0.8rem', paddingLeft: '4px',
                                            alignSelf: isRightSide ? 'flex-end' : 'flex-start'
                                        }}>
                                            {senderName}
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', gap: '16px', flexDirection: isRightSide ? 'row-reverse' : 'row' }}>
                                        <div style={{
                                            width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            background: !isUser ? 'rgba(0, 240, 255, 0.1)' : 'rgba(255,255,255,0.1)',
                                            border: `1px solid ${!isUser ? 'rgba(0, 240, 255, 0.3)' : 'var(--panel-border)'} `
                                        }}>
                                            {!isUser ? <Sparkles size={18} color="var(--accent-glow)" /> : <UserIcon size={18} />}
                                        </div>

                                        <div style={{
                                            background: isRightSide ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.03)',
                                            padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid',
                                            borderColor: isRightSide ? 'rgba(59, 130, 246, 0.4)' : 'var(--panel-border)'
                                        }}>
                                            <div className="markdown-content" style={{ fontSize: '0.95rem', color: '#fff' }}>
                                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                                            </div>

                                            {msg.sources && msg.sources.length > 0 && (
                                                <details style={{ marginTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '12px' }}>
                                                    <summary style={{
                                                        listStyle: 'none', cursor: 'pointer', fontSize: '0.8rem',
                                                        color: 'var(--accent-glow)', fontWeight: '600', display: 'flex',
                                                        alignItems: 'center', gap: '8px'
                                                    }}>
                                                        <ChevronRight size={14} className="details-chevron" /> SOURCES CITED
                                                    </summary>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
                                                        {msg.sources.map((src: any, j: number) => (
                                                            <div key={j} style={{
                                                                background: 'rgba(0,0,0,0.3)', padding: '12px', borderLeft: '3px solid var(--accent-glow)',
                                                                borderRadius: 'var(--radius-sm)', fontSize: '0.85rem'
                                                            }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                                    <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                        <FileText size={14} /> {src.filename}
                                                                    </strong>
                                                                    <span style={{ opacity: 0.7 }}>{Math.round(src.relevance_score * 100)}% Match</span>
                                                                </div>
                                                                <div style={{ opacity: 0.8, fontStyle: 'italic', fontSize: '0.8rem' }}>"{src.chunk_excerpt}"</div>
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
                        <div style={{ display: 'flex', gap: '16px', maxWidth: '85%' }}>
                            <div style={{
                                width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: 'rgba(0, 240, 255, 0.1)', border: '1px solid rgba(0, 240, 255, 0.3)'
                            }}>
                                <Loader2 size={18} color="var(--accent-glow)" className="animate-spin" />
                            </div>
                            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Agent is researching...</span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Chat Input Area */}
                <div style={{ padding: '24px', borderTop: '1px solid var(--panel-border)' }}>
                    <form onSubmit={handleSend} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
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
                            placeholder={isMultiplayer && !isConnected ? "Connecting to multiplayer room..." : isMultiplayer ? "Type @ai to ask the Agent... or just chat here" : "Query the knowledge base... (Shift+Enter for newline)"}
                            style={{
                                flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--panel-border)',
                                borderRadius: 'var(--radius-md)', padding: '16px', color: '#fff',
                                resize: 'none', height: '56px', maxHeight: '200px', fontSize: '0.95rem',
                                opacity: (isMultiplayer && !isConnected) ? 0.5 : 1
                            }}
                        />
                        <button
                            type="submit"
                            disabled={loading || !input.trim() || (isMultiplayer && !isConnected)}
                            style={{
                                width: '56px', height: '56px', borderRadius: '16px',
                                border: 'none', background: 'var(--accent-gradient)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', transition: 'var(--transition-bounce)'
                            }}
                        >
                            <Send size={24} color="#fff" />
                        </button>
                    </form>
                </div>
            </div>

            {/* Expandable Document Vault Sidebar (Multiplayer Only) */}
            <AnimatePresence>
                {isMultiplayer && showVault && (
                    <motion.div
                        initial={{ width: 0, opacity: 0, marginLeft: 0 }}
                        animate={{ width: 320, opacity: 1, marginLeft: 20 }}
                        exit={{ width: 0, opacity: 0, marginLeft: 0 }}
                        className="glass-panel"
                        style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                    >
                        <div style={{ padding: '20px', borderBottom: '1px solid var(--panel-border)', background: 'rgba(0,0,0,0.2)' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#c084fc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FileBox size={18} /> Shared Vault
                            </h3>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                Add documents from your Knowledge Base to the Room Brain.
                            </p>
                        </div>
                        <div style={{ padding: '20px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {myDocuments.length === 0 ? (
                                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '40px' }}>
                                    Your Knowledge Base is empty. Go upload some files first.
                                </div>
                            ) : (
                                myDocuments.map(doc => {
                                    const isAdded = roomDocuments.some(rd => rd.document_id === doc.document_id);
                                    return (
                                        <div key={doc.document_id} style={{
                                            background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px',
                                            border: '1px solid var(--panel-border)', display: 'flex', flexDirection: 'column', gap: '8px'
                                        }}>
                                            <div style={{ fontSize: '0.85rem', fontWeight: '500', color: '#fff', wordBreak: 'break-all' }}>
                                                {doc.filename}
                                            </div>
                                            <button
                                                onClick={() => handleShareDocument(doc.document_id)}
                                                disabled={addingDoc === doc.document_id || isAdded}
                                                style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                                    background: (isAdded || addingDoc === doc.document_id) ? 'var(--success)' : 'rgba(168, 85, 247, 0.2)',
                                                    color: (isAdded || addingDoc === doc.document_id) ? '#fff' : '#c084fc',
                                                    border: 'none', padding: '6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600',
                                                    cursor: (isAdded || addingDoc === doc.document_id) ? 'default' : 'pointer', transition: 'all 0.2s'
                                                }}
                                            >
                                                {(isAdded || addingDoc === doc.document_id) ? <CheckCircle2 size={14} /> : <PlusCircle size={14} />}
                                                {addingDoc === doc.document_id ? 'Adding...' : (isAdded ? 'In Room' : 'Add to Room')}
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
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                    }}>
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="glass-panel"
                            style={{ padding: '30px', width: '400px', display: 'flex', flexDirection: 'column', gap: '20px' }}
                        >
                            <h3 style={{ fontSize: '1.2rem', fontWeight: '600', color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Users size={20} color="#60a5fa" /> Create Collaboration Room
                            </h3>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                Give your team's workspace a name. You can invite friends and share documents once inside.
                            </p>
                            <form onSubmit={handleCreateGlobalRoom} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="e.g. Project Phoenix, Q3 Legal Review..."
                                    value={newRoomName}
                                    onChange={(e) => setNewRoomName(e.target.value)}
                                    style={{
                                        background: 'rgba(0,0,0,0.4)', border: '1px solid var(--panel-border)',
                                        padding: '12px 16px', borderRadius: '8px', color: '#fff', fontSize: '0.95rem'
                                    }}
                                />
                                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setShowRoomModal(false)}
                                        style={{
                                            padding: '10px 16px', borderRadius: '8px', background: 'transparent',
                                            border: '1px solid var(--panel-border)', color: 'var(--text-secondary)', cursor: 'pointer'
                                        }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        style={{
                                            padding: '10px 16px', borderRadius: '8px', background: 'var(--accent-gradient)',
                                            border: 'none', color: '#fff', fontWeight: '600', cursor: 'pointer',
                                            boxShadow: '0 4px 15px rgba(59, 130, 246, 0.4)'
                                        }}
                                    >
                                        Create Room
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Chat;


