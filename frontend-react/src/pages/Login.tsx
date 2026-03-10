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

    const fromPath = (location.state as any)?.from?.pathname || '/chat';
    const fromSearch = (location.state as any)?.from?.search || '';
    const destination = `${fromPath}${fromSearch}`;

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
            navigate(destination, { replace: true });
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Authentication failed. Please check your credentials.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex w-full h-screen bg-app-radial items-center justify-center p-4">
            {/* Background decorative glows */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accentGlow/10 rounded-full blur-[120px] pointer-events-none"></div>
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accentSec/10 rounded-full blur-[120px] pointer-events-none"></div>

            <motion.div
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="glass-panel w-full max-w-[440px] p-10 relative z-10 box-border shadow-2xl"
            >
                <div className="text-center mb-10">
                    <div className="w-16 h-16 mx-auto mb-5 flex items-center justify-center rounded-2xl bg-accent-gradient shadow-glow relative">
                        {/* Inner pulse */}
                        <div className="absolute inset-0 bg-white/20 rounded-2xl animate-ping opacity-20"></div>
                        <Sparkles size={32} className="text-white drop-shadow-md relative z-10" />
                    </div>
                    <h1 className="text-3xl font-outfit font-bold tracking-tight text-white mb-2">
                        {isLogin ? 'Welcome Back' : 'Create Account'}
                    </h1>
                    <p className="text-textSec text-sm font-medium">
                        Nexus Intelligence System
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                    <div className="relative group">
                        <label className="block text-[0.8rem] font-medium text-textSec mb-2 uppercase tracking-wide">Email</label>
                        <div className="relative flex items-center">
                            <Mail size={18} className="absolute left-4 text-textSec group-focus-within:text-accentGlow transition-colors" />
                            <input
                                type="email" required
                                value={email} onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                className="w-full py-3.5 pr-4 pl-12 bg-black/20 border border-white/10 rounded-xl text-white text-[0.95rem] outline-none transition-all duration-300 focus:border-accentGlow/50 focus:bg-black/40 focus:ring-4 focus:ring-accentGlow/10 placeholder:text-white/20"
                            />
                        </div>
                    </div>

                    <div className="relative group">
                        <label className="block text-[0.8rem] font-medium text-textSec mb-2 uppercase tracking-wide">Password</label>
                        <div className="relative flex items-center">
                            <Lock size={18} className="absolute left-4 text-textSec group-focus-within:text-accentGlow transition-colors" />
                            <input
                                type="password" required
                                value={password} onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full py-3.5 pr-4 pl-12 bg-black/20 border border-white/10 rounded-xl text-white text-[0.95rem] outline-none transition-all duration-300 focus:border-accentGlow/50 focus:bg-black/40 focus:ring-4 focus:ring-accentGlow/10 placeholder:text-white/20"
                            />
                        </div>
                    </div>

                    <AnimatePresence mode="wait">
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                                animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
                                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="text-danger text-[0.85rem] bg-danger/10 border border-danger/20 p-3 rounded-xl flex gap-2 items-start font-medium leading-snug">
                                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                                    <span>{error}</span>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full mt-2 py-4 rounded-xl border-none bg-accent-gradient text-white font-bold text-base cursor-pointer flex items-center justify-center gap-2 shadow-glow hover:shadow-[0_0_25px_rgba(0,240,255,0.6)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:opacity-70 disabled:hover:scale-100 disabled:cursor-not-allowed"
                    >
                        {loading ? <Loader2 size={22} className="animate-spin" /> : (
                            isLogin ? <>Sign In <LogIn size={20} className="ml-1" /></> : <>Sign Up <UserPlus size={20} className="ml-1" /></>
                        )}
                    </button>

                    <div className="text-center mt-4">
                        <button
                            type="button"
                            onClick={() => setIsLogin(!isLogin)}
                            className="bg-transparent border-none text-textSec hover:text-white cursor-pointer text-sm font-medium transition-colors"
                        >
                            {isLogin ? (
                                <>Don't have an account? <span className="text-accentGlow">Sign Up</span></>
                            ) : (
                                <>Already have an account? <span className="text-accentGlow">Sign In</span></>
                            )}
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
};

export default Login;
