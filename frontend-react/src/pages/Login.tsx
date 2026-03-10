import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/api';
import { Sparkles, Mail, Lock, LogIn, UserPlus, AlertCircle, Loader2, Eye, EyeOff, ShieldCheck, Brain, Users, X } from 'lucide-react';

const Login: React.FC = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [showWelcome, setShowWelcome] = useState(false);

    // Pending auth data to apply after the user dismisses the welcome modal
    const [pendingAuth, setPendingAuth] = useState<{ token: string; role: string; email: string } | null>(null);

    const { login: setAuth } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const fromPath = (location.state as any)?.from?.pathname || '/chat';
    const fromSearch = (location.state as any)?.from?.search || '';
    const destination = `${fromPath}${fromSearch}`;

    const validateInputs = (): string | null => {
        if (!email.trim()) return 'Please enter your email address.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address.';
        if (!password) return 'Please enter your password.';
        if (!isLogin && password.length < 6) return 'Password must be at least 6 characters.';
        return null;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const validationError = validateInputs();
        if (validationError) {
            setError(validationError);
            return;
        }

        setLoading(true);

        try {
            if (isLogin) {
                const formData = new FormData();
                formData.append('username', email); // OAuth2 format
                formData.append('password', password);

                const res = await authService.login(formData);
                setAuth(res.data.access_token, res.data.role, email);
                navigate(destination, { replace: true });
            } else {
                const res = await authService.register({ email, password });
                // Don't navigate yet — show welcome modal first
                setPendingAuth({ token: res.data.access_token, role: res.data.role, email });
                setShowWelcome(true);
            }
        } catch (err: any) {
            const detail = err.response?.data?.detail;
            if (typeof detail === 'string') {
                setError(detail);
            } else if (Array.isArray(detail)) {
                // FastAPI validation errors come as an array
                setError(detail.map((d: any) => d.msg).join('. '));
            } else {
                setError('Authentication failed. Please check your credentials.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleDismissWelcome = () => {
        setShowWelcome(false);
        if (pendingAuth) {
            setAuth(pendingAuth.token, pendingAuth.role, pendingAuth.email);
            navigate(destination, { replace: true });
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
                                value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }}
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
                                type={showPassword ? 'text' : 'password'} required
                                value={password} onChange={(e) => { setPassword(e.target.value); setError(null); }}
                                placeholder="••••••••"
                                className="w-full py-3.5 pr-12 pl-12 bg-black/20 border border-white/10 rounded-xl text-white text-[0.95rem] outline-none transition-all duration-300 focus:border-accentGlow/50 focus:bg-black/40 focus:ring-4 focus:ring-accentGlow/10 placeholder:text-white/20"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                tabIndex={-1}
                                className="absolute right-4 text-textSec hover:text-white transition-colors bg-transparent border-none cursor-pointer p-0"
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                        {!isLogin && password.length > 0 && password.length < 6 && (
                            <p className="text-[0.75rem] text-amber-400/80 mt-2 ml-1">Password must be at least 6 characters</p>
                        )}
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
                            onClick={() => { setIsLogin(!isLogin); setError(null); }}
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

            {/* ── Welcome Disclaimer Modal ──────────────────────────── */}
            <AnimatePresence>
                {showWelcome && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            transition={{ duration: 0.3 }}
                            className="glass-panel max-w-[520px] w-full p-8 relative shadow-2xl"
                        >
                            <button
                                onClick={handleDismissWelcome}
                                className="absolute top-4 right-4 text-textSec hover:text-white transition-colors bg-transparent border-none cursor-pointer p-1"
                            >
                                <X size={20} />
                            </button>

                            <div className="text-center mb-6">
                                <div className="w-14 h-14 mx-auto mb-4 flex items-center justify-center rounded-2xl bg-accent-gradient shadow-glow">
                                    <Sparkles size={28} className="text-white" />
                                </div>
                                <h2 className="text-2xl font-outfit font-bold text-white mb-1">Welcome to Nexus! 🎉</h2>
                                <p className="text-textSec text-sm">Your intelligent knowledge companion</p>
                            </div>

                            <div className="flex flex-col gap-4 mb-8">
                                <div className="flex items-start gap-4 p-4 bg-black/30 rounded-xl border border-white/5">
                                    <div className="p-2 bg-accentGlow/10 rounded-lg shrink-0">
                                        <Brain size={20} className="text-accentGlow" />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-semibold text-white mb-1">AI-Powered Document Intelligence</h4>
                                        <p className="text-xs text-textSec leading-relaxed">Upload PDFs, DOCX, or text files and instantly ask questions. Nexus uses RAG (Retrieval-Augmented Generation) to give you precise, sourced answers.</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-4 p-4 bg-black/30 rounded-xl border border-white/5">
                                    <div className="p-2 bg-success/10 rounded-lg shrink-0">
                                        <ShieldCheck size={20} className="text-success" />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-semibold text-white mb-1">Enterprise-Grade Security</h4>
                                        <p className="text-xs text-textSec leading-relaxed">Your documents are protected with envelope encryption (AES-256). Files are encrypted locally before being backed up to cloud storage. Zero-trust architecture.</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-4 p-4 bg-black/30 rounded-xl border border-white/5">
                                    <div className="p-2 bg-accentSec/10 rounded-lg shrink-0">
                                        <Users size={20} className="text-accentSec" />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-semibold text-white mb-1">Real-Time Collaboration</h4>
                                        <p className="text-xs text-textSec leading-relaxed">Create chat rooms, share documents with teammates, and query AI together. All conversations are persisted and synced in real-time via WebSockets.</p>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handleDismissWelcome}
                                className="w-full py-3.5 rounded-xl bg-accent-gradient text-white font-bold text-sm cursor-pointer flex items-center justify-center gap-2 shadow-glow hover:shadow-[0_0_25px_rgba(0,240,255,0.6)] hover:scale-[1.01] active:scale-[0.98] transition-all duration-300 border-none"
                            >
                                Get Started <LogIn size={18} />
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Login;

