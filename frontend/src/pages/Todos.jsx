import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { todosApi, categoriesApi, equipmentApi, usersApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useSwipeable } from 'react-swipeable';
import {
  Plus,
  Check,
  Clock,
  Calendar,
  User,
  ArrowRight,
  Trash2,
  Edit,
  X,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  GripVertical,
  Mic,
  MicOff,
  Camera,
  ChevronDown,
  ChevronUp,
  Tag,
  Bell,
  ListChecks,
  RefreshCw,
  AlertTriangle,
  CalendarDays,
  CalendarCheck
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';

// Swipeable Todo Item Component
function SwipeableTodoItem({ todo, onComplete, onDelete, onEdit, onImageUpload, canEdit, children }) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const handlers = useSwipeable({
    onSwiping: (e) => {
      if (!canEdit) return;
      setIsSwiping(true);
      const offset = Math.min(Math.max(e.deltaX, -120), 120);
      setSwipeOffset(offset);
    },
    onSwipedLeft: (e) => {
      if (!canEdit) return;
      if (e.absX > 80) {
        onDelete(todo.id);
      }
      setSwipeOffset(0);
      setIsSwiping(false);
    },
    onSwipedRight: (e) => {
      if (!canEdit) return;
      if (e.absX > 80) {
        onComplete(todo.id);
      }
      setSwipeOffset(0);
      setIsSwiping(false);
    },
    onSwiped: () => {
      setSwipeOffset(0);
      setIsSwiping(false);
    },
    trackMouse: false,
    trackTouch: true,
  });

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Background actions */}
      <div className="absolute inset-0 flex">
        {/* Complete action (swipe right) */}
        <div
          className={clsx(
            'flex-1 flex items-center justify-start pl-6 transition-colors',
            swipeOffset > 40 ? 'bg-green-500' : 'bg-green-400'
          )}
        >
          <Check className="w-6 h-6 text-white" />
          <span className="ml-2 text-white font-medium">Complete</span>
        </div>
        {/* Delete action (swipe left) */}
        <div
          className={clsx(
            'flex-1 flex items-center justify-end pr-6 transition-colors',
            swipeOffset < -40 ? 'bg-red-500' : 'bg-red-400'
          )}
        >
          <span className="mr-2 text-white font-medium">Delete</span>
          <Trash2 className="w-6 h-6 text-white" />
        </div>
      </div>

      {/* Swipeable content */}
      <div
        {...handlers}
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: isSwiping ? 'none' : 'transform 0.2s ease-out'
        }}
        className="relative bg-white"
      >
        {children}
      </div>
    </div>
  );
}

// Sortable Todo Item
function SortableTodoItem({ todo, ...props }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: todo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto'
  };

  return (
    <div ref={setNodeRef} style={style}>
      <TodoCard todo={todo} dragHandleProps={{ ...attributes, ...listeners }} {...props} />
    </div>
  );
}

// Todo Card Component
function TodoCard({
  todo,
  onToggle,
  onDelete,
  onEdit,
  onImageUpload,
  onConvertToIssue,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onAssignTag,
  onRemoveTag,
  availableTags,
  canEdit,
  dragHandleProps,
  uploadingImages,
  deleteImage
}) {
  const [expanded, setExpanded] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [newSubtask, setNewSubtask] = useState('');
  const fileInputRef = useRef(null);

  const getPriorityBarColor = (priority) => {
    switch (priority) {
      case 'high': return 'bg-red-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-300';
    }
  };

  const isOverdue = (dueDate) => {
    if (!dueDate) return false;
    const due = new Date(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return due < today;
  };

  const isDueToday = (dueDate) => {
    if (!dueDate) return false;
    const due = new Date(dueDate);
    const today = new Date();
    return due.toDateString() === today.toDateString();
  };

  const completedSubtasks = todo.subtasks?.filter(s => s.is_completed).length || 0;
  const totalSubtasks = todo.subtasks?.length || 0;

  const handleAddSubtask = (e) => {
    e.preventDefault();
    if (newSubtask.trim()) {
      onAddSubtask(todo.id, newSubtask.trim());
      setNewSubtask('');
    }
  };

  return (
    <div className={clsx(
      'card overflow-hidden transition-all',
      todo.status === 'completed' && 'opacity-60'
    )}>
      {/* Priority bar */}
      <div className={clsx('h-1', getPriorityBarColor(todo.priority))} />

      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Drag handle */}
          {canEdit && dragHandleProps && (
            <button
              {...dragHandleProps}
              className="mt-1 p-1 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing touch-none"
            >
              <GripVertical className="w-5 h-5" />
            </button>
          )}

          {/* Checkbox */}
          <button
            onClick={() => onToggle(todo.id)}
            disabled={!canEdit}
            className={clsx(
              'mt-0.5 flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all',
              todo.status === 'completed'
                ? 'bg-green-500 border-green-500 text-white'
                : 'border-gray-300 hover:border-primary-500 hover:bg-primary-50'
            )}
          >
            {todo.status === 'completed' && <Check className="w-4 h-4" />}
          </button>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 flex-wrap">
              <h3 className={clsx(
                'font-medium text-base',
                todo.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-900'
              )}>
                {todo.title}
              </h3>

              {/* Due date badges */}
              {todo.due_date && todo.status !== 'completed' && (
                <>
                  {isOverdue(todo.due_date) && (
                    <span className="badge bg-red-100 text-red-700 text-xs flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Overdue
                    </span>
                  )}
                  {isDueToday(todo.due_date) && !isOverdue(todo.due_date) && (
                    <span className="badge bg-orange-100 text-orange-700 text-xs flex items-center gap-1">
                      <CalendarCheck className="w-3 h-3" />
                      Due Today
                    </span>
                  )}
                </>
              )}
            </div>

            {/* Tags */}
            {todo.tags && todo.tags.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {todo.tags.map(tag => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                    style={{ backgroundColor: tag.color }}
                  >
                    {tag.name}
                    {canEdit && todo.status !== 'completed' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveTag(todo.id, tag.id);
                        }}
                        className="hover:bg-white/20 rounded-full p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}

            {todo.description && (
              <p className="mt-1.5 text-sm text-gray-500 line-clamp-2">
                {todo.description}
              </p>
            )}

            {/* Subtasks progress */}
            {totalSubtasks > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 transition-all"
                    style={{ width: `${(completedSubtasks / totalSubtasks) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500">
                  {completedSubtasks}/{totalSubtasks}
                </span>
              </div>
            )}

            {/* Meta info */}
            <div className="mt-2 flex items-center gap-3 text-xs text-gray-400 flex-wrap">
              {todo.assigned_to_name && (
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {todo.assigned_to_name}
                </span>
              )}
              {todo.due_date && (
                <span className={clsx(
                  'flex items-center gap-1',
                  isOverdue(todo.due_date) && todo.status !== 'completed' && 'text-red-500 font-medium'
                )}>
                  <Calendar className="w-3 h-3" />
                  {new Date(todo.due_date).toLocaleDateString()}
                </span>
              )}
              {todo.equipment_name && (
                <span className="flex items-center gap-1 truncate">
                  {todo.equipment_name}
                </span>
              )}
              {todo.converted_to_issue_id && (
                <Link
                  to={`/issues/${todo.converted_to_issue_id}`}
                  className="flex items-center gap-1 text-primary-600 hover:text-primary-700"
                >
                  <ArrowRight className="w-3 h-3" />
                  Issue
                </Link>
              )}
            </div>

            {/* Images - larger preview */}
            {todo.images && todo.images.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {todo.images.map((img) => (
                  <div key={img.id} className="relative group">
                    <img
                      src={`${import.meta.env.VITE_API_URL || ''}${img.file_path}`}
                      alt={img.original_name}
                      className="w-28 h-28 object-cover rounded-lg border border-gray-200 cursor-pointer hover:shadow-lg transition-shadow"
                      onClick={() => window.open(`${import.meta.env.VITE_API_URL || ''}${img.file_path}`, '_blank')}
                    />
                    {canEdit && todo.status !== 'completed' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('Delete this image?')) {
                            deleteImage(img.id);
                          }
                        }}
                        className="absolute -top-2 -right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Expandable subtasks */}
            {(totalSubtasks > 0 || (canEdit && todo.status !== 'completed')) && (
              <div className="mt-3">
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
                >
                  <ListChecks className="w-4 h-4" />
                  <span>Subtasks ({totalSubtasks})</span>
                  {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {expanded && (
                  <div className="mt-2 space-y-2 pl-2 border-l-2 border-gray-200">
                    {todo.subtasks?.map(subtask => (
                      <div key={subtask.id} className="flex items-center gap-2">
                        <button
                          onClick={() => onToggleSubtask(todo.id, subtask.id)}
                          disabled={!canEdit}
                          className={clsx(
                            'flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors',
                            subtask.is_completed
                              ? 'bg-green-500 border-green-500 text-white'
                              : 'border-gray-300 hover:border-primary-500'
                          )}
                        >
                          {subtask.is_completed && <Check className="w-3 h-3" />}
                        </button>
                        <span className={clsx(
                          'flex-1 text-sm',
                          subtask.is_completed && 'text-gray-400 line-through'
                        )}>
                          {subtask.title}
                        </span>
                        {canEdit && (
                          <button
                            onClick={() => onDeleteSubtask(todo.id, subtask.id)}
                            className="p-1 text-gray-400 hover:text-red-500"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}

                    {/* Add subtask form */}
                    {canEdit && todo.status !== 'completed' && (
                      <form onSubmit={handleAddSubtask} className="flex items-center gap-2 mt-2">
                        <input
                          type="text"
                          value={newSubtask}
                          onChange={(e) => setNewSubtask(e.target.value)}
                          placeholder="Add subtask..."
                          className="flex-1 text-sm px-2 py-1 border border-gray-200 rounded focus:outline-none focus:border-primary-500"
                        />
                        <button
                          type="submit"
                          disabled={!newSubtask.trim()}
                          className="p-1 text-primary-600 hover:text-primary-700 disabled:text-gray-300"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          {canEdit && todo.status !== 'completed' && (
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Tag picker */}
              <div className="relative">
                <button
                  onClick={() => setShowTagPicker(!showTagPicker)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                  title="Add Tag"
                >
                  <Tag className="w-4 h-4 text-gray-500" />
                </button>
                {showTagPicker && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border z-20 py-1">
                    {availableTags?.map(tag => (
                      <button
                        key={tag.id}
                        onClick={() => {
                          onAssignTag(todo.id, tag.id);
                          setShowTagPicker(false);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2"
                        disabled={todo.tags?.some(t => t.id === tag.id)}
                      >
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="text-sm">{tag.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Image upload */}
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => onImageUpload(todo.id, e.target.files)}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 hover:bg-gray-100 rounded-lg"
                title="Add Image"
              >
                {uploadingImages === todo.id ? (
                  <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
                ) : (
                  <ImageIcon className="w-4 h-4 text-gray-500" />
                )}
              </button>

              {!todo.converted_to_issue_id && (
                <button
                  onClick={() => onConvertToIssue(todo.id)}
                  className="p-2 hover:bg-primary-50 rounded-lg text-primary-600"
                  title="Convert to Issue"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => onEdit(todo)}
                className="p-2 hover:bg-gray-100 rounded-lg"
                title="Edit"
              >
                <Edit className="w-4 h-4 text-gray-500" />
              </button>
              <button
                onClick={() => onDelete(todo.id)}
                className="p-2 hover:bg-red-50 rounded-lg"
                title="Delete"
              >
                <Trash2 className="w-4 h-4 text-red-500" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Todos() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingTodo, setEditingTodo] = useState(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [filterAssigned, setFilterAssigned] = useState('');
  const [quickAddText, setQuickAddText] = useState('');
  const [quickAddImages, setQuickAddImages] = useState([]);
  const [quickAddAssignee, setQuickAddAssignee] = useState('');
  const [uploadingImages, setUploadingImages] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [groupBy, setGroupBy] = useState('none'); // none, date, priority
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeId, setActiveId] = useState(null);

  const quickAddFileRef = useRef(null);
  const recognitionRef = useRef(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium',
    due_date: '',
    assigned_to: '',
    category_id: '',
    equipment_id: ''
  });
  const [equipmentSearch, setEquipmentSearch] = useState('');
  const [equipmentSuggestions, setEquipmentSuggestions] = useState([]);
  const [showEquipmentSuggestions, setShowEquipmentSuggestions] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState(null);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  // Queries
  const { data: todos, isLoading, refetch } = useQuery({
    queryKey: ['todos', showCompleted, filterAssigned],
    queryFn: async () => {
      const params = { show_completed: showCompleted };
      if (filterAssigned) params.assigned_to = filterAssigned;
      const response = await todosApi.getAll(params);
      return response.data.todos;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ['todo-stats'],
    queryFn: async () => {
      const response = await todosApi.getStats();
      return response.data.stats;
    },
  });

  const { data: allTags } = useQuery({
    queryKey: ['todo-tags'],
    queryFn: async () => {
      const response = await todosApi.getAllTags();
      return response.data.tags;
    },
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const response = await categoriesApi.getAll();
      return response.data.flat;
    },
  });

  const { data: users } = useQuery({
    queryKey: ['users-list'],
    queryFn: async () => {
      const response = await usersApi.getAll({ limit: 100 });
      return response.data.users;
    },
    enabled: user?.role === 'admin' || user?.role === 'technician',
  });

  // Mutations
  const createTodo = useMutation({
    mutationFn: (data) => todosApi.create(data),
    onSuccess: async (response) => {
      // If we have quick add images, upload them
      if (quickAddImages.length > 0) {
        await todosApi.uploadImages(response.data.todo.id, quickAddImages);
        setQuickAddImages([]);
      }
      queryClient.invalidateQueries(['todos']);
      queryClient.invalidateQueries(['todo-stats']);
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
      queryClient.invalidateQueries(['todo-stats']);
    },
  });

  const deleteTodo = useMutation({
    mutationFn: (id) => todosApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['todos']);
      queryClient.invalidateQueries(['todo-stats']);
      toast.success('Todo deleted');
    },
  });

  const convertToIssue = useMutation({
    mutationFn: (id) => todosApi.convertToIssue(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['todos']);
      toast.success('Converted to issue');
    },
  });

  const quickAddTodo = useMutation({
    mutationFn: async ({ title, assigned_to }) => {
      // Use create endpoint if assignee is selected, otherwise quick add
      let response;
      if (assigned_to) {
        response = await todosApi.create({ title, priority: 'medium', assigned_to });
      } else {
        response = await todosApi.quickAdd(title);
      }
      // Upload images if any
      if (quickAddImages.length > 0) {
        await todosApi.uploadImages(response.data.todo.id, quickAddImages);
      }
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['todos']);
      queryClient.invalidateQueries(['todo-stats']);
      setQuickAddText('');
      setQuickAddImages([]);
      setQuickAddAssignee('');
      toast.success('Todo added');
    },
  });

  const uploadImages = useMutation({
    mutationFn: ({ todoId, files }) => todosApi.uploadImages(todoId, files),
    onSuccess: () => {
      queryClient.invalidateQueries(['todos']);
      toast.success('Images uploaded');
    },
  });

  const deleteImage = useMutation({
    mutationFn: (imageId) => todosApi.deleteImage(imageId),
    onSuccess: () => {
      queryClient.invalidateQueries(['todos']);
      toast.success('Image deleted');
    },
  });

  const reorderTodos = useMutation({
    mutationFn: (order) => todosApi.reorder(order),
    onSuccess: () => {
      queryClient.invalidateQueries(['todos']);
    },
  });

  // Subtasks
  const addSubtask = useMutation({
    mutationFn: ({ todoId, title }) => todosApi.addSubtask(todoId, title),
    onSuccess: () => {
      queryClient.invalidateQueries(['todos']);
    },
  });

  const toggleSubtask = useMutation({
    mutationFn: ({ todoId, subtaskId }) => todosApi.toggleSubtask(todoId, subtaskId),
    onSuccess: () => {
      queryClient.invalidateQueries(['todos']);
    },
  });

  const deleteSubtask = useMutation({
    mutationFn: ({ todoId, subtaskId }) => todosApi.deleteSubtask(todoId, subtaskId),
    onSuccess: () => {
      queryClient.invalidateQueries(['todos']);
    },
  });

  // Tags
  const assignTag = useMutation({
    mutationFn: ({ todoId, tagId }) => todosApi.assignTag(todoId, tagId),
    onSuccess: () => {
      queryClient.invalidateQueries(['todos']);
    },
  });

  const removeTag = useMutation({
    mutationFn: ({ todoId, tagId }) => todosApi.removeTag(todoId, tagId),
    onSuccess: () => {
      queryClient.invalidateQueries(['todos']);
    },
  });

  // Voice input setup
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map(result => result[0].transcript)
          .join('');
        setQuickAddText(transcript);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current.onerror = () => {
        setIsListening(false);
        toast.error('Voice recognition error');
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const toggleVoiceInput = () => {
    if (!recognitionRef.current) {
      toast.error('Voice input not supported');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  // Pull to refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  // Handlers
  const handleQuickAdd = (e) => {
    e.preventDefault();
    if (quickAddText.trim()) {
      quickAddTodo.mutate({
        title: quickAddText.trim(),
        assigned_to: quickAddAssignee || undefined
      });
    }
  };

  const handleQuickAddImageSelect = (e) => {
    const files = Array.from(e.target.files);
    setQuickAddImages(prev => [...prev, ...files]);
  };

  const handleImageUpload = async (todoId, files) => {
    if (files.length === 0) return;
    setUploadingImages(todoId);
    try {
      await uploadImages.mutateAsync({ todoId, files: Array.from(files) });
    } finally {
      setUploadingImages(null);
    }
  };

  const handleDelete = (id) => {
    if (confirm('Delete this todo?')) {
      deleteTodo.mutate(id);
    }
  };

  const handleConvertToIssue = (id) => {
    if (confirm('Convert this todo to a knowledge base issue?')) {
      convertToIssue.mutate(id);
    }
  };

  // DnD handlers
  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const oldIndex = todos.findIndex(t => t.id === active.id);
    const newIndex = todos.findIndex(t => t.id === over.id);

    const newOrder = arrayMove(todos, oldIndex, newIndex).map((todo, index) => ({
      id: todo.id,
      sort_order: index
    }));

    reorderTodos.mutate(newOrder);
  };

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
    setEquipmentSearch('');
    setEquipmentSuggestions([]);
    setSelectedEquipment(null);
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
    if (todo.equipment_id && todo.equipment_name) {
      setSelectedEquipment({ id: todo.equipment_id, name: todo.equipment_name });
      setEquipmentSearch(todo.equipment_name);
    } else {
      setSelectedEquipment(null);
      setEquipmentSearch('');
    }
    setEditingTodo(todo);
    setShowForm(true);
  };

  const handleEquipmentSearch = async (value) => {
    setEquipmentSearch(value);
    setShowEquipmentSuggestions(true);

    if (value.length < 2) {
      setEquipmentSuggestions([]);
      return;
    }

    try {
      const response = await equipmentApi.getAll({ search: value, limit: 10 });
      setEquipmentSuggestions(response.data.equipment || []);
    } catch (error) {
      setEquipmentSuggestions([]);
    }
  };

  const selectEquipment = (eq) => {
    setSelectedEquipment(eq);
    setFormData({ ...formData, equipment_id: eq.id });
    setEquipmentSearch(`${eq.serial_number || ''} - ${eq.model || eq.name}`);
    setShowEquipmentSuggestions(false);
  };

  const clearEquipment = () => {
    setSelectedEquipment(null);
    setFormData({ ...formData, equipment_id: '' });
    setEquipmentSearch('');
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

  // Group todos
  const groupTodos = useCallback((todoList) => {
    if (!todoList) return { ungrouped: [] };

    if (groupBy === 'none') {
      return { ungrouped: todoList };
    }

    if (groupBy === 'date') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);

      return {
        'Overdue': todoList.filter(t =>
          t.due_date && new Date(t.due_date) < today && t.status !== 'completed'
        ),
        'Today': todoList.filter(t =>
          t.due_date && new Date(t.due_date).toDateString() === today.toDateString() && t.status !== 'completed'
        ),
        'Tomorrow': todoList.filter(t =>
          t.due_date && new Date(t.due_date).toDateString() === tomorrow.toDateString() && t.status !== 'completed'
        ),
        'This Week': todoList.filter(t => {
          if (!t.due_date || t.status === 'completed') return false;
          const due = new Date(t.due_date);
          return due > tomorrow && due <= nextWeek;
        }),
        'Later': todoList.filter(t => {
          if (!t.due_date || t.status === 'completed') return false;
          return new Date(t.due_date) > nextWeek;
        }),
        'No Date': todoList.filter(t => !t.due_date && t.status !== 'completed'),
        'Completed': todoList.filter(t => t.status === 'completed')
      };
    }

    if (groupBy === 'priority') {
      return {
        'High Priority': todoList.filter(t => t.priority === 'high' && t.status !== 'completed'),
        'Medium Priority': todoList.filter(t => t.priority === 'medium' && t.status !== 'completed'),
        'Low Priority': todoList.filter(t => t.priority === 'low' && t.status !== 'completed'),
        'Completed': todoList.filter(t => t.status === 'completed')
      };
    }

    return { ungrouped: todoList };
  }, [groupBy]);

  const groupedTodos = groupTodos(todos);
  const activeTodo = activeId ? todos?.find(t => t.id === activeId) : null;

  // Progress calculation
  const totalTodos = stats?.total || 0;
  const completedTodos = stats?.completed || 0;
  const progressPercent = totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : 0;

  return (
    <div className="space-y-6 pb-24 md:pb-6">
      {/* Header with progress */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Todos</h1>
            <p className="text-gray-500">
              {stats?.pending || 0} pending
              {stats?.overdue > 0 && (
                <span className="text-red-500 ml-2">({stats.overdue} overdue)</span>
              )}
              {stats?.due_today > 0 && (
                <span className="text-orange-500 ml-2">({stats.due_today} due today)</span>
              )}
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <RefreshCw className={clsx('w-5 h-5 text-gray-500', isRefreshing && 'animate-spin')} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary-500 to-primary-600 transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-sm font-medium text-gray-600 min-w-[4rem] text-right">
            {completedTodos}/{totalTodos}
          </span>
        </div>
      </div>

      {/* Quick Add with voice and photo */}
      {canEdit && (
        <form onSubmit={handleQuickAdd} className="card p-4">
          <div className="flex gap-2 flex-wrap sm:flex-nowrap">
            <div className="flex-1 relative min-w-0">
              <input
                type="text"
                value={quickAddText}
                onChange={(e) => setQuickAddText(e.target.value)}
                placeholder="Quick add a todo..."
                className="input w-full pr-20"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                {/* Voice input */}
                <button
                  type="button"
                  onClick={toggleVoiceInput}
                  className={clsx(
                    'p-1.5 rounded-lg transition-colors',
                    isListening ? 'bg-red-100 text-red-600' : 'hover:bg-gray-100 text-gray-500'
                  )}
                >
                  {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                {/* Photo */}
                <button
                  type="button"
                  onClick={() => quickAddFileRef.current?.click()}
                  className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"
                >
                  <Camera className="w-5 h-5" />
                </button>
                <input
                  type="file"
                  ref={quickAddFileRef}
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleQuickAddImageSelect}
                />
              </div>
            </div>
            {/* Assignee dropdown */}
            {users && users.length > 0 && (
              <select
                value={quickAddAssignee}
                onChange={(e) => setQuickAddAssignee(e.target.value)}
                className="input w-full sm:w-40 text-sm"
              >
                <option value="">Assign to...</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            )}
            <button
              type="submit"
              disabled={!quickAddText.trim() || quickAddTodo.isPending}
              className="btn btn-primary px-4"
            >
              {quickAddTodo.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Plus className="w-5 h-5" />
              )}
            </button>
          </div>

          {/* Preview selected images */}
          {quickAddImages.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {quickAddImages.map((file, idx) => (
                <div key={idx} className="relative">
                  <img
                    src={URL.createObjectURL(file)}
                    alt="Preview"
                    className="w-16 h-16 object-cover rounded-lg border"
                  />
                  <button
                    type="button"
                    onClick={() => setQuickAddImages(prev => prev.filter((_, i) => i !== idx))}
                    className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </form>
      )}

      {/* Filters and grouping */}
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

          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
            className="input w-auto text-sm"
          >
            <option value="none">No grouping</option>
            <option value="date">Group by date</option>
            <option value="priority">Group by priority</option>
          </select>

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
      ) : groupBy === 'none' ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={todos?.map(t => t.id) || []}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {todos?.map((todo) => (
                <SwipeableTodoItem
                  key={todo.id}
                  todo={todo}
                  onComplete={() => toggleTodo.mutate(todo.id)}
                  onDelete={() => handleDelete(todo.id)}
                  canEdit={canEdit && todo.status !== 'completed'}
                >
                  <SortableTodoItem
                    todo={todo}
                    onToggle={() => toggleTodo.mutate(todo.id)}
                    onDelete={handleDelete}
                    onEdit={handleEdit}
                    onImageUpload={handleImageUpload}
                    onConvertToIssue={handleConvertToIssue}
                    onAddSubtask={(todoId, title) => addSubtask.mutate({ todoId, title })}
                    onToggleSubtask={(todoId, subtaskId) => toggleSubtask.mutate({ todoId, subtaskId })}
                    onDeleteSubtask={(todoId, subtaskId) => deleteSubtask.mutate({ todoId, subtaskId })}
                    onAssignTag={(todoId, tagId) => assignTag.mutate({ todoId, tagId })}
                    onRemoveTag={(todoId, tagId) => removeTag.mutate({ todoId, tagId })}
                    availableTags={allTags}
                    canEdit={canEdit}
                    uploadingImages={uploadingImages}
                    deleteImage={(imageId) => deleteImage.mutate(imageId)}
                  />
                </SwipeableTodoItem>
              ))}
            </div>
          </SortableContext>
          <DragOverlay>
            {activeTodo && (
              <div className="opacity-80">
                <TodoCard
                  todo={activeTodo}
                  onToggle={() => {}}
                  onDelete={() => {}}
                  onEdit={() => {}}
                  onImageUpload={() => {}}
                  onConvertToIssue={() => {}}
                  onAddSubtask={() => {}}
                  onToggleSubtask={() => {}}
                  onDeleteSubtask={() => {}}
                  onAssignTag={() => {}}
                  onRemoveTag={() => {}}
                  availableTags={[]}
                  canEdit={false}
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      ) : (
        // Grouped view (no drag & drop)
        <div className="space-y-6">
          {Object.entries(groupedTodos).map(([group, groupTodos]) => {
            if (groupTodos.length === 0) return null;
            return (
              <div key={group}>
                <h3 className={clsx(
                  'text-sm font-semibold mb-3 flex items-center gap-2',
                  group === 'Overdue' && 'text-red-600',
                  group === 'Today' && 'text-orange-600',
                  group === 'High Priority' && 'text-red-600',
                  group === 'Completed' && 'text-green-600'
                )}>
                  {group === 'Overdue' && <AlertTriangle className="w-4 h-4" />}
                  {group === 'Today' && <CalendarCheck className="w-4 h-4" />}
                  {group}
                  <span className="text-gray-400 font-normal">({groupTodos.length})</span>
                </h3>
                <div className="space-y-3">
                  {groupTodos.map((todo) => (
                    <SwipeableTodoItem
                      key={todo.id}
                      todo={todo}
                      onComplete={() => toggleTodo.mutate(todo.id)}
                      onDelete={() => handleDelete(todo.id)}
                      canEdit={canEdit && todo.status !== 'completed'}
                    >
                      <TodoCard
                        todo={todo}
                        onToggle={() => toggleTodo.mutate(todo.id)}
                        onDelete={handleDelete}
                        onEdit={handleEdit}
                        onImageUpload={handleImageUpload}
                        onConvertToIssue={handleConvertToIssue}
                        onAddSubtask={(todoId, title) => addSubtask.mutate({ todoId, title })}
                        onToggleSubtask={(todoId, subtaskId) => toggleSubtask.mutate({ todoId, subtaskId })}
                        onDeleteSubtask={(todoId, subtaskId) => deleteSubtask.mutate({ todoId, subtaskId })}
                        onAssignTag={(todoId, tagId) => assignTag.mutate({ todoId, tagId })}
                        onRemoveTag={(todoId, tagId) => removeTag.mutate({ todoId, tagId })}
                        availableTags={allTags}
                        canEdit={canEdit}
                        uploadingImages={uploadingImages}
                        deleteImage={(imageId) => deleteImage.mutate(imageId)}
                      />
                    </SwipeableTodoItem>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Add Button (Mobile) */}
      {canEdit && (
        <button
          onClick={() => setShowForm(true)}
          className="fixed bottom-20 right-4 md:bottom-6 md:right-6 w-14 h-14 bg-primary-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-primary-700 transition-colors z-40"
        >
          <Plus className="w-7 h-7" />
        </button>
      )}

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
                <div className="relative">
                  {selectedEquipment ? (
                    <div className="input flex items-center justify-between bg-primary-50 border-primary-200">
                      <div>
                        <span className="font-medium text-gray-900">{selectedEquipment.name}</span>
                        {selectedEquipment.serial_number && (
                          <span className="text-gray-500 ml-2">S/N: {selectedEquipment.serial_number}</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={clearEquipment}
                        className="p-1 hover:bg-primary-100 rounded"
                      >
                        <X className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={equipmentSearch}
                        onChange={(e) => handleEquipmentSearch(e.target.value)}
                        onFocus={() => equipmentSearch.length >= 2 && setShowEquipmentSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowEquipmentSuggestions(false), 200)}
                        className="input"
                        placeholder="Type serial number or model to search..."
                      />
                      {showEquipmentSuggestions && equipmentSuggestions.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {equipmentSuggestions.map((eq) => (
                            <button
                              key={eq.id}
                              type="button"
                              onClick={() => selectEquipment(eq)}
                              className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0"
                            >
                              <div className="font-medium text-gray-900">{eq.name}</div>
                              <div className="text-sm text-gray-500">
                                {eq.serial_number && <span>S/N: {eq.serial_number}</span>}
                                {eq.model && <span className="ml-2">Model: {eq.model}</span>}
                                {eq.location && <span className="ml-2">• {eq.location}</span>}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {showEquipmentSuggestions && equipmentSearch.length >= 2 && equipmentSuggestions.length === 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-4 text-center text-gray-500">
                          No equipment found
                        </div>
                      )}
                    </>
                  )}
                </div>
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
