import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { issuesApi, categoriesApi, equipmentApi, searchApi } from '../services/api';
import {
  ArrowLeft,
  Save,
  X,
  Sparkles,
  Loader2,
  CheckCircle2,
  Lightbulb,
  ExternalLink,
  Search,
  MessageCircle,
  Send,
  Bot
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const schema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters').max(500),
  description: z.string().min(20, 'Description must be at least 20 characters'),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  category_id: z.string().optional(),
});

function NewIssue() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      priority: 'medium',
    },
  });

  // Watch title and description for AI suggestions
  const watchedTitle = watch('title');
  const watchedDescription = watch('description');

  // Equipment autocomplete state
  const [equipmentId, setEquipmentId] = useState('');
  const [equipmentSearch, setEquipmentSearch] = useState('');
  const [equipmentSuggestions, setEquipmentSuggestions] = useState([]);
  const [showEquipmentSuggestions, setShowEquipmentSuggestions] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState(null);

  // AI suggestions state
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [similarIssues, setSimilarIssues] = useState([]);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  // Conversation state
  const [conversationHistory, setConversationHistory] = useState([]);
  const [hasQuestions, setHasQuestions] = useState(false);
  const [userAnswer, setUserAnswer] = useState('');
  const [sendingAnswer, setSendingAnswer] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const response = await categoriesApi.getAll();
      return response.data.flat;
    },
  });

  const createIssue = useMutation({
    mutationFn: (data) => issuesApi.create(data),
    onSuccess: (response) => {
      queryClient.invalidateQueries(['issues']);
      toast.success('Issue created successfully');
      navigate(`/issues/${response.data.issue.id}`);
    },
  });

  // Debounced AI suggestion fetch
  const fetchSuggestions = useCallback(async () => {
    const title = watchedTitle || '';
    const description = watchedDescription || '';

    if (title.length < 10 && description.length < 20) {
      return;
    }

    setLoadingSuggestions(true);
    setChatMessages([]);
    setConversationHistory([]);

    try {
      const response = await searchApi.similarIssues({ title, description });
      setSimilarIssues(response.data.similarIssues || []);
      setAiSuggestion(response.data.aiSuggestion);
      setHasQuestions(response.data.hasQuestions || false);
      setConversationHistory(response.data.conversationHistory || []);

      // Add AI message to chat
      if (response.data.aiSuggestion) {
        setChatMessages([{
          role: 'assistant',
          content: response.data.aiSuggestion
        }]);
      }

      if ((response.data.similarIssues?.length > 0 || response.data.aiSuggestion) && !suggestionDismissed) {
        setShowSuggestions(true);
      }
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
    } finally {
      setLoadingSuggestions(false);
    }
  }, [watchedTitle, watchedDescription, suggestionDismissed]);

  // Debounce effect for AI suggestions
  useEffect(() => {
    const title = watchedTitle || '';
    const description = watchedDescription || '';

    if (title.length >= 10 || description.length >= 20) {
      const timer = setTimeout(fetchSuggestions, 1500);
      return () => clearTimeout(timer);
    }
  }, [watchedTitle, watchedDescription, fetchSuggestions]);

  // Send answer to continue conversation
  const sendAnswer = async () => {
    if (!userAnswer.trim() || sendingAnswer) return;

    const answer = userAnswer.trim();
    setUserAnswer('');
    setSendingAnswer(true);

    // Add user message to chat
    setChatMessages(prev => [...prev, { role: 'user', content: answer }]);

    try {
      const response = await searchApi.continueConversation({
        answer,
        conversationHistory
      });

      setAiSuggestion(response.data.aiSuggestion);
      setHasQuestions(response.data.hasQuestions || false);
      setConversationHistory(response.data.conversationHistory || []);

      // Add AI response to chat
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: response.data.aiSuggestion
      }]);
    } catch (error) {
      console.error('Failed to continue conversation:', error);
      toast.error('Failed to get response');
    } finally {
      setSendingAnswer(false);
    }
  };

  // Equipment search
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
      console.error('Failed to search equipment:', error);
      setEquipmentSuggestions([]);
    }
  };

  const selectEquipment = (eq) => {
    setSelectedEquipment(eq);
    setEquipmentId(eq.id);
    setEquipmentSearch(`${eq.serial_number || ''} - ${eq.model || eq.name}`);
    setShowEquipmentSuggestions(false);
  };

  const clearEquipment = () => {
    setSelectedEquipment(null);
    setEquipmentId('');
    setEquipmentSearch('');
  };

  const onSubmit = (data) => {
    // Clean up empty optional fields
    if (!data.category_id) delete data.category_id;
    if (equipmentId) {
      data.equipment_id = equipmentId;
    }
    // Include AI conversation if there was one
    if (chatMessages.length > 0) {
      data.ai_conversation = chatMessages;
    }
    createIssue.mutate(data);
  };

  const dismissSuggestions = () => {
    setShowSuggestions(false);
    setSuggestionDismissed(true);
  };

  const resetConversation = () => {
    setChatMessages([]);
    setConversationHistory([]);
    setHasQuestions(false);
    setUserAnswer('');
    fetchSuggestions();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Create New Issue</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-3">
          <form onSubmit={handleSubmit(onSubmit)} className="card p-6 space-y-6">
            {/* Title */}
            <div>
              <label htmlFor="title" className="label">Issue Title *</label>
              <input
                id="title"
                type="text"
                {...register('title')}
                className={`input ${errors.title ? 'input-error' : ''}`}
                placeholder="Brief description of the problem"
              />
              {errors.title && (
                <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
              )}
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="label">Description *</label>
              <textarea
                id="description"
                {...register('description')}
                rows={6}
                className={`input ${errors.description ? 'input-error' : ''}`}
                placeholder="Provide detailed information about the issue:
- What were you trying to do?
- What happened instead?
- Any error messages?
- Steps to reproduce the problem"
              />
              {errors.description && (
                <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Priority */}
              <div>
                <label htmlFor="priority" className="label">Priority *</label>
                <select
                  id="priority"
                  {...register('priority')}
                  className="input"
                >
                  <option value="low">Low - Minor inconvenience</option>
                  <option value="medium">Medium - Affects work but has workaround</option>
                  <option value="high">High - Significant impact, needs attention</option>
                  <option value="critical">Critical - System down, urgent fix needed</option>
                </select>
              </div>

              {/* Category */}
              <div>
                <label htmlFor="category_id" className="label">Category</label>
                <select
                  id="category_id"
                  {...register('category_id')}
                  className="input"
                >
                  <option value="">Select a category</option>
                  {categories?.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Equipment - Autocomplete */}
            <div>
              <label className="label">Related Equipment</label>
              <div className="relative">
                {selectedEquipment ? (
                  <div className="input flex items-center justify-between bg-primary-50 border-primary-200">
                    <div>
                      <span className="font-medium text-gray-900">{selectedEquipment.name}</span>
                      <span className="text-gray-500 ml-2">
                        {selectedEquipment.serial_number && `S/N: ${selectedEquipment.serial_number}`}
                        {selectedEquipment.model && ` • ${selectedEquipment.model}`}
                      </span>
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

            {/* Submit */}
            <div className="flex items-center justify-end gap-4 pt-4 border-t">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createIssue.isPending}
                className="btn btn-primary flex items-center gap-2"
              >
                {createIssue.isPending ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-5 h-5" />
                )}
                Create Issue
              </button>
            </div>
          </form>
        </div>

        {/* AI Assistant Sidebar */}
        <div className="lg:col-span-2 space-y-4">
          {/* Loading indicator */}
          {loadingSuggestions && (
            <div className="card p-4 bg-gradient-to-br from-primary-50 to-accent-50 border-primary-100">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
                <span className="text-sm text-primary-700">AI is analyzing your problem...</span>
              </div>
            </div>
          )}

          {/* AI Chat Interface */}
          {showSuggestions && !loadingSuggestions && (chatMessages.length > 0 || similarIssues.length > 0) && (
            <div className="card overflow-hidden border-primary-100 flex flex-col" style={{ maxHeight: '70vh' }}>
              {/* Header */}
              <div className="p-4 bg-gradient-to-br from-primary-50 to-accent-50 border-b border-primary-100 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bot className="w-5 h-5 text-primary-600" />
                    <h3 className="font-semibold text-primary-900">AI Assistant</h3>
                  </div>
                  <div className="flex items-center gap-1">
                    {chatMessages.length > 1 && (
                      <button
                        onClick={resetConversation}
                        className="text-xs text-primary-600 hover:text-primary-700 px-2 py-1"
                      >
                        Reset
                      </button>
                    )}
                    <button
                      onClick={dismissSuggestions}
                      className="p-1 hover:bg-primary-100 rounded text-primary-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-primary-600 mt-1">
                  Using knowledge base, documentation, and general expertise
                </p>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={clsx(
                      'flex',
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    <div
                      className={clsx(
                        'max-w-[90%] rounded-lg p-3 text-sm',
                        msg.role === 'user'
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-800'
                      )}
                    >
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    </div>
                  </div>
                ))}

                {sendingAnswer && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 rounded-lg p-3">
                      <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                    </div>
                  </div>
                )}
              </div>

              {/* Answer Input */}
              {hasQuestions && (
                <div className="p-3 border-t border-gray-200 flex-shrink-0">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={userAnswer}
                      onChange={(e) => setUserAnswer(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendAnswer()}
                      placeholder="Answer the question..."
                      className="input flex-1 text-sm py-2"
                      disabled={sendingAnswer}
                    />
                    <button
                      onClick={sendAnswer}
                      disabled={!userAnswer.trim() || sendingAnswer}
                      className="btn btn-primary px-3 py-2"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Solved Button */}
              {chatMessages.length > 0 && (
                <div className="p-3 border-t border-gray-200 flex-shrink-0">
                  <button
                    onClick={() => {
                      toast.success('Great! Glad the AI assistant helped solve your problem.');
                      navigate('/issues');
                    }}
                    className="w-full btn bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    This Solved My Problem
                  </button>
                </div>
              )}

              {/* Similar Issues */}
              {similarIssues.length > 0 && (
                <div className="p-4 border-t border-gray-200 flex-shrink-0 bg-gray-50">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    Similar Resolved Issues
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {similarIssues.slice(0, 3).map((issue) => (
                      <Link
                        key={issue.id}
                        to={`/issues/${issue.id}`}
                        target="_blank"
                        className="block p-2 bg-white rounded border border-gray-200 hover:border-primary-300 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-900 truncate">
                              {issue.title}
                            </p>
                            {issue.solution && (
                              <p className="text-xs text-green-600 mt-0.5 line-clamp-1">
                                {issue.solution.substring(0, 80)}...
                              </p>
                            )}
                          </div>
                          <ExternalLink className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Search tip when no suggestions */}
          {!showSuggestions && !loadingSuggestions && !suggestionDismissed && (
            <div className="card p-4 bg-gradient-to-br from-gray-50 to-primary-50 border-gray-200">
              <div className="flex items-start gap-3">
                <Bot className="w-6 h-6 text-primary-500 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-800">AI Assistant Ready</p>
                  <p className="text-xs text-gray-600 mt-1">
                    As you describe your issue, AI will search the knowledge base, documentation, and use expert knowledge to suggest solutions.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Manual search button */}
          {(watchedTitle?.length >= 5 || watchedDescription?.length >= 10) && (
            <button
              type="button"
              onClick={fetchSuggestions}
              disabled={loadingSuggestions}
              className="w-full btn btn-secondary flex items-center justify-center gap-2"
            >
              {loadingSuggestions ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Search for Solutions
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default NewIssue;
