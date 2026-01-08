import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '../store/authStore';
import { settingsApi, categoriesApi, emailApi } from '../services/api';
import {
  User,
  Lock,
  Save,
  Bot,
  Key,
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  Zap,
  AlertTriangle,
  Tag,
  Plus,
  Edit,
  Trash2,
  X,
  Mail,
  Bell,
  Send,
  Server
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

function Settings() {
  const { user, updateProfile, changePassword } = useAuthStore();
  const [activeTab, setActiveTab] = useState('profile');
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // AI Settings state
  const [aiSettings, setAiSettings] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [newApiKey, setNewApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  // Categories state
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [newCategory, setNewCategory] = useState({ name: '', color: '#3B82F6', description: '' });
  const [showNewCategory, setShowNewCategory] = useState(false);

  // Email Settings state (admin)
  const [emailSettings, setEmailSettings] = useState({
    smtp_host: '',
    smtp_port: 587,
    smtp_secure: false,
    smtp_user: '',
    smtp_pass: '',
    from_email: '',
    from_name: 'Knowledge Base',
    enabled: false
  });
  const [emailSettingsLoading, setEmailSettingsLoading] = useState(false);
  const [emailTesting, setEmailTesting] = useState(false);
  const [testEmail, setTestEmail] = useState('');

  // Email Preferences state (all users)
  const [emailPrefs, setEmailPrefs] = useState({
    notify_issue_assigned: true,
    notify_issue_updated: true,
    notify_issue_comment: true,
    notify_rma_status: true,
    notify_reminders: true,
    notify_digest: false
  });
  const [emailPrefsLoading, setEmailPrefsLoading] = useState(false);

  const isAdmin = user?.role === 'admin';

  const profileForm = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name || '',
      email: user?.email || '',
    },
  });

  const passwordForm = useForm({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  // Load AI settings for admins
  useEffect(() => {
    if (isAdmin && activeTab === 'ai') {
      loadAiSettings();
    }
  }, [isAdmin, activeTab]);

  // Load categories for admins
  useEffect(() => {
    if (isAdmin && activeTab === 'categories') {
      loadCategories();
    }
  }, [isAdmin, activeTab]);

  // Load email settings for admins
  useEffect(() => {
    if (isAdmin && activeTab === 'email') {
      loadEmailSettings();
    }
  }, [isAdmin, activeTab]);

  // Load email preferences for all users
  useEffect(() => {
    if (activeTab === 'notifications') {
      loadEmailPrefs();
    }
  }, [activeTab]);

  const loadCategories = async () => {
    try {
      setCategoriesLoading(true);
      const response = await categoriesApi.getAll();
      setCategories(response.data.flat || []);
    } catch (error) {
      console.error('Failed to load categories:', error);
      toast.error('Failed to load categories');
    } finally {
      setCategoriesLoading(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategory.name.trim()) {
      toast.error('Category name is required');
      return;
    }
    try {
      await categoriesApi.create(newCategory);
      setNewCategory({ name: '', color: '#3B82F6', description: '' });
      setShowNewCategory(false);
      loadCategories();
      toast.success('Category created');
    } catch (error) {
      toast.error('Failed to create category');
    }
  };

  const handleUpdateCategory = async () => {
    if (!editingCategory?.name.trim()) {
      toast.error('Category name is required');
      return;
    }
    try {
      await categoriesApi.update(editingCategory.id, {
        name: editingCategory.name,
        color: editingCategory.color,
        description: editingCategory.description
      });
      setEditingCategory(null);
      loadCategories();
      toast.success('Category updated');
    } catch (error) {
      toast.error('Failed to update category');
    }
  };

  const handleDeleteCategory = async (id) => {
    if (!confirm('Are you sure you want to delete this category? Issues using this category will become uncategorized.')) {
      return;
    }
    try {
      await categoriesApi.delete(id);
      loadCategories();
      toast.success('Category deleted');
    } catch (error) {
      toast.error('Failed to delete category');
    }
  };

  const loadAiSettings = async () => {
    try {
      setAiLoading(true);
      const response = await settingsApi.getAI();
      setAiSettings(response.data);
    } catch (error) {
      console.error('Failed to load AI settings:', error);
    } finally {
      setAiLoading(false);
    }
  };

  const loadEmailSettings = async () => {
    try {
      setEmailSettingsLoading(true);
      const response = await emailApi.getSettings();
      setEmailSettings(response.data);
    } catch (error) {
      console.error('Failed to load email settings:', error);
    } finally {
      setEmailSettingsLoading(false);
    }
  };

  const loadEmailPrefs = async () => {
    try {
      setEmailPrefsLoading(true);
      const response = await emailApi.getPreferences();
      setEmailPrefs(response.data);
    } catch (error) {
      console.error('Failed to load email preferences:', error);
    } finally {
      setEmailPrefsLoading(false);
    }
  };

  const handleSaveEmailSettings = async () => {
    try {
      setEmailSettingsLoading(true);
      await emailApi.updateSettings(emailSettings);
      toast.success('Email settings saved');
    } catch (error) {
      toast.error('Failed to save email settings');
    } finally {
      setEmailSettingsLoading(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail) {
      toast.error('Please enter a test email address');
      return;
    }
    try {
      setEmailTesting(true);
      await emailApi.testEmail(testEmail);
      toast.success('Test email sent successfully');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to send test email');
    } finally {
      setEmailTesting(false);
    }
  };

  const handleSaveEmailPrefs = async () => {
    try {
      setEmailPrefsLoading(true);
      await emailApi.updatePreferences(emailPrefs);
      toast.success('Email preferences saved');
    } catch (error) {
      toast.error('Failed to save email preferences');
    } finally {
      setEmailPrefsLoading(false);
    }
  };

  const onProfileSubmit = async (data) => {
    setProfileLoading(true);
    try {
      await updateProfile(data);
      toast.success('Profile updated');
    } catch (error) {
      // Error handled by interceptor
    } finally {
      setProfileLoading(false);
    }
  };

  const onPasswordSubmit = async (data) => {
    setPasswordLoading(true);
    try {
      await changePassword(data.currentPassword, data.newPassword);
      toast.success('Password changed');
      passwordForm.reset();
    } catch (error) {
      // Error handled by interceptor
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleTestApiKey = async () => {
    setAiTesting(true);
    setTestResult(null);
    try {
      const response = await settingsApi.testAI(newApiKey || undefined);
      setTestResult({
        success: true,
        ...response.data
      });
    } catch (error) {
      setTestResult({
        success: false,
        error: error.response?.data?.error || 'Test failed'
      });
    } finally {
      setAiTesting(false);
    }
  };

  const handleSaveApiKey = async () => {
    if (!newApiKey) {
      toast.error('Please enter an API key');
      return;
    }

    setAiLoading(true);
    try {
      const response = await settingsApi.updateAI(newApiKey);
      setAiSettings(prev => ({
        ...prev,
        has_api_key: true,
        api_key_masked: response.data.api_key_masked
      }));
      setNewApiKey('');
      setTestResult(null);
      toast.success('API key saved successfully');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save API key');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Manage your account and preferences</p>
      </div>

      {/* Tabs */}
      <div className="card">
        <div className="border-b border-dark-100">
          <nav className="flex">
            <button
              onClick={() => setActiveTab('profile')}
              className={clsx(
                'px-6 py-4 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2',
                activeTab === 'profile'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-dark-500 hover:text-dark-700'
              )}
            >
              <User className="w-4 h-4" />
              Profile
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={clsx(
                'px-6 py-4 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2',
                activeTab === 'security'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-dark-500 hover:text-dark-700'
              )}
            >
              <Lock className="w-4 h-4" />
              Security
            </button>
            {isAdmin && (
              <button
                onClick={() => setActiveTab('categories')}
                className={clsx(
                  'px-6 py-4 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2',
                  activeTab === 'categories'
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-dark-500 hover:text-dark-700'
                )}
              >
                <Tag className="w-4 h-4" />
                Categories
              </button>
            )}
            <button
              onClick={() => setActiveTab('notifications')}
              className={clsx(
                'px-6 py-4 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2',
                activeTab === 'notifications'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-dark-500 hover:text-dark-700'
              )}
            >
              <Bell className="w-4 h-4" />
              Notifications
            </button>
            {isAdmin && (
              <button
                onClick={() => setActiveTab('email')}
                className={clsx(
                  'px-6 py-4 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2',
                  activeTab === 'email'
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-dark-500 hover:text-dark-700'
                )}
              >
                <Mail className="w-4 h-4" />
                Email Server
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => setActiveTab('ai')}
                className={clsx(
                  'px-6 py-4 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2',
                  activeTab === 'ai'
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-dark-500 hover:text-dark-700'
                )}
              >
                <Bot className="w-4 h-4" />
                AI Configuration
              </button>
            )}
          </nav>
        </div>

        <div className="p-6">
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-5">
              <div>
                <label className="label">Full Name</label>
                <input
                  type="text"
                  {...profileForm.register('name')}
                  className={clsx('input', profileForm.formState.errors.name && 'input-error')}
                />
                {profileForm.formState.errors.name && (
                  <p className="mt-2 text-sm text-danger-600">{profileForm.formState.errors.name.message}</p>
                )}
              </div>

              <div>
                <label className="label">Email Address</label>
                <input
                  type="email"
                  {...profileForm.register('email')}
                  className={clsx('input', profileForm.formState.errors.email && 'input-error')}
                />
                {profileForm.formState.errors.email && (
                  <p className="mt-2 text-sm text-danger-600">{profileForm.formState.errors.email.message}</p>
                )}
              </div>

              <div className="pt-4 border-t border-dark-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-dark-500">Role</p>
                    <p className="font-semibold capitalize text-dark-900">{user?.role}</p>
                  </div>
                  <div>
                    <p className="text-sm text-dark-500">Member since</p>
                    <p className="font-semibold text-dark-900">
                      {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={profileLoading}
                  className="btn btn-primary flex items-center gap-2"
                >
                  {profileLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Save className="w-5 h-5" />
                  )}
                  Save Changes
                </button>
              </div>
            </form>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-5">
              <div>
                <label className="label">Current Password</label>
                <input
                  type="password"
                  {...passwordForm.register('currentPassword')}
                  className={clsx('input', passwordForm.formState.errors.currentPassword && 'input-error')}
                />
                {passwordForm.formState.errors.currentPassword && (
                  <p className="mt-2 text-sm text-danger-600">
                    {passwordForm.formState.errors.currentPassword.message}
                  </p>
                )}
              </div>

              <div>
                <label className="label">New Password</label>
                <input
                  type="password"
                  {...passwordForm.register('newPassword')}
                  className={clsx('input', passwordForm.formState.errors.newPassword && 'input-error')}
                  placeholder="At least 8 characters"
                />
                {passwordForm.formState.errors.newPassword && (
                  <p className="mt-2 text-sm text-danger-600">
                    {passwordForm.formState.errors.newPassword.message}
                  </p>
                )}
              </div>

              <div>
                <label className="label">Confirm New Password</label>
                <input
                  type="password"
                  {...passwordForm.register('confirmPassword')}
                  className={clsx('input', passwordForm.formState.errors.confirmPassword && 'input-error')}
                />
                {passwordForm.formState.errors.confirmPassword && (
                  <p className="mt-2 text-sm text-danger-600">
                    {passwordForm.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="btn btn-primary flex items-center gap-2"
                >
                  {passwordLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Lock className="w-5 h-5" />
                  )}
                  Change Password
                </button>
              </div>
            </form>
          )}

          {/* Categories Tab */}
          {activeTab === 'categories' && isAdmin && (
            <div className="space-y-6">
              {categoriesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                </div>
              ) : (
                <>
                  {/* Add Category Button */}
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-dark-500">
                      Manage categories for organizing issues
                    </p>
                    <button
                      onClick={() => setShowNewCategory(true)}
                      className="btn btn-primary text-sm flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add Category
                    </button>
                  </div>

                  {/* New Category Form */}
                  {showNewCategory && (
                    <div className="p-4 rounded-xl bg-primary-50 border border-primary-200 space-y-4">
                      <div className="flex justify-between items-center">
                        <h3 className="font-semibold text-primary-900">New Category</h3>
                        <button
                          onClick={() => {
                            setShowNewCategory(false);
                            setNewCategory({ name: '', color: '#3B82F6', description: '' });
                          }}
                          className="text-primary-500 hover:text-primary-700"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="label">Name *</label>
                          <input
                            type="text"
                            value={newCategory.name}
                            onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                            className="input"
                            placeholder="e.g., Video Switchers"
                          />
                        </div>
                        <div>
                          <label className="label">Color</label>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={newCategory.color}
                              onChange={(e) => setNewCategory({ ...newCategory, color: e.target.value })}
                              className="w-12 h-10 rounded cursor-pointer"
                            />
                            <input
                              type="text"
                              value={newCategory.color}
                              onChange={(e) => setNewCategory({ ...newCategory, color: e.target.value })}
                              className="input flex-1 font-mono"
                            />
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="label">Description</label>
                        <input
                          type="text"
                          value={newCategory.description}
                          onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })}
                          className="input"
                          placeholder="Optional description"
                        />
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={handleCreateCategory}
                          className="btn btn-primary flex items-center gap-2"
                        >
                          <Save className="w-4 h-4" />
                          Create Category
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Categories List */}
                  <div className="space-y-2">
                    {categories.length === 0 ? (
                      <div className="text-center py-8 text-dark-500">
                        <Tag className="w-10 h-10 mx-auto mb-2 text-dark-300" />
                        <p>No categories yet</p>
                        <p className="text-sm">Create your first category to organize issues</p>
                      </div>
                    ) : (
                      categories.map((category) => (
                        <div
                          key={category.id}
                          className="p-4 rounded-xl border border-dark-100 hover:border-dark-200 transition-colors"
                        >
                          {editingCategory?.id === category.id ? (
                            <div className="space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="label">Name *</label>
                                  <input
                                    type="text"
                                    value={editingCategory.name}
                                    onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                                    className="input"
                                  />
                                </div>
                                <div>
                                  <label className="label">Color</label>
                                  <div className="flex gap-2">
                                    <input
                                      type="color"
                                      value={editingCategory.color || '#3B82F6'}
                                      onChange={(e) => setEditingCategory({ ...editingCategory, color: e.target.value })}
                                      className="w-12 h-10 rounded cursor-pointer"
                                    />
                                    <input
                                      type="text"
                                      value={editingCategory.color || '#3B82F6'}
                                      onChange={(e) => setEditingCategory({ ...editingCategory, color: e.target.value })}
                                      className="input flex-1 font-mono"
                                    />
                                  </div>
                                </div>
                              </div>
                              <div>
                                <label className="label">Description</label>
                                <input
                                  type="text"
                                  value={editingCategory.description || ''}
                                  onChange={(e) => setEditingCategory({ ...editingCategory, description: e.target.value })}
                                  className="input"
                                />
                              </div>
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => setEditingCategory(null)}
                                  className="btn btn-secondary"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={handleUpdateCategory}
                                  className="btn btn-primary flex items-center gap-2"
                                >
                                  <Save className="w-4 h-4" />
                                  Save
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div
                                  className="w-4 h-4 rounded"
                                  style={{ backgroundColor: category.color || '#3B82F6' }}
                                />
                                <div>
                                  <p className="font-medium text-dark-900">{category.name}</p>
                                  {category.description && (
                                    <p className="text-sm text-dark-500">{category.description}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setEditingCategory({ ...category })}
                                  className="p-2 text-dark-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                                  title="Edit"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteCategory(category.id)}
                                  className="p-2 text-dark-400 hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <div className="space-y-6">
              {emailPrefsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                </div>
              ) : (
                <>
                  <div className="p-4 rounded-xl bg-primary-50 border border-primary-100">
                    <p className="text-sm text-primary-700">
                      Configure which email notifications you'd like to receive. Make sure you have a verified email address to receive notifications.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold text-dark-900">Issue Notifications</h3>

                    <label className="flex items-center justify-between p-4 rounded-xl border border-dark-100 hover:border-dark-200 cursor-pointer">
                      <div>
                        <p className="font-medium text-dark-900">Issue Assigned</p>
                        <p className="text-sm text-dark-500">When an issue is assigned to you</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={emailPrefs.notify_issue_assigned}
                        onChange={(e) => setEmailPrefs({ ...emailPrefs, notify_issue_assigned: e.target.checked })}
                        className="w-5 h-5 rounded border-dark-300 text-primary-600 focus:ring-primary-500"
                      />
                    </label>

                    <label className="flex items-center justify-between p-4 rounded-xl border border-dark-100 hover:border-dark-200 cursor-pointer">
                      <div>
                        <p className="font-medium text-dark-900">Issue Updated</p>
                        <p className="text-sm text-dark-500">When an issue you're watching is updated</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={emailPrefs.notify_issue_updated}
                        onChange={(e) => setEmailPrefs({ ...emailPrefs, notify_issue_updated: e.target.checked })}
                        className="w-5 h-5 rounded border-dark-300 text-primary-600 focus:ring-primary-500"
                      />
                    </label>

                    <label className="flex items-center justify-between p-4 rounded-xl border border-dark-100 hover:border-dark-200 cursor-pointer">
                      <div>
                        <p className="font-medium text-dark-900">Issue Comments</p>
                        <p className="text-sm text-dark-500">When someone comments on your issues</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={emailPrefs.notify_issue_comment}
                        onChange={(e) => setEmailPrefs({ ...emailPrefs, notify_issue_comment: e.target.checked })}
                        className="w-5 h-5 rounded border-dark-300 text-primary-600 focus:ring-primary-500"
                      />
                    </label>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold text-dark-900">RMA Notifications</h3>

                    <label className="flex items-center justify-between p-4 rounded-xl border border-dark-100 hover:border-dark-200 cursor-pointer">
                      <div>
                        <p className="font-medium text-dark-900">RMA Status Changes</p>
                        <p className="text-sm text-dark-500">When an RMA you created changes status</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={emailPrefs.notify_rma_status}
                        onChange={(e) => setEmailPrefs({ ...emailPrefs, notify_rma_status: e.target.checked })}
                        className="w-5 h-5 rounded border-dark-300 text-primary-600 focus:ring-primary-500"
                      />
                    </label>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold text-dark-900">Other Notifications</h3>

                    <label className="flex items-center justify-between p-4 rounded-xl border border-dark-100 hover:border-dark-200 cursor-pointer">
                      <div>
                        <p className="font-medium text-dark-900">Daily Reminders</p>
                        <p className="text-sm text-dark-500">Receive daily reminders about pending tasks</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={emailPrefs.notify_reminders}
                        onChange={(e) => setEmailPrefs({ ...emailPrefs, notify_reminders: e.target.checked })}
                        className="w-5 h-5 rounded border-dark-300 text-primary-600 focus:ring-primary-500"
                      />
                    </label>

                    <label className="flex items-center justify-between p-4 rounded-xl border border-dark-100 hover:border-dark-200 cursor-pointer">
                      <div>
                        <p className="font-medium text-dark-900">Weekly Digest</p>
                        <p className="text-sm text-dark-500">Receive a weekly summary of activity</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={emailPrefs.notify_digest}
                        onChange={(e) => setEmailPrefs({ ...emailPrefs, notify_digest: e.target.checked })}
                        className="w-5 h-5 rounded border-dark-300 text-primary-600 focus:ring-primary-500"
                      />
                    </label>
                  </div>

                  <div className="pt-4">
                    <button
                      onClick={handleSaveEmailPrefs}
                      disabled={emailPrefsLoading}
                      className="btn btn-primary flex items-center gap-2"
                    >
                      {emailPrefsLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Save className="w-5 h-5" />
                      )}
                      Save Preferences
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Email Server Tab (Admin) */}
          {activeTab === 'email' && isAdmin && (
            <div className="space-y-6">
              {emailSettingsLoading && !emailSettings.smtp_host ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                </div>
              ) : (
                <>
                  {/* Status Indicator */}
                  <div className="p-4 rounded-xl bg-dark-50 border border-dark-100">
                    <div className="flex items-center gap-3">
                      <div className={clsx(
                        'w-10 h-10 rounded-xl flex items-center justify-center',
                        emailSettings.enabled
                          ? 'bg-success-100 text-success-600'
                          : 'bg-warning-100 text-warning-600'
                      )}>
                        {emailSettings.enabled ? (
                          <CheckCircle className="w-5 h-5" />
                        ) : (
                          <AlertTriangle className="w-5 h-5" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-dark-900">
                          {emailSettings.enabled ? 'Email Enabled' : 'Email Disabled'}
                        </p>
                        <p className="text-sm text-dark-500">
                          {emailSettings.enabled
                            ? 'Email notifications are active'
                            : 'Configure SMTP settings and enable to send emails'}
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={emailSettings.enabled}
                          onChange={(e) => setEmailSettings({ ...emailSettings, enabled: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-dark-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-dark-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                      </label>
                    </div>
                  </div>

                  {/* SMTP Settings */}
                  <div className="space-y-4">
                    <h3 className="font-semibold text-dark-900 flex items-center gap-2">
                      <Server className="w-4 h-4" />
                      SMTP Configuration
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="label">SMTP Host</label>
                        <input
                          type="text"
                          value={emailSettings.smtp_host}
                          onChange={(e) => setEmailSettings({ ...emailSettings, smtp_host: e.target.value })}
                          className="input"
                          placeholder="smtp.example.com"
                        />
                      </div>
                      <div>
                        <label className="label">SMTP Port</label>
                        <input
                          type="number"
                          value={emailSettings.smtp_port}
                          onChange={(e) => setEmailSettings({ ...emailSettings, smtp_port: parseInt(e.target.value) || 587 })}
                          className="input"
                          placeholder="587"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="label">SMTP Username</label>
                        <input
                          type="text"
                          value={emailSettings.smtp_user}
                          onChange={(e) => setEmailSettings({ ...emailSettings, smtp_user: e.target.value })}
                          className="input"
                          placeholder="user@example.com"
                        />
                      </div>
                      <div>
                        <label className="label">SMTP Password</label>
                        <input
                          type="password"
                          value={emailSettings.smtp_pass}
                          onChange={(e) => setEmailSettings({ ...emailSettings, smtp_pass: e.target.value })}
                          className="input"
                          placeholder="••••••••"
                        />
                      </div>
                    </div>

                    <label className="flex items-center gap-3 p-3 rounded-lg border border-dark-100 hover:border-dark-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={emailSettings.smtp_secure}
                        onChange={(e) => setEmailSettings({ ...emailSettings, smtp_secure: e.target.checked })}
                        className="w-5 h-5 rounded border-dark-300 text-primary-600 focus:ring-primary-500"
                      />
                      <div>
                        <p className="font-medium text-dark-900">Use SSL/TLS</p>
                        <p className="text-sm text-dark-500">Enable for secure connections (typically port 465)</p>
                      </div>
                    </label>
                  </div>

                  {/* From Address */}
                  <div className="space-y-4">
                    <h3 className="font-semibold text-dark-900 flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      Sender Information
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="label">From Email</label>
                        <input
                          type="email"
                          value={emailSettings.from_email}
                          onChange={(e) => setEmailSettings({ ...emailSettings, from_email: e.target.value })}
                          className="input"
                          placeholder="noreply@example.com"
                        />
                      </div>
                      <div>
                        <label className="label">From Name</label>
                        <input
                          type="text"
                          value={emailSettings.from_name}
                          onChange={(e) => setEmailSettings({ ...emailSettings, from_name: e.target.value })}
                          className="input"
                          placeholder="Knowledge Base"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Test Email */}
                  <div className="space-y-4 pt-4 border-t border-dark-100">
                    <h3 className="font-semibold text-dark-900 flex items-center gap-2">
                      <Send className="w-4 h-4" />
                      Test Email
                    </h3>
                    <div className="flex gap-3">
                      <input
                        type="email"
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                        className="input flex-1"
                        placeholder="test@example.com"
                      />
                      <button
                        onClick={handleTestEmail}
                        disabled={emailTesting || !emailSettings.enabled}
                        className="btn btn-secondary flex items-center gap-2"
                      >
                        {emailTesting ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Send className="w-5 h-5" />
                        )}
                        Send Test
                      </button>
                    </div>
                    {!emailSettings.enabled && (
                      <p className="text-sm text-warning-600">Enable email above to send test emails</p>
                    )}
                  </div>

                  {/* Save Button */}
                  <div className="pt-4">
                    <button
                      onClick={handleSaveEmailSettings}
                      disabled={emailSettingsLoading}
                      className="btn btn-primary flex items-center gap-2"
                    >
                      {emailSettingsLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Save className="w-5 h-5" />
                      )}
                      Save Email Settings
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* AI Configuration Tab */}
          {activeTab === 'ai' && isAdmin && (
            <div className="space-y-6">
              {aiLoading && !aiSettings ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                </div>
              ) : (
                <>
                  {/* Current Status */}
                  <div className="p-4 rounded-xl bg-dark-50 border border-dark-100">
                    <div className="flex items-center gap-3">
                      <div className={clsx(
                        'w-10 h-10 rounded-xl flex items-center justify-center',
                        aiSettings?.has_api_key
                          ? 'bg-success-100 text-success-600'
                          : 'bg-warning-100 text-warning-600'
                      )}>
                        {aiSettings?.has_api_key ? (
                          <CheckCircle className="w-5 h-5" />
                        ) : (
                          <AlertTriangle className="w-5 h-5" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-dark-900">
                          {aiSettings?.has_api_key ? 'API Key Configured' : 'No API Key Configured'}
                        </p>
                        <p className="text-sm text-dark-500">
                          {aiSettings?.has_api_key
                            ? `Current key: ${aiSettings.api_key_masked}`
                            : 'AI features are disabled until you add an API key'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* API Key Input */}
                  <div>
                    <label className="label flex items-center gap-2">
                      <Key className="w-4 h-4" />
                      {aiSettings?.has_api_key ? 'Update API Key' : 'Enter Claude API Key'}
                    </label>
                    <div className="relative">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={newApiKey}
                        onChange={(e) => setNewApiKey(e.target.value)}
                        className="input pr-12 font-mono text-sm"
                        placeholder="sk-ant-api03-..."
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-600"
                      >
                        {showApiKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    <p className="mt-2 text-sm text-dark-500">
                      Get your API key from{' '}
                      <a
                        href="https://console.anthropic.com/settings/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:text-primary-700 font-medium"
                      >
                        console.anthropic.com
                      </a>
                    </p>
                  </div>

                  {/* Test Result */}
                  {testResult && (
                    <div className={clsx(
                      'p-4 rounded-xl border',
                      testResult.success
                        ? 'bg-success-50 border-success-200'
                        : 'bg-danger-50 border-danger-200'
                    )}>
                      <div className="flex items-start gap-3">
                        {testResult.success ? (
                          <CheckCircle className="w-5 h-5 text-success-600 mt-0.5" />
                        ) : (
                          <XCircle className="w-5 h-5 text-danger-600 mt-0.5" />
                        )}
                        <div className="flex-1">
                          <p className={clsx(
                            'font-semibold',
                            testResult.success ? 'text-success-700' : 'text-danger-700'
                          )}>
                            {testResult.success ? 'Connection Successful' : 'Connection Failed'}
                          </p>
                          {testResult.success ? (
                            <div className="mt-2 text-sm text-success-600 space-y-1">
                              <p>Response: "{testResult.response}"</p>
                              <p>Model: {testResult.model}</p>
                              <p>Response time: {testResult.response_time_ms}ms</p>
                              <p>Tokens used: {testResult.usage?.input_tokens} in / {testResult.usage?.output_tokens} out</p>
                            </div>
                          ) : (
                            <p className="mt-1 text-sm text-danger-600">{testResult.error}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleTestApiKey}
                      disabled={aiTesting}
                      className="btn btn-secondary flex items-center gap-2"
                    >
                      {aiTesting ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Zap className="w-5 h-5" />
                      )}
                      Test Connection
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveApiKey}
                      disabled={!newApiKey || aiLoading}
                      className="btn btn-primary flex items-center gap-2"
                    >
                      {aiLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Save className="w-5 h-5" />
                      )}
                      Save API Key
                    </button>
                  </div>

                  {/* Info Section */}
                  <div className="mt-6 p-4 rounded-xl bg-primary-50 border border-primary-100">
                    <h3 className="font-semibold text-primary-900 flex items-center gap-2">
                      <Bot className="w-5 h-5" />
                      AI Features Enabled
                    </h3>
                    <ul className="mt-2 text-sm text-primary-700 space-y-1">
                      <li>• AI-powered search through issues and manuals</li>
                      <li>• Smart category suggestions for new issues</li>
                      <li>• Duplicate issue detection</li>
                      <li>• Related issue recommendations</li>
                      <li>• Automatic manual content summarization</li>
                    </ul>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Account Info */}
      <div className="card p-6">
        <h2 className="font-bold text-dark-900 mb-4">Account Information</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-dark-500">User ID</p>
            <p className="font-mono text-xs mt-1 truncate text-dark-700">{user?.id}</p>
          </div>
          <div>
            <p className="text-dark-500">Last Login</p>
            <p className="mt-1 text-dark-700">
              {user?.last_login
                ? new Date(user.last_login).toLocaleString()
                : 'N/A'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;
