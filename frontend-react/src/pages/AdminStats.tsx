import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Layers,
    FileText,
    Activity,
    ShieldCheck,
    Clock,
    RefreshCw,
    Loader2,
    Users,
    Server,
    Database
} from 'lucide-react';
import { adminService } from '../services/api';

interface Stats {
    total_documents: number;
    total_chunks: number;
    total_users: number;
    collection_name: string;
}

const AdminStats: React.FC = () => {
    const [stats, setStats] = useState<Stats | null>(null);
    const [health, setHealth] = useState<'healthy' | 'error' | 'checking'>('checking');
    const [loading, setLoading] = useState(true);

    const loadData = async () => {
        setLoading(true);
        try {
            const [statsRes, healthRes] = await Promise.all([
                adminService.getStats(),
                adminService.checkHealth()
            ]);
            setStats(statsRes.data);
            setHealth(healthRes.data.status === 'healthy' ? 'healthy' : 'error');
        } catch {
            setHealth('error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const cards = [
        {
            label: 'Indexed Documents',
            count: stats?.total_documents || 0,
            icon: <FileText size={28} className="text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" />,
            colorClass: 'from-cyan-500/20 to-cyan-500/5',
            borderClass: 'border-cyan-500/30 group-hover:border-cyan-400/50',
            textClass: 'text-cyan-400',
            bgGlow: 'bg-cyan-500/10'
        },
        {
            label: 'Semantic Chunks',
            count: stats?.total_chunks || 0,
            icon: <Layers size={28} className="text-blue-500 drop-shadow-[0_0_8px_rgba(59,130,246,0.8)]" />,
            colorClass: 'from-blue-600/20 to-blue-600/5',
            borderClass: 'border-blue-500/30 group-hover:border-blue-400/50',
            textClass: 'text-blue-500',
            bgGlow: 'bg-blue-500/10'
        },
        {
            label: 'Platform Users',
            count: stats?.total_users || 0,
            icon: <Users size={28} className="text-pink-500 drop-shadow-[0_0_8px_rgba(236,72,153,0.8)]" />,
            colorClass: 'from-pink-500/20 to-pink-500/5',
            borderClass: 'border-pink-500/30 group-hover:border-pink-400/50',
            textClass: 'text-pink-500',
            bgGlow: 'bg-pink-500/10'
        },
    ];

    return (
        <div className="flex-1 p-6 md:p-10 overflow-y-auto custom-scrollbar relative">
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-accentSec/5 rounded-full blur-[120px] -z-10 pointer-events-none"></div>

            <div className="max-w-7xl mx-auto space-y-8">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-outfit font-bold text-white flex items-center gap-3">
                            <Server className="text-accentGlow" /> System Overview
                        </h1>
                        <p className="text-textSec mt-1 text-sm md:text-base">Monitor the real-time health and metrics of the Nexus Intelligence infrastructure.</p>
                    </div>
                    <button
                        onClick={loadData}
                        disabled={loading}
                        className="glass-panel flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white font-semibold text-sm transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_20px_rgba(0,0,0,0.2)]"
                    >
                        {loading ? <Loader2 size={18} className="animate-spin text-accentGlow" /> : <RefreshCw size={18} className="text-accentGlow" />}
                        {loading ? 'Syncing...' : 'Sync Metrics'}
                    </button>
                </div>

                {/* Health Status Bar */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`glass-panel p-4 md:p-5 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border backdrop-blur-md shadow-lg ${health === 'healthy'
                        ? 'bg-success/5 border-success/20 shadow-[inset_0_0_20px_rgba(16,185,129,0.05)]'
                        : health === 'error'
                            ? 'bg-danger/5 border-danger/20 shadow-[inset_0_0_20px_rgba(244,63,94,0.05)]'
                            : 'bg-white/5 border-white/10'
                        }`}
                >
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${health === 'healthy' ? 'bg-success/20' : health === 'error' ? 'bg-danger/20' : 'bg-white/10'
                            }`}>
                            {health === 'checking' ? (
                                <Loader2 size={24} className="text-white animate-spin" />
                            ) : (
                                <Activity size={24} className={health === 'healthy' ? 'text-success drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'text-danger drop-shadow-[0_0_8px_rgba(244,63,94,0.8)]'} />
                            )}
                        </div>
                        <div>
                            <h3 className="text-white font-bold text-lg leading-tight flex items-center gap-2">
                                Engine Connectivity
                                {health === 'healthy' && <span className="text-[10px] uppercase tracking-wider font-bold bg-success/20 text-success px-2 py-0.5 rounded-full border border-success/30">Online</span>}
                                {health === 'error' && <span className="text-[10px] uppercase tracking-wider font-bold bg-danger/20 text-danger px-2 py-0.5 rounded-full border border-danger/30">Offline</span>}
                            </h3>
                            <p className="text-textSec text-sm mt-0.5">
                                {health === 'healthy' ? 'All systems operational and responding to queries.' : health === 'error' ? 'Critical services unreachable. Check connectivity.' : 'Verifying system status...'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-medium text-textSec/80 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5 shrink-0">
                        <Clock size={14} /> Last heartbeat: {new Date().toLocaleTimeString()}
                    </div>
                </motion.div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {cards.map((card, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            className={`group relative glass-panel p-6 rounded-2xl overflow-hidden backdrop-blur-xl border transition-all duration-300 hover:-translate-y-1 shadow-xl ${card.borderClass}`}
                        >
                            {/* Background Gradient Effect */}
                            <div className={`absolute inset-0 bg-gradient-to-br opacity-50 ${card.colorClass} z-0`}></div>

                            <div className="relative z-10 flex flex-col h-full">
                                <div className="flex justify-between items-start mb-6">
                                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border border-white/10 ${card.bgGlow} shadow-lg backdrop-blur-sm group-hover:scale-110 transition-transform duration-500`}>
                                        {card.icon}
                                    </div>
                                </div>

                                <div className="mt-auto">
                                    <h3 className="text-4xl font-outfit font-bold text-white mb-1 tracking-tight drop-shadow-md">
                                        {loading ? <span className="animate-pulse opacity-50">...</span> : card.count.toLocaleString()}
                                    </h3>
                                    <p className={`text-xs font-bold uppercase tracking-widest ${card.textClass} opacity-80`}>
                                        {card.label}
                                    </p>
                                </div>
                            </div>

                            {/* Decorative accent line */}
                            <div className={`absolute bottom-0 left-0 h-1 w-0 group-hover:w-full transition-all duration-700 ease-out bg-current ${card.textClass}`}></div>
                        </motion.div>
                    ))}
                </div>

                {/* Tech Info Panel */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="glass-panel mt-8 rounded-2xl border border-white/10 overflow-hidden shadow-2xl relative"
                >
                    <div className="absolute right-0 top-0 w-64 h-64 bg-accentGlow/5 rounded-full blur-[80px] -z-10 pointer-events-none"></div>

                    <div className="px-6 py-5 border-b border-white/10 bg-black/40 backdrop-blur-md flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-accentGlow/10 border border-accentGlow/20 flex items-center justify-center shadow-[0_0_15px_rgba(0,240,255,0.15)]">
                                <ShieldCheck size={20} className="text-accentGlow" />
                            </div>
                            <div>
                                <h4 className="font-bold text-white font-outfit text-lg">Infrastructure Security</h4>
                                <p className="text-xs text-textSec font-medium">System Architecture & Assurances</p>
                            </div>
                        </div>
                        <Database className="text-white/10" size={32} />
                    </div>
                    <div className="p-6 md:p-8 grid md:grid-cols-2 gap-8 bg-black/20">
                        <div className="space-y-4">
                            <h5 className="text-sm font-bold text-accentSec uppercase tracking-wider flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-accentSec"></div>
                                Data Isolation
                            </h5>
                            <p className="text-textSec text-[0.95rem] leading-relaxed">
                                All vector indexing and LLM operations are strictly isolated. RBAC policies are enforced at the network edge and kernel level. Document uploads are scanned for heuristic anomalies before semantic splitting.
                            </p>
                        </div>
                        <div className="space-y-4">
                            <h5 className="text-sm font-bold text-purple-400 uppercase tracking-wider flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-purple-400"></div>
                                Vector Analytics
                            </h5>
                            <p className="text-textSec text-[0.95rem] leading-relaxed">
                                Current collection points directly to <span className="font-mono text-xs bg-white/5 px-1.5 py-0.5 rounded border border-white/10 text-white/80">{stats?.collection_name || 'nexus_core'}</span>.
                                Embeddings rely on the optimized sentence-transformers model running on isolated compute instances.
                            </p>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default AdminStats;
