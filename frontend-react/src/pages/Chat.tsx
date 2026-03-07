import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Send,
    Sparkles,
    ChevronRight,
    FileText,
    Loader2
} from 'lucide-react';
import { queryService } from '../services/api';

interface Message {
    role: 'user' | 'ai';
    content: string;
    sources?: any[];
}

const Chat: React.FC = () => {
    const [messages, setMessages] = useState<Message[]>(() => {
        const saved = sessionStorage.getItem('chat_messages');
        return saved ? JSON.parse(saved) : [
            { role: 'ai', content: "Hello! I am your advanced RAG Intelligence Agent. I can analyze documents from our secure knowledge base. What would you like to know?" }
        ];
    });
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState<any[]>(() => {
        const saved = sessionStorage.getItem('chat_history');
        return saved ? JSON.parse(saved) : [];
    });

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(scrollToBottom, [messages]);

    useEffect(() => {
        sessionStorage.setItem('chat_messages', JSON.stringify(messages));
        sessionStorage.setItem('chat_history', JSON.stringify(history));
    }, [messages, history]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || loading) return;

        const question = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: question }]);
        setLoading(true);

        try {
            const res = await queryService.ask({
                question,
                chat_history: history
            });

            const data = res.data;
            setMessages(prev => [...prev, {
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
            setMessages(prev => [...prev, {
                role: 'ai',
                content: "⚠️ Error contacting the intelligence engine. Please check your connection or API keys."
            }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', padding: '20px' }}>
            <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Chat Header */}
                <div style={{
                    padding: '20px 24px', borderBottom: '1px solid var(--panel-border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 10px var(--success)' }}></div>
                        <h3 style={{ fontSize: '1.2rem', fontWeight: '600' }}>AI Research Assistant</h3>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.3)', padding: '6px 14px', borderRadius: '20px', border: '1px solid var(--panel-border)' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-glow)', boxShadow: '0 0 8px var(--accent-glow)' }}></div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600', letterSpacing: '0.05em' }}>GEMINI POWERED</span>
                    </div>
                </div>

                {/* Messages Container */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <AnimatePresence initial={false}>
                        {messages.map((msg, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                style={{
                                    display: 'flex', gap: '16px',
                                    maxWidth: '85%', alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                    flexDirection: msg.role === 'user' ? 'row-reverse' : 'row'
                                }}
                            >
                                <div style={{
                                    width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: msg.role === 'ai' ? 'rgba(0, 240, 255, 0.1)' : 'rgba(255,255,255,0.1)',
                                    border: `1px solid ${msg.role === 'ai' ? 'rgba(0, 240, 255, 0.3)' : 'var(--panel-border)'} `
                                }}>
                                    {msg.role === 'ai' ? <Sparkles size={18} color="var(--accent-glow)" /> : <User size={18} />}
                                </div>

                                <div style={{
                                    background: msg.role === 'user' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                                    padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--panel-border)'
                                }}>
                                    <div style={{ lineHeight: '1.6', fontSize: '0.95rem', color: '#fff', whiteSpace: 'pre-wrap' }}>
                                        {msg.content}
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
                                                {msg.sources.map((src, j) => (
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
                            </motion.div>
                        ))}
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
                            placeholder="Query the knowledge base... (Shift+Enter for newline)"
                            style={{
                                flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--panel-border)',
                                borderRadius: 'var(--radius-md)', padding: '16px', color: '#fff',
                                resize: 'none', height: '56px', maxHeight: '200px', fontSize: '0.95rem'
                            }}
                        />
                        <button
                            type="submit"
                            disabled={loading || !input.trim()}
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
        </div>
    );
};

export default Chat;

const User = ({ size, color = "currentColor" }: { size: number, color?: string }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
    </svg>
);
