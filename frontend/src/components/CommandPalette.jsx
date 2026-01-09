import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { searchApi } from '../services/api';
import {
  Search, X, AlertCircle, FileText, Monitor, BookOpen,
  Clock, Star, ArrowRight, Loader2, Hash, Settings,
  LayoutDashboard, Package, CheckSquare
} from 'lucide-react';
import clsx from 'clsx';

const NAVIGATION_ITEMS = [
  { id: 'nav-dashboard', title: 'Dashboard', type: 'navigation', icon: LayoutDashboard, path: '/dashboard' },
  { id: 'nav-issues', title: 'Issues', type: 'navigation', icon: AlertCircle, path: '/issues' },
  { id: 'nav-todos', title: 'Todos', type: 'navigation', icon: CheckSquare, path: '/todos' },
  { id: 'nav-rmas', title: 'RMAs', type: 'navigation', icon: Package, path: '/rmas' },
  { id: 'nav-manuals', title: 'Manuals', type: 'navigation', icon: BookOpen, path: '/manuals' },
  { id: 'nav-articles', title: 'Articles', type: 'navigation', icon: FileText, path: '/articles' },
  { id: 'nav-equipment', title: 'Equipment', type: 'navigation', icon: Monitor, path: '/equipment' },
  { id: 'nav-search', title: 'Search', type: 'navigation', icon: Search, path: '/search' },
  { id: 'nav-settings', title: 'Settings', type: 'navigation', icon: Settings, path: '/settings' },
];

function CommandPalette({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();

  // Search query
  const { data: searchResults, isLoading } = useQuery({
    queryKey: ['quick-search', query],
    queryFn: async () => {
      const response = await searchApi.quick(query);
      return response.data.results;
    },
    enabled: query.length >= 2,
    staleTime: 30000,
  });

  // Get recent searches
  const { data: recentSearches } = useQuery({
    queryKey: ['search-history'],
    queryFn: async () => {
      const response = await searchApi.getHistory(5);
      return response.data.history;
    },
    enabled: isOpen && query.length === 0,
  });

  // Get saved searches
  const { data: savedSearches } = useQuery({
    queryKey: ['saved-searches'],
    queryFn: async () => {
      const response = await searchApi.getSaved();
      return response.data.searches;
    },
    enabled: isOpen && query.length === 0,
  });

  // Build display items
  const getDisplayItems = useCallback(() => {
    if (query.length >= 2 && searchResults) {
      return searchResults.map(item => ({
        ...item,
        id: `${item.type}-${item.id}`,
      }));
    }

    if (query.length === 0) {
      const items = [];

      // Filter navigation by query
      const filteredNav = NAVIGATION_ITEMS.filter(
        item => item.title.toLowerCase().includes(query.toLowerCase())
      );
      if (filteredNav.length > 0) {
        items.push({ type: 'header', title: 'Navigation' });
        items.push(...filteredNav);
      }

      // Recent searches
      if (recentSearches?.length > 0) {
        items.push({ type: 'header', title: 'Recent Searches' });
        items.push(...recentSearches.map(s => ({
          id: `recent-${s.id}`,
          title: s.query,
          type: 'recent',
          search_type: s.search_type,
        })));
      }

      // Saved searches
      if (savedSearches?.length > 0) {
        items.push({ type: 'header', title: 'Saved Searches' });
        items.push(...savedSearches.map(s => ({
          id: `saved-${s.id}`,
          title: s.name,
          subtitle: s.query,
          type: 'saved',
        })));
      }

      return items;
    }

    // Filter navigation when typing
    const filtered = NAVIGATION_ITEMS.filter(
      item => item.title.toLowerCase().includes(query.toLowerCase())
    );
    return filtered;
  }, [query, searchResults, recentSearches, savedSearches]);

  const displayItems = getDisplayItems();
  const selectableItems = displayItems.filter(item => item.type !== 'header');

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, searchResults]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && selectableItems.length > 0) {
      const selectedEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, selectableItems.length]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(i => Math.min(i + 1, selectableItems.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(i => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (selectableItems[selectedIndex]) {
            handleSelect(selectableItems[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, selectableItems, onClose]);

  const handleSelect = (item) => {
    if (!item) return;

    switch (item.type) {
      case 'navigation':
        navigate(item.path);
        break;
      case 'issue':
        navigate(`/issues/${item.id}`);
        break;
      case 'article':
        navigate(`/articles/${item.slug}`);
        break;
      case 'equipment':
        navigate(`/equipment?search=${encodeURIComponent(item.title)}`);
        break;
      case 'manual':
        navigate(`/manuals?search=${encodeURIComponent(item.title)}`);
        break;
      case 'recent':
      case 'saved':
        setQuery(item.subtitle || item.title);
        return; // Don't close, just search
    }

    onClose();
  };

  const getItemIcon = (item) => {
    switch (item.type) {
      case 'issue':
        return AlertCircle;
      case 'article':
        return FileText;
      case 'equipment':
        return Monitor;
      case 'manual':
        return BookOpen;
      case 'navigation':
        return item.icon;
      case 'recent':
        return Clock;
      case 'saved':
        return Star;
      default:
        return Hash;
    }
  };

  const getItemColor = (item) => {
    switch (item.type) {
      case 'issue':
        return 'text-warning-500';
      case 'article':
        return 'text-primary-500';
      case 'equipment':
        return 'text-accent-500';
      case 'manual':
        return 'text-success-500';
      case 'recent':
        return 'text-dark-400';
      case 'saved':
        return 'text-warning-500';
      default:
        return 'text-dark-500';
    }
  };

  if (!isOpen) return null;

  let selectableIndex = -1;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-dark-900/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Command Palette */}
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-2xl px-4">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 py-4 border-b border-dark-100">
            <Search className="w-5 h-5 text-dark-400 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or type a command..."
              className="flex-1 bg-transparent border-none outline-none text-lg text-dark-900 placeholder:text-dark-400"
            />
            {isLoading && <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />}
            <kbd className="hidden sm:inline-flex items-center px-2 py-1 text-xs font-medium text-dark-400 bg-dark-100 rounded">
              ESC
            </kbd>
          </div>

          {/* Results List */}
          <div ref={listRef} className="max-h-[50vh] overflow-y-auto">
            {displayItems.length === 0 && query.length >= 2 && !isLoading ? (
              <div className="px-4 py-8 text-center text-dark-500">
                <Search className="w-10 h-10 mx-auto mb-2 text-dark-300" />
                <p>No results found for "{query}"</p>
              </div>
            ) : (
              displayItems.map((item, idx) => {
                if (item.type === 'header') {
                  return (
                    <div
                      key={`header-${item.title}`}
                      className="px-4 py-2 text-xs font-semibold text-dark-400 uppercase tracking-wider bg-dark-50"
                    >
                      {item.title}
                    </div>
                  );
                }

                selectableIndex++;
                const Icon = getItemIcon(item);
                const isSelected = selectableIndex === selectedIndex;

                return (
                  <button
                    key={item.id}
                    data-index={selectableIndex}
                    onClick={() => handleSelect(item)}
                    className={clsx(
                      'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                      isSelected ? 'bg-primary-50' : 'hover:bg-dark-50'
                    )}
                  >
                    <div className={clsx(
                      'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                      isSelected ? 'bg-primary-100' : 'bg-dark-100'
                    )}>
                      <Icon className={clsx('w-4 h-4', getItemColor(item))} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={clsx(
                        'font-medium truncate',
                        isSelected ? 'text-primary-700' : 'text-dark-900'
                      )}>
                        {item.title}
                      </p>
                      {item.subtitle && (
                        <p className="text-sm text-dark-500 truncate">{item.subtitle}</p>
                      )}
                      {item.status && (
                        <p className="text-xs text-dark-400 mt-0.5">
                          Status: {item.status}
                        </p>
                      )}
                    </div>
                    {isSelected && (
                      <ArrowRight className="w-4 h-4 text-primary-500 flex-shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-dark-100 bg-dark-50 flex items-center justify-between text-xs text-dark-400">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white rounded border border-dark-200">↑</kbd>
                <kbd className="px-1.5 py-0.5 bg-white rounded border border-dark-200">↓</kbd>
                Navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white rounded border border-dark-200">↵</kbd>
                Select
              </span>
            </div>
            <span>
              <kbd className="px-1.5 py-0.5 bg-white rounded border border-dark-200">⌘</kbd>
              <kbd className="px-1.5 py-0.5 bg-white rounded border border-dark-200 ml-0.5">K</kbd>
              to toggle
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
