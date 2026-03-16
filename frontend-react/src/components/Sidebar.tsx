import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    MessageSquare,
    Home as HomeIcon,
    Upload,
    BarChart3,
    LogOut,
    User,
    ShieldCheck,
    Sparkles,
    Hash,
    Plug,
    Network
} from 'lucide-react';
import { roomService } from '../services/api';

const Sidebar: React.FC = () => {
    const { user, logout, isAdmin, token } = useAuth();
    const navigate = useNavigate();
    const [rooms, setRooms] = React.useState<any[]>([]);

    React.useEffect(() => {
        const fetchRooms = async () => {
            try {
                const res = await roomService.getUserRooms();
                setRooms(res.data.rooms);
            } catch (err) {
                console.error("Failed to load user rooms", err);
            }
        };
        fetchRooms();

        window.addEventListener('rooms-updated', fetchRooms);
        return () => window.removeEventListener('rooms-updated', fetchRooms);
    }, [token]);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const navItems = [
        { to: '/home', label: 'Dashboard', icon: <HomeIcon size={20} /> },
        { to: '/chat', label: 'Chat Hub', icon: <MessageSquare size={20} /> },
        { to: '/knowledge', label: 'Documents', icon: <Upload size={20} /> },
        { to: '/graph', label: 'Knowledge Graph', icon: <Network size={20} /> },
        { to: '/connectors', label: 'Connectors', icon: <Plug size={20} /> },
    ];

    const adminItems = [
        { to: '/admin/users', label: 'User Management', icon: <ShieldCheck size={20} /> },
        { to: '/admin', label: 'System Stats', icon: <BarChart3 size={20} /> },
    ];

    return (
        <aside className="glass-panel w-[280px] h-[calc(100vh-40px)] m-5 p-6 flex flex-col relative overflow-hidden group">
            {/* Subtle glow effect behind the sidebar */}
            <div className="absolute top-0 left-0 w-full h-32 bg-accentGlow/5 blur-[50px] -z-10 rounded-t-2xl pointer-events-none"></div>

            <div className="flex items-center gap-3 mb-10 pl-2">
                <Sparkles size={28} className="text-accentGlow drop-shadow-glow" />
                <h2 className="text-2xl font-outfit font-bold tracking-wide text-textMain">Nexus</h2>
            </div>

            <nav className="flex-1 flex flex-col gap-2 overflow-y-auto pr-2">
                {navItems.map(item => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-300 relative overflow-hidden ${isActive
                                ? 'text-accentGlow bg-accentGlow/10 shadow-[inset_0_0_20px_rgba(0,240,255,0.05)]'
                                : 'text-textSec hover:text-textMain hover:bg-white/5'
                            }`
                        }
                    >
                        {({ isActive }) => (
                            <>
                                {isActive && (
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-accentGlow rounded-r-md shadow-glow"></div>
                                )}
                                {item.icon}
                                <span>{item.label}</span>
                            </>
                        )}
                    </NavLink>
                ))}

                {/* SHARED SPACES SUBMENU */}
                {rooms.length > 0 && (
                    <div className="mt-8">
                        <div className="text-[0.7rem] text-textSec/60 uppercase tracking-widest font-semibold mb-3 pl-4">
                            Chat Rooms
                        </div>
                        <div className="flex flex-col gap-1">
                            {rooms.map(room => (
                                <NavLink
                                    key={room.id}
                                    to={`/chat?room=${room.id}`}
                                    className={({ isActive }) =>
                                        `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 relative ${isActive
                                            ? 'text-accentGlow bg-accentGlow/5'
                                            : 'text-textSec hover:text-textMain hover:bg-white/5'
                                        }`
                                    }
                                >
                                    {({ isActive }) => (
                                        <>
                                            {isActive && (
                                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-accentGlow rounded-r-md shadow-glow"></div>
                                            )}
                                            <Hash size={16} className={isActive ? "text-accentGlow drop-shadow-glow" : "text-textSec/40"} />
                                            <span className="truncate">{room.name}</span>
                                        </>
                                    )}
                                </NavLink>
                            ))}
                        </div>
                    </div>
                )}

                {isAdmin && (
                    <>
                        <div className="text-[0.7rem] text-danger/60 uppercase tracking-widest font-semibold mt-10 mb-3 pl-4">
                            Administration
                        </div>
                        {adminItems.map(item => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                className={({ isActive }) =>
                                    `flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-300 relative ${isActive
                                        ? 'text-danger bg-danger/10 shadow-[inset_0_0_20px_rgba(255,77,77,0.05)]'
                                        : 'text-textSec hover:text-textMain hover:bg-white/5'
                                    }`
                                }
                            >
                                {({ isActive }) => (
                                    <>
                                        {isActive && (
                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-danger rounded-r-md shadow-glow-error"></div>
                                        )}
                                        {item.icon}
                                        <span>{item.label}</span>
                                    </>
                                )}
                            </NavLink>
                        ))}
                    </>
                )}
            </nav>


            <div className="mt-auto pt-6 border-t border-textMain/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-accent-gradient flex items-center justify-center shadow-glow">
                        {isAdmin ? <ShieldCheck size={20} className="text-white" /> : <User size={20} className="text-white" />}
                    </div>
                    <div className="overflow-hidden max-w-[120px]">
                        <div className="text-sm font-semibold truncate text-textMain">
                            {user?.name || user?.email.split('@')[0]}
                        </div>
                        <div className="text-[0.7rem] font-medium text-textSec uppercase tracking-wider">
                            {user?.role}
                        </div>
                    </div>
                </div>
                <button
                    onClick={handleLogout}
                    title="Logout"
                    className="p-2.5 rounded-xl text-textSec hover:text-danger hover:bg-danger/10 transition-all duration-300 group"
                >
                    <LogOut size={20} className="group-hover:-translate-x-1 transition-transform" />
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
