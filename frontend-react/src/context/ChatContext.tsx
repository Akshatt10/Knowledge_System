import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { queryService } from '../services/api';

interface Message {
    role: 'user' | 'ai' | 'system';
    content: string;
    sources?: any[];
    id?: string;
    sender?: string;
}

interface ChatContextType {
    localMessages: Message[];
    loading: boolean;
    streaming: boolean;
    provider: string;
    history: any[];
    selectedFolderId: string | null;
    setProvider: (provider: string) => void;
    setSelectedFolderId: (id: string | null) => void;
    sendQuery: (question: string) => Promise<void>;
    clearChat: () => void;
}

const ChatContext = createContext<ChatContextType | null>(null);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [localMessages, setLocalMessages] = useState<Message[]>(() => {
        const saved = sessionStorage.getItem('chat_messages');
        return saved ? JSON.parse(saved) : [
            { role: 'ai', content: "Hello! I am your advanced RAG Intelligence Agent. I can analyze documents from our secure knowledge base. What would you like to know?" }
        ];
    });
    const [history, setHistory] = useState<any[]>(() => {
        const saved = sessionStorage.getItem('chat_history');
        return saved ? JSON.parse(saved) : [];
    });
    const [provider, setProviderState] = useState(() => {
        return sessionStorage.getItem('chat_provider') || 'gemini';
    });
    const [loading, setLoading] = useState(false);
    const [streaming, setStreaming] = useState(false);
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
    const receivedFirstToken = useRef(false);

    const setProvider = (p: string) => {
        setProviderState(p);
        sessionStorage.setItem('chat_provider', p);
    };

    useEffect(() => {
        sessionStorage.setItem('chat_messages', JSON.stringify(localMessages));
    }, [localMessages]);

    useEffect(() => {
        sessionStorage.setItem('chat_history', JSON.stringify(history));
    }, [history]);

    const clearChat = useCallback(() => {
        const initialMessage: Message = { role: 'ai', content: "Hello! I am your advanced RAG Intelligence Agent. I can analyze documents from our secure knowledge base. What would you like to know?" };
        setLocalMessages([initialMessage]);
        setHistory([]);
        sessionStorage.removeItem('chat_messages');
        sessionStorage.removeItem('chat_history');
    }, []);

    const sendQuery = useCallback(async (question: string) => {
        // Show user message + loading spinner
        setLocalMessages(prev => [...prev, { role: 'user', content: question }]);
        setLoading(true);
        setStreaming(false);
        receivedFirstToken.current = false;

        try {
            await queryService.streamAsk(
                {
                    question,
                    provider,
                    folder_id: selectedFolderId,
                },
                {
                    onToken: (token: string) => {
                        // On FIRST token: hide spinner, add AI bubble, switch to streaming mode
                        if (!receivedFirstToken.current) {
                            receivedFirstToken.current = true;
                            setLoading(false);
                            setStreaming(true);
                            setLocalMessages(prev => [...prev, { role: 'ai' as const, content: token, sources: [] }]);
                        } else {
                            // Append subsequent tokens to the existing AI message
                            setLocalMessages(prev => {
                                const updated = [...prev];
                                const lastAi = updated[updated.length - 1];
                                if (lastAi && lastAi.role === 'ai') {
                                    updated[updated.length - 1] = {
                                        ...lastAi,
                                        content: lastAi.content + token,
                                    };
                                }
                                return updated;
                            });
                        }
                    },
                    onSources: (sources: any[]) => {
                        setLocalMessages(prev => {
                            const updated = [...prev];
                            const lastAi = updated[updated.length - 1];
                            if (lastAi && lastAi.role === 'ai') {
                                updated[updated.length - 1] = {
                                    ...lastAi,
                                    sources,
                                };
                            }
                            return updated;
                        });
                    },
                    onDone: () => {
                        setLocalMessages(prev => {
                            const lastAi = prev[prev.length - 1];
                            if (lastAi && lastAi.role === 'ai') {
                                setHistory(h => [
                                    ...h,
                                    { role: 'user', content: question },
                                    { role: 'assistant', content: lastAi.content },
                                ]);
                            }
                            return prev;
                        });
                        setLoading(false);
                        setStreaming(false);
                    },
                    onError: (error: string) => {
                        console.error('Stream error:', error);
                        setLocalMessages(prev => [...prev, {
                            role: 'ai' as const,
                            content: '⚠️ Error contacting the intelligence engine. Please check your connection or API keys.',
                        }]);
                        setLoading(false);
                        setStreaming(false);
                    },
                }
            );
        } catch (err) {
            console.error('Chat Query Error:', err);
            setLocalMessages(prev => [...prev, {
                role: 'ai' as const,
                content: '⚠️ Error contacting the intelligence engine. Please check your connection or API keys.',
            }]);
            setLoading(false);
            setStreaming(false);
        }
    }, [history, provider, selectedFolderId]);

    return (
        <ChatContext.Provider value={{ 
            localMessages, 
            loading, 
            streaming,
            provider, 
            history, 
            selectedFolderId,
            setProvider,
            setSelectedFolderId,
            sendQuery, 
            clearChat 
        }}>
            {children}
        </ChatContext.Provider>
    );
};

export const useChat = () => {
    const context = useContext(ChatContext);
    if (!context) {
        throw new Error('useChat must be used within a ChatProvider');
    }
    return context;
};
