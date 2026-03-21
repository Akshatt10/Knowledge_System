import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';
import {
    Layers,
    FileText,
    Activity,
    ShieldCheck,
    RefreshCw,
    Loader2,
    Users,
    Server,
    Database,
    LineChart,
    Cpu,
    ThumbsUp,
    HeartPulse
} from 'lucide-react';
import { adminService } from '../services/api';

interface Stats {
    total_documents: number;
    total_chunks: number;
    total_users: number;
    collection_name: string;
}

interface DataPoint {
    timestamp: string;
    value: number;
}

interface FeedbackStats {
    total_positive: number;
    total_negative: number;
    positive_rate_percent: number;
}

interface TimeSeriesData {
    user_growth: DataPoint[];
    document_growth: DataPoint[];
    active_users: DataPoint[];
    ai_queries: DataPoint[];
}

type Period = '1d' | '7d' | '30d' | '6m' | '12m';

const AdminStats: React.FC = () => {
    const [stats, setStats] = useState<Stats | null>(null);
    const [health, setHealth] = useState<'healthy' | 'error' | 'checking'>('checking');
    const [loading, setLoading] = useState(true);

    const [period, setPeriod] = useState<Period>('7d');
    const [timeSeries, setTimeSeries] = useState<TimeSeriesData>({ 
        user_growth: [], 
        document_growth: [],
        active_users: [],
        ai_queries: []
    });
    const [loadingSeries, setLoadingSeries] = useState(false);
    const [feedbackStats, setFeedbackStats] = useState<FeedbackStats | null>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            const [statsRes, healthRes, feedbackRes] = await Promise.all([
                adminService.getStats(),
                adminService.checkHealth(),
                adminService.getFeedbackStats()
            ]);
            setStats(statsRes.data);
            setHealth(healthRes.data.status === 'healthy' ? 'healthy' : 'error');
            setFeedbackStats(feedbackRes.data);
        } catch {
            setHealth('error');
        } finally {
            setLoading(false);
        }
    };

    const loadTimeSeries = async (selectedPeriod: Period) => {
        setLoadingSeries(true);
        try {
            const res = await adminService.getTimeSeriesStats(selectedPeriod);
            setTimeSeries(res.data);
        } catch (error) {
            console.error("Failed to load time series data", error);
        } finally {
            setLoadingSeries(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        loadTimeSeries(period);
    }, [period]);

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
        {
            label: 'Success Rate',
            count: feedbackStats ? `${Math.round(feedbackStats.positive_rate_percent)}%` : '0%',
            icon: <HeartPulse size={28} className="text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]" />,
            colorClass: 'from-emerald-600/20 to-emerald-600/5',
            borderClass: 'border-emerald-500/30 group-hover:border-emerald-400/50',
            textClass: 'text-emerald-500',
            bgGlow: 'bg-emerald-500/10'
        },
    ];

    // Formatter for Recharts Tooltip
    // Fix: Recharts Tooltip passes a string OR number depending on scale, so we use 'any' wrapper inside
    const formatTooltipLabel = (val: any) => {
        if (!val) return '';
        const d = new Date(val);
        const options: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata' };
        if (period === '1d') return d.toLocaleTimeString('en-IN', { ...options, hour: '2-digit', minute: '2-digit' });
        if (period === '6m' || period === '12m') return d.toLocaleDateString('en-IN', { ...options, month: 'short', year: 'numeric' });
        return d.toLocaleDateString('en-IN', { ...options, month: 'short', day: 'numeric' });
    };

    return (
        <div className="flex-1 p-4 md:p-10 overflow-y-auto custom-scrollbar relative">
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-accentSec/5 rounded-full blur-[120px] -z-10 pointer-events-none"></div>

            <div className="max-w-7xl mx-auto space-y-8">
                {/* Header Section */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-outfit font-bold text-textMain flex items-center gap-3">
                            <Server className="text-accentGlow" /> System Overview
                        </h1>
                        <p className="text-textSec mt-1 text-xs md:text-sm">Monitor real-time health and metrics of the infrastructure.</p>
                    </div>
                    <button
                        onClick={loadData}
                        disabled={loading}
                        className="glass-panel flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border-color/10 bg-panelBg/20 hover:bg-panelBg/10 text-textMain font-semibold text-sm transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg w-full sm:w-auto justify-center"
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
                                : 'bg-panelBg/20 border-border-color/10'
                        }`}
                >
                    <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center shrink-0 ${health === 'healthy' ? 'bg-success/20' : health === 'error' ? 'bg-danger/20' : 'bg-panelBg/10'}`}>
                            {health === 'checking' ? (
                                <Loader2 className="w-5 h-5 md:w-6 md:h-6 text-textMain animate-spin" />
                            ) : (
                                <Activity className={`w-5 h-5 md:w-6 md:h-6 ${health === 'healthy' ? 'text-success drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'text-danger drop-shadow-[0_0_8px_rgba(244,63,94,0.8)]'}`} />
                            )}
                        </div>
                        <div>
                            <h3 className="text-textMain font-bold text-base md:text-lg leading-tight flex items-center gap-2">
                                Engine Connectivity
                                {health === 'healthy' && <span className="text-[8px] md:text-[10px] uppercase tracking-wider font-bold bg-success/20 text-success px-2 py-0.5 rounded-full border border-success/30">Online</span>}
                            </h3>
                            <p className="text-textSec text-[11px] md:text-sm mt-0.5">
                                {health === 'healthy' ? 'Systems operational and responding.' : health === 'error' ? 'Critical services unreachable.' : 'Verifying status...'}
                            </p>
                        </div>
                    </div>
                </motion.div>

                {/* Top Level Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {cards.map((card, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            className={`group glass-panel p-6 rounded-2xl relative overflow-hidden backdrop-blur-xl border border-border-color/10 hover:border-border-color/20 transition-all shadow-lg`}
                        >
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className={`text-xs font-bold uppercase tracking-widest ${card.textClass} opacity-80 mb-1`}>
                                        {card.label}
                                    </p>
                                    <h3 className="text-3xl font-outfit font-bold text-textMain drop-shadow-md">
                                        {loading ? <span className="animate-pulse">...</span> : card.count}
                                    </h3>
                                </div>
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center border border-border-color/10 ${card.bgGlow}`}>
                                    {card.icon}
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Time-Series Graphs */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="glass-panel rounded-2xl border border-border-color/10 overflow-hidden shadow-2xl relative"
                >
                    <div className="px-6 py-5 border-b border-border-color/10 bg-panelBg/40 backdrop-blur-md flex flex-col xl:flex-row xl:items-center justify-between gap-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                                <LineChart size={20} className="text-purple-400" />
                            </div>
                            <div>
                                <h4 className="font-bold text-textMain font-outfit text-lg">Growth Analytics</h4>
                                <p className="text-xs text-textSec font-bold tracking-wide">Platform adoption over time</p>
                            </div>
                        </div>

                        {/* Period Toggle */}
                        <div className="flex items-center bg-panelBg/60 border border-border-color/20 p-1 rounded-xl overflow-x-auto no-scrollbar shadow-inner">
                            {(['1d', '7d', '30d', '6m', '12m'] as Period[]).map(p => (
                                <button
                                    key={p}
                                    onClick={() => setPeriod(p)}
                                    className={`px-3 md:px-4 py-1.5 text-[10px] md:text-xs font-bold rounded-lg transition-all whitespace-nowrap ${period === p
                                            ? 'bg-accentGlow text-mainBg shadow-glow'
                                            : 'text-textSec hover:text-textMain hover:bg-panelBg/10'
                                        }`}
                                >
                                    {p.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="p-6 md:p-8 grid md:grid-cols-2 gap-8 bg-panelBg/20">
                        {/* Users Graph */}
                        <div className="relative">
                            <h5 className="text-sm font-bold text-pink-400 mb-6 flex items-center gap-2">
                                New Signups
                                {loadingSeries && <Loader2 size={12} className="animate-spin text-textSec" />}
                            </h5>
                            <div className="h-48 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={timeSeries.user_growth} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--text-sec) / 0.1)" vertical={false} />
                                        <XAxis
                                            dataKey="timestamp"
                                            tickFormatter={formatTooltipLabel}
                                            stroke="rgb(var(--text-sec) / 0.3)"
                                            tick={{ fill: 'rgb(var(--text-sec))', fontSize: 11, fontWeight: 600 }}
                                            tickMargin={10}
                                        />
                                        <YAxis
                                            stroke="rgb(var(--text-sec) / 0.3)"
                                            tick={{ fill: 'rgb(var(--text-sec))', fontSize: 11, fontWeight: 600 }}
                                            allowDecimals={false}
                                        />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: 'rgb(var(--panel-bg))', border: '1px solid rgb(var(--border-color) / 0.1)', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                            labelFormatter={formatTooltipLabel}
                                            itemStyle={{ color: '#ec4899', fontWeight: 'bold' }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="value"
                                            name="Signups"
                                            stroke="#ec4899"
                                            strokeWidth={3}
                                            fillOpacity={1}
                                            fill="url(#colorUsers)"
                                            animationDuration={1500}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Active Users Graph */}
                        <div className="relative">
                            <h5 className="text-sm font-bold text-emerald-400 mb-6 flex items-center gap-2">
                                Active Users
                                {loadingSeries && <Loader2 size={12} className="animate-spin text-textSec" />}
                            </h5>
                            <div className="h-48 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={timeSeries.active_users} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorActiveUsers" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--text-sec) / 0.1)" vertical={false} />
                                        <XAxis
                                            dataKey="timestamp"
                                            tickFormatter={formatTooltipLabel}
                                            stroke="rgb(var(--text-sec) / 0.3)"
                                            tick={{ fill: 'rgb(var(--text-sec))', fontSize: 11, fontWeight: 600 }}
                                            tickMargin={10}
                                        />
                                        <YAxis
                                            stroke="rgb(var(--text-sec) / 0.3)"
                                            tick={{ fill: 'rgb(var(--text-sec))', fontSize: 11, fontWeight: 600 }}
                                            allowDecimals={false}
                                        />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: 'rgb(var(--panel-bg))', border: '1px solid rgb(var(--border-color) / 0.1)', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                            labelFormatter={formatTooltipLabel}
                                            itemStyle={{ color: '#10b981', fontWeight: 'bold' }}
                                        />
                                        <Area
                                            type="stepAfter"
                                            dataKey="value"
                                            name="Engaged"
                                            stroke="#10b981"
                                            strokeWidth={3}
                                            fillOpacity={1}
                                            fill="url(#colorActiveUsers)"
                                            animationDuration={1500}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Documents Graph */}
                        <div className="relative">
                            <h5 className="text-sm font-bold text-cyan-400 mb-6 flex items-center gap-2">
                                Documents Ingested
                                {loadingSeries && <Loader2 size={12} className="animate-spin text-textSec" />}
                            </h5>
                            <div className="h-48 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={timeSeries.document_growth} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorDocs" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--text-sec) / 0.1)" vertical={false} />
                                        <XAxis
                                            dataKey="timestamp"
                                            tickFormatter={formatTooltipLabel}
                                            stroke="rgb(var(--text-sec) / 0.3)"
                                            tick={{ fill: 'rgb(var(--text-sec))', fontSize: 11, fontWeight: 600 }}
                                            tickMargin={10}
                                        />
                                        <YAxis
                                            stroke="rgb(var(--text-sec) / 0.3)"
                                            tick={{ fill: 'rgb(var(--text-sec))', fontSize: 11, fontWeight: 600 }}
                                            allowDecimals={false}
                                        />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: 'rgb(var(--panel-bg))', border: '1px solid rgb(var(--border-color) / 0.1)', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                            labelFormatter={formatTooltipLabel}
                                            itemStyle={{ color: '#22d3ee', fontWeight: 'bold' }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="value"
                                            name="Documents"
                                            stroke="#22d3ee"
                                            strokeWidth={3}
                                            fillOpacity={1}
                                            fill="url(#colorDocs)"
                                            animationDuration={1500}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* AI Queries Graph */}
                        <div className="relative">
                            <h5 className="text-sm font-bold text-purple-400 mb-6 flex items-center gap-2">
                                <Cpu size={16} className="text-purple-400" /> AI Queries
                                {loadingSeries && <Loader2 size={12} className="animate-spin text-textSec" />}
                            </h5>
                            <div className="h-48 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={timeSeries.ai_queries} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorAi" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--text-sec) / 0.1)" vertical={false} />
                                        <XAxis
                                            dataKey="timestamp"
                                            tickFormatter={formatTooltipLabel}
                                            stroke="rgb(var(--text-sec) / 0.3)"
                                            tick={{ fill: 'rgb(var(--text-sec))', fontSize: 11, fontWeight: 600 }}
                                            tickMargin={10}
                                        />
                                        <YAxis
                                            stroke="rgb(var(--text-sec) / 0.3)"
                                            tick={{ fill: 'rgb(var(--text-sec))', fontSize: 11, fontWeight: 600 }}
                                            allowDecimals={false}
                                        />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: 'rgb(var(--panel-bg))', border: '1px solid rgb(var(--border-color) / 0.1)', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                            labelFormatter={formatTooltipLabel}
                                            itemStyle={{ color: '#a855f7', fontWeight: 'bold' }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="value"
                                            name="Queries"
                                            stroke="#a855f7"
                                            strokeWidth={3}
                                            fillOpacity={1}
                                            fill="url(#colorAi)"
                                            animationDuration={1500}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                    </div>
                </motion.div>

                {/* Feedback Detailed Stats */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6"
                >
                    <div className="glass-panel p-6 rounded-2xl border border-border-color/10 bg-panelBg/20 backdrop-blur-md">
                        <h4 className="text-sm font-bold text-textMain uppercase tracking-widest mb-4 flex items-center gap-2">
                            <ThumbsUp size={16} className="text-success" /> User Satisfaction
                        </h4>
                        <div className="space-y-4">
                            <div className="flex justify-between items-end">
                                <span className="text-textSec text-xs font-bold">POS RATINGS</span>
                                <span className="text-success font-outfit font-bold text-xl">{feedbackStats?.total_positive || 0}</span>
                            </div>
                            <div className="w-full bg-panelBg/10 h-2 rounded-full overflow-hidden">
                                <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: feedbackStats ? `${feedbackStats.positive_rate_percent}%` : 0 }}
                                    className="h-full bg-success shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                                />
                            </div>
                            <div className="flex justify-between items-end pt-2">
                                <span className="text-textSec text-xs font-bold">NEG RATINGS</span>
                                <span className="text-danger font-outfit font-bold text-xl">{feedbackStats?.total_negative || 0}</span>
                            </div>
                            <div className="w-full bg-panelBg/10 h-2 rounded-full overflow-hidden">
                                <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: feedbackStats ? `${100 - feedbackStats.positive_rate_percent}%` : 0 }}
                                    className="h-full bg-danger shadow-[0_0_10px_rgba(244,63,94,0.5)]"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="glass-panel p-6 rounded-2xl border border-border-color/10 bg-panelBg/20 backdrop-blur-md flex flex-col justify-center">
                        <div className="text-center space-y-2">
                            <p className="text-textSec text-xs font-bold uppercase tracking-widest">Global Feedback Volume</p>
                            <h2 className="text-5xl font-outfit font-bold text-textMain drop-shadow-glow">
                                {feedbackStats ? (feedbackStats.total_positive + feedbackStats.total_negative) : 0}
                            </h2>
                            <p className="text-accentGlow text-[10px] font-bold">TOTAL INTERACTIONS RATED</p>
                        </div>
                    </div>
                </motion.div>

                {/* Tech Info Panel */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="glass-panel rounded-2xl border border-border-color/10 overflow-hidden shadow-2xl relative"
                >
                    <div className="px-6 py-5 border-b border-border-color/10 bg-panelBg/40 backdrop-blur-md flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-accentGlow/10 border border-accentGlow/20 flex items-center justify-center shadow-[0_0_15px_rgba(0,240,255,0.15)]">
                                <ShieldCheck size={20} className="text-accentGlow" />
                            </div>
                            <div>
                                <h4 className="font-bold text-textMain font-outfit text-lg">Infrastructure Security</h4>
                                <p className="text-xs text-textSec font-bold tracking-wide">System Architecture & Assurances</p>
                            </div>
                        </div>
                        <Database className="text-textSec/30" size={32} />
                    </div>
                    <div className="p-6 md:p-8 grid md:grid-cols-2 gap-8 bg-panelBg/20">
                        <div className="space-y-4">
                            <h5 className="text-sm font-bold text-accentSec uppercase tracking-wider flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-accentSec"></div>
                                Data Isolation
                            </h5>
                            <p className="text-textSec text-[0.95rem] leading-relaxed font-medium">
                                All vector indexing and LLM operations are strictly isolated. RBAC policies are enforced at the network edge and kernel level. Document uploads are scanned for heuristic anomalies before semantic splitting.
                            </p>
                        </div>
                        <div className="space-y-4">
                            <h5 className="text-sm font-bold text-purple-400 uppercase tracking-wider flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-purple-400"></div>
                                Vector Analytics
                            </h5>
                            <p className="text-textSec text-[0.95rem] leading-relaxed font-medium">
                                Current collection points directly to <span className="font-mono text-xs bg-panelBg/40 px-1.5 py-0.5 rounded border border-border-color/10 text-textMain">{stats?.collection_name || 'nexus_core'}</span>.
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
