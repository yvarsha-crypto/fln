import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { User, UserRole, Announcement } from './types';
import { LandingView } from './components/LandingView';
import { LoginView } from './components/LoginView';
import { Layout } from './components/Layout';
import {
  SuperadminDashboard,
  AdminDashboard,
  SchoolDashboard,
  TeacherDashboard,
  VolunteerDashboard
} from './components/RoleDashboards';
import { LogbookView } from './components/LogbookView';
import { TicketSubmission } from './components/TicketSubmission';
import { AssessmentCalendar } from './components/AssessmentCalendar';
import { PanelViews } from './components/PanelViews';
import { ShieldCheck, Settings, Bell, Loader2 } from 'lucide-react';
import { RegisterStudentView } from './components/students/RegisterStudentView';
import { RegisteredStudentsView } from './components/students/RegisteredStudentsView';
import { BulkUploadView } from './components/students/BulkUploadView';

const VIEW_TO_PATH: Record<string, string> = {
  workspace: '/workspace',
  logbook: '/logbook',
  tickets: '/tickets',
  calendar: '/calendar',
  settings: '/settings',
  notifications: '/notifications',
  register_student: '/register-student',
  registered_students: '/registered-students',
  bulk_upload: '/bulk-upload',
};

const PATH_TO_VIEW: Record<string, string> = Object.fromEntries(
  Object.entries(VIEW_TO_PATH).map(([k, v]) => [v.replace(/^\//, ''), k])
);

function pathFromViewId(view: string): string {
  if (VIEW_TO_PATH[view]) return VIEW_TO_PATH[view];
  return '/' + view.replace(/^\//, '');
}

function viewIdFromPath(path: string): string {
  const clean = path.replace(/^\//, '');
  return PATH_TO_VIEW[clean] || clean;
}

function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [token, setToken] = useState<string | null>(localStorage.getItem('fln_token'));
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const activeView = viewIdFromPath(location.pathname);

  const handleSelectView = (view: string) => {
    navigate(pathFromViewId(view));
  };

  const triggerToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Verify token session on load
  useEffect(() => {
    const checkSession = async () => {
      if (!token) {
        setAuthChecked(true);
        return;
      }
      try {
        const res = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok) {
          setCurrentUser(data.user);
          setAuthChecked(true);
        } else {
          handleLogout();
        }
      } catch (err) {
        handleLogout();
      }
    };
    checkSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Fetch announcements
  useEffect(() => {
    const fetchAnnouncements = async () => {
      if (!token || !currentUser) return;
      try {
        const res = await fetch('/api/announcements', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (Array.isArray(data)) {
          setAnnouncements(data);
        }
      } catch (err) {
        console.error('Error fetching announcements:', err);
      }
    };
    fetchAnnouncements();
    const interval = setInterval(fetchAnnouncements, 15000);
    return () => clearInterval(interval);
  }, [token, currentUser]);

  const handleLoginSuccess = (userToken: string, loggedInUser: User) => {
    localStorage.setItem('fln_token', userToken);
    setToken(userToken);
    setCurrentUser(loggedInUser);
    navigate('/workspace', { replace: true });
    triggerToast(`Switched workspace to ${loggedInUser.name} [${loggedInUser.role.toUpperCase()}]`);
  };

  const handleLogout = () => {
    localStorage.removeItem('fln_token');
    setToken(null);
    setCurrentUser(null);
    setAuthChecked(true);
    setAnnouncements([]);
    navigate('/', { replace: true });
    triggerToast('Logged out of active session.');
  };

  const handleMarkNotificationRead = (id: string) => {
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
  };

  const handleClearNotifications = () => {
    setAnnouncements([]);
  };

  const renderRoleWorkspace = () => {
    if (!currentUser || !token) return null;
    switch (currentUser.role) {
      case UserRole.SUPERADMIN:
        return <SuperadminDashboard user={currentUser} token={token} />;
      case UserRole.ADMIN:
      case UserRole.DISTRICT_ADMIN:
      case UserRole.BLOCK_ADMIN:
        return <AdminDashboard user={currentUser} token={token} />;
      case UserRole.SCHOOL:
        return <SchoolDashboard user={currentUser} token={token} />;
      case UserRole.TEACHER:
        return <TeacherDashboard user={currentUser} token={token} />;
      case UserRole.VOLUNTEER:
        return <VolunteerDashboard user={currentUser} token={token} />;
      default:
        return <div className="p-8 text-center text-zinc-500">Unrecognized user role mapping.</div>;
    }
  };

  const handleRoleSwitch = async (newRole: UserRole) => {
    if (!currentUser || !token) return;
    try {
      const res = await fetch('/api/admin/coordinators', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const users: User[] = await res.json();
      const targetUser = users.find((u) => u.role === newRole);

      if (targetUser) {
        setCurrentUser(targetUser);
        navigate('/workspace', { replace: true });
        triggerToast(`Switched active profile to ${targetUser.name} [${newRole.toUpperCase()}]`);
      } else {
        const fallbackUser: User = {
          ...currentUser,
          role: newRole,
          name: `Demo ${newRole.charAt(0).toUpperCase() + newRole.slice(1)}`
        };
        setCurrentUser(fallbackUser);
        navigate('/workspace', { replace: true });
        triggerToast(`Switched active profile to fallback ${newRole.toUpperCase()}`);
      }
    } catch (e) {
      const fallbackUser: User = {
        ...currentUser,
        role: newRole,
        name: `Demo ${newRole.charAt(0).toUpperCase() + newRole.slice(1)}`
      };
      setCurrentUser(fallbackUser);
      navigate('/workspace', { replace: true });
      triggerToast(`Switched active profile to fallback ${newRole.toUpperCase()}`);
    }
  };

  const activeUrgentAnnouncements = announcements.filter((a) => a.isUrgent);

  // Auth gate: while we don't yet know if the token is valid, show a spinner.
  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 text-slate-500 animate-spin" />
      </div>
    );
  }

  if (!currentUser) {
    if (location.pathname === '/login') {
      return (
        <LoginView
          onLoginSuccess={handleLoginSuccess}
          onBackToHome={() => navigate('/', { replace: true })}
        />
      );
    }
    return <LandingView onNavigateToLogin={() => navigate('/login')} />;
  }

  if (location.pathname === '/' || location.pathname === '/login') {
    return <Navigate to="/workspace" replace />;
  }

  return (
    <div className="flex min-h-screen flex-col font-sans bg-slate-50 text-slate-900 antialiased">
      <Layout
        currentUser={currentUser}
        onRoleSwitch={handleRoleSwitch}
        activeView={activeView}
        onSelectView={handleSelectView}
        notifications={announcements}
        onMarkNotificationRead={handleMarkNotificationRead}
        onClearNotifications={handleClearNotifications}
        onLogout={handleLogout}
      >
        {activeUrgentAnnouncements.length > 0 && (
          <div className="bg-amber-600 text-white font-medium text-xs py-2.5 px-6 flex items-center justify-between shadow-sm border border-amber-700 rounded-xl mb-6">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold">⚠️ CRITICAL ALERT:</span>
              <span>{activeUrgentAnnouncements[0].message}</span>
            </div>
            <span className="text-[10px] font-mono text-amber-200 bg-amber-800/40 px-2 py-0.5 rounded uppercase">
              Escalated
            </span>
          </div>
        )}

        <Routes>
          <Route path="/workspace" element={renderRoleWorkspace()} />
          <Route
            path="/register-student"
            element={<RegisterStudentView user={currentUser} token={token!} />}
          />
          <Route
            path="/registered-students"
            element={<RegisteredStudentsView user={currentUser} token={token!} />}
          />
          <Route path="/bulk-upload" element={<BulkUploadView user={currentUser} token={token!} />} />
          <Route path="/logbook" element={<LogbookView token={token!} user={currentUser} />} />
          <Route path="/tickets" element={<TicketSubmission token={token!} userRole={currentUser.role} />} />
          <Route path="/calendar" element={<AssessmentCalendar />} />
          <Route
            path="/settings"
            element={
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                  <Settings className="h-6 w-6 text-slate-500" />
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 font-sans">Portal Preferences & Account Settings</h2>
                    <p className="text-xs text-slate-505">Configure user settings, localization preferences, and SSO authorization status.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm font-sans">
                  <div className="space-y-4">
                    <h3 className="font-bold text-slate-800 text-xs uppercase font-mono">User Profile Details</h3>
                    <div className="p-4 bg-slate-50 rounded-lg space-y-2 border border-slate-150">
                      <div><span className="text-slate-450 font-semibold text-xs">Full Name:</span> <strong className="text-slate-800">{currentUser.name}</strong></div>
                      <div><span className="text-slate-450 font-semibold text-xs">Email ID:</span> <strong className="text-slate-850 font-mono">{currentUser.email}</strong></div>
                      <div><span className="text-slate-450 font-semibold text-xs">Assigned Scope:</span> <strong className="text-slate-800 font-mono">{currentUser.schoolId || currentUser.districtCode || currentUser.stateCode || 'National Oversight'}</strong></div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h3 className="font-bold text-slate-800 text-xs uppercase font-mono">Accessibility Configuration</h3>
                    <div className="p-4 bg-slate-50 rounded-lg space-y-3 border border-slate-150">
                      <label className="flex items-center gap-2 font-medium">
                        <input type="checkbox" defaultChecked className="rounded border-slate-300 text-indigo-650" />
                        <span>Enable High-Contrast Border Outlines</span>
                      </label>
                      <label className="flex items-center gap-2 font-medium">
                        <input type="checkbox" className="rounded border-slate-300 text-indigo-650" />
                        <span>Audio voice narration on hover (SLA §2.3)</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            }
          />
          <Route
            path="/notifications"
            element={
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                  <Bell className="h-6 w-6 text-slate-550" />
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 font-sans">Announcements Log</h2>
                    <p className="text-xs text-slate-505">Official notifications escalated by state administrative coordinators.</p>
                  </div>
                </div>
                <div className="space-y-4">
                  {announcements.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 font-mono text-xs">No active broadcasts.</div>
                  ) : (
                    announcements.map((notif) => (
                      <div
                        key={notif.id}
                        className={`p-4 border rounded-xl space-y-2 ${notif.isUrgent ? 'border-amber-200 bg-amber-50/30' : 'border-slate-150 bg-slate-50/50'}`}
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-sm text-slate-900">{notif.title}</h4>
                          <span className="text-[10px] text-slate-400 font-mono font-bold">{new Date(notif.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="text-xs text-slate-650 leading-relaxed font-sans">{notif.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            }
          />
          <Route
            path="*"
            element={<PanelViews activePanel={activeView} currentUser={currentUser} token={token!} />}
          />
        </Routes>
      </Layout>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-bold text-white shadow-2xl border border-slate-800 animate-slideIn">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-650 text-white">
            <ShieldCheck className="h-3 w-3 animate-ping" />
          </div>
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
