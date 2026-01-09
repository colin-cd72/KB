import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { articlesApi, categoriesApi, equipmentApi } from '../services/api';
import ReactMarkdown from 'react-markdown';
import {
  ArrowLeft, Save, Eye, EyeOff, Image, Upload, Trash2,
  Bold, Italic, Heading1, Heading2, List, ListOrdered,
  Link as LinkIcon, Code, Quote, Minus, X
} from 'lucide-react';
import toast from 'react-hot-toast';

function ArticleEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const textareaRef = useRef(null);
  const isEditing = !!id;

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    summary: '',
    category_id: '',
    equipment_id: '',
    is_published: false,
  });
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Fetch article if editing
  const { data: article, isLoading } = useQuery({
    queryKey: ['article-edit', id],
    queryFn: async () => {
      const response = await articlesApi.getOne(id);
      return response.data;
    },
    enabled: isEditing,
  });

  // Fetch categories and equipment
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const response = await categoriesApi.getAll();
      return response.data;
    },
  });

  const { data: equipment } = useQuery({
    queryKey: ['equipment-list'],
    queryFn: async () => {
      const response = await equipmentApi.getAll({ limit: 100 });
      return response.data.equipment;
    },
  });

  // Initialize form when article loads
  useEffect(() => {
    if (article) {
      setFormData({
        title: article.title || '',
        content: article.content || '',
        summary: article.summary || '',
        category_id: article.category_id || '',
        equipment_id: article.equipment_id || '',
        is_published: article.is_published || false,
      });
      setImages(article.images || []);
    }
  }, [article]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (isEditing) {
        return articlesApi.update(id, data);
      } else {
        return articlesApi.create(data);
      }
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries(['articles']);
      toast.success(isEditing ? 'Article saved!' : 'Article created!');
      if (!isEditing) {
        navigate(`/articles/${response.data.slug}`);
      }
    },
  });

  // Image upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append('image', file);
      return articlesApi.uploadImage(id, formData);
    },
    onSuccess: (response) => {
      setImages([...images, response.data]);
      toast.success('Image uploaded!');
      // Insert image markdown at cursor
      insertText(`![${response.data.alt_text || 'Image'}](${response.data.file_path})`);
    },
  });

  // Delete image mutation
  const deleteImageMutation = useMutation({
    mutationFn: (imageId) => articlesApi.deleteImage(imageId),
    onSuccess: (_, imageId) => {
      setImages(images.filter(img => img.id !== imageId));
      toast.success('Image deleted');
    },
  });

  const handleSave = async (publish = null) => {
    if (!formData.title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!formData.content.trim()) {
      toast.error('Content is required');
      return;
    }

    setSaving(true);
    try {
      const data = {
        ...formData,
        is_published: publish !== null ? publish : formData.is_published,
      };
      await saveMutation.mutateAsync(data);
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isEditing) {
      // Need to save the article first
      toast.error('Please save the article first before uploading images');
      return;
    }

    setUploading(true);
    try {
      await uploadMutation.mutateAsync(file);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  // Insert text at cursor position
  const insertText = (text, wrap = false) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = formData.content.substring(start, end);

    let newText;
    if (wrap && selectedText) {
      newText = formData.content.substring(0, start) + text.replace('$1', selectedText) + formData.content.substring(end);
    } else {
      newText = formData.content.substring(0, start) + text + formData.content.substring(end);
    }

    setFormData({ ...formData, content: newText });

    // Restore cursor position
    setTimeout(() => {
      textarea.focus();
      const newPos = wrap ? start + text.indexOf('$1') + selectedText.length : start + text.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  // Toolbar actions
  const toolbarActions = [
    { icon: Bold, action: () => insertText('**$1**', true), title: 'Bold' },
    { icon: Italic, action: () => insertText('*$1*', true), title: 'Italic' },
    { icon: Heading1, action: () => insertText('# '), title: 'Heading 1' },
    { icon: Heading2, action: () => insertText('## '), title: 'Heading 2' },
    { type: 'divider' },
    { icon: List, action: () => insertText('- '), title: 'Bullet List' },
    { icon: ListOrdered, action: () => insertText('1. '), title: 'Numbered List' },
    { icon: Quote, action: () => insertText('> '), title: 'Quote' },
    { type: 'divider' },
    { icon: LinkIcon, action: () => insertText('[text](url)'), title: 'Link' },
    { icon: Code, action: () => insertText('`$1`', true), title: 'Inline Code' },
    { icon: Minus, action: () => insertText('\n---\n'), title: 'Horizontal Rule' },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-dark-500 hover:text-dark-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="btn btn-secondary inline-flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save Draft
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="btn btn-primary inline-flex items-center gap-2"
          >
            {formData.is_published ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            {saving ? 'Saving...' : formData.is_published ? 'Update' : 'Publish'}
          </button>
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
        {/* Editor Panel */}
        <div className="card flex flex-col min-h-0">
          <div className="p-4 border-b border-dark-100 space-y-4">
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Article title..."
              className="w-full text-2xl font-bold border-none outline-none focus:ring-0 p-0 bg-transparent placeholder:text-dark-300"
            />
            <input
              type="text"
              value={formData.summary}
              onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
              placeholder="Brief summary (optional)..."
              className="w-full text-dark-500 border-none outline-none focus:ring-0 p-0 bg-transparent placeholder:text-dark-300"
            />
            <div className="flex flex-wrap gap-3">
              <select
                value={formData.category_id}
                onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                className="input py-1.5 text-sm"
              >
                <option value="">No category</option>
                {categories?.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              <select
                value={formData.equipment_id}
                onChange={(e) => setFormData({ ...formData, equipment_id: e.target.value })}
                className="input py-1.5 text-sm"
              >
                <option value="">No equipment</option>
                {equipment?.map((eq) => (
                  <option key={eq.id} value={eq.id}>{eq.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-1 p-2 border-b border-dark-100 bg-dark-50">
            {toolbarActions.map((item, idx) => (
              item.type === 'divider' ? (
                <div key={idx} className="w-px h-6 bg-dark-200 mx-1" />
              ) : (
                <button
                  key={idx}
                  onClick={item.action}
                  className="p-2 text-dark-500 hover:text-dark-700 hover:bg-dark-100 rounded transition-colors"
                  title={item.title}
                >
                  <item.icon className="w-4 h-4" />
                </button>
              )
            ))}
            <div className="flex-1" />
            <label className="p-2 text-dark-500 hover:text-dark-700 hover:bg-dark-100 rounded cursor-pointer transition-colors">
              <Image className="w-4 h-4" />
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                disabled={!isEditing || uploading}
              />
            </label>
          </div>

          {/* Content Editor */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <textarea
              ref={textareaRef}
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="Write your article content in Markdown..."
              className="w-full h-full p-4 border-none outline-none focus:ring-0 resize-none font-mono text-sm bg-transparent"
            />
          </div>

          {/* Images */}
          {images.length > 0 && (
            <div className="p-4 border-t border-dark-100 bg-dark-50">
              <div className="text-xs font-medium text-dark-500 mb-2">
                Uploaded Images (click to insert)
              </div>
              <div className="flex flex-wrap gap-2">
                {images.map((img) => (
                  <div key={img.id} className="relative group">
                    <button
                      onClick={() => insertText(`![Image](${img.file_path})`)}
                      className="w-16 h-16 rounded overflow-hidden border border-dark-200 hover:border-primary-400 transition-colors"
                    >
                      <img src={img.file_path} alt="" className="w-full h-full object-cover" />
                    </button>
                    <button
                      onClick={() => deleteImageMutation.mutate(img.id)}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-danger-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Preview Panel */}
        <div className="card flex flex-col min-h-0">
          <div className="p-4 border-b border-dark-100 bg-dark-50">
            <span className="text-sm font-medium text-dark-500">Preview</span>
          </div>
          <div className="flex-1 overflow-auto p-6">
            {formData.title && (
              <h1 className="text-3xl font-bold text-dark-900 mb-4">
                {formData.title}
              </h1>
            )}
            {formData.summary && (
              <p className="text-lg text-dark-600 mb-6 pb-6 border-b border-dark-100">
                {formData.summary}
              </p>
            )}
            <div className="prose prose-lg max-w-none prose-headings:text-dark-900 prose-p:text-dark-600 prose-a:text-primary-600 prose-strong:text-dark-800 prose-code:bg-dark-50 prose-code:px-1 prose-code:rounded prose-pre:bg-dark-800 prose-pre:text-dark-100 prose-img:rounded-lg">
              <ReactMarkdown
                components={{
                  img: ({ node, ...props }) => (
                    <img {...props} className="max-w-full h-auto rounded-lg shadow-md" loading="lazy" />
                  ),
                  pre: ({ node, children, ...props }) => (
                    <pre {...props} className="bg-dark-800 text-dark-100 p-4 rounded-lg overflow-x-auto">
                      {children}
                    </pre>
                  ),
                  code: ({ node, inline, ...props }) => (
                    inline
                      ? <code {...props} className="bg-dark-100 text-dark-800 px-1.5 py-0.5 rounded text-sm" />
                      : <code {...props} />
                  ),
                }}
              >
                {formData.content || '*Start writing to see the preview...*'}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ArticleEditor;
