import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
    children: React.ReactNode;
    adminOnly?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, adminOnly = false }) => {
    const { isAuthenticated, isAdmin } = useAuth();
    const location = useLocation();

    if (!isAuthenticated) {
        // Redirect to login but save the current location AND its search parameters (?room=xyz)
        return <Navigate to="/login" state={{ from: { pathname: location.pathname, search: location.search } }} replace />;
    }

    if (adminOnly && !isAdmin) {
        // If not admin, redirect to chat
        return <Navigate to="/chat" replace />;
    }

    return <>{children}</>;
};

export default ProtectedRoute;
