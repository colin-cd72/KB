import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { issuesApi, solutionsApi, searchApi, categoriesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Clock,
  User,
  CheckCircle,
  Star,
  Send,
  Eye,
  History,
  Plus,
  Bot,
  Loader2,
  MessageCircle,
  Camera,
  Image,
  X,
  Sparkles
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';

function IssueDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [newSolution, setNewSolution] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  // AI conversation state
  const [showAIChat, setShowAIChat] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [userAnswer, setUserAnswer] = useState('');
  const [sendingAnswer, setSendingAnswer] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);

  // Image state
  const [uploadingImage, setUploadingImage] = useState(false);
  const [analyzingImage, setAnalyzingImage] = useState(null);
  const [imageAnalysis, setImageAnalysis] = useState({});
  const [selectedImage, setSelectedImage] = useState(null);

  const { data: issue, isLoading } = useQuery({
    queryKey: ['issue', id],
    queryFn: async () => {
      const response = await issuesApi.getOne(id);
      return response.data.issue;
    },
  });

  const { data: solutions } = useQuery({
    queryKey: ['solutions', id],
    queryFn: async () => {
      const response = await solutionsApi.getForIssue(id);
      return response.data.solutions;
    },
  });

  const { data: history } = useQuery({
    queryKey: ['issue-history', id],
    queryFn: async () => {
      const response = await issuesApi.getHistory(id);
      return response.data.history;
    },
    enabled: showHistory,
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const response = await categoriesApi.getAll();
      return response.data.flat;
    },
  });

  const { data: attachments, refetch: refetchAttachments } = useQuery({
    queryKey: ['attachments', id],
    queryFn: async () => {
      const response = await issuesApi.getAttachments(id);
      return response.data.attachments;
    },
  });

  const updateCategory = useMutation({
    mutationFn: (category_id) => issuesApi.update(id, { category_id: category_id || null }),
    onSuccess: () => {
      queryClient.invalidateQueries(['issue', id]);
      toast.success('Category updated');
    },
  });

  const addSolution = useMutation({
    mutationFn: (content) => solutionsApi.create({ issue_id: id, content }),
    onSuccess: () => {
      queryClient.invalidateQueries(['solutions', id]);
      setNewSolution('');
      toast.success('Solution added');
    },
  });

  const acceptSolution = useMutation({
    mutationFn: (solutionId) => solutionsApi.accept(solutionId),
    onSuccess: () => {
      queryClient.invalidateQueries(['solutions', id]);
      queryClient.invalidateQueries(['issue', id]);
      toast.success('Solution accepted');
    },
  });

  const rateSolution = useMutation({
    mutationFn: ({ solutionId, rating }) => solutionsApi.rate(solutionId, rating),
    onSuccess: () => {
      queryClient.invalidateQueries(['solutions', id]);
    },
  });

  const updateStatus = useMutation({
    mutationFn: (status) => issuesApi.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries(['issue', id]);
      toast.success('Status updated');
    },
  });

  const deleteIssue = useMutation({
    mutationFn: () => issuesApi.delete(id),
    onSuccess: () => {
      toast.success('Issue deleted');
      navigate('/issues');
    },
  });

  // Load AI conversation from issue when it loads
  useEffect(() => {
    if (issue?.ai_conversation && issue.ai_conversation.length > 0) {
      setChatMessages(issue.ai_conversation);
      // Build conversation history for Claude format
      const history = issue.ai_conversation.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      setConversationHistory(history);
      // Auto-expand if there's existing conversation
      setShowAIChat(true);
    }
  }, [issue?.ai_conversation]);

  // Continue AI conversation
  const sendAIMessage = async () => {
    if (!userAnswer.trim() || sendingAnswer) return;

    const answer = userAnswer.trim();
    setUserAnswer('');
    setSendingAnswer(true);

    // Add user message to chat
    const newUserMessage = { role: 'user', content: answer };
    setChatMessages(prev => [...prev, newUserMessage]);

    try {
      const response = await searchApi.continueConversation({
        answer,
        conversationHistory
      });

      const newAIMessage = { role: 'assistant', content: response.data.aiSuggestion };
      setChatMessages(prev => [...prev, newAIMessage]);
      setConversationHistory(response.data.conversationHistory || []);

      // Save updated conversation to issue
      const updatedMessages = [...chatMessages, newUserMessage, newAIMessage];
      await issuesApi.updateAIConversation(id, updatedMessages);
    } catch (error) {
      console.error('Failed to continue conversation:', error);
      toast.error('Failed to get AI response');
    } finally {
      setSendingAnswer(false);
    }
  };

  // Start new AI conversation for this issue
  const startAIConversation = async () => {
    if (!issue) return;
    setSendingAnswer(true);

    try {
      const response = await searchApi.similarIssues({
        title: issue.title,
        description: issue.description
      });

      if (response.data.aiSuggestion) {
        const initialMessage = { role: 'assistant', content: response.data.aiSuggestion };
        setChatMessages([initialMessage]);
        setConversationHistory(response.data.conversationHistory || []);

        // Save to issue
        await issuesApi.updateAIConversation(id, [initialMessage]);
      }
    } catch (error) {
      console.error('Failed to start AI conversation:', error);
      toast.error('Failed to get AI suggestions');
    } finally {
      setSendingAnswer(false);
    }
  };

  // Handle image upload
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    const formData = new FormData();
    formData.append('image', file);

    try {
      await issuesApi.uploadImage(id, formData);
      refetchAttachments();
      toast.success('Image uploaded');
    } catch (error) {
      console.error('Failed to upload image:', error);
      toast.error('Failed to upload image');
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  // Analyze image with AI
  const handleAnalyzeImage = async (attachment) => {
    setAnalyzingImage(attachment.id);
    try {
      const response = await issuesApi.analyzeImage(id, attachment.file_path);
      setImageAnalysis(prev => ({
        ...prev,
        [attachment.id]: response.data.analysis
      }));
    } catch (error) {
      console.error('Failed to analyze image:', error);
      toast.error('Failed to analyze image');
    } finally {
      setAnalyzingImage(null);
    }
  };

  // Delete attachment
  const handleDeleteAttachment = async (attachmentId) => {
    if (!confirm('Delete this image?')) return;
    try {
      await issuesApi.deleteAttachment(id, attachmentId);
      refetchAttachments();
      toast.success('Image deleted');
    } catch (error) {
      console.error('Failed to delete image:', error);
      toast.error('Failed to delete image');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!issue) {
    return <div>Issue not found</div>;
  }

  const canEdit = user?.role === 'admin' || user?.role === 'technician';
  const canDelete = user?.role === 'admin';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate(-1)} className="mt-1 p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{issue.title}</h1>
            <span className={`badge badge-${issue.priority}`}>{issue.priority}</span>
            <span className={`badge status-${issue.status}`}>{issue.status.replace('_', ' ')}</span>
          </div>
          <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <User className="w-4 h-4" />
              {issue.created_by_name}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {new Date(issue.created_at).toLocaleString()}
            </span>
            <span className="flex items-center gap-1">
              <Eye className="w-4 h-4" />
              {issue.view_count} views
            </span>
          </div>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <select
              value={issue.status}
              onChange={(e) => updateStatus.mutate(e.target.value)}
              className="input w-auto"
            >
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
            {canDelete && (
              <button
                onClick={() => {
                  if (confirm('Delete this issue?')) deleteIssue.mutate();
                }}
                className="btn btn-danger"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <div className="card p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Description</h2>
            <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
              {issue.description}
            </div>
          </div>

          {/* Images */}
          <div className="card">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Camera className="w-5 h-5" />
                Images ({attachments?.length || 0})
              </h2>
              {canEdit && (
                <label className="btn btn-secondary text-sm cursor-pointer">
                  {uploadingImage ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-1" />
                      Add Image
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    disabled={uploadingImage}
                  />
                </label>
              )}
            </div>

            {attachments?.length > 0 ? (
              <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                {attachments.map((attachment) => (
                  <div key={attachment.id} className="relative group">
                    <img
                      src={`/api${attachment.file_path}`}
                      alt={attachment.file_name}
                      className="w-full h-32 object-cover rounded-lg cursor-pointer hover:opacity-90"
                      onClick={() => setSelectedImage(attachment)}
                    />
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                      <button
                        onClick={() => handleAnalyzeImage(attachment)}
                        disabled={analyzingImage === attachment.id}
                        className="p-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                        title="Analyze with AI"
                      >
                        {analyzingImage === attachment.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                      </button>
                      {canEdit && (
                        <button
                          onClick={() => handleDeleteAttachment(attachment.id)}
                          className="p-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700"
                          title="Delete"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {imageAnalysis[attachment.id] && (
                      <div className="mt-2 p-3 bg-primary-50 rounded-lg border border-primary-200">
                        <div className="flex items-center gap-1 text-xs font-medium text-primary-700 mb-1">
                          <Sparkles className="w-3 h-3" />
                          AI Analysis
                        </div>
                        <p className="text-xs text-gray-700 whitespace-pre-wrap">
                          {imageAnalysis[attachment.id]}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-gray-500">
                <Image className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">No images attached</p>
                {canEdit && (
                  <p className="text-xs mt-1">Upload images to help diagnose the issue</p>
                )}
              </div>
            )}
          </div>

          {/* Image Modal */}
          {selectedImage && (
            <div
              className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
              onClick={() => setSelectedImage(null)}
            >
              <div className="relative max-w-4xl max-h-[90vh]">
                <img
                  src={`/api${selectedImage.file_path}`}
                  alt={selectedImage.file_name}
                  className="max-w-full max-h-[90vh] object-contain rounded-lg"
                />
                <button
                  onClick={() => setSelectedImage(null)}
                  className="absolute top-2 right-2 p-2 bg-black/50 text-white rounded-full hover:bg-black/70"
                >
                  <X className="w-5 h-5" />
                </button>
                <div className="absolute bottom-2 left-2 right-2 flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAnalyzeImage(selectedImage);
                    }}
                    disabled={analyzingImage === selectedImage.id}
                    className="btn btn-primary text-sm"
                  >
                    {analyzingImage === selectedImage.id ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-1" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-1" />
                    )}
                    Analyze with AI
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Solutions */}
          <div className="card">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">
                Solutions ({solutions?.length || 0})
              </h2>
            </div>

            <div className="divide-y">
              {solutions?.map((solution) => (
                <div key={solution.id} className={clsx(
                  'p-6',
                  solution.is_accepted && 'bg-green-50 border-l-4 border-green-500'
                )}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{solution.created_by_name}</span>
                      {solution.is_accepted && (
                        <span className="flex items-center gap-1 text-green-600 text-sm">
                          <CheckCircle className="w-4 h-4" />
                          Accepted
                        </span>
                      )}
                    </div>
                    <span className="text-sm text-gray-500">
                      {new Date(solution.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-3 prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
                    {solution.content}
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    {/* Rating */}
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => rateSolution.mutate({ solutionId: solution.id, rating: star })}
                          className={clsx(
                            'p-1 hover:text-yellow-500',
                            solution.user_rating >= star ? 'text-yellow-500' : 'text-gray-300'
                          )}
                        >
                          <Star className="w-4 h-4 fill-current" />
                        </button>
                      ))}
                      {solution.average_rating > 0 && (
                        <span className="ml-2 text-sm text-gray-500">
                          ({solution.average_rating})
                        </span>
                      )}
                    </div>
                    {canEdit && !solution.is_accepted && (
                      <button
                        onClick={() => acceptSolution.mutate(solution.id)}
                        className="btn btn-secondary text-sm"
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Accept Solution
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {solutions?.length === 0 && (
                <div className="p-6 text-center text-gray-500">
                  No solutions yet. Be the first to help!
                </div>
              )}
            </div>

            {/* Add Solution */}
            {canEdit && (
              <div className="p-6 border-t">
                <h3 className="font-medium text-gray-900 mb-3">Add a Solution</h3>
                <textarea
                  value={newSolution}
                  onChange={(e) => setNewSolution(e.target.value)}
                  placeholder="Describe the solution step by step..."
                  rows={4}
                  className="input"
                />
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => addSolution.mutate(newSolution)}
                    disabled={!newSolution.trim() || addSolution.isPending}
                    className="btn btn-primary flex items-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    Submit Solution
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* AI Assistant */}
          <div className="card overflow-hidden border-2 border-primary-200 shadow-md">
            <button
              onClick={() => setShowAIChat(!showAIChat)}
              className="w-full px-4 py-4 bg-gradient-to-br from-primary-100 to-accent-100 flex items-center justify-between hover:from-primary-200 hover:to-accent-200 transition-colors"
            >
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-primary-600 rounded-lg">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div className="text-left">
                  <span className="font-semibold text-primary-900 block">AI Assistant</span>
                  <span className="text-xs text-primary-600">
                    {chatMessages.length > 0 ? 'Click to continue conversation' : 'Click to get help'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {chatMessages.length > 0 && (
                  <span className="px-2 py-0.5 bg-primary-600 text-white text-xs rounded-full">
                    {chatMessages.length}
                  </span>
                )}
                <MessageCircle className={clsx(
                  "w-5 h-5 transition-transform",
                  showAIChat ? "rotate-180 text-primary-700" : "text-primary-500"
                )} />
              </div>
            </button>

            {showAIChat && (
              <div className="flex flex-col" style={{ maxHeight: '400px' }}>
                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {chatMessages.length === 0 ? (
                    <div className="text-center py-4">
                      <p className="text-sm text-gray-500 mb-3">
                        Get AI-powered suggestions for this issue
                      </p>
                      <button
                        onClick={startAIConversation}
                        disabled={sendingAnswer}
                        className="btn btn-primary text-sm"
                      >
                        {sendingAnswer ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Bot className="w-4 h-4 mr-1" />
                            Get AI Suggestions
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    <>
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
                              'max-w-[90%] rounded-lg p-2 text-sm',
                              msg.role === 'user'
                                ? 'bg-primary-600 text-white'
                                : 'bg-gray-100 text-gray-800'
                            )}
                          >
                            <div className="whitespace-pre-wrap text-xs">{msg.content}</div>
                          </div>
                        </div>
                      ))}
                      {sendingAnswer && (
                        <div className="flex justify-start">
                          <div className="bg-gray-100 rounded-lg p-2">
                            <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Input */}
                {chatMessages.length > 0 && (
                  <div className="p-3 border-t border-gray-200">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={userAnswer}
                        onChange={(e) => setUserAnswer(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendAIMessage()}
                        placeholder="Ask a follow-up..."
                        className="input flex-1 text-sm py-2"
                        disabled={sendingAnswer}
                      />
                      <button
                        onClick={sendAIMessage}
                        disabled={!userAnswer.trim() || sendingAnswer}
                        className="btn btn-primary px-3 py-2"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="card p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Details</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-gray-500">Category</dt>
                <dd className="mt-1">
                  {canEdit ? (
                    <select
                      value={issue.category_id || ''}
                      onChange={(e) => updateCategory.mutate(e.target.value)}
                      className="input py-1 text-sm"
                    >
                      <option value="">None</option>
                      {categories?.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="font-medium">{issue.category_name || 'None'}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Equipment</dt>
                <dd className="mt-1 font-medium">
                  {issue.equipment_name ? (
                    <Link to={`/equipment/${issue.equipment_id}`} className="text-primary-600 hover:underline">
                      {issue.equipment_name}
                    </Link>
                  ) : 'None'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Assigned to</dt>
                <dd className="mt-1 font-medium">{issue.assigned_to_name || 'Unassigned'}</dd>
              </div>
              {issue.resolved_at && (
                <div>
                  <dt className="text-gray-500">Resolved</dt>
                  <dd className="mt-1 font-medium">{new Date(issue.resolved_at).toLocaleString()}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Tags */}
          {issue.tags?.length > 0 && (
            <div className="card p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Tags</h2>
              <div className="flex flex-wrap gap-2">
                {issue.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="badge"
                    style={{ backgroundColor: tag.color + '20', color: tag.color }}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* History */}
          <div className="card">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50"
            >
              <span className="font-semibold text-gray-900">History</span>
              <History className="w-5 h-5 text-gray-400" />
            </button>
            {showHistory && history && (
              <div className="px-6 pb-4 max-h-64 overflow-y-auto">
                <div className="space-y-3">
                  {history.map((entry) => (
                    <div key={entry.id} className="text-sm">
                      <p className="text-gray-900">
                        <span className="font-medium">{entry.user_name}</span>
                        {' '}{entry.action}
                        {entry.field_name && ` ${entry.field_name}`}
                      </p>
                      <p className="text-gray-500 text-xs">
                        {new Date(entry.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Related Issues */}
          {issue.related_issues?.length > 0 && (
            <div className="card p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Related Issues</h2>
              <div className="space-y-2">
                {issue.related_issues.map((related) => (
                  <Link
                    key={related.id}
                    to={`/issues/${related.id}`}
                    className="block p-2 hover:bg-gray-50 rounded text-sm"
                  >
                    <span className={`badge status-${related.status} mr-2`}>
                      {related.status}
                    </span>
                    {related.title}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default IssueDetail;
