import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '../store/authStore';
import { settingsApi } from '../services/api';
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
  AlertTriangle
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
