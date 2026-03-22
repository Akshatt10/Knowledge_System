import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Shield,
    User,
    Trash2,
    RefreshCw,
    Search,
    Loader2,
    AlertCircle,
    Users
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
        } catch {
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
        } catch {
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
        <div className="flex-1 p-4 md:p-10 overflow-y-auto custom-scrollbar relative">
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-[120px] -z-10 pointer-events-none"></div>

            <div className="max-w-7xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-outfit font-bold text-textMain flex items-center gap-3">
                            <Users className="text-accentGlow" /> Registry
                        </h1>
                        <p className="text-textSec mt-1 text-xs md:text-sm font-medium">Manage platform access control and roles.</p>
                    </div>
                    <button
                        onClick={loadUsers}
                        disabled={loading}
                        className="glass-panel flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border-color/10 bg-panelBg/10 hover:bg-panelBg/20 text-textMain font-semibold text-sm transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg w-full sm:w-auto justify-center"
                    >
                        {loading ? <Loader2 size={18} className="animate-spin text-purple-400" /> : <RefreshCw size={18} className="text-purple-400" />}
                        {loading ? 'Syncing...' : 'Sync Users'}
                    </button>
                </div>

                {/* Search Bar */}
                <div className="glass-panel p-4 md:p-5 rounded-2xl flex items-center gap-4 border border-border-color/10 bg-panelBg/30 backdrop-blur-xl shadow-lg focus-within:border-accentGlow/50 focus-within:ring-4 focus-within:ring-accentGlow/10 transition-all">
                    <Search size={22} className="text-textSec" />
                    <input
                        type="text"
                        placeholder="Search users by email or role..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-transparent border-none text-textMain outline-none flex-1 text-[1rem] placeholder:text-textSec/50 font-medium"
                    />
                </div>

                {/* Users Table */}
                <div className="glass-panel rounded-2xl border border-border-color/10 overflow-hidden shadow-2xl bg-panelBg/20 backdrop-blur-xl relative">
                    <div className="absolute left-0 top-0 w-64 h-64 bg-purple-500/5 rounded-full blur-[80px] -z-10 pointer-events-none"></div>

                    {/* Table Header */}
                    <div className="px-6 py-4 bg-panelBg/20 border-b border-border-color/10 grid grid-cols-[1fr_auto] md:grid-cols-[2fr_1fr_1fr_120px] gap-4 font-bold text-[10px] md:text-xs text-textSec uppercase tracking-wider">
                        <div>User Account</div>
                        <div className="hidden md:block">Assigned Role</div>
                        <div className="hidden md:block">Status</div>
                        <div className="text-right">Actions</div>
                    </div>

                    {/* Table Body */}
                    <div className="flex flex-col min-h-[300px]">
                        {loading ? (
                            <div className="flex-1 flex flex-col items-center justify-center p-12 text-textSec opacity-70">
                                <Loader2 size={40} className="animate-spin mb-4 text-purple-400 drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]" />
                                <span className="text-sm font-medium">Processing user registry...</span>
                            </div>
                        ) : filteredUsers.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center p-12 text-textSec opacity-70">
                                <Users size={40} className="mb-4 opacity-50" />
                                <span className="text-sm font-medium">No users found matching your search.</span>
                            </div>
                        ) : (
                            <AnimatePresence>
                                {filteredUsers.map((u, idx) => {
                                    const isMe = u.id === currentUser?.id;
                                    const isAdmin = u.role === 'ADMIN';

                                    return (
                                        <motion.div
                                            key={u.id}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 10 }}
                                            transition={{ delay: idx * 0.05 }}
                                            className={`px-4 md:px-6 py-4 md:py-5 grid grid-cols-[1fr_auto] md:grid-cols-[2fr_1fr_1fr_120px] gap-4 items-center border-b border-border-color/5 transition-colors hover:bg-panelBg/10 ${isMe ? 'bg-accentGlow/5 hover:bg-accentGlow/10' : ''} ${idx === filteredUsers.length - 1 ? 'border-none' : ''}`}
                                        >
                                            <div className="flex items-center gap-3 md:gap-4 min-w-0">
                                                <div className={`w-9 h-9 md:w-10 md:h-10 rounded-xl shrink-0 flex items-center justify-center border shadow-sm ${isMe ? 'bg-accentGlow/20 border-accentGlow/30 text-accentGlow' : 'bg-panelBg/20 border-border-color/10 text-textSec'}`}>
                                                    <User size={16} className={isMe ? 'drop-shadow-glow' : ''} />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-bold text-textMain text-[0.85rem] md:text-[0.95rem] truncate flex items-center gap-2">
                                                        {u.email}
                                                        {isMe && <span className="text-[8px] md:text-[10px] bg-accentGlow/20 text-accentGlow px-1.5 py-0.5 rounded-md border border-accentGlow/30 uppercase tracking-wider font-bold shrink-0">Me</span>}
                                                    </div>
                                                    <div className="md:hidden flex items-center gap-2 mt-1">
                                                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold border ${isAdmin ? 'bg-accentGlow/10 text-accentGlow border-accentGlow/20' : 'bg-panelBg/20 text-textSec border-border-color/10'}`}>
                                                            {u.role}
                                                        </span>
                                                        <div className="w-1 h-1 rounded-full bg-success"></div>
                                                    </div>
                                                    <div className="hidden md:block text-xs font-mono text-textSec/60 mt-0.5 truncate">
                                                        UID: {u.id.substring(0, 12)}...
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="hidden md:flex items-center">
                                                <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border flex items-center gap-1.5 w-fit ${isAdmin
                                                    ? 'bg-accentGlow/10 text-accentGlow border-accentGlow/20 shadow-[inset_0_0_10px_rgba(99,102,241,0.1)]'
                                                    : 'bg-panelBg/20 text-textSec border-border-color/10'
                                                    }`}>
                                                    {isAdmin && <Shield size={12} />}
                                                    {u.role.toUpperCase()}
                                                </span>
                                            </div>

                                            <div className="hidden md:flex items-center">
                                                <div className="flex items-center gap-2 text-[0.85rem] font-medium text-textSec">
                                                    <div className="w-2 h-2 rounded-full bg-success drop-shadow-[0_0_5px_rgba(16,185,129,0.8)] animate-pulse"></div>
                                                    Active
                                                </div>
                                            </div>

                                            <div className="flex justify-end gap-1 md:gap-2 text-right">
                                                {actionLoading === u.id ? (
                                                    <Loader2 size={18} className="animate-spin text-textSec opacity-50" />
                                                ) : (
                                                    <>
                                                        <button
                                                            onClick={() => handleRoleToggle(u.id, u.role)}
                                                            disabled={isMe}
                                                            className={`p-1.5 md:p-2 rounded-lg transition-all ${isMe ? 'opacity-20 cursor-not-allowed' : 'text-textSec hover:text-textMain hover:bg-panelBg/20'}`}
                                                        >
                                                            <Shield size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteUser(u.id, u.email)}
                                                            disabled={isMe}
                                                            className={`p-1.5 md:p-2 rounded-lg transition-all ${isMe ? 'opacity-20 cursor-not-allowed' : 'text-textSec hover:text-danger hover:bg-danger/10'}`}
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                        )}
                    </div>
                </div>

                {/* Info Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="glass-panel p-6 rounded-2xl flex items-start gap-4 border border-border-color/10 bg-panelBg/20"
                    >
                        <div className="p-3 bg-accentGlow/10 border border-accentGlow/20 rounded-xl shrink-0">
                            <Shield size={24} className="text-accentGlow drop-shadow-glow" />
                        </div>
                        <div>
                            <div className="text-[0.95rem] font-bold text-textMain mb-1">Administrative Shield</div>
                            <div className="text-sm text-textSec font-medium leading-relaxed">Admins bypass standard RLS policies, having full visibility over knowledge bases and system health.</div>
                        </div>
                    </motion.div>
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="glass-panel p-6 rounded-2xl flex items-start gap-4 border border-border-color/10 bg-panelBg/20"
                    >
                        <div className="p-3 bg-danger/10 border border-danger/20 rounded-xl shrink-0">
                            <AlertCircle size={24} className="text-danger drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
                        </div>
                        <div>
                            <div className="text-[0.95rem] font-bold text-textMain mb-1">Safety Protocols Enforced</div>
                            <div className="text-sm text-textSec font-medium leading-relaxed">Self-deletion and role demotion are strictly blocked at the application level to prevent accidental lockouts.</div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </div>
    );
};

export default UserManagement;
