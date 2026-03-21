import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { queryService } from '../services/api';

interface Message {
    role: 'user' | 'ai' | 'system';
    content: string;
    sources?: any[];
    id?: string;
    query_id?: string;
    confidence_score?: number;
    feedback?: number; // 1, -1, or undefined
    sender?: string;
    follow_up_questions?: string[];
    user_annotation?: string;
}

interface ChatContextType {
    localMessages: Message[];
    loading: boolean;
    streaming: boolean;
    history: any[];
    selectedFolderId: string | null;
    setSelectedFolderId: (id: string | null) => void;
    sendQuery: (question: string) => Promise<void>;
    giveFeedback: (messageIndex: number, feedback: number) => Promise<void>;
    saveAnnotation: (messageIndex: number, annotation: string) => Promise<void>;
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
    const [loading, setLoading] = useState(false);
    const [streaming, setStreaming] = useState(false);
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
    const receivedFirstToken = useRef(false);

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

    const giveFeedback = useCallback(async (index: number, feedbackValue: number) => {
        const msg = localMessages[index];
        if (!msg || !msg.query_id) return;

        try {
            await queryService.giveFeedback(msg.query_id, feedbackValue);
            setLocalMessages(prev => {
                const updated = [...prev];
                updated[index] = { ...updated[index], feedback: feedbackValue };
                return updated;
            });
        } catch (err) {
            console.error("Failed to give feedback", err);
        }
    }, [localMessages]);

    const saveAnnotation = useCallback(async (index: number, annotation: string) => {
        const msg = localMessages[index];
        if (!msg || !msg.query_id) return;

        try {
            await queryService.saveAnnotation(msg.query_id, annotation);
            setLocalMessages(prev => {
                const updated = [...prev];
                updated[index] = { ...updated[index], user_annotation: annotation };
                return updated;
            });
        } catch (err) {
            console.error("Failed to save annotation", err);
            throw err;
        }
    }, [localMessages]);

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
                    onAnalytics: (data: any) => {
                        setLocalMessages(prev => {
                            const updated = [...prev];
                            const lastAi = updated[updated.length - 1];
                            if (lastAi && lastAi.role === 'ai') {
                                updated[updated.length - 1] = {
                                    ...lastAi,
                                    query_id: data.query_id,
                                    confidence_score: data.confidence_score
                                };
                            }
                            return updated;
                        });
                    },
                    onFollowups: (questions: string[]) => {
                        setLocalMessages(prev => {
                            const updated = [...prev];
                            const lastAi = updated[updated.length - 1];
                            if (lastAi && lastAi.role === 'ai') {
                                updated[updated.length - 1] = {
                                    ...lastAi,
                                    follow_up_questions: questions,
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
    }, [history, selectedFolderId]);

    return (
        <ChatContext.Provider value={{ 
            localMessages, 
            loading, 
            streaming,
            history, 
            selectedFolderId,
            setSelectedFolderId,
            sendQuery, 
            giveFeedback,
            saveAnnotation,
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
