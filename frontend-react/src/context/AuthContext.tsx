import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
    id: string;
    email: string;
    role: 'USER' | 'ADMIN';
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (token: string, role: string, email: string) => void;
    logout: () => void;
    isAuthenticated: boolean;
    isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
    const [user, setUser] = useState<User | null>(() => {
        const savedToken = localStorage.getItem('token');
        const savedRole = localStorage.getItem('role');
        const savedEmail = localStorage.getItem('email');
        if (savedToken && savedRole && savedEmail) {
            return { id: '', email: savedEmail, role: savedRole as 'USER' | 'ADMIN' };
        }
        return null;
    });

    // Handle token changes (logout/login)
    useEffect(() => {
        if (!token) {
            setUser(null);
        }
    }, [token]);

    const login = (newToken: string, role: string, email: string) => {
        localStorage.setItem('token', newToken);
        localStorage.setItem('role', role);
        localStorage.setItem('email', email);
        setToken(newToken);
        setUser({ id: '', email, role: role as 'USER' | 'ADMIN' });
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('email');
        setToken(null);
        setUser(null);
    };

    const isAuthenticated = !!token;
    const isAdmin = user?.role === 'ADMIN';

    return (
        <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated, isAdmin }}>
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
