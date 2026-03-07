import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/api';
import { Sparkles, Mail, Lock, LogIn, UserPlus, AlertCircle, Loader2 } from 'lucide-react';

const Login: React.FC = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { login: setAuth } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const from = (location.state as any)?.from?.pathname || '/chat';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            if (isLogin) {
                const formData = new FormData();
                formData.append('username', email); // OAuth2 format
                formData.append('password', password);

                const res = await authService.login(formData);
                setAuth(res.data.access_token, res.data.role, email);
            } else {
                const res = await authService.register({ email, password });
                setAuth(res.data.access_token, res.data.role, email);
            }
            navigate(from, { replace: true });
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Authentication failed. Please check your credentials.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="layout-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-panel"
                style={{ width: '100%', maxWidth: '420px', padding: '40px' }}
            >
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                    <div style={{
                        width: '64px', height: '64px', margin: '0 auto 16px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: '16px', background: 'var(--accent-gradient)'
                    }}>
                        <Sparkles size={32} color="#fff" />
                    </div>
                    <h1 style={{ fontSize: '1.8rem', letterSpacing: '-0.5px' }}>
                        {isLogin ? 'Sign In' : 'Create Account'}
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>
                        Knowledge Intelligence System
                    </p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div style={{ position: 'relative' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Email</label>
                            <div style={{ position: 'relative' }}>
                                <Mail size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                                <input
                                    type="email" required
                                    value={email} onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    style={{
                                        width: '100%', padding: '12px 12px 12px 42px',
                                        backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid var(--panel-border)',
                                        borderRadius: 'var(--radius-sm)', color: '#fff', fontSize: '0.95rem'
                                    }}
                                />
                            </div>
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Password</label>
                            <div style={{ position: 'relative' }}>
                                <Lock size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                                <input
                                    type="password" required
                                    value={password} onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    style={{
                                        width: '100%', padding: '12px 12px 12px 42px',
                                        backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid var(--panel-border)',
                                        borderRadius: 'var(--radius-sm)', color: '#fff'
                                    }}
                                />
                            </div>
                        </div>

                        <AnimatePresence>
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    style={{
                                        color: 'var(--danger)', fontSize: '0.85rem', background: 'rgba(255, 77, 77, 0.1)',
                                        padding: '10px', borderRadius: 'var(--radius-sm)', display: 'flex', gap: '8px', alignItems: 'center'
                                    }}
                                >
                                    <AlertCircle size={16} /> {error}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                width: '100%', padding: '14px', borderRadius: 'var(--radius-sm)',
                                border: 'none', background: 'var(--accent-gradient)', color: '#fff',
                                fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                            }}
                        >
                            {loading ? <Loader2 size={20} className="animate-spin" /> : (
                                isLogin ? <>Sign In <LogIn size={18} /></> : <>Sign Up <UserPlus size={18} /></>
                            )}
                        </button>

                        <div style={{ textAlign: 'center', marginTop: '12px' }}>
                            <button
                                type="button"
                                onClick={() => setIsLogin(!isLogin)}
                                style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '0.9rem' }}
                            >
                                {isLogin ? 'Need an account? Sign Up' : 'Already have an account? Sign In'}
                            </button>
                        </div>
                    </div>
                </form>
            </motion.div>
        </div>
    );
};

export default Login;
