import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { todosApi, categoriesApi, equipmentApi, usersApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import {
  Plus,
  Check,
  Circle,
  Clock,
  Calendar,
  User,
  ArrowRight,
  Trash2,
  Edit,
  X,
  Filter,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';

function Todos() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingTodo, setEditingTodo] = useState(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [filterAssigned, setFilterAssigned] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium',
    due_date: '',
    assigned_to: '',
    category_id: '',
    equipment_id: ''
  });

  const { data: todos, isLoading } = useQuery({
    queryKey: ['todos', showCompleted, filterAssigned],
    queryFn: async () => {
      const params = { show_completed: showCompleted };
      if (filterAssigned) params.assigned_to = filterAssigned;
      const response = await todosApi.getAll(params);
      return response.data.todos;
    },
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const response = await categoriesApi.getAll();
      return response.data.flat;
    },
  });

  const { data: equipment } = useQuery({
    queryKey: ['equipment-list'],
    queryFn: async () => {
      const response = await equipmentApi.getAll({ limit: 100 });
      return response.data.equipment;
    },
  });

  const { data: users } = useQuery({
    queryKey: ['users-list'],
    queryFn: async () => {
      const response = await usersApi.getAll({ limit: 100 });
      return response.data.users;
    },
    enabled: user?.role === 'admin',
  });

  const createTodo = useMutation({
    mutationFn: (data) => todosApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['todos']);
      resetForm();
      toast.success('Todo created');
    },
  });

  const updateTodo = useMutation({
    mutationFn: ({ id, data }) => todosApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['todos']);
      resetForm();
      toast.success('Todo updated');
    },
  });

  const toggleTodo = useMutation({
    mutationFn: (id) => todosApi.toggle(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['todos']);
    },
  });

  const deleteTodo = useMutation({
    mutationFn: (id) => todosApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['todos']);
      toast.success('Todo deleted');
    },
  });

  const convertToIssue = useMutation({
    mutationFn: (id) => todosApi.convertToIssue(id),
    onSuccess: (response) => {
      queryClient.invalidateQueries(['todos']);
      toast.success('Converted to issue');
    },
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingTodo(null);
    setFormData({
      title: '',
      description: '',
      priority: 'medium',
      due_date: '',
      assigned_to: '',
      category_id: '',
      equipment_id: ''
    });
  };

  const handleEdit = (todo) => {
    setFormData({
      title: todo.title,
      description: todo.description || '',
      priority: todo.priority,
      due_date: todo.due_date ? todo.due_date.split('T')[0] : '',
      assigned_to: todo.assigned_to || '',
      category_id: todo.category_id || '',
      equipment_id: todo.equipment_id || ''
    });
    setEditingTodo(todo);
    setShowForm(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { ...formData };
    if (!data.due_date) delete data.due_date;
    if (!data.assigned_to) delete data.assigned_to;
    if (!data.category_id) delete data.category_id;
    if (!data.equipment_id) delete data.equipment_id;

    if (editingTodo) {
      updateTodo.mutate({ id: editingTodo.id, data });
    } else {
      createTodo.mutate(data);
    }
  };

  const canEdit = user?.role === 'admin' || user?.role === 'technician';

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const isOverdue = (dueDate) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date() && new Date(dueDate).toDateString() !== new Date().toDateString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Todo List</h1>
          <p className="mt-1 text-gray-500">
            {todos?.filter(t => t.status !== 'completed').length || 0} pending tasks
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowForm(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Add Todo
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
              className="rounded border-gray-300 text-primary-600"
            />
            Show completed
          </label>

          {user?.role === 'admin' && users && (
            <select
              value={filterAssigned}
              onChange={(e) => setFilterAssigned(e.target.value)}
              className="input w-auto text-sm"
            >
              <option value="">All assignees</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Todo List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="card p-8 text-center">
            <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : todos?.length === 0 ? (
          <div className="card p-12 text-center">
            <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-300" />
            <h3 className="text-lg font-medium text-gray-900">All caught up!</h3>
            <p className="mt-1 text-gray-500">No pending todos</p>
          </div>
        ) : (
          todos?.map((todo) => (
            <div
              key={todo.id}
              className={clsx(
                'card p-4 transition-all',
                todo.status === 'completed' && 'opacity-60'
              )}
            >
              <div className="flex items-start gap-4">
                {/* Checkbox */}
                <button
                  onClick={() => toggleTodo.mutate(todo.id)}
                  disabled={!canEdit}
                  className={clsx(
                    'mt-1 flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors',
                    todo.status === 'completed'
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'border-gray-300 hover:border-primary-500'
                  )}
                >
                  {todo.status === 'completed' && <Check className="w-4 h-4" />}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className={clsx(
                      'font-medium',
                      todo.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-900'
                    )}>
                      {todo.title}
                    </h3>
                    <span className={clsx('badge text-xs', getPriorityColor(todo.priority))}>
                      {todo.priority}
                    </span>
                    {todo.category_name && (
                      <span className="badge bg-gray-100 text-gray-600 text-xs">
                        {todo.category_name}
                      </span>
                    )}
                  </div>

                  {todo.description && (
                    <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                      {todo.description}
                    </p>
                  )}

                  <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
                    {todo.assigned_to_name && (
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {todo.assigned_to_name}
                      </span>
                    )}
                    {todo.due_date && (
                      <span className={clsx(
                        'flex items-center gap-1',
                        isOverdue(todo.due_date) && todo.status !== 'completed' && 'text-red-500'
                      )}>
                        <Calendar className="w-3 h-3" />
                        {new Date(todo.due_date).toLocaleDateString()}
                        {isOverdue(todo.due_date) && todo.status !== 'completed' && ' (Overdue)'}
                      </span>
                    )}
                    {todo.equipment_name && (
                      <span className="flex items-center gap-1">
                        {todo.equipment_name}
                      </span>
                    )}
                    {todo.converted_to_issue_id && (
                      <Link
                        to={`/issues/${todo.converted_to_issue_id}`}
                        className="flex items-center gap-1 text-primary-600 hover:text-primary-700"
                      >
                        <ArrowRight className="w-3 h-3" />
                        View Issue
                      </Link>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {canEdit && todo.status !== 'completed' && (
                  <div className="flex items-center gap-1">
                    {!todo.converted_to_issue_id && (
                      <button
                        onClick={() => {
                          if (confirm('Convert this todo to a knowledge base issue?')) {
                            convertToIssue.mutate(todo.id);
                          }
                        }}
                        className="p-2 hover:bg-primary-50 rounded-lg text-primary-600"
                        title="Convert to Issue"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleEdit(todo)}
                      className="p-2 hover:bg-gray-100 rounded-lg"
                      title="Edit"
                    >
                      <Edit className="w-4 h-4 text-gray-500" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Delete this todo?')) deleteTodo.mutate(todo.id);
                      }}
                      className="p-2 hover:bg-red-50 rounded-lg"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
              <h2 className="text-lg font-semibold">{editingTodo ? 'Edit Todo' : 'Add Todo'}</h2>
              <button onClick={resetForm} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="label">Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="input"
                  placeholder="What needs to be done?"
                  required
                />
              </div>

              <div>
                <label className="label">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="input"
                  rows={3}
                  placeholder="Add more details..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="input"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div>
                  <label className="label">Due Date</label>
                  <input
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    className="input"
                  />
                </div>
              </div>

              {user?.role === 'admin' && users && (
                <div>
                  <label className="label">Assign To</label>
                  <select
                    value={formData.assigned_to}
                    onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                    className="input"
                  >
                    <option value="">Unassigned</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="label">Category</label>
                <select
                  value={formData.category_id}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  className="input"
                >
                  <option value="">No category</option>
                  {categories?.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Related Equipment</label>
                <select
                  value={formData.equipment_id}
                  onChange={(e) => setFormData({ ...formData, equipment_id: e.target.value })}
                  className="input"
                >
                  <option value="">None</option>
                  {equipment?.map((eq) => (
                    <option key={eq.id} value={eq.id}>{eq.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={resetForm} className="btn btn-secondary">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createTodo.isPending || updateTodo.isPending}
                  className="btn btn-primary"
                >
                  {editingTodo ? 'Save Changes' : 'Add Todo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Todos;
