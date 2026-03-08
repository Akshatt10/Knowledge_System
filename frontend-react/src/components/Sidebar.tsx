import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    MessageSquare,
    Upload,
    BarChart3,
    LogOut,
    User,
    ShieldCheck,
    Sparkles
} from 'lucide-react';

const Sidebar: React.FC = () => {
    const { user, logout, isAdmin } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const navItems = [
        { to: '/chat', label: 'Chat Hub', icon: <MessageSquare size={20} /> },
        { to: '/knowledge', label: 'Knowledge Base', icon: <Upload size={20} /> },
    ];

    const adminItems = [
        { to: '/admin/users', label: 'User Management', icon: <ShieldCheck size={20} /> },
        { to: '/admin', label: 'System Stats', icon: <BarChart3 size={20} /> },
    ];

    return (
        <aside className="glass-panel" style={{
            width: '260px', height: 'calc(100vh - 40px)', margin: '20px',
            padding: '24px', display: 'flex', flexDirection: 'column'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px', paddingLeft: '8px' }}>
                <Sparkles size={24} color="var(--accent-glow)" />
                <h2 style={{ fontSize: '1.4rem', color: '#fff' }}>Nexus</h2>
            </div>

            <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {navItems.map(item => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        style={({ isActive }) => ({
                            display: 'flex', alignItems: 'center', gap: '12px',
                            padding: '12px 16px', borderRadius: 'var(--radius-sm)',
                            textDecoration: 'none', color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                            background: isActive ? 'rgba(0, 240, 255, 0.1)' : 'transparent',
                            fontWeight: '500', transition: 'var(--transition-smooth)'
                        })}
                    >
                        {item.icon} <span>{item.label}</span>
                    </NavLink>
                ))}

                {isAdmin && (
                    <>
                        <div style={{
                            fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)',
                            textTransform: 'uppercase', letterSpacing: '1px',
                            marginTop: '24px', marginBottom: '8px', paddingLeft: '16px'
                        }}>
                            Administration
                        </div>
                        {adminItems.map(item => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                style={({ isActive }) => ({
                                    display: 'flex', alignItems: 'center', gap: '12px',
                                    padding: '12px 16px', borderRadius: 'var(--radius-sm)',
                                    textDecoration: 'none', color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                    background: isActive ? 'rgba(0, 240, 255, 0.1)' : 'transparent',
                                    fontWeight: '500', transition: 'var(--transition-smooth)'
                                })}
                            >
                                {item.icon} <span>{item.label}</span>
                            </NavLink>
                        ))}
                    </>
                )}
            </nav>

            <div style={{
                marginTop: 'auto', paddingTop: '20px',
                borderTop: '1px solid var(--panel-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                        width: '36px', height: '36px', borderRadius: '50%',
                        background: 'var(--accent-gradient)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center'
                    }}>
                        {isAdmin ? <ShieldCheck size={18} color="#fff" /> : <User size={18} color="#fff" />}
                    </div>
                    <div style={{ overflow: 'hidden', maxWidth: '120px' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: '600', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                            {user?.email.split('@')[0]}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                            {user?.role}
                        </div>
                    </div>
                </div>
                <button
                    onClick={handleLogout}
                    title="Logout"
                    style={{
                        background: 'none', border: 'none', color: 'var(--text-secondary)',
                        cursor: 'pointer', padding: '8px', borderRadius: '8px',
                        transition: 'var(--transition-bounce)'
                    }}
                >
                    <LogOut size={20} />
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
