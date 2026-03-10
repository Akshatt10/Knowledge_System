import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';

interface WebSocketMessage {
    type: 'system' | 'user_message' | 'ai_chunk';
    id?: string;
    sender?: string;
    content: string;
    status?: 'start' | 'streaming' | 'done';
}

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    sender?: string;
}

interface WebSocketContextType {
    messages: ChatMessage[];
    isConnected: boolean;
    error: string | null;
    connectToRoom: (roomId: string) => void;
    disconnect: () => void;
    sendMessage: (prompt: string, provider: string) => void;
    setInitialHistory: (history: ChatMessage[]) => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { token } = useAuth();
    const ws = useRef<WebSocket | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const activeAiMessageId = useRef<string | null>(null);
    const reconnectCount = useRef(0);
    const reconnectTimeoutId = useRef<ReturnType<typeof setTimeout> | null>(null);
    const manualDisconnect = useRef(false);

    const connectToRoom = useCallback((roomId: string) => {
        if (!token) return;

        if (reconnectTimeoutId.current) {
            clearTimeout(reconnectTimeoutId.current);
            reconnectTimeoutId.current = null;
        }
        manualDisconnect.current = false;

        if (ws.current) {
            ws.current.close();
            ws.current = null;
        }

        // Use standard or secure websocket based on current protocol
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // Connect to Vite's proxy if local, otherwise to real API url
        const baseUrl = import.meta.env.VITE_API_URL
            ? import.meta.env.VITE_API_URL.replace('http', 'ws').replace(/\/api$/, '')
            : `${protocol}//${window.location.host}`;

        // Need to bypass Vite proxy for pure WS if running frontend specifically on different port, 
        // falling back to hardcoding for local dev if needed.
        let wsUrl = `${baseUrl}/api/ws/chat/${roomId}?token=${token}`;
        if (!import.meta.env.VITE_API_URL && window.location.port === '5173') {
            wsUrl = `ws://localhost:8000/api/ws/chat/${roomId}?token=${token}`;
        }

        ws.current = new WebSocket(wsUrl);

        ws.current.onopen = () => {
            setIsConnected(true);
            setError(null);
            reconnectCount.current = 0;
        };

        ws.current.onclose = (event) => {
            setIsConnected(false);
            if (event.code === 1008) {
                setError("Authentication failed.");
            } else if (event.code === 4004) {
                setError("Room completely not found.");
            } else if (!manualDisconnect.current) {
                if (reconnectCount.current < 5) {
                    const timeout = Math.min(1000 * Math.pow(2, reconnectCount.current), 10000);
                    setError(`Connection lost. Reconnecting in ${timeout / 1000}s...`);
                    reconnectTimeoutId.current = setTimeout(() => {
                        reconnectCount.current += 1;
                        connectToRoom(roomId);
                    }, timeout);
                } else {
                    setError("Connection lost. Maximum reconnect attempts reached.");
                }
            } else {
                console.log("WebSocket Disconnected intentionally");
            }
        };

        ws.current.onerror = () => {
            setError("WebSocket connection failed.");
        };

        ws.current.onmessage = (event) => {
            try {
                const data: WebSocketMessage = JSON.parse(event.data);

                if (data.type === 'system') {
                    setMessages(prev => [...prev, { id: window.crypto.randomUUID(), role: 'system', content: data.content }]);
                }
                else if (data.type === 'user_message') {
                    setMessages(prev => [...prev, {
                        id: data.id || window.crypto.randomUUID(),
                        role: 'user',
                        content: data.content,
                        sender: data.sender
                    }]);
                }
                else if (data.type === 'ai_chunk') {
                    setMessages(prev => {
                        const newMessages = [...prev];
                        const existingMsgIndex = newMessages.findIndex(m => m.id === data.id);

                        if (existingMsgIndex >= 0) {
                            // Update existing stream
                            newMessages[existingMsgIndex].content = data.content;
                        } else if (data.status === 'start' || data.content) {
                            // Create new stream
                            newMessages.push({
                                id: data.id!,
                                role: 'assistant',
                                content: data.content,
                                sender: 'AI'
                            });
                        }
                        return newMessages;
                    });
                }
            } catch (err) {
                console.error("Failed to parse websocket message", err);
            }
        };
    }, [token]);

    const disconnect = useCallback(() => {
        manualDisconnect.current = true;
        if (reconnectTimeoutId.current) {
            clearTimeout(reconnectTimeoutId.current);
            reconnectTimeoutId.current = null;
        }
        if (ws.current) {
            ws.current.close();
            ws.current = null;
        }
        setIsConnected(false);
        setMessages([]);
        activeAiMessageId.current = null;
        reconnectCount.current = 0;
    }, []);

    const sendMessage = useCallback((prompt: string, provider: string) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ prompt, provider }));
        } else {
            setError("Cannot send message: WebSocket is disconnected.");
        }
    }, []);

    const setInitialHistory = useCallback((history: ChatMessage[]) => {
        setMessages(history);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => disconnect();
    }, []);

    return (
        <WebSocketContext.Provider value={{ messages, isConnected, error, connectToRoom, disconnect, sendMessage, setInitialHistory }}>
            {children}
        </WebSocketContext.Provider>
    );
};

export const useWebSocket = () => {
    const context = useContext(WebSocketContext);
    if (!context) {
        throw new Error("useWebSocket must be used within a WebSocketProvider");
    }
    return context;
};
