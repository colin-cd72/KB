import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import {
  LayoutDashboard,
  AlertCircle,
  BookOpen,
  Monitor,
  Search,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  Bell,
  ChevronDown,
  CheckSquare,
  Sparkles,
  ChevronRight
} from 'lucide-react';
import clsx from 'clsx';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, description: 'Overview & stats' },
  { name: 'Issues', href: '/issues', icon: AlertCircle, description: 'Problem tracking' },
  { name: 'Todos', href: '/todos', icon: CheckSquare, description: 'Task management' },
  { name: 'Manuals', href: '/manuals', icon: BookOpen, description: 'Documentation' },
  { name: 'Equipment', href: '/equipment', icon: Monitor, description: 'Asset registry' },
  { name: 'Search', href: '/search', icon: Search, description: 'AI-powered search' },
];

const adminNavigation = [
  { name: 'Users', href: '/users', icon: Users, roles: ['admin'], description: 'User management' },
];

function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const allNavigation = [
    ...navigation,
    ...adminNavigation.filter(item => !item.roles || item.roles.includes(user?.role))
  ];

  const isActive = (href) => location.pathname === href || location.pathname.startsWith(href + '/');

  return (
    <div className="min-h-screen">
      {/* Mobile sidebar overlay */}
      <div className={clsx(
        'fixed inset-0 z-50 lg:hidden transition-opacity duration-300',
        sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      )}>
        <div
          className="fixed inset-0 bg-dark-900/60 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
        <div className={clsx(
          'fixed inset-y-0 left-0 w-72 bg-white shadow-2xl transform transition-transform duration-300',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}>
          {/* Mobile sidebar header */}
          <div className="flex items-center justify-between h-20 px-6 border-b border-dark-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/25">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="font-bold text-dark-900">TMRW Sports</span>
                <p className="text-xs text-dark-500">Knowledge Base</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="btn-icon"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mobile navigation */}
          <nav className="p-4 space-y-1">
            {allNavigation.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setSidebarOpen(false)}
                className={clsx(
                  'nav-item',
                  isActive(item.href) ? 'nav-item-active' : 'nav-item-inactive'
                )}
              >
                <item.icon className="w-5 h-5" />
                <div className="flex-1">
                  <span>{item.name}</span>
                </div>
                {isActive(item.href) && (
                  <ChevronRight className="w-4 h-4 opacity-50" />
                )}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:block sidebar">
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/25">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="font-bold text-lg text-dark-900">TMRW Sports</span>
              <p className="text-xs text-dark-500 font-medium">Knowledge Base</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <div className="mb-2 px-4">
            <span className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Menu</span>
          </div>
          {allNavigation.map((item) => (
            <Link
              key={item.name}
              to={item.href}
              className={clsx(
                'nav-item group',
                isActive(item.href) ? 'nav-item-active' : 'nav-item-inactive'
              )}
            >
              <div className={clsx(
                'w-9 h-9 rounded-lg flex items-center justify-center transition-colors',
                isActive(item.href)
                  ? 'bg-white/20'
                  : 'bg-dark-100 group-hover:bg-dark-200'
              )}>
                <item.icon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <span className="font-medium">{item.name}</span>
                <p className={clsx(
                  'text-xs',
                  isActive(item.href) ? 'text-white/70' : 'text-dark-400'
                )}>
                  {item.description}
                </p>
              </div>
              {isActive(item.href) && (
                <ChevronRight className="w-4 h-4 opacity-50" />
              )}
            </Link>
          ))}
        </nav>

        {/* Sidebar footer */}
        <div className="sidebar-footer">
          <Link
            to="/settings"
            className={clsx(
              'nav-item',
              isActive('/settings') ? 'nav-item-active' : 'nav-item-inactive'
            )}
          >
            <div className={clsx(
              'w-9 h-9 rounded-lg flex items-center justify-center transition-colors',
              isActive('/settings')
                ? 'bg-white/20'
                : 'bg-dark-100 group-hover:bg-dark-200'
            )}>
              <Settings className="w-5 h-5" />
            </div>
            <span className="font-medium">Settings</span>
          </Link>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-72">
        {/* Top bar */}
        <header className="topbar">
          <button
            className="lg:hidden btn-icon"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-6 h-6" />
          </button>

          {/* Search bar placeholder */}
          <div className="hidden md:flex flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
              <input
                type="text"
                placeholder="Quick search..."
                className="search-input w-full"
                onClick={() => navigate('/search')}
                readOnly
              />
              <kbd className="absolute right-4 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-dark-400 bg-dark-100 rounded">
                ⌘K
              </kbd>
            </div>
          </div>

          <div className="flex-1 md:hidden" />

          {/* Notifications */}
          <button className="btn-icon relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger-500 rounded-full ring-2 ring-white" />
          </button>

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-dark-100 transition-colors"
            >
              <div className="avatar avatar-sm">
                <span>{user?.name?.charAt(0).toUpperCase()}</span>
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-sm font-semibold text-dark-900">{user?.name}</p>
                <p className="text-xs text-dark-500 capitalize">{user?.role}</p>
              </div>
              <ChevronDown className={clsx(
                'w-4 h-4 text-dark-400 transition-transform',
                userMenuOpen && 'rotate-180'
              )} />
            </button>

            {userMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setUserMenuOpen(false)}
                />
                <div className="dropdown-menu">
                  <div className="px-4 py-3 border-b border-dark-100">
                    <p className="text-sm font-semibold text-dark-900">{user?.name}</p>
                    <p className="text-xs text-dark-500">{user?.email}</p>
                    <span className="inline-block mt-2 px-2 py-0.5 text-xs font-medium bg-primary-100 text-primary-700 rounded-full capitalize">
                      {user?.role}
                    </span>
                  </div>
                  <Link
                    to="/settings"
                    onClick={() => setUserMenuOpen(false)}
                    className="dropdown-item"
                  >
                    <Settings className="w-4 h-4" />
                    Settings
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="dropdown-item w-full text-danger-600 hover:bg-danger-50 hover:text-danger-700"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="p-6 lg:p-8 page-animate">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default Layout;
