import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Users,
    Shield,
    User,
    Trash2,
    RefreshCw,
    Search,
    Loader2,
    AlertCircle,
    MoreVertical
} from 'lucide-react';
import { adminService } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface UserData {
    id: string;
    email: string;
    role: string;
    is_active: boolean;
}

const UserManagement: React.FC = () => {
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState<UserData[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const loadUsers = async () => {
        setLoading(true);
        try {
            const res = await adminService.listUsers();
            setUsers(res.data);
        } catch (err) {
            console.error('Failed to load users', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadUsers(); }, []);

    const handleRoleToggle = async (userId: string, currentRole: string) => {
        if (userId === currentUser?.id) {
            alert("You cannot change your own role.");
            return;
        }

        const newRole = currentRole === 'ADMIN' ? 'USER' : 'ADMIN';
        if (!confirm(`Are you sure you want to change this user to ${newRole}?`)) return;

        setActionLoading(userId);
        try {
            await adminService.updateUser(userId, { role: newRole });
            await loadUsers();
        } catch (err) {
            alert('Failed to update role');
        } finally {
            setActionLoading(null);
        }
    };

    const handleDeleteUser = async (userId: string, email: string) => {
        if (userId === currentUser?.id) {
            alert("You cannot delete your own account.");
            return;
        }

        if (!confirm(`CRITICAL: Are you sure you want to PERMANENTLY delete account ${email}?`)) return;

        setActionLoading(userId);
        try {
            await adminService.deleteUser(userId);
            await loadUsers();
        } catch (err) {
            alert('Failed to delete user');
        } finally {
            setActionLoading(null);
        }
    };

    const filteredUsers = users.filter(u =>
        u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.role.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div style={{ flex: 1, padding: '40px', overflowY: 'auto' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                    <div>
                        <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>User Management</h1>
                        <p style={{ color: 'var(--text-secondary)' }}>Manage platform access control and administrative roles.</p>
                    </div>
                    <button
                        onClick={loadUsers}
                        className="glass-panel"
                        style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--panel-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        Sync Users
                    </button>
                </div>

                <div className="glass-panel" style={{ padding: '24px', marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <Search size={20} color="var(--text-secondary)" />
                    <input
                        type="text"
                        placeholder="Search users by email or role..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ background: 'none', border: 'none', color: '#fff', outline: 'none', flex: 1, fontSize: '1rem' }}
                    />
                </div>

                <div className="glass-panel" style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '20px 24px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--panel-border)', display: 'grid', gridTemplateColumns: 'minmax(300px, 2fr) 1fr 1fr 120px', fontWeight: '600', fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        <div>User Account</div>
                        <div>Assigned Role</div>
                        <div>Status</div>
                        <div style={{ textAlign: 'right' }}>Actions</div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {loading ? (
                            <div style={{ padding: '80px', textAlign: 'center', opacity: 0.5 }}>
                                <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 16px' }} />
                                Processing users...
                            </div>
                        ) : filteredUsers.length === 0 ? (
                            <div style={{ padding: '80px', textAlign: 'center', opacity: 0.5 }}>
                                No users found matching your search.
                            </div>
                        ) : (
                            filteredUsers.map((u, idx) => (
                                <motion.div
                                    key={u.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    style={{
                                        padding: '20px 24px',
                                        display: 'grid',
                                        gridTemplateColumns: 'minmax(300px, 2fr) 1fr 1fr 120px',
                                        alignItems: 'center',
                                        borderBottom: idx === filteredUsers.length - 1 ? 'none' : '1px solid var(--panel-border)',
                                        background: u.id === currentUser?.id ? 'rgba(0, 240, 255, 0.03)' : 'transparent'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <User size={20} color={u.id === currentUser?.id ? 'var(--accent-glow)' : 'var(--text-secondary)'} />
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: '600' }}>{u.email}</div>
                                            <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>UID: {u.id.substring(0, 8)}...</div>
                                        </div>
                                    </div>

                                    <div>
                                        <span style={{
                                            padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '700',
                                            background: u.role === 'ADMIN' ? 'rgba(0, 240, 255, 0.1)' : 'rgba(255,255,255,0.05)',
                                            color: u.role === 'ADMIN' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                            border: `1px solid ${u.role === 'ADMIN' ? 'rgba(0, 240, 255, 0.2)' : 'rgba(255,255,255,0.1)'}`
                                        }}>
                                            {u.role.toUpperCase()}
                                        </span>
                                    </div>

                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success)' }}></div>
                                            Active
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                        {actionLoading === u.id ? (
                                            <Loader2 size={18} className="animate-spin" style={{ opacity: 0.5 }} />
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => handleRoleToggle(u.id, u.role)}
                                                    title={u.role === 'ADMIN' ? 'Demote to User' : 'Promote to Admin'}
                                                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: '6px', borderRadius: '6px', transition: '0.2s' }}
                                                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                                    disabled={u.id === currentUser?.id}
                                                >
                                                    <Shield size={18} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteUser(u.id, u.email)}
                                                    title="Delete User"
                                                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: '6px', borderRadius: '6px', transition: '0.2s' }}
                                                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 77, 77, 0.1)')}
                                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                                    disabled={u.id === currentUser?.id}
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </motion.div>
                            ))
                        )}
                    </div>
                </div>

                <div style={{ marginTop: '32px', display: 'flex', gap: '16px' }}>
                    <div className="glass-panel" style={{ flex: 1, padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <Shield size={24} color="var(--accent-glow)" />
                        <div>
                            <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>Administrative Shield</div>
                            <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>Admins can manage documents and system-wide roles.</div>
                        </div>
                    </div>
                    <div className="glass-panel" style={{ flex: 1, padding: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <AlertCircle size={24} color="var(--danger)" />
                        <div>
                            <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>Safety First</div>
                            <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>Self-deletion and role demotion are blocked for your safety.</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UserManagement;
