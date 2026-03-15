import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

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
        } catch (err) {
            console.error("Chat Query Error:", err);
            setLocalMessages(prev => [...prev, {
                role: 'ai',
                content: "⚠️ Error contacting the intelligence engine. Please check your connection or API keys."
            }]);
        } finally {
            setLoading(false);
        }
    }, [history, provider, selectedFolderId]);

    return (
        <ChatContext.Provider value={{ 
            localMessages, 
            loading, 
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
