/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  CheckCircle2, 
  Circle, 
  Plus, 
  Trash2, 
  LogOut, 
  Search, 
  Filter,
  Bell,
  Wifi,
  WifiOff,
  User,
  Settings,
  MoreVertical,
  Edit
} from 'lucide-react';
import { cn } from './lib/utils';
import { Todo, Category } from './types';

// Using dummy auth as specified in README (JWT logic implied)
const DUMMY_USER = {
  id: 'user_123',
  name: 'Joseph Tuta',
  email: 'josephtuta20@gmail.com',
  avatar: 'JT'
};

export default function App() {
  const [todos, setTodos] = useState<Todo[]>(() => {
    const saved = localStorage.getItem('todoflow_tasks');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [isLoggedIn, setIsLoggedIn] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [notifications, setNotifications] = useState<{id: number, msg: string}[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentFilter, setCurrentFilter] = useState<Category | 'all'>('all');
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  const [newTask, setNewTask] = useState({ text: '', category: 'work' as Category });

  // Persistence
  useEffect(() => {
    localStorage.setItem('todoflow_tasks', JSON.stringify(todos));
  }, [todos]);

  // Online status management
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const addNotification = useCallback((msg: string) => {
    const id = Date.now();
    setNotifications(prev => [...prev.slice(-2), { id, msg }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 3000);
  }, []);

  const handleAddTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.text.trim()) return;

    const todo: Todo = {
      id: Math.random().toString(36).substr(2, 9),
      text: newTask.text,
      completed: false,
      category: newTask.category,
      createdAt: Date.now()
    };

    setTodos([todo, ...todos]);
    setNewTask({ text: '', category: 'work' });
    setShowNewTaskForm(false);
    addNotification('Task added successfully');
  };

  const toggleTodo = (id: string) => {
    setTodos(todos.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
    addNotification('Task status updated');
  };

  const deleteTodo = (id: string) => {
    setTodos(todos.filter(t => t.id !== id));
    addNotification('Task removed');
  };

  const filteredTodos = useMemo(() => {
    return todos.filter(t => {
      const matchesSearch = t.text.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = currentFilter === 'all' || t.category === currentFilter;
      return matchesSearch && matchesFilter;
    });
  }, [todos, searchQuery, currentFilter]);

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-6 font-sans">
        <div className="w-full max-w-md bg-white p-8 rounded-3xl border border-neutral-200 shadow-sm text-center">
          <h1 className="text-3xl font-black tracking-tight mb-2">TodoFlow</h1>
          <p className="text-neutral-500 mb-8">Please sign in to manage your tasks</p>
          <button 
            onClick={() => setIsLoggedIn(true)}
            className="w-full bg-black text-white py-4 rounded-2xl font-bold hover:bg-neutral-800 transition-colors"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFDFD] font-sans selection:bg-black selection:text-white pb-24">
      {/* Notifications Layer */}
      <div className="fixed top-6 right-6 z-50 flex flex-col gap-2">
        {notifications.map(n => (
          <div key={n.id} className="bg-neutral-900 text-white px-4 py-2 rounded-xl text-xs font-bold animate-in fade-in slide-in-from-right-4">
            {n.msg}
          </div>
        ))}
      </div>

      {/* Navigation */}
      <nav className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-neutral-100">
        <div className="max-w-screen-xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <h1 className="text-xl font-black tracking-tighter uppercase italic">TodoFlow</h1>
            <div className="hidden md:flex items-center gap-1 bg-neutral-100 p-1 rounded-xl">
              <button 
                onClick={() => setCurrentFilter('all')}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                  currentFilter === 'all' ? "bg-white text-black shadow-sm" : "text-neutral-500 hover:text-black"
                )}
              >
                Board
              </button>
              <button className="px-4 py-1.5 rounded-lg text-xs font-bold text-neutral-400 cursor-not-allowed">Calendar</button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-50 rounded-full border border-neutral-100 italic">
              {isOnline ? <Wifi size={14} className="text-green-500" /> : <WifiOff size={14} className="text-red-500" />}
              <span className="text-[10px] font-bold uppercase tracking-wider">{isOnline ? 'Network Sync' : 'Offline Mode'}</span>
            </div>
            
            <div className="h-8 w-px bg-neutral-100" />
            
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-black">{DUMMY_USER.name}</p>
                <p className="text-[10px] text-neutral-400 font-medium">Free Plan</p>
              </div>
              <button 
                onClick={() => setIsLoggedIn(false)}
                className="w-10 h-10 rounded-2xl bg-neutral-900 flex items-center justify-center text-white border-4 border-white shadow-xl hover:scale-105 transition-transform"
              >
                <User size={18} />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-screen-md mx-auto px-6 pt-12">
        {/* Header Section */}
        <div className="mb-12">
          <h2 className="text-4xl font-black tracking-tight mb-4">Good morning,<br />{DUMMY_USER.name.split(' ')[0]}!</h2>
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-blue-600/10 text-blue-600 px-4 py-1.5 rounded-full text-xs font-black flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
              {todos.filter(t => !t.completed).length} Tasks Pending
            </div>
            <div className="bg-green-600/10 text-green-600 px-4 py-1.5 rounded-full text-xs font-black">
              {todos.filter(t => t.completed).length} Completed
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-black transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="Quick search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white pl-12 pr-4 py-4 rounded-3xl border border-neutral-100 shadow-sm focus:outline-none focus:ring-4 focus:ring-black/5 focus:border-black transition-all font-medium text-sm"
            />
          </div>
          <button 
            onClick={() => setShowNewTaskForm(true)}
            className="px-8 py-4 bg-black text-white rounded-3xl flex items-center justify-center gap-2 font-black text-sm active:scale-95 transition-transform shadow-2xl shadow-black/20"
          >
            <Plus size={18} />
            Create New
          </button>
        </div>

        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-4 scrollbar-hide">
          <button 
            onClick={() => setCurrentFilter('all')}
            className={cn(
              "px-6 py-2 rounded-2xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap",
              currentFilter === 'all' ? "bg-black text-white" : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
            )}
          >
            All Categories
          </button>
          {['work', 'personal', 'urgent', 'shopping', 'health'].map(cat => (
            <button 
              key={cat}
              onClick={() => setCurrentFilter(cat as Category)}
              className={cn(
                "px-6 py-2 rounded-2xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap border",
                currentFilter === cat ? "bg-black text-white border-black" : "bg-white text-neutral-400 border-neutral-100 hover:border-neutral-300"
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Task List */}
        <div className="space-y-4">
          {filteredTodos.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-neutral-100 rounded-[40px] py-16 text-center">
              <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Settings className="text-neutral-200" />
              </div>
              <p className="text-neutral-400 font-bold italic">Nothing here yet</p>
            </div>
          ) : (
            filteredTodos.map(todo => (
              <div 
                key={todo.id} 
                className={cn(
                  "group relative bg-white p-6 rounded-[32px] border border-neutral-100 transition-all hover:translate-x-1",
                  todo.completed && "opacity-60 grayscale-[0.5]"
                )}
              >
                <div className="flex items-start gap-4">
                  <button 
                    onClick={() => toggleTodo(todo.id)}
                    className={cn(
                      "mt-1 w-6 h-6 rounded-lg flex items-center justify-center transition-all border-2",
                      todo.completed ? "bg-black border-black text-white" : "bg-white border-neutral-200 hover:border-black"
                    )}
                  >
                    {todo.completed && <CheckCircle2 size={14} />}
                  </button>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-300 group-hover:text-black transition-colors">
                        {todo.category}
                      </span>
                      <div className="w-1 h-1 rounded-full bg-neutral-200" />
                      <span className="text-[10px] font-mono text-neutral-400 bg-neutral-50 px-2 py-0.5 rounded">
                        ID:{todo.id}
                      </span>
                    </div>
                    <h3 className={cn(
                      "text-lg font-bold tracking-tight transition-all",
                      todo.completed ? "line-through text-neutral-400" : "text-black"
                    )}>
                      {todo.text}
                    </h3>
                  </div>

                  <button 
                    onClick={() => deleteTodo(todo.id)}
                    className="p-3 bg-red-50 text-red-500 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* New Task Overlay */}
      {showNewTaskForm && (
        <div className="fixed inset-0 z-50 bg-neutral-900/60 backdrop-blur-md flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-[40px] p-8 shadow-2xl animate-in fade-in slide-in-from-bottom-10 duration-300">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-black italic uppercase tracking-tighter">New Task</h3>
              <button 
                onClick={() => setShowNewTaskForm(false)}
                className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center hover:bg-neutral-200 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleAddTodo} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest px-2">Task Title</label>
                <input 
                  autoFocus
                  type="text" 
                  value={newTask.text}
                  onChange={(e) => setNewTask({...newTask, text: e.target.value})}
                  placeholder="Task description..."
                  className="w-full bg-neutral-50 border-none p-5 rounded-2xl focus:ring-4 focus:ring-black/5 font-bold"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest px-2">Category</label>
                <div className="grid grid-cols-3 gap-2">
                  {['work', 'personal', 'urgent', 'shopping', 'health'].map((cat) => (
                    <button 
                      key={cat}
                      type="button"
                      onClick={() => setNewTask({...newTask, category: cat as Category})}
                      className={cn(
                        "py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all",
                        newTask.category === cat ? "bg-black border-black text-white" : "bg-white border-neutral-100 text-neutral-400 hover:border-neutral-300"
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <button 
                type="submit"
                disabled={!newTask.text.trim()}
                className="w-full bg-black text-white py-5 rounded-[24px] font-black text-sm shadow-2xl shadow-black/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
              >
                Launch Task
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Footer Branding */}
      <footer className="max-w-screen-md mx-auto px-6 mt-20 text-center border-t border-neutral-100 pt-12 opacity-30 italic font-mono text-[10px]">
        DESIGNED FOR JAE5IVE &lt;&gt; TODOFLOW CLOUD v4.1.0-STABLE
      </footer>
    </div>
  );
}

function X({ size, className }: { size?: number, className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size || 24} 
      height={size || 24} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
