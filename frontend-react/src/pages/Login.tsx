import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
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
    const [ssoLoading, setSsoLoading] = useState(false);

    const [pendingAuth, setPendingAuth] = useState<{ token: string; role: string; email: string } | null>(null);

    const { login: setAuth } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();

    const fromPath = (location.state as any)?.from?.pathname || '/chat';
    const fromSearch = (location.state as any)?.from?.search || '';
    const destination = `${fromPath}${fromSearch}`;

    // Handle SSO callback tokens from URL
    useEffect(() => {
        const ssoToken = searchParams.get('sso_token');
        const ssoRole = searchParams.get('sso_role');
        const ssoEmail = searchParams.get('sso_email');
        const ssoName = searchParams.get('sso_name');
        const ssoError = searchParams.get('sso_error');

        if (ssoError) {
            setError(`Google sign-in failed: ${ssoError}`);
            return;
        }

        if (ssoToken && ssoRole && ssoEmail) {
            // Store in localStorage first, then update React state, then navigate
            localStorage.setItem('token', ssoToken);
            localStorage.setItem('role', ssoRole);
            localStorage.setItem('email', ssoEmail);
            if (ssoName) localStorage.setItem('name', ssoName);
            setAuth(ssoToken, ssoRole, ssoEmail, ssoName || undefined);
            // Small delay so AuthContext state propagates before route change
            setTimeout(() => navigate('/chat', { replace: true }), 50);
        }
    }, []);

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
                formData.append('username', email);
                formData.append('password', password);

                const res = await authService.login(formData);
                setAuth(res.data.access_token, res.data.role, email);
                navigate(destination, { replace: true });
            } else {
                const res = await authService.register({ email, password });
                setPendingAuth({ token: res.data.access_token, role: res.data.role, email });
                setShowWelcome(true);
            }
        } catch (err: any) {
            const detail = err.response?.data?.detail;
            if (typeof detail === 'string') {
                setError(detail);
            } else if (Array.isArray(detail)) {
                setError(detail.map((d: any) => d.msg).join('. '));
            } else {
                setError('Authentication failed. Please check your credentials.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSSO = async () => {
        setSsoLoading(true);
        try {
            const res = await authService.googleSSO();
            window.location.href = res.data.auth_url;
        } catch {
            setError('Failed to initiate Google sign-in.');
            setSsoLoading(false);
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

                {/* Google SSO Button */}
                <button
                    onClick={handleGoogleSSO}
                    disabled={ssoLoading}
                    className="w-full mb-5 py-3.5 rounded-xl border border-white/10 bg-white/5 text-white font-medium text-sm cursor-pointer flex items-center justify-center gap-3 hover:bg-white/10 hover:border-white/20 active:scale-[0.98] transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {ssoLoading ? (
                        <Loader2 size={20} className="animate-spin" />
                    ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                    )}
                    {ssoLoading ? 'Redirecting...' : 'Continue with Google'}
                </button>

                {/* Divider */}
                <div className="flex items-center gap-4 mb-5">
                    <div className="flex-1 h-px bg-white/10"></div>
                    <span className="text-[0.7rem] text-textSec uppercase tracking-wider font-medium">or</span>
                    <div className="flex-1 h-px bg-white/10"></div>
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
