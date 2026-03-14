import React, { createContext, useContext, useState } from 'react';

interface User {
    id: string;
    email: string;
    name?: string;
    role: 'USER' | 'ADMIN';
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (token: string, role: string, email: string, name?: string) => void;
    logout: () => void;
    isAuthenticated: boolean;
    isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthState {
    token: string | null;
    user: User | null;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [authState, setAuthState] = useState<AuthState>(() => {
        const savedToken = localStorage.getItem('token');
        const savedRole = localStorage.getItem('role');
        const savedEmail = localStorage.getItem('email');
        const savedName = localStorage.getItem('name');
        
        if (savedToken && savedRole && savedEmail) {
            return {
                token: savedToken,
                user: { id: '', email: savedEmail, role: savedRole as 'USER' | 'ADMIN', name: savedName || undefined }
            };
        }
        return { token: null, user: null };
    });

    const login = (newToken: string, role: string, email: string, name?: string) => {
        localStorage.setItem('token', newToken);
        localStorage.setItem('role', role);
        localStorage.setItem('email', email);
        if (name) localStorage.setItem('name', name);

        sessionStorage.clear();

        setAuthState({
            token: newToken,
            user: { id: '', email, role: role as 'USER' | 'ADMIN', name }
        });
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('email');
        localStorage.removeItem('name');

        sessionStorage.clear();

        setAuthState({ token: null, user: null });
    };

    const isAuthenticated = !!authState.token;
    const isAdmin = authState.user?.role === 'ADMIN';

    return (
        <AuthContext.Provider value={{ 
            user: authState.user, 
            token: authState.token, 
            login, 
            logout, 
            isAuthenticated, 
            isAdmin 
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
