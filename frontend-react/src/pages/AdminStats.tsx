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
    Users
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
            setHealth(healthRes.data.status === 'ok' ? 'healthy' : 'error');
        } catch (err) {
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
            icon: <FileText size={24} />,
            color: '#00f0ff'
        },
        {
            label: 'Semantic Chunks',
            count: stats?.total_chunks || 0,
            icon: <Layers size={24} />,
            color: '#0050ff'
        },
        {
            label: 'Platform Users',
            count: stats?.total_users || 0,
            icon: <Users size={24} />,
            color: '#ff007f'
        },
    ];

    return (
        <div style={{ flex: 1, padding: '40px', overflowY: 'auto' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
                    <div>
                        <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>System Administration</h1>
                        <p style={{ color: 'var(--text-secondary)' }}>Monitor the Knowledge Intelligence infrastructure.</p>
                    </div>
                    <button
                        onClick={loadData}
                        className="glass-panel"
                        style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--panel-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        Sync Metrics
                    </button>
                </div>

                {/* Health Bar */}
                <div className="glass-panel" style={{
                    padding: '16px 24px', marginBottom: '32px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: health === 'healthy' ? 'rgba(0, 255, 136, 0.05)' : 'rgba(255, 77, 77, 0.05)',
                    border: `1px solid ${health === 'healthy' ? 'rgba(0, 255, 136, 0.2)' : 'rgba(255, 77, 77, 0.2)'}`
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Activity size={20} color={health === 'healthy' ? 'var(--success)' : 'var(--danger)'} />
                        <span style={{ fontWeight: '600', fontSize: '0.95rem' }}>
                            Engine Connectivity: {health.toUpperCase()}
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', opacity: 0.7 }}>
                        <Clock size={14} /> Last heartbeat: {new Date().toLocaleTimeString()}
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
                    {cards.map((card, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            className="glass-panel"
                            style={{ padding: '32px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}
                        >
                            <div style={{
                                position: 'absolute', top: 0, left: 0, width: '100%', height: '2px',
                                background: card.color, opacity: 0.5
                            }}></div>

                            <div style={{
                                width: '56px', height: '56px', borderRadius: '14px',
                                background: `${card.color}15`, color: card.color,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 20px'
                            }}>
                                {card.icon}
                            </div>

                            <h3 style={{ fontSize: '2.5rem', marginBottom: '8px', fontWeight: '700' }}>
                                {loading ? '...' : card.count}
                            </h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                                {card.label}
                            </p>
                        </motion.div>
                    ))}
                </div>

                <div style={{ marginTop: '40px' }} className="glass-panel">
                    <div style={{ padding: '24px', borderBottom: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <ShieldCheck size={20} color="var(--accent-glow)" />
                        <h4 style={{ fontWeight: '600' }}>Infrastructure Security</h4>
                    </div>
                    <div style={{ padding: '24px', opacity: 0.7, fontSize: '0.9rem', lineHeight: '1.6' }}>
                        All vector indexing and LLM operations are strictly isolated. RBAC policies are enforced at the network edge and kernel level. Document uploads are scanned for heuristic anomalies before semantic splitting.
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminStats;
