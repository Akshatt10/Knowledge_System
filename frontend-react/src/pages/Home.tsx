import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
    MessageSquare, 
    FileText, 
    HeartPulse, 
    ArrowRight, 
    Folder, 
    Plus,
    Flame,
    History,
    Star,
    Share2,
    Activity,
    Layers
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { homeService, folderService } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface RecentQuery {
    id: string;
    question: string;
    confidence_score: number;
    created_at: string;
}

interface HomeStats {
    total_docs: number;
    queries_this_week: number;
    vault_health: number;
}

interface FolderData {
    id: string;
    name: string;
    created_at: string;
}

const Home: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [stats, setStats] = useState<HomeStats | null>(null);
    const [history, setHistory] = useState<RecentQuery[]>([]);
    const [folders, setFolders] = useState<FolderData[]>([]);
    const [streak, setStreak] = useState(0);

    const username = user?.email?.split('@')[0] || 'Navigator';
    
    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 5) return 'Burning the midnight oil';
        if (hour < 12) return 'Good Morning';
        if (hour < 17) return 'Good Afternoon';
        return 'Good Evening';
    };

    const calculateStreak = (historyData: RecentQuery[]) => {
        if (!historyData.length) return 0;
        const dates = [...new Set(historyData.map(q => new Date(q.created_at).toDateString()))];
        dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
        
        let currentStreak = 0;
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        
        const latestDate = dates[0];
        if (latestDate !== today && latestDate !== yesterday) return 0;
        
        let checkDate = new Date(latestDate);
        for (let i = 0; i < dates.length; i++) {
            if (dates[i] === checkDate.toDateString()) {
                currentStreak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                break;
            }
        }
        return currentStreak;
    };

    useEffect(() => {
        const loadHomeData = async () => {
            try {
                const [statsRes, historyRes, foldersRes] = await Promise.all([
                    homeService.getStats(),
                    homeService.getHistory(20),
                    folderService.getAll()
                ]);
                
                setStats(statsRes.data);
                const historyData = historyRes.data;
                setHistory(historyData.slice(0, 5));
                setFolders(foldersRes.data.folders.slice(0, 4));
                setStreak(calculateStreak(historyData));
            } catch (error) {
                console.error('Failed to load home data', error);
            }
        };

        loadHomeData();
    }, []);

    const formatTimeAgo = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
        if (diffInSeconds < 60) return 'just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1, delayChildren: 0.1 }
        }
    } as const;

    const itemVariants = {
        hidden: { opacity: 0, y: 15 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
    } as const;

    return (
        <div className="flex-1 p-6 md:p-10 lg:p-12 overflow-y-auto custom-scrollbar relative bg-[#070709]">
            {/* Minimal Background Elements */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-accentGlow/20 to-transparent"></div>
            <div className="absolute top-[-5%] right-[-2%] w-[500px] h-[500px] bg-accentGlow/5 rounded-full blur-[120px] -z-10 pointer-events-none"></div>

            <motion.div 
                className="max-w-6xl mx-auto space-y-10"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >
                {/* ── Header: Simple & Welcoming ─────────────────────────── */}
                <motion.div variants={itemVariants} className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-white/5 pb-10">
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <Activity size={12} className="text-accentGlow animate-pulse" />
                            <span className="text-[10px] font-bold text-accentGlow uppercase tracking-[0.3em] font-outfit">{getGreeting()}</span>
                        </div>
                        <h1 className="text-5xl font-outfit font-bold text-white tracking-tight leading-tight">
                            Your <span className="text-transparent bg-clip-text bg-accent-gradient">Dashboard</span>
                        </h1>
                        <p className="text-textSec mt-3 text-lg font-medium">
                            Welcome back, <span className="text-white">{username}</span>. Here's what's happening today.
                        </p>
                    </div>
                    
                    <motion.div 
                        whileHover={{ scale: 1.02 }}
                        className="glass-panel px-6 py-4 rounded-xl flex items-center gap-4 bg-white/[0.03] border-white/5 shadow-xl group cursor-default"
                    >
                        <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                            <Flame size={20} className="text-orange-500" />
                        </div>
                        <div>
                            <div className="text-[10px] font-bold text-textSec uppercase tracking-widest leading-none mb-1">Daily Streak</div>
                            <div className="text-3xl font-outfit font-bold text-white flex items-center gap-2 leading-none">
                                {streak} <span className="text-sm text-white/20 font-medium">DAYS</span>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>

                {/* ── Core Stats: Simplified Terminology ─────────────────── */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[
                        { 
                            label: 'Library Size', 
                            value: stats?.total_docs || 0, 
                            desc: 'Total documents saved',
                            icon: <FileText size={22} className="text-blue-400" />,
                            glow: 'bg-blue-400/5'
                        },
                        { 
                            label: 'Weekly Questions', 
                            value: stats?.queries_this_week || 0, 
                            desc: 'Interactions this week',
                            icon: <Share2 size={22} className="text-purple-400" />,
                            glow: 'bg-purple-400/5'
                        },
                        { 
                            label: 'Answer Confidence', 
                            value: `${Math.round(stats?.vault_health || 0)}%`, 
                            desc: 'Overall help quality',
                            icon: <HeartPulse size={22} className="text-emerald-400" />,
                            glow: 'bg-emerald-400/5'
                        }
                    ].map((stat) => (
                        <motion.div 
                            key={stat.label}
                            variants={itemVariants}
                            whileHover={{ y: -3, backgroundColor: 'rgba(255,255,255,0.05)' }}
                            className="glass-panel p-6 rounded-2xl border border-white/5 bg-white/[0.02] relative overflow-hidden group transition-all"
                        >
                            <div className={`absolute -right-4 -top-4 w-20 h-20 rounded-full blur-[40px] ${stat.glow}`}></div>
                            <div className="flex items-center gap-5">
                                <div className="w-12 h-12 rounded-xl bg-black/40 flex items-center justify-center border border-white/10 group-hover:bg-white/5 transition-colors">
                                    {stat.icon}
                                </div>
                                <div>
                                    <h3 className="text-3xl font-outfit font-bold text-white leading-none">{stat.value}</h3>
                                    <p className="text-[11px] font-bold text-textSec uppercase tracking-widest mt-2">{stat.label}</p>
                                </div>
                            </div>
                            <p className="text-[11px] text-white/30 font-medium mt-3">{stat.desc}</p>
                        </motion.div>
                    ))}
                </div>

                {/* ── Main Dashboard Content ────────────────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                    {/* Insights Map Card (Compact & Simple) */}
                    <div className="lg:col-span-12">
                        <motion.div 
                            variants={itemVariants}
                            whileHover={{ scale: 1.005 }}
                            onClick={() => navigate('/graph')}
                            className="glass-panel p-8 rounded-3xl border border-accentGlow/20 bg-gradient-to-r from-accentGlow/[0.08] via-transparent to-transparent relative overflow-hidden group cursor-pointer"
                        >
                            <div className="absolute right-0 top-0 h-full w-1/3 opacity-20 group-hover:opacity-40 transition-opacity flex items-center justify-center p-8">
                                <Layers size={140} className="text-accentGlow/20 blur-sm group-hover:scale-110 transition-transform duration-1000" />
                            </div>
                            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 h-5">
                                        <div className="w-2 h-2 rounded-full bg-accentGlow animate-pulse"></div>
                                        <span className="text-[10px] font-bold text-accentGlow uppercase tracking-[0.25em]">Ready to explore</span>
                                    </div>
                                    <h2 className="text-4xl font-outfit font-bold text-white leading-tight">Document Relationship Map</h2>
                                    <p className="text-textSec text-base font-medium max-w-xl leading-relaxed">
                                        Visualize how your files are connected and find related ideas across your entire library instantly.
                                    </p>
                                </div>
                                <button className="flex items-center gap-3 px-8 py-4 bg-white text-darkBg text-sm font-extrabold rounded-xl hover:bg-accentGlow transition-all active:scale-95 shadow-xl whitespace-nowrap">
                                    Open Map <ArrowRight size={18} />
                                </button>
                            </div>
                        </motion.div>
                    </div>

                    {/* Activity Section */}
                    <div className="lg:col-span-7 space-y-6">
                        <motion.div variants={itemVariants} className="flex items-center justify-between px-2">
                            <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                                <History size={20} className="text-white/30" /> Recent Activity
                            </h3>
                            <button onClick={() => navigate('/chat')} className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] hover:text-accentGlow transition-colors">See All</button>
                        </motion.div>
                        <div className="space-y-4">
                            {history.length > 0 ? (
                                history.map((item) => (
                                    <motion.div
                                        key={item.id}
                                        variants={itemVariants}
                                        onClick={() => navigate(`/chat?q=${encodeURIComponent(item.question)}`)}
                                        className="glass-panel p-5 rounded-2xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.04] cursor-pointer transition-all flex items-center justify-between group"
                                    >
                                        <div className="flex items-center gap-5 flex-1 min-w-0">
                                            <div className="w-10 h-10 rounded-xl bg-black/40 flex items-center justify-center border border-white/5 text-textSec group-hover:text-accentGlow group-hover:border-accentGlow/30 transition-all shadow-inner">
                                                <MessageSquare size={18} />
                                            </div>
                                            <div className="truncate">
                                                <p className="text-base text-white/90 font-bold truncate mb-1">{item.question}</p>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-bold text-textSec uppercase tracking-wider">{formatTimeAgo(item.created_at)}</span>
                                                    <div className="w-1.5 h-1.5 rounded-full bg-white/10"></div>
                                                    <div className="flex items-center gap-1.5">
                                                        <Star size={10} className={`fill-current ${item.confidence_score > 0.8 ? 'text-accentGlow' : 'text-white/20'}`} />
                                                        <span className="text-[10px] font-bold text-white/40 uppercase">Accuracy: {Math.round(item.confidence_score * 100)}%</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <ArrowRight size={16} className="text-white/10 group-hover:text-white group-hover:translate-x-1 transition-all" />
                                    </motion.div>
                                ))
                            ) : (
                                <div className="py-16 text-center glass-panel rounded-2xl border border-dashed border-white/10 text-white/10 text-xs font-bold uppercase tracking-widest bg-white/[0.01]">No questions asked yet</div>
                            )}
                        </div>
                    </div>

                    {/* Folders Section */}
                    <div className="lg:col-span-5 space-y-6">
                        <motion.div variants={itemVariants} className="flex items-center justify-between px-2">
                            <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                                <Folder size={20} className="text-white/30" /> Your Folders
                            </h3>
                            <button onClick={() => navigate('/chat')} className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] hover:text-accentGlow transition-colors">New</button>
                        </motion.div>
                        <div className="grid grid-cols-1 gap-4">
                            {folders.length > 0 ? (
                                folders.map((folder) => (
                                    <motion.div
                                        key={folder.id}
                                        whileHover={{ backgroundColor: 'rgba(255,255,255,0.04)', x: 4 }}
                                        className="glass-panel p-5 rounded-2xl border border-white/5 bg-[#0e0e11] hover:border-white/10 transition-all flex items-center justify-between group cursor-pointer shadow-lg"
                                        onClick={() => navigate(`/chat`)}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-11 h-11 rounded-xl bg-accentGlow/5 flex items-center justify-center border border-accentGlow/10 group-hover:border-accentGlow/30 transition-all">
                                                <Folder size={20} className="text-accentGlow" />
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="text-white/90 font-extrabold text-sm truncate">{folder.name}</h4>
                                                <p className="text-[10px] text-textSec font-bold uppercase tracking-wider mt-1">Updated {formatTimeAgo(folder.created_at)}</p>
                                            </div>
                                        </div>
                                        <Plus size={16} className="text-white/10 group-hover:text-accentGlow transition-transform group-hover:rotate-90 duration-300" />
                                    </motion.div>
                                ))
                            ) : (
                                <div className="p-16 text-center glass-panel rounded-2xl border border-dashed border-white/10 text-white/10 text-xs font-bold uppercase tracking-widest leading-relaxed bg-white/[0.01]">Ready to add files</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Bottom Shortcuts */}
                <motion.div variants={itemVariants} className="pt-8 flex flex-wrap gap-10 border-t border-white/5">
                    {[
                        { label: 'Add Documents', to: '/knowledge', icon: <Plus size={14} /> },
                        { label: 'Intelligence Map', to: '/graph', icon: <Share2 size={14} /> },
                        { label: 'Start Chatting', to: '/chat', icon: <MessageSquare size={14} /> }
                    ].map((link, i) => (
                        <button 
                            key={i} 
                            onClick={() => navigate(link.to as any)}
                            className="flex items-center gap-3 text-[11px] font-extrabold text-white/30 uppercase tracking-[0.2em] hover:text-white transition-all group"
                        >
                            <span className="group-hover:text-accentGlow transition-colors">{link.icon}</span> {link.label}
                        </button>
                    ))}
                </motion.div>
            </motion.div>
        </div>
    );
};

export default Home;
